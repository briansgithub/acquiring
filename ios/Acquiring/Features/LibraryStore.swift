import AcquiringCatalog
import AcquiringCore
import Foundation
import Observation

struct CatalogDownloadInfo: Equatable {
    let formattedSize: String
    let songCount: Int
}

enum AppRoute: Hashable {
    case artist(String)
    case allSongs
    case playlist(String)
    case songDetail(String)
    case quiz(String)
}

enum SearchScope: String, CaseIterable, Identifiable {
    case songs = "Songs"
    case artists = "Artists"
    var id: Self { self }
}

enum CatalogMaintenanceOperation: Equatable {
    case downloadAndInstall
    case harvest

    var title: String {
        switch self {
        case .downloadAndInstall: "Catalog update"
        case .harvest: "Song harvest"
        }
    }
}

enum CatalogMaintenanceState: Equatable {
    case idle
    case running(operation: CatalogMaintenanceOperation, progress: CatalogProgress)
    case cancelling(operation: CatalogMaintenanceOperation)
    case cancelled(operation: CatalogMaintenanceOperation)
    case failed(operation: CatalogMaintenanceOperation, message: String)
    case completed(operation: CatalogMaintenanceOperation, songCount: Int)

    var isRunning: Bool {
        switch self {
        case .running, .cancelling: true
        default: false
        }
    }

    var canCancel: Bool {
        guard case let .running(_, progress) = self else { return false }
        if case .installing = progress { return false }
        return true
    }

    var retainsCurrentCatalogMessage: Bool {
        switch self {
        case .running, .cancelling, .cancelled, .failed: true
        case .idle, .completed: false
        }
    }

    var accessibilityAnnouncement: String? {
        switch self {
        case .idle:
            nil
        case let .running(operation, progress):
            switch progress {
            case .connecting: "\(operation.title). Connecting."
            case .downloading: "\(operation.title). Downloading catalog."
            case .preparing: "\(operation.title). Preparing catalog."
            case .validating: "\(operation.title). Validating catalog."
            case .installing: "\(operation.title). Installing catalog."
            case .harvesting: "\(operation.title). Fetching song sections."
            case .completed: nil
            }
        case let .cancelling(operation):
            "Cancelling \(operation.title.lowercased())."
        case let .cancelled(operation):
            "\(operation.title) cancelled."
        case let .failed(operation, message):
            "\(operation.title) failed. \(message)"
        case let .completed(operation, songCount):
            "\(operation.title) complete. \(songCount.formatted()) songs ready."
        }
    }
}

@MainActor
@Observable
final class LibraryStore {
    var path: [AppRoute] = []
    var catalogState: FeatureState<Int> = .idle
    var suggestions: FeatureState<[CatalogSong]> = .idle
    var artistSuggestions: FeatureState<[String]> = .idle
    var hasMoreSongSuggestions = false
    var hasMoreArtistSuggestions = false
    var isLoadingMoreSuggestions = false
    var pagingError: String?
    private(set) var isSongSearchFocused = false
    private(set) var isArtistSearchFocused = false
    var recentSongs: [CatalogSong] = []
    var recentArtists: [String] = []
    var playlists: [PlaylistSummary] = []
    var query = "" { didSet { scheduleSearch() } }
    var searchScope: SearchScope = .songs { didSet { scheduleSearch() } }
    var maintenanceState: CatalogMaintenanceState = .idle
    var userContentError: String?
    var harvestURL = ""
    var downloadInfo: FeatureState<CatalogDownloadInfo> = .idle
    var downloadPromptDismissed = false

    private let catalog: any CatalogRepository
    private let maintenance: any CatalogMaintenanceService
    private let history: HistoryStore
    private let userLibrary: UserLibraryStore
    private let prepareCatalog: @MainActor () async throws -> Void
    private let downloadURL: URL
    private let expectedSongCount: Int
    @ObservationIgnored private var searchTask: Task<Void, Never>?
    @ObservationIgnored private var loadMoreTask: Task<Void, Never>?
    @ObservationIgnored private var searchGeneration = 0
    @ObservationIgnored private var maintenanceTask: Task<Void, Never>?
    @ObservationIgnored private var maintenanceCancellation: (@Sendable () -> CatalogCancellationDisposition)?
    @ObservationIgnored private var maintenanceGeneration = 0
    @ObservationIgnored private var retryHarvestURL: URL?

