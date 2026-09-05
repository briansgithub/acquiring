import AcquiringAudio
import AcquiringCatalog
import AcquiringCore
import CryptoKit
import Foundation
import Observation
import SwiftData

struct UITestCatalogFixture: Decodable {
    struct Source: Decodable {
        let snapshot: String
        let schemaVersion: Int
        let songCount: Int
        let payloadEncoding: String
        let payloadCompression: String
    }

    struct Song: Decodable {
        let id: String
        let artist: String
        let title: String
        let url: String
        let status: String
        let alphaGroup: String
        let modes: Set<String>
        let compressedPayloadByteCount: Int
        let compressedPayloadSHA256: String
        let payloadBase64Chunks: [String]

        func catalogSong() throws -> CatalogSong {
            guard let url = URL(string: url), url.scheme == "https", url.host != nil else {
                throw CatalogError.invalidSchema("UI test fixture has an invalid URL for \(id)")
            }
            return CatalogSong(id: id, artist: artist, title: title, url: url, status: status)
        }

        func compressedPayload() throws -> Data {
            guard !payloadBase64Chunks.isEmpty, payloadBase64Chunks.allSatisfy({ !$0.isEmpty }) else {
                throw CatalogError.invalidPayload("UI test fixture has no base64 payload for \(id)")
            }
            guard let payload = Data(base64Encoded: payloadBase64Chunks.joined()), !payload.isEmpty else {
                throw CatalogError.invalidPayload("UI test fixture has invalid base64 for \(id)")
            }
            guard payload.count == compressedPayloadByteCount else {
                throw CatalogError.invalidPayload("UI test fixture payload size does not match for \(id)")
            }
            guard payload.starts(with: [0x1F, 0x8B]) else {
                throw CatalogError.invalidPayload("UI test fixture payload is not gzip for \(id)")
            }
            let checksum = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
            guard checksum == compressedPayloadSHA256 else {
                throw CatalogError.invalidPayload("UI test fixture payload checksum does not match for \(id)")
            }
            return payload
        }
    }

    let source: Source
    let songs: [Song]

    static func load(from bundle: Bundle = .main) throws -> Self {
        guard let resourceURL = bundle.url(forResource: "ios_ui_test_catalog", withExtension: "json") else {
            throw CatalogError.invalidSchema("Bundled UI test catalog fixture is missing")
        }
        do {
            let fixture = try JSONDecoder().decode(Self.self, from: Data(contentsOf: resourceURL))
            guard fixture.source.payloadEncoding == "base64-chunks", fixture.source.payloadCompression == "gzip" else {
                throw CatalogError.invalidSchema("Bundled UI test catalog fixture has unsupported payload encoding")
            }
            guard !fixture.songs.isEmpty, Set(fixture.songs.map(\.id)).count == fixture.songs.count else {
                throw CatalogError.invalidSchema("Bundled UI test catalog fixture is empty or contains duplicate song IDs")
            }
            return fixture
        } catch let error as CatalogError {
            throw error
        } catch {
            throw CatalogError.invalidSchema("Bundled UI test catalog fixture could not be decoded: \(error.localizedDescription)")
        }
    }
}

struct UITestSession {
    static let launchEnvironmentKey = "ACQUIRING_UI_TEST_SESSION_ID"

    let identifier: String

    var catalogDirectoryURL: URL {
        FileManager.default.temporaryDirectory
            .appending(path: "AcquiringUITests")
            .appending(path: identifier)
    }

    var historySuiteName: String { "AcquiringUITests.\(identifier)" }

    static func current(processInfo: ProcessInfo = .processInfo) -> Self? {
#if DEBUG
        guard processInfo.arguments.contains("--ui-testing") else { return nil }
        let candidate = processInfo.environment[launchEnvironmentKey] ?? UUID().uuidString
        let identifier = candidate.filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
        return Self(identifier: identifier.isEmpty ? UUID().uuidString : identifier)
#else
        nil
#endif
    }

