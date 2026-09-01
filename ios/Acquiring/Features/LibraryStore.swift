import AcquiringCatalog
import AcquiringCore
import Foundation
import Observation

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
    case cancelled(operation: CatalogMaintenanceOperation)
    case failed(operation: CatalogMaintenanceOperation, message: String)
    case completed(operation: CatalogMaintenanceOperation, songCount: Int)

    var isRunning: Bool {
        if case .running = self { true } else { false }
    }
}

@MainActor
@Observable
final class LibraryStore {
    var path: [AppRoute] = []
    var catalogState: FeatureState<Int> = .idle
    var suggestions: FeatureState<[CatalogSong]> = .idle
    var artistSuggestions: FeatureState<[String]> = .idle
    var recentSongs: [CatalogSong] = []
    var recentArtists: [String] = []
    var playlists: [PlaylistSummary] = []
    var query = "" { didSet { scheduleSearch() } }
    var searchScope: SearchScope = .songs { didSet { scheduleSearch() } }
    var maintenanceState: CatalogMaintenanceState = .idle
    var userContentError: String?
    var harvestURL = ""

    private let catalog: any CatalogRepository
    private let maintenance: any CatalogMaintenanceService
    private let history: HistoryStore
    private let userLibrary: UserLibraryStore
    private let prepareCatalog: @MainActor () async throws -> Void
    @ObservationIgnored private var searchTask: Task<Void, Never>?
    @ObservationIgnored private var maintenanceTask: Task<Void, Never>?
    @ObservationIgnored private var maintenanceGeneration = 0
    @ObservationIgnored private var retryHarvestURL: URL?

    convenience init(environment: AppEnvironment) {
        self.init(
            catalog: environment.catalog,
            maintenance: environment.maintenance,
            history: environment.history,
            userLibrary: environment.userLibrary,
            prepareCatalog: { try await environment.prepare() }
        )
    }

    init(
        catalog: any CatalogRepository,
        maintenance: any CatalogMaintenanceService,
        history: HistoryStore,
        userLibrary: UserLibraryStore,
        prepareCatalog: @escaping @MainActor () async throws -> Void
    ) {
        self.catalog = catalog
        self.maintenance = maintenance
        self.history = history
        self.userLibrary = userLibrary
        self.prepareCatalog = prepareCatalog
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

    func openSong(_ song: CatalogSong) {
        Task {
            await history.addSong(song.id)
            await history.addArtist(song.artist)
        }
        path.append(.songDetail(song.id))
        path.append(.quiz(song.id))
    }

    func installCatalog() {
        guard !maintenanceState.isRunning else { return }
        begin(
            operation: .downloadAndInstall,
            stream: maintenance.downloadAndInstall()
        )
    }

    func harvest() {
        guard let url = Self.validHarvestURL(from: harvestURL) else {
            maintenanceState = .failed(
                operation: .harvest,
                message: "Enter a valid Hooktheory TheoryTab URL."
            )
            return
        }
        guard !maintenanceState.isRunning else { return }
        retryHarvestURL = url
        begin(operation: .harvest, stream: maintenance.harvest(url: url))
    }

    func cancelMaintenance() {
        guard case let .running(operation, _) = maintenanceState else { return }
        maintenanceGeneration += 1
        maintenanceState = .cancelled(operation: operation)
        maintenanceTask?.cancel()
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
            guard let url = retryHarvestURL else {
                harvest()
                return
            }
            begin(operation: .harvest, stream: maintenance.harvest(url: url))
        }
    }

    func waitForMaintenance() async {
        await maintenanceTask?.value
    }

    private func begin(
        operation: CatalogMaintenanceOperation,
        stream: AsyncThrowingStream<CatalogProgress, any Error>
    ) {
        maintenanceTask?.cancel()
        maintenanceGeneration += 1
        let generation = maintenanceGeneration
        maintenanceState = .running(operation: operation, progress: .connecting)
        maintenanceTask = Task { [weak self] in
            await self?.consume(stream, operation: operation, generation: generation)
        }
    }

    private func consume(
        _ stream: AsyncThrowingStream<CatalogProgress, any Error>,
        operation: CatalogMaintenanceOperation,
        generation: Int
    ) async {
        var completed = false
        do {
            for try await progress in stream {
                guard generation == maintenanceGeneration else { return }
                if case .completed = progress {
                    let count = try await catalog.songCount()
                    completed = true
                    maintenanceState = .completed(operation: operation, songCount: count)
                    catalogState = count == 0 ? .empty : .content(count)
                    await refreshUserContent()
                } else {
                    maintenanceState = .running(operation: operation, progress: progress)
                }
            }
            guard generation == maintenanceGeneration, !completed else { return }
            if Task.isCancelled {
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
            maintenanceState = .failed(operation: operation, message: error.localizedDescription)
        }
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else {
            suggestions = .idle
            artistSuggestions = .idle
            return
        }
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            do {
                switch searchScope {
                case .songs:
                    suggestions = .loading
                    let values = try await catalog.songSuggestions(query: term, limit: 20, offset: 0)
                    suggestions = values.isEmpty ? .empty : .content(values)
                case .artists:
                    artistSuggestions = .loading
                    let values = try await catalog.artistSuggestions(query: term, limit: 20, offset: 0)
                    artistSuggestions = values.isEmpty ? .empty : .content(values)
                }
            } catch is CancellationError {
            } catch {
                if searchScope == .songs { suggestions = .failure(error.localizedDescription) }
                else { artistSuggestions = .failure(error.localizedDescription) }
            }
        }
    }

    private static func validHarvestURL(from input: String) -> URL? {
        guard let url = URL(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              let host = url.host?.lowercased(),
              host == "hooktheory.com" || host.hasSuffix(".hooktheory.com"),
              url.path.lowercased().contains("/theorytab/view/")
        else { return nil }
        return url
    }
}