    var canInstallCatalog: Bool {
        guard !maintenanceState.isRunning else { return false }
        switch catalogState {
        case .empty, .content, .failure: return true
        case .idle, .loading: return false
        }
    }

    var canHarvest: Bool {
        guard !maintenanceState.isRunning else { return false }
        switch catalogState {
        case .empty, .content: return true
        case .idle, .loading, .failure: return false
        }
    }

    var shouldShowRecentContent: Bool {
        guard query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        switch searchScope {
        case .songs: return isSongSearchFocused
        case .artists: return isArtistSearchFocused
        }
    }

    convenience init(environment: AppEnvironment) {
        self.init(
            catalog: environment.catalog,
            maintenance: environment.maintenance,
            history: environment.history,
            userLibrary: environment.userLibrary,
            prepareCatalog: { try await environment.prepare() },
            downloadURL: environment.catalogConfiguration.downloadURL,
            expectedSongCount: environment.catalogConfiguration.contract.minimumBrowseRows
        )
    }

    init(
        catalog: any CatalogRepository,
        maintenance: any CatalogMaintenanceService,
        history: HistoryStore,
        userLibrary: UserLibraryStore,
        prepareCatalog: @escaping @MainActor () async throws -> Void,
        downloadURL: URL = URL(string: "https://example.invalid/catalog.db.gz")!,
        expectedSongCount: Int = 0
    ) {
        self.catalog = catalog
        self.maintenance = maintenance
        self.history = history
        self.userLibrary = userLibrary
        self.prepareCatalog = prepareCatalog
        self.downloadURL = downloadURL
        self.expectedSongCount = expectedSongCount
    }

    func load() async {
        catalogState = .loading
        do {
            try await prepareCatalog()
            let count = try await catalog.songCount()
            catalogState = count == 0 ? .empty : .content(count)
            await refreshUserContent()
        } catch {
            catalogState = .failure(error.localizedDescription)
        }
    }

    func refreshUserContent() async {
        do {
            let slugs = await history.songSlugs()
            recentSongs = try await catalog.songs(ids: slugs)
            recentArtists = await history.artists()
            playlists = try userLibrary.summaries()
            userContentError = nil
        } catch {
            userContentError = error.localizedDescription
        }
    }