    func resetPersistentFixtures() throws {
        let fileManager = FileManager.default
        if fileManager.fileExists(atPath: catalogDirectoryURL.path) {
            try fileManager.removeItem(at: catalogDirectoryURL)
        }
        UserDefaults(suiteName: historySuiteName)?.removePersistentDomain(forName: historySuiteName)
    }
}

final class ExclusiveCatalogMaintenanceService: CatalogMaintenanceService, @unchecked Sendable {
    typealias Stream = AsyncThrowingStream<CatalogProgress, any Error>

    private let base: any CatalogMaintenanceService
    private let didRelease: (@Sendable () -> Void)?
    private let lock = NSLock()
    private var isBusy = false

    init(
        base: any CatalogMaintenanceService,
        didRelease: (@Sendable () -> Void)? = nil
    ) {
        self.base = base
        self.didRelease = didRelease
    }

    func downloadAndInstall() -> CatalogMaintenanceRun {
        exclusiveRun { base.downloadAndInstall() }
    }

    func harvest(url: URL) -> CatalogMaintenanceRun {
        exclusiveRun { base.harvest(url: url) }
    }

    private func exclusiveRun(_ makeSource: () -> CatalogMaintenanceRun) -> CatalogMaintenanceRun {
        // This gates app callers; the base service still owns cancellation-safe staging cleanup.
        guard acquire() else {
            let events = Stream { continuation in
                continuation.finish(throwing: CatalogMaintenanceGateError.operationInProgress)
            }
            return CatalogMaintenanceRun(events: events, requestCancellation: { .noOperation })
        }
        let source = makeSource()
        let events = Stream { continuation in
            Task {
                var released = false
                do {
                    for try await progress in source.events {
                        if case .completed = progress, !released {
                            self.release()
                            released = true
                        }
                        continuation.yield(progress)
                    }
                    if !released { self.release() }
                    continuation.finish()
                } catch is CancellationError {
                    if !released { self.release() }
                    continuation.finish()
                } catch {
                    if !released { self.release() }
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in
                _ = source.requestCancellation()
            }
        }
        return CatalogMaintenanceRun(events: events) { source.requestCancellation() }
    }

    private func acquire() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !isBusy else { return false }
        isBusy = true
        return true
    }

    private func release() {
        lock.lock()
        isBusy = false
        lock.unlock()
        didRelease?()
    }
}

private enum CatalogMaintenanceGateError: LocalizedError, Sendable {
    case operationInProgress

    var errorDescription: String? {
        "Another catalog operation is already running in a different window."
    }
}

enum QuizDisplayMode: String, CaseIterable, Hashable, Identifiable {
    case full
    case rootOnly

    var id: Self { self }

    var title: String {
        switch self {
        case .full: "Full"
        case .rootOnly: "Root-only"
        }
    }
}

/// A visual rendering preference only; never changes the audio clock or tempo.
enum TimelineFrameRatePreference: String, CaseIterable, Identifiable {
    case standard = "60"
    case maximum = "maximum"

    static let defaultsKey = "timelineFrameRate"
    var id: Self { self }

    var title: String {
        switch self {
        case .standard: "60 fps"
        case .maximum: "Maximum"
        }
    }

    func framesPerSecond(displayMaximum: Int) -> Int {
        let supportedMaximum = max(displayMaximum, 1)
        switch self {
        case .standard: return min(60, supportedMaximum)
        case .maximum: return supportedMaximum
        }
    }
}

struct QuizContinuityState: Equatable {
    let songID: String
    var sectionID: String
    var mode: QuizDisplayMode = .full
    /// The shared sound-control payload for Quiz. New controls belong here so
    /// view continuity and audio commands continue to use one configuration.
    var playbackConfiguration = QuizPlaybackConfiguration()

    /// Kept as the narrow call-site API while the remaining controls migrate
    /// onto `playbackConfiguration`.
    var tempoPercent: Double {
        get { playbackConfiguration.tempoPercent }
        set { playbackConfiguration.tempoPercent = newValue }
    }
    var usesRelativeIonianContext = false
}

