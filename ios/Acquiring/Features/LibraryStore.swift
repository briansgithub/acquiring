import AcquiringCatalog
import AcquiringCore
import Foundation
import Observation

struct CatalogDownloadInfo: Equatable {
    let formattedSize: String
    let songCount: Int
}

enum CatalogUpdateState: Equatable {
    case idle
    case checking
    case current
    case updateAvailable
    case unknown
    case failed(String)
}

struct ExternalBetaBuild: Equatable, Sendable {
    let version: String
    let build: String
}

enum ExternalBetaUpdateState: Equatable, Sendable {
    case idle
    case checking
    case current
    case installedBuildIsNewer
    case available(ExternalBetaBuild)
    case noExternalRelease
    case unsupportedMinimumOS(String)
    case unknown
}

struct ExternalBetaUpdateSnapshot: Equatable, Sendable {
    let state: ExternalBetaUpdateState
    let validUntil: Date?

    init(_ state: ExternalBetaUpdateState, validUntil: Date? = nil) {
        self.state = state
        self.validUntil = validUntil
    }
}

protocol ExternalBetaUpdateService: Sendable {
    func check() async -> ExternalBetaUpdateSnapshot
}

/// Reads the small, release-tool-produced manifest. The app never talks to App
/// Store Connect and intentionally treats every transport or validation problem
/// as unknown rather than making an update claim.
actor ExternalBetaUpdateManifestService: ExternalBetaUpdateService {
    static let manifestURL = URL(string: "https://github.com/briansgithub/acquiring/releases/download/ios-external-beta/latest.json")!

    typealias FetchData = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let fetchData: FetchData
    private let installedVersion: String
    private let installedBuild: String
    private let operatingSystemVersion: [Int]
    private let now: @Sendable () -> Date

    init(
        url: URL = ExternalBetaUpdateManifestService.manifestURL,
        session: URLSession = .shared,
        installedVersion: String? = nil,
        installedBuild: String? = nil,
        operatingSystemVersion: OperatingSystemVersion = ProcessInfo.processInfo.operatingSystemVersion,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.init(
            url: url,
            fetchData: { request in try await session.data(for: request) },
            installedVersion: installedVersion ?? Self.bundleValue("CFBundleShortVersionString"),
            installedBuild: installedBuild ?? Self.bundleValue("CFBundleVersion"),
            operatingSystemVersion: [
                operatingSystemVersion.majorVersion,
                operatingSystemVersion.minorVersion,
                operatingSystemVersion.patchVersion
            ],
            now: now
        )
    }

    init(
        url: URL = ExternalBetaUpdateManifestService.manifestURL,
        fetchData: @escaping FetchData,
        installedVersion: String,
        installedBuild: String,
        operatingSystemVersion: [Int],
        now: @escaping @Sendable () -> Date
    ) {
        self.fetchData = { request in
            var request = request
            request.url = url
            return try await fetchData(request)
        }
        self.installedVersion = installedVersion
        self.installedBuild = installedBuild
        self.operatingSystemVersion = operatingSystemVersion
        self.now = now
    }

    func check() async -> ExternalBetaUpdateSnapshot {
        do {
            var request = URLRequest(url: Self.manifestURL, cachePolicy: .reloadIgnoringLocalCacheData)
            request.timeoutInterval = 15
            let (data, response) = try await fetchData(request)
            guard let response = response as? HTTPURLResponse,
                  (200..<300).contains(response.statusCode)
            else { return ExternalBetaUpdateSnapshot(.unknown) }

            let manifest = try JSONDecoder().decode(Manifest.self, from: data)
            let currentTime = now()
            guard manifest.schemaVersion == 1, manifest.channel == "external",
                  let generatedAt = Self.date(from: manifest.generatedAt),
                  let validUntil = Self.date(from: manifest.validUntil),
                  generatedAt <= currentTime.addingTimeInterval(5 * 60),
                  validUntil > generatedAt,
                  validUntil > currentTime,
                  validUntil <= generatedAt.addingTimeInterval(24 * 60 * 60)
            else { return ExternalBetaUpdateSnapshot(.unknown) }
            guard let externalBuild = manifest.externalBuild else {
                return ExternalBetaUpdateSnapshot(.noExternalRelease, validUntil: validUntil)
            }
            guard let expiresAt = Self.date(from: externalBuild.expiresAt), expiresAt > currentTime,
                  let requiredOS = NumericVersion(externalBuild.minimumOSVersion, allowsDots: true),
                  let installedOS = NumericVersion(operatingSystemVersion.map(String.init).joined(separator: "."), allowsDots: true),
                  let externalVersion = NumericVersion(externalBuild.version, allowsDots: true),
                  let localVersion = NumericVersion(installedVersion, allowsDots: true),
                  let externalBuildNumber = NumericVersion(externalBuild.build, allowsDots: true),
                  let localBuildNumber = NumericVersion(installedBuild, allowsDots: true)
            else { return ExternalBetaUpdateSnapshot(.unknown) }

            let candidate = ExternalBetaBuild(version: externalBuild.version, build: externalBuild.build)
            let usableUntil = min(validUntil, expiresAt)
            guard installedOS >= requiredOS else {
                return ExternalBetaUpdateSnapshot(
                    .unsupportedMinimumOS(externalBuild.minimumOSVersion),
                    validUntil: usableUntil
                )
            }
            if externalVersion > localVersion { return ExternalBetaUpdateSnapshot(.available(candidate), validUntil: usableUntil) }
            if externalVersion < localVersion { return ExternalBetaUpdateSnapshot(.installedBuildIsNewer, validUntil: usableUntil) }
            if externalBuildNumber > localBuildNumber { return ExternalBetaUpdateSnapshot(.available(candidate), validUntil: usableUntil) }
            if externalBuildNumber < localBuildNumber { return ExternalBetaUpdateSnapshot(.installedBuildIsNewer, validUntil: usableUntil) }
            return ExternalBetaUpdateSnapshot(.current, validUntil: usableUntil)
        } catch {
            return ExternalBetaUpdateSnapshot(.unknown)
        }
    }

    private struct Manifest: Decodable {
        struct Build: Decodable {
            let version: String
            let build: String
            let minimumOSVersion: String
            let expiresAt: String
        }

        let schemaVersion: Int
        let channel: String
        let generatedAt: String
        let validUntil: String
        let externalBuild: Build?

        private enum CodingKeys: String, CodingKey {
            case schemaVersion
            case channel
            case generatedAt
            case validUntil
            case externalBuild
        }

        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
            channel = try container.decode(String.self, forKey: .channel)
            generatedAt = try container.decode(String.self, forKey: .generatedAt)
            validUntil = try container.decode(String.self, forKey: .validUntil)
            guard container.contains(.externalBuild) else {
                throw DecodingError.keyNotFound(
                    CodingKeys.externalBuild,
                    DecodingError.Context(
                        codingPath: container.codingPath,
                        debugDescription: "External beta manifest is missing externalBuild."
                    )
                )
            }
            externalBuild = try container.decodeIfPresent(Build.self, forKey: .externalBuild)
        }
    }

    private struct NumericVersion: Comparable {
        let parts: [String]

        init?(_ rawValue: String, allowsDots: Bool) {
            let components = rawValue.split(separator: ".", omittingEmptySubsequences: false)
            guard !components.isEmpty, components.count <= 3,
                  (allowsDots || components.count == 1),
                  components.allSatisfy({ part in
                      (1...9).contains(part.utf8.count)
                          && part.utf8.allSatisfy { $0 >= 48 && $0 <= 57 }
                  })
            else { return nil }
            var normalizedParts = components.map { part in
                let normalized = part.drop(while: { $0 == "0" })
                return normalized.isEmpty ? "0" : String(normalized)
            }
            while normalizedParts.count > 1, normalizedParts.last == "0" {
                normalizedParts.removeLast()
            }
            parts = normalizedParts
        }

        static func < (lhs: Self, rhs: Self) -> Bool {
            let count = max(lhs.parts.count, rhs.parts.count)
            for index in 0..<count {
                let left = index < lhs.parts.count ? lhs.parts[index] : "0"
                let right = index < rhs.parts.count ? rhs.parts[index] : "0"
                if left.count != right.count { return left.count < right.count }
                if left != right { return left < right }
            }
            return false
        }
    }

    private static func date(from value: String) -> Date? {
        let bytes = Array(value.utf8)
        guard bytes.count == 20,
              bytes[4] == 45, bytes[7] == 45, bytes[10] == 84,
              bytes[13] == 58, bytes[16] == 58, bytes[19] == 90,
              [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18].allSatisfy({ index in
                  bytes[index] >= 48 && bytes[index] <= 57
              })
        else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withDashSeparatorInDate, .withColonSeparatorInTime]
        return formatter.date(from: value)
    }

    private static func bundleValue(_ key: String) -> String {
        Bundle.main.object(forInfoDictionaryKey: key) as? String ?? ""
    }
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
    let browse: AllSongsBrowseStore
    let userContent: UserLibraryViewModel
    private(set) var catalogRevision = 0
    var query = "" { didSet { scheduleSearch() } }
    var searchScope: SearchScope = .songs { didSet { scheduleSearch() } }
    var maintenanceState: CatalogMaintenanceState = .idle
    var userContentError: String?
    var harvestURL = ""
    var downloadInfo: FeatureState<CatalogDownloadInfo> = .idle
    private(set) var catalogUpdateState: CatalogUpdateState = .idle
    private(set) var externalBetaUpdateState: ExternalBetaUpdateState = .idle
    var downloadPromptDismissed = false

    private let catalog: any CatalogRepository
    private let maintenance: any CatalogMaintenanceService
    private let assetMetadata: any CatalogAssetMetadataService
    private let externalBetaUpdates: any ExternalBetaUpdateService
    private let history: HistoryStore
    private let prepareCatalog: @MainActor () async throws -> Void
    private let downloadURL: URL
    private let expectedSongCount: Int
    @ObservationIgnored private var searchTask: Task<Void, Never>?
    @ObservationIgnored private var loadMoreTask: Task<Void, Never>?
    @ObservationIgnored private var searchGeneration = 0
    @ObservationIgnored private var maintenanceTask: Task<Void, Never>?
    @ObservationIgnored private var maintenanceCancellation: (@Sendable () -> CatalogCancellationDisposition)?
    @ObservationIgnored private var maintenanceGeneration = 0
    @ObservationIgnored private var catalogUpdateGeneration = 0
    @ObservationIgnored private var betaUpdateGeneration = 0
    @ObservationIgnored private var lastCatalogUpdateCheck: Date?
    @ObservationIgnored private var lastBetaUpdateCheck: Date?
    @ObservationIgnored private var betaUpdateValidUntil: Date?
    @ObservationIgnored private var betaExpiryTask: Task<Void, Never>?
    @ObservationIgnored private var retryHarvestURL: URL?
    @ObservationIgnored private var didAttemptAutomaticCatalogInstall = false
    private var catalogInstallWasAutomatic = false

    private static let updateRefreshInterval: TimeInterval = 60 * 60

    var hasInstalledCatalog: Bool {
        guard case let .content(count) = catalogState else { return false }
        return count > 0
    }

    var isAutomaticCatalogInstall: Bool {
        catalogInstallWasAutomatic
    }

    var isAutomaticCatalogInstallRunning: Bool {
        isAutomaticCatalogInstall && maintenanceState.isRunning
    }

    var shouldShowMissingCatalogNotice: Bool {
        guard !hasInstalledCatalog else { return false }
        guard !maintenanceState.isRunning else { return false }
        if case .failure = catalogState { return true }
        guard case .empty = catalogState else { return false }

        switch maintenanceState {
        case .cancelled(operation: .downloadAndInstall),
             .failed(operation: .downloadAndInstall, message: _):
            return true
        case let .completed(operation: .downloadAndInstall, songCount):
            return songCount == 0
        case .idle, .running, .cancelling, .completed, .cancelled, .failed:
            return false
        }
    }

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
        query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    convenience init(environment: AppEnvironment) {
        self.init(
            catalog: environment.catalog,
            maintenance: environment.maintenance,
            assetMetadata: environment.catalogAssetMetadata,
            externalBetaUpdates: environment.externalBetaUpdates,
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
        assetMetadata: any CatalogAssetMetadataService,
        externalBetaUpdates: any ExternalBetaUpdateService = ExternalBetaUpdateManifestService(),
        history: HistoryStore,
        userLibrary: UserLibraryStore,
        prepareCatalog: @escaping @MainActor () async throws -> Void,
        downloadURL: URL = URL(string: "https://example.invalid/catalog.db.gz")!,
        expectedSongCount: Int = 0
    ) {
        self.catalog = catalog
        self.maintenance = maintenance
        self.assetMetadata = assetMetadata
        self.externalBetaUpdates = externalBetaUpdates
        self.history = history
        self.browse = AllSongsBrowseStore(catalog: catalog)
        self.userContent = UserLibraryViewModel(catalog: catalog, userLibrary: userLibrary)
        self.prepareCatalog = prepareCatalog
        self.downloadURL = downloadURL
        self.expectedSongCount = expectedSongCount
    }

    func load() async {
        catalogState = .loading
        scheduleSearch(debounced: false)
        do {
            try await prepareCatalog()
            let count = try await catalog.songCount()
            catalogState = count == 0 ? .empty : .content(count)
            catalogRevision &+= 1
            if count == 0, !didAttemptAutomaticCatalogInstall {
                didAttemptAutomaticCatalogInstall = true
                startCatalogInstall(automatically: true)
            } else if count > 0 {
                scheduleSearch(debounced: false)
            }
            await refreshUserContent()
        } catch {
            catalogState = .failure(error.localizedDescription)
        }
    }

    func refreshUserContent() async {
        await userContent.refresh(catalogRevision: catalogRevision)
        do {
            let slugs = await history.songSlugs()
            recentSongs = try await catalog.songs(ids: slugs)
            var resolvedArtists: [String] = []
            for artist in await history.artists() {
                let resolved = try await catalog.resolvedArtistName(artist) ?? artist
                if !resolvedArtists.contains(where: { $0.caseInsensitiveCompare(resolved) == .orderedSame }) {
                    resolvedArtists.append(resolved)
                }
            }
            recentArtists = resolvedArtists
            userContentError = nil
        } catch {
            userContentError = error.localizedDescription
        }
    }

    func loadDownloadInfoIfNeeded() {
        guard downloadInfo == .idle else { return }
        downloadInfo = .loading
        let songCount = expectedSongCount
        Task {
            do {
                let metadata = try await assetMetadata.remoteAsset()
                let formattedSize = metadata.byteCount.map {
                    ByteCountFormatter.string(fromByteCount: $0, countStyle: .file)
                } ?? "Unknown size"
                downloadInfo = .content(CatalogDownloadInfo(formattedSize: formattedSize, songCount: songCount))
            } catch {
                downloadInfo = .failure(error.localizedDescription)
            }
        }
    }

    func checkForCatalogUpdate() async {
        await checkForCatalogUpdate(rateLimited: false)
    }

    func refreshUpdateIndicatorsIfNeeded() async {
        async let catalog: Void = checkForCatalogUpdate(rateLimited: true)
        async let beta: Void = checkForExternalBetaUpdate(rateLimited: true)
        _ = await (catalog, beta)
    }

    var hasAvailableUpdate: Bool {
        if case .updateAvailable = catalogUpdateState { return true }
        if case .available = externalBetaUpdateState {
            return betaUpdateValidUntil.map { $0 > Date() } ?? true
        }
        return false
    }

    var updateIndicatorAccessibilityLabel: String {
        let databaseAvailable: Bool
        if case .updateAvailable = catalogUpdateState {
            databaseAvailable = true
        } else {
            databaseAvailable = false
        }
        let betaAvailable: Bool
        if case .available = externalBetaUpdateState,
           betaUpdateValidUntil.map({ $0 > Date() }) ?? true {
            betaAvailable = true
        } else {
            betaAvailable = false
        }
        switch (databaseAvailable, betaAvailable) {
        case (true, true): return "Settings, database and beta updates available"
        case (true, false): return "Settings, database update available"
        case (false, true): return "Settings, beta update available"
        case (false, false): return "Settings"
        }
    }

    private func checkForCatalogUpdate(rateLimited: Bool) async {
        guard !maintenanceState.isRunning else { return }
        guard catalogUpdateState != .checking else { return }
        let currentTime = Date()
        if rateLimited, let lastCatalogUpdateCheck,
           currentTime.timeIntervalSince(lastCatalogUpdateCheck) < Self.updateRefreshInterval {
            return
        }
        guard case .content = catalogState else {
            catalogUpdateState = .idle
            return
        }

        lastCatalogUpdateCheck = currentTime
        catalogUpdateGeneration &+= 1
        let generation = catalogUpdateGeneration
        catalogUpdateState = .checking
        do {
            async let remote = assetMetadata.remoteAsset()
            async let installed = assetMetadata.installedAssetIdentity()
            let (remoteAsset, installedIdentity) = try await (remote, installed)
            guard generation == catalogUpdateGeneration else { return }
            guard let installedIdentity, let remoteIdentity = remoteAsset.identity else {
                catalogUpdateState = .unknown
                return
            }
            switch installedIdentity.matches(remoteIdentity) {
            case true: catalogUpdateState = .current
            case false: catalogUpdateState = .updateAvailable
            case nil: catalogUpdateState = .unknown
            }
        } catch {
            guard generation == catalogUpdateGeneration else { return }
            catalogUpdateState = .failed(error.localizedDescription)
        }
    }

    private func checkForExternalBetaUpdate(rateLimited: Bool) async {
        guard externalBetaUpdateState != .checking else { return }
        let currentTime = Date()
        if rateLimited, let lastBetaUpdateCheck,
           currentTime.timeIntervalSince(lastBetaUpdateCheck) < Self.updateRefreshInterval,
           betaUpdateValidUntil.map({ $0 > currentTime }) ?? true {
            return
        }

        lastBetaUpdateCheck = currentTime
        betaUpdateGeneration &+= 1
        let generation = betaUpdateGeneration
        externalBetaUpdateState = .checking
        let result = await externalBetaUpdates.check()
        guard generation == betaUpdateGeneration else { return }
        betaUpdateValidUntil = result.validUntil
        externalBetaUpdateState = result.state
        scheduleBetaExpiryInvalidation(validUntil: result.validUntil, generation: generation)
    }

    private func scheduleBetaExpiryInvalidation(validUntil: Date?, generation: Int) {
        betaExpiryTask?.cancel()
        guard let validUntil else { return }
        guard validUntil > Date() else {
            betaUpdateValidUntil = nil
            lastBetaUpdateCheck = nil
            externalBetaUpdateState = .unknown
            return
        }

        let nanoseconds = UInt64(max(0, validUntil.timeIntervalSinceNow) * 1_000_000_000)
        betaExpiryTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: nanoseconds)
            } catch {
                return
            }
            guard !Task.isCancelled, let self, generation == self.betaUpdateGeneration else { return }
            self.betaUpdateValidUntil = nil
            self.lastBetaUpdateCheck = nil
            self.externalBetaUpdateState = .unknown
        }
    }

    func openSong(_ song: CatalogSong) {
        Task {
            await history.addSong(song.id)
            await history.addArtist(song.artist)
        }
        path.append(.quiz(song.id))
    }

    func openArtist(from song: CatalogSong) async {
        let artist = song.artist?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
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
           let resolvedCurrentArtist = try? await catalog.resolvedArtistName(currentArtist),
           resolvedCurrentArtist.caseInsensitiveCompare(artist) == .orderedSame {
            return
        }
        if case let .artist(currentArtist)? = path.last,
           currentArtist.caseInsensitiveCompare(artist) == .orderedSame {
            return
        }
        path.append(.artist(artist))
    }

    func installCatalog() {
        startCatalogInstall(automatically: false)
    }

    private func startCatalogInstall(automatically: Bool) {
        guard canInstallCatalog else { return }
        catalogInstallWasAutomatic = automatically
        begin(
            operation: .downloadAndInstall,
            run: maintenance.downloadAndInstall()
        )
    }

    func harvest() {
        guard canHarvest else { return }
        catalogInstallWasAutomatic = false
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
        if operation == .downloadAndInstall {
            catalogUpdateGeneration &+= 1
            catalogUpdateState = .idle
        } else {
            catalogInstallWasAutomatic = false
        }
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
                    catalogRevision &+= 1
                    if count > 0 {
                        scheduleSearch(debounced: false)
                    }
                    await refreshUserContent()
                    guard generation == maintenanceGeneration, !Task.isCancelled else { return }
                    maintenanceState = .completed(operation: operation, songCount: count)
                    if operation == .downloadAndInstall {
                        catalogUpdateState = .current
                    }
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

    /// Runs the current search without waiting for the type-ahead debounce.
    /// This is used by the keyboard's Search action so hardware and software
    /// Return both produce an observable result immediately.
    func submitSearch() {
        scheduleSearch(debounced: false)
    }

    private func scheduleSearch(debounced: Bool = true) {
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
        guard hasInstalledCatalog else {
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
                if debounced {
                    try await Task.sleep(for: .milliseconds(300))
                }
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

}