    func loadDownloadInfoIfNeeded() {
        guard downloadInfo == .idle else { return }
        downloadInfo = .loading
        let url = downloadURL
        let songCount = expectedSongCount
        Task {
            var request = URLRequest(url: url)
            request.httpMethod = "HEAD"
            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                let byteCount = response.expectedContentLength
                let formattedSize = byteCount > 0
                    ? ByteCountFormatter.string(fromByteCount: byteCount, countStyle: .file)
                    : "Unknown size"
                downloadInfo = .content(CatalogDownloadInfo(formattedSize: formattedSize, songCount: songCount))
            } catch {
                downloadInfo = .failure(error.localizedDescription)
            }
        }
    }

    func openSong(_ song: CatalogSong) {
        Task {
            await history.addSong(song.id)
            await history.addArtist(song.artist)
        }
        path.append(.songDetail(song.id))
        path.append(.quiz(song.id))
    }

    func openArtist(from song: CatalogSong) async {
        let artist = Self.canonicalArtistName(song.artist)
        guard !artist.isEmpty else { return }

        await history.addArtist(artist)

        trimTrailingSongRoutes: while let route = path.last {
            switch route {
            case .quiz, .songDetail:
                path.removeLast()
            default:
                break trimTrailingSongRoutes
            }
        }

        if case let .artist(currentArtist)? = path.last,
           Self.canonicalArtistName(currentArtist)
               .caseInsensitiveCompare(artist) == .orderedSame {
            return
        }
        path.append(.artist(artist))
    }

    func installCatalog() {
        guard canInstallCatalog else { return }
        begin(
            operation: .downloadAndInstall,
            run: maintenance.downloadAndInstall()
        )
    }

    func harvest() {
        guard canHarvest else { return }
        guard let url = Self.validHarvestURL(from: harvestURL) else {
            retryHarvestURL = nil
            maintenanceState = .failed(
                operation: .harvest,
                message: "Enter a valid Hooktheory TheoryTab URL."
            )
            return
        }
        retryHarvestURL = url
        begin(operation: .harvest, run: maintenance.harvest(url: url))
    }

    func cancelMaintenance() {
        guard maintenanceState.canCancel,
              case let .running(operation, _) = maintenanceState
        else { return }

        guard let maintenanceCancellation else { return }
        switch maintenanceCancellation() {
        case .accepted:
            // Keep consuming the producer-owned stream so its terminal state
            // remains authoritative and the app-scoped gate stays held until
            // cleanup has actually finished.
            maintenanceState = .cancelling(operation: operation)
            return
        case .commitInProgress:
            // The swap/write crossed its commit boundary before this MainActor
            // observed the installing progress. It must finish, so reconcile
            // the UI immediately and keep the completion consumer alive.
            maintenanceState = .running(operation: operation, progress: .installing)
            return
        case .noOperation:
            return
        }
    }

    func retryMaintenance() {
        let operation: CatalogMaintenanceOperation
        switch maintenanceState {
        case let .cancelled(value), let .failed(value, _): operation = value
        default: return
        }
        switch operation {
        case .downloadAndInstall: installCatalog()
        case .harvest:
            guard canHarvest else { return }
            guard let url = retryHarvestURL else {
                harvest()
                return
            }
            begin(operation: .harvest, run: maintenance.harvest(url: url))
        }
    }

    func waitForMaintenance() async {
        await maintenanceTask?.value
    }

    private func begin(
        operation: CatalogMaintenanceOperation,
        run: CatalogMaintenanceRun
    ) {
        maintenanceTask?.cancel()
        maintenanceGeneration += 1
        let generation = maintenanceGeneration
        maintenanceState = .running(operation: operation, progress: .connecting)
        maintenanceCancellation = { run.requestCancellation() }
        maintenanceTask = Task { [weak self] in
            await self?.consume(run.events, operation: operation, generation: generation)
        }
    }

    private func consume(
        _ stream: AsyncThrowingStream<CatalogProgress, any Error>,
        operation: CatalogMaintenanceOperation,
        generation: Int
    ) async {
        defer {
            if generation == maintenanceGeneration {
                maintenanceCancellation = nil
            }
        }
        do {
            for try await progress in stream {
                guard generation == maintenanceGeneration, !Task.isCancelled else { return }
                if case .completed = progress {
                    maintenanceState = .running(operation: operation, progress: .installing)
                    let count = try await catalog.songCount()
                    guard generation == maintenanceGeneration, !Task.isCancelled else { return }
                    catalogState = count == 0 ? .empty : .content(count)
                    await refreshUserContent()
                    guard generation == maintenanceGeneration, !Task.isCancelled else { return }
                    maintenanceState = .completed(operation: operation, songCount: count)
                    return
                } else {
                    if maintenanceState == .cancelling(operation: operation) {
                        continue
                    }
                    if case .running(_, .installing) = maintenanceState {
                        continue
                    }
                    maintenanceState = .running(operation: operation, progress: progress)
                }
            }
            guard generation == maintenanceGeneration else { return }
            if maintenanceState == .cancelling(operation: operation) || Task.isCancelled {
                maintenanceState = .cancelled(operation: operation)
            } else {
                maintenanceState = .failed(
                    operation: operation,
                    message: "The catalog operation ended before completion."
                )
            }
        } catch is CancellationError {
            guard generation == maintenanceGeneration else { return }
            maintenanceState = .cancelled(operation: operation)
        } catch {
            guard generation == maintenanceGeneration else { return }
            if maintenanceState == .cancelling(operation: operation) {
                maintenanceState = .cancelled(operation: operation)
            } else {
                maintenanceState = .failed(operation: operation, message: error.localizedDescription)
            }
        }
    }

    private static let suggestionPageSize = 20

    func setSearchFocused(_ isFocused: Bool, for scope: SearchScope) {
        switch scope {
        case .songs: isSongSearchFocused = isFocused
        case .artists: isArtistSearchFocused = isFocused
        }
    }

    private func scheduleSearch() {
        searchGeneration &+= 1
        searchTask?.cancel()
        loadMoreTask?.cancel()
        searchTask = nil
        loadMoreTask = nil
        isLoadingMoreSuggestions = false
        pagingError = nil

        let term = normalizedQuery
        guard !term.isEmpty else {
            suggestions = .idle
            artistSuggestions = .idle
            hasMoreSongSuggestions = false
            hasMoreArtistSuggestions = false
            return
        }

        let scope = searchScope
        let generation = searchGeneration
        searchTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .milliseconds(300))
                guard let self, !Task.isCancelled,
                      self.isCurrentSearch(generation: generation, query: term, scope: scope)
                else { return }

                switch scope {
                case .songs:
                    self.suggestions = .loading
                    self.hasMoreSongSuggestions = false
                    let values = try await self.catalog.songSuggestions(
                        query: term,
                        limit: Self.suggestionPageSize,
                        offset: 0
                    )
                    guard !Task.isCancelled,
                          self.isCurrentSearch(generation: generation, query: term, scope: scope)
                    else { return }
                    self.suggestions = values.isEmpty ? .empty : .content(values)
                    self.hasMoreSongSuggestions = values.count == Self.suggestionPageSize
                case .artists:
                    self.artistSuggestions = .loading
                    self.hasMoreArtistSuggestions = false
                    let values = try await self.catalog.artistSuggestions(
                        query: term,
                        limit: Self.suggestionPageSize,
                        offset: 0
                    )
                    guard !Task.isCancelled,
                          self.isCurrentSearch(generation: generation, query: term, scope: scope)
                    else { return }
                    self.artistSuggestions = values.isEmpty ? .empty : .content(values)
                    self.hasMoreArtistSuggestions = values.count == Self.suggestionPageSize
                }
            } catch is CancellationError {
                return
            } catch {
                guard let self,
                      self.isCurrentSearch(generation: generation, query: term, scope: scope)
                else { return }
                switch scope {
                case .songs: self.suggestions = .failure(error.localizedDescription)
                case .artists: self.artistSuggestions = .failure(error.localizedDescription)
                }
            }
        }
    }

    func loadMoreSuggestions() {
        guard !isLoadingMoreSuggestions else { return }
        let term = normalizedQuery
        guard !term.isEmpty else { return }

        let scope = searchScope
        let generation = searchGeneration
        let offset: Int
        switch scope {
        case .songs:
            guard case let .content(existing) = suggestions, hasMoreSongSuggestions else { return }
            offset = existing.count
        case .artists:
            guard case let .content(existing) = artistSuggestions, hasMoreArtistSuggestions else { return }
            offset = existing.count
        }

        isLoadingMoreSuggestions = true
        pagingError = nil
        loadMoreTask = Task { [weak self] in
            defer {
                if let self,
                   self.isCurrentSearch(generation: generation, query: term, scope: scope) {
                    self.isLoadingMoreSuggestions = false
                    self.loadMoreTask = nil
                }
            }
            do {
                guard let self else { return }
                switch scope {
                case .songs:
                    let values = try await self.catalog.songSuggestions(
                        query: term,
                        limit: Self.suggestionPageSize,
                        offset: offset
                    )
                    guard !Task.isCancelled,
                          self.isCurrentSearch(generation: generation, query: term, scope: scope),
                          case let .content(existing) = self.suggestions,
                          existing.count == offset
                    else { return }
                    self.suggestions = .content(existing + values)
                    self.hasMoreSongSuggestions = values.count == Self.suggestionPageSize
                case .artists:
                    let values = try await self.catalog.artistSuggestions(
                        query: term,
                        limit: Self.suggestionPageSize,
                        offset: offset
                    )
                    guard !Task.isCancelled,
                          self.isCurrentSearch(generation: generation, query: term, scope: scope),
                          case let .content(existing) = self.artistSuggestions,
                          existing.count == offset
                    else { return }
                    self.artistSuggestions = .content(existing + values)
                    self.hasMoreArtistSuggestions = values.count == Self.suggestionPageSize
                }
            } catch is CancellationError {
                return
            } catch {
                guard let self,
                      self.isCurrentSearch(generation: generation, query: term, scope: scope)
                else { return }
                // The first page stays visible. This message is only for the
                // active query/scope, so a later search cannot inherit it.
                self.pagingError = error.localizedDescription
            }
        }
    }

    private var normalizedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func isCurrentSearch(
        generation: Int,
        query: String,
        scope: SearchScope
    ) -> Bool {
        generation == searchGeneration && query == normalizedQuery && scope == searchScope
    }

    private static func validHarvestURL(from input: String) -> URL? {
        guard let url = URL(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              let host = url.host?.lowercased(),
              host == "hooktheory.com" || host.hasSuffix(".hooktheory.com")
        else { return nil }
        let pathComponents = url.pathComponents.dropFirst().map { $0.lowercased() }
        guard pathComponents.count >= 4,
              pathComponents[0] == "theorytab",
              pathComponents[1] == "view",
              !pathComponents[2].isEmpty,
              !pathComponents[3].isEmpty
        else { return nil }
        return url
    }

    private static func canonicalArtistName(_ artist: String?) -> String {
        artist?
            .replacingOccurrences(of: "-", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}