/// Shared Quiz settings retained across section changes and tab navigation.
struct QuizPlaybackConfiguration: Equatable {
    static let defaultTempoPercent = 100.0
    static let tempoRange = 0.0...200.0

    var tempoPercent: Double = defaultTempoPercent {
        didSet { tempoPercent = Self.normalizedTempoPercent(tempoPercent) }
    }
    var soundConfiguration = QuizSoundConfiguration()

    static func normalizedTempoPercent(_ value: Double) -> Double {
        guard value.isFinite else { return defaultTempoPercent }
        return min(max(value, tempoRange.lowerBound), tempoRange.upperBound)
    }
}

@MainActor
@Observable
final class AppEnvironment {
    let catalog: CatalogCoordinator
    let maintenance: any CatalogMaintenanceService
    let catalogAssetMetadata: any CatalogAssetMetadataService
    let history: HistoryStore
    let userLibrary: UserLibraryStore
    let audio: AppAudioSystem
    let vocalPractice: VocalPracticeModel
    let catalogConfiguration: CatalogConfiguration
    private(set) var quizContinuity: QuizContinuityState?
    private let seedsUITestCatalog: Bool
#if DEBUG
    private let catalogLaunchUITestScenario: CatalogLaunchUITestScenario?
    private var hasPresentedCatalogLaunchFailure = false
#endif

    init(modelContext: ModelContext, uiTestSession: UITestSession? = UITestSession.current()) throws {
        let arguments = ProcessInfo.processInfo.arguments
        let isUITesting = uiTestSession != nil
#if DEBUG
        let launchScenario = isUITesting
            ? CatalogLaunchUITestScenario(arguments: arguments)
            : nil
        catalogLaunchUITestScenario = launchScenario
        seedsUITestCatalog = isUITesting
            && launchScenario != .empty
            && !arguments.contains("--ui-testing-catalog-empty")
#else
        seedsUITestCatalog = isUITesting && !arguments.contains("--ui-testing-catalog-empty")
#endif
        guard let contractURL = Bundle.main.url(forResource: "contract", withExtension: "json") else {
            throw CatalogError.invalidSchema("Bundled catalog contract is missing")
        }
        let contract = try CatalogContract.load(from: contractURL)
        let configuration: CatalogConfiguration
        if let uiTestSession {
            try uiTestSession.resetPersistentFixtures()
            configuration = CatalogConfiguration(
                directoryURL: uiTestSession.catalogDirectoryURL,
                downloadURL: URL(string: "https://example.invalid/catalog.db.gz")!,
                contract: contract
            )
        } else {
            configuration = try CatalogConfiguration.live(contract: contract)
        }
        let coordinator = CatalogCoordinator(configuration: configuration)
        catalog = coordinator
        catalogConfiguration = configuration
#if DEBUG
        let selectedAssetMetadata: any CatalogAssetMetadataService
        if isUITesting {
            selectedAssetMetadata = CatalogAssetMetadataUITestService(
                hasInstalledCatalog: seedsUITestCatalog,
                updateAvailable: arguments.contains("--ui-testing-catalog-update-available")
            )
        } else {
            selectedAssetMetadata = CatalogAssetMetadataTracker(configuration: configuration)
        }
        let selectedMaintenance: any CatalogMaintenanceService
        if isUITesting, let scenario = CatalogMaintenanceUITestScenario(arguments: arguments) {
            selectedMaintenance = CatalogMaintenanceUITestService(
                scenario: scenario,
                assetMetadata: selectedAssetMetadata,
                installFixture: { try await Self.installUITestCatalog(into: coordinator) }
            )
        } else {
            selectedMaintenance = DefaultCatalogMaintenanceService(
                coordinator: coordinator,
                configuration: configuration
            )
        }
#else
        let selectedAssetMetadata: any CatalogAssetMetadataService = CatalogAssetMetadataTracker(
            configuration: configuration
        )
        let selectedMaintenance: any CatalogMaintenanceService = DefaultCatalogMaintenanceService(
            coordinator: coordinator,
            configuration: configuration
        )
#endif
        catalogAssetMetadata = selectedAssetMetadata
        maintenance = ExclusiveCatalogMaintenanceService(base: selectedMaintenance)
        history = HistoryStore(suiteName: uiTestSession?.historySuiteName)
        userLibrary = try UserLibraryStore(context: modelContext)
        audio = AppAudioSystem()
        vocalPractice = VocalPracticeModel(audio: audio)
    }

    func quizContinuity(for songID: String) -> QuizContinuityState? {
        guard quizContinuity?.songID == songID else { return nil }
        return quizContinuity
    }

    @discardableResult
    func rememberQuizSection(songID: String, sectionID: String) -> QuizContinuityState {
        if quizContinuity?.songID == songID {
            quizContinuity?.sectionID = sectionID
        } else {
            quizContinuity = QuizContinuityState(songID: songID, sectionID: sectionID)
        }
        return quizContinuity!
    }

    func rememberQuizSettings(
        songID: String,
        mode: QuizDisplayMode? = nil,
        tempoPercent: Double? = nil,
        soundConfiguration: QuizSoundConfiguration? = nil,
        usesRelativeIonianContext: Bool? = nil
    ) {
        guard quizContinuity?.songID == songID else { return }
        if let mode { quizContinuity?.mode = mode }
        if let tempoPercent { quizContinuity?.tempoPercent = tempoPercent }
        if let soundConfiguration {
            quizContinuity?.playbackConfiguration.soundConfiguration = soundConfiguration
        }
        if let usesRelativeIonianContext {
            quizContinuity?.usesRelativeIonianContext = usesRelativeIonianContext
        }
    }

    func prepare() async throws {
#if DEBUG
        switch catalogLaunchUITestScenario {
        case .loading:
            try await Task.sleep(for: .seconds(3_600))
        case .failureThenReady where !hasPresentedCatalogLaunchFailure:
            hasPresentedCatalogLaunchFailure = true
            throw CatalogLaunchUITestError.preparationFailed
        case .ready, .empty, .failureThenReady, nil:
            break
        }
#endif
        try await catalog.prepare()
        if seedsUITestCatalog, try await catalog.songCount() == 0 {
            try await seedUITestCatalog()
        }
    }

    private func seedUITestCatalog() async throws {
        _ = try await Self.installUITestCatalog(into: catalog)
    }

    static func installUITestCatalog(
        into catalog: CatalogCoordinator,
        bundle: Bundle = .main
    ) async throws -> Int {
        let fixture = try UITestCatalogFixture.load(from: bundle)
        for song in fixture.songs {
            try await catalog.writeHarvested(
                song: try song.catalogSong(),
                payload: try song.compressedPayload(),
                alphaGroup: song.alphaGroup,
                modes: song.modes
            )
        }
        return try await catalog.songCount()
    }
}

#if DEBUG
private enum CatalogLaunchUITestScenario: Equatable, Sendable {
    case ready
    case empty
    case loading
    case failureThenReady

    init?(arguments: [String]) {
        let value = arguments
            .first { $0.hasPrefix("--ui-testing-scenario=") }?
            .dropFirst("--ui-testing-scenario=".count)
            .description

        if value == "library.ready" {
            self = .ready
        } else if value == "library.empty" {
            self = .empty
        } else if value == "library.loading" {
            self = .loading
        } else if value == "library.failureThenReady" {
            self = .failureThenReady
        } else if arguments.contains("--ui-testing-catalog-launch-loading") {
            self = .loading
        } else if arguments.contains("--ui-testing-catalog-launch-failure") {
            self = .failureThenReady
        } else {
            return nil
        }
    }
}

private enum CatalogLaunchUITestError: LocalizedError, Sendable {
    case preparationFailed

    var errorDescription: String? {
        "The test catalog could not be opened."
    }
}

private enum CatalogMaintenanceUITestScenario: Equatable, Sendable {
    case failure
    case cancellable
    case success
    case harvestFailure

    init?(arguments: [String]) {
        if arguments.contains("--ui-testing-catalog-harvest-failure") {
            self = .harvestFailure
        } else if arguments.contains("--ui-testing-catalog-install-failure") {
            self = .failure
        } else if arguments.contains("--ui-testing-catalog-install-cancellable") {
            self = .cancellable
        } else if arguments.contains("--ui-testing-catalog-install-success") {
            self = .success
        } else {
            return nil
        }
    }
}

private actor CatalogAssetMetadataUITestService: CatalogAssetMetadataService {
    private static let currentIdentity = CatalogAssetIdentity(
        eTag: "\"ui-test-current\"",
        lastModified: "Sat, 05 Sep 2026 12:00:00 GMT",
        contentLength: 1_024
    )
    private let remoteIdentity: CatalogAssetIdentity
    private var installedIdentity: CatalogAssetIdentity?

    init(hasInstalledCatalog: Bool, updateAvailable: Bool) {
        installedIdentity = hasInstalledCatalog ? Self.currentIdentity : nil
        remoteIdentity = updateAvailable
            ? CatalogAssetIdentity(
                eTag: "\"ui-test-update\"",
                lastModified: "Sat, 05 Sep 2026 13:00:00 GMT",
                contentLength: 2_048
            )
            : Self.currentIdentity
    }

    func remoteAsset() -> CatalogAssetMetadata {
        CatalogAssetMetadata(identity: remoteIdentity, byteCount: remoteIdentity.contentLength)
    }

    func installedAssetIdentity() -> CatalogAssetIdentity? {
        installedIdentity
    }

    func recordInstalledAsset(_ identity: CatalogAssetIdentity?) {
        installedIdentity = identity
    }
}

private final class UITestMaintenanceRunController: @unchecked Sendable {
    private enum Phase {
        case starting
        case cancellable(Task<Void, Never>)
        case committing
        case finished
    }

    private let lock = NSLock()
    private var phase: Phase = .starting

    func attach(_ task: Task<Void, Never>) {
        lock.lock()
        if case .starting = phase { phase = .cancellable(task) }
        lock.unlock()
    }

    func beginCommit() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        switch phase {
        case .starting, .cancellable:
            phase = .committing
            return true
        case .committing:
            return true
        case .finished:
            return false
        }
    }

    func finish() {
        lock.lock()
        phase = .finished
        lock.unlock()
    }

    @discardableResult
    func requestCancellation() -> CatalogCancellationDisposition {
        var task: Task<Void, Never>?
        let disposition: CatalogCancellationDisposition
        lock.lock()
        switch phase {
        case .cancellable(let value):
            task = value
            phase = .finished
            disposition = .accepted
        case .committing:
            disposition = .commitInProgress
        case .starting, .finished:
            disposition = .noOperation
        }
        lock.unlock()
        task?.cancel()
        return disposition
    }
}

private final class CatalogMaintenanceUITestService: CatalogMaintenanceService, @unchecked Sendable {
    typealias InstallFixture = @Sendable () async throws -> Int
    typealias Stream = AsyncThrowingStream<CatalogProgress, any Error>

    let scenario: CatalogMaintenanceUITestScenario
    let assetMetadata: any CatalogAssetMetadataService
    let installFixture: InstallFixture
    private let lock = NSLock()
    private var downloadAttempts = 0
    private var harvestAttempts = 0
    private var firstHarvestURL: URL?

    init(
        scenario: CatalogMaintenanceUITestScenario,
        assetMetadata: any CatalogAssetMetadataService,
        installFixture: @escaping InstallFixture
    ) {
        self.scenario = scenario
        self.assetMetadata = assetMetadata
        self.installFixture = installFixture
    }

    func downloadAndInstall() -> CatalogMaintenanceRun {
        lock.lock()
        downloadAttempts += 1
        let attempt = downloadAttempts
        lock.unlock()

        switch scenario {
        case .failure where attempt == 1:
            let events = Stream { continuation in
                continuation.yield(.connecting)
                continuation.yield(.downloading(fraction: 0.25))
                continuation.finish(throwing: CatalogMaintenanceUITestError.downloadFailed)
            }
            return CatalogMaintenanceRun(events: events, requestCancellation: { .noOperation })
        case .cancellable:
            let controller = UITestMaintenanceRunController()
            let events = Stream { continuation in
                let task = Task {
                    continuation.yield(.connecting)
                    continuation.yield(.downloading(fraction: 0.25))
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(60))
                    }
                    controller.finish()
                    continuation.finish()
                }
                controller.attach(task)
                continuation.onTermination = { _ in controller.requestCancellation() }
            }
            return CatalogMaintenanceRun(events: events) { controller.requestCancellation() }
        case .failure, .success:
            let controller = UITestMaintenanceRunController()
            let events = Stream { continuation in
                let task = Task {
                    do {
                        continuation.yield(.connecting)
                        continuation.yield(.preparing)
                        continuation.yield(.validating)
                        try Task.checkCancellation()
                        guard controller.beginCommit() else { throw CancellationError() }
                        continuation.yield(.installing)
                        let count = try await self.installFixture()
                        let remoteAsset = try await self.assetMetadata.remoteAsset()
                        try await self.assetMetadata.recordInstalledAsset(remoteAsset.identity)
                        controller.finish()
                        continuation.yield(.completed(songCount: count))
                        continuation.finish()
                    } catch is CancellationError {
                        controller.finish()
                        continuation.finish()
                    } catch {
                        controller.finish()
                        continuation.finish(throwing: error)
                    }
                }
                controller.attach(task)
                continuation.onTermination = { _ in controller.requestCancellation() }
            }
            return CatalogMaintenanceRun(events: events) { controller.requestCancellation() }
        case .harvestFailure:
            let events = Stream { continuation in
                continuation.finish(throwing: CatalogMaintenanceUITestError.harvestFailed)
            }
            return CatalogMaintenanceRun(events: events, requestCancellation: { .noOperation })
        }
    }

    func harvest(url: URL) -> CatalogMaintenanceRun {
        lock.lock()
        harvestAttempts += 1
        let attempt = harvestAttempts
        let expectedURL = firstHarvestURL ?? url
        if firstHarvestURL == nil { firstHarvestURL = url }
        let usesOriginalURL = url == expectedURL
        lock.unlock()

        guard usesOriginalURL else {
            let events = Stream { continuation in
                continuation.finish(throwing: CatalogMaintenanceUITestError.unexpectedHarvestURL)
            }
            return CatalogMaintenanceRun(events: events, requestCancellation: { .noOperation })
        }
        if scenario == .harvestFailure, attempt == 1 {
            let events = Stream { continuation in
                continuation.yield(.connecting)
                continuation.finish(throwing: CatalogMaintenanceUITestError.harvestFailed)
            }
            return CatalogMaintenanceRun(events: events, requestCancellation: { .noOperation })
        }
        let controller = UITestMaintenanceRunController()
        let events = Stream { continuation in
            let task = Task {
                do {
                    continuation.yield(.connecting)
                    continuation.yield(.harvesting(current: 1, total: 1))
                    try Task.checkCancellation()
                    guard controller.beginCommit() else { throw CancellationError() }
                    continuation.yield(.installing)
                    let count = try await self.installFixture()
                    controller.finish()
                    continuation.yield(.completed(songCount: count))
                    continuation.finish()
                } catch is CancellationError {
                    controller.finish()
                    continuation.finish()
                } catch {
                    controller.finish()
                    continuation.finish(throwing: error)
                }
            }
            controller.attach(task)
            continuation.onTermination = { _ in controller.requestCancellation() }
        }
        return CatalogMaintenanceRun(events: events) { controller.requestCancellation() }
    }
}

private enum CatalogMaintenanceUITestError: LocalizedError, Sendable {
    case downloadFailed
    case harvestFailed
    case unexpectedHarvestURL

    var errorDescription: String? {
        switch self {
        case .downloadFailed:
            "The test catalog update failed. The current catalog is still available."
        case .harvestFailed:
            "The test song harvest failed. The current catalog is still available."
        case .unexpectedHarvestURL:
            "Retry used a different song URL."
        }
    }
}
#endif
