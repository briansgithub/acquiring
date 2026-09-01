import AcquiringAudio
import AcquiringCatalog
import AcquiringCore
import Foundation
import Observation
import SwiftData

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

@MainActor
@Observable
final class AppEnvironment {
    let catalog: CatalogCoordinator
    let maintenance: any CatalogMaintenanceService
    let history: HistoryStore
    let userLibrary: UserLibraryStore
    let audio: AppAudioSystem
    private let seedsUITestCatalog: Bool

    init(modelContext: ModelContext, uiTestSession: UITestSession? = UITestSession.current()) throws {
        let arguments = ProcessInfo.processInfo.arguments
        let isUITesting = uiTestSession != nil
        seedsUITestCatalog = isUITesting && !arguments.contains("--ui-testing-catalog-empty")
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
#if DEBUG
        let selectedMaintenance: any CatalogMaintenanceService
        if isUITesting, let scenario = CatalogMaintenanceUITestScenario(arguments: arguments) {
            selectedMaintenance = CatalogMaintenanceUITestService(
                scenario: scenario,
                installFixture: { try await Self.installUITestCatalog(into: coordinator) }
            )
        } else {
            selectedMaintenance = DefaultCatalogMaintenanceService(
                coordinator: coordinator,
                configuration: configuration
            )
        }
#else
        let selectedMaintenance: any CatalogMaintenanceService = DefaultCatalogMaintenanceService(
            coordinator: coordinator,
            configuration: configuration
        )
#endif
        maintenance = ExclusiveCatalogMaintenanceService(base: selectedMaintenance)
        history = HistoryStore(suiteName: uiTestSession?.historySuiteName)
        userLibrary = try UserLibraryStore(context: modelContext)
        audio = AppAudioSystem()
    }

    func prepare() async throws {
        try await catalog.prepare()
        if seedsUITestCatalog, try await catalog.songCount() == 0 {
            try await seedUITestCatalog()
        }
    }

    private func seedUITestCatalog() async throws {
        _ = try await Self.installUITestCatalog(into: catalog)
    }

    private static func installUITestCatalog(into catalog: CatalogCoordinator) async throws -> Int {
        for (slug, artist, title, mode) in [
            ("sample-artist__seed-song", "Sample Artist", "Seed Song", "major"),
            ("sample-artist__second-song", "Sample Artist", "Second Song", "minor")
        ] {
            let section = ExtractedSection(
                songId: .string(slug),
                numericId: .string("42"),
                sectionName: "Verse",
                sectionIndex: 0,
                songInfo: title,
                chords: [
                    ["root": .number(1), "type": .number(5), "beat": .number(1), "duration": .number(2)],
                    ["root": .number(5), "type": .number(7), "beat": .number(3), "duration": .number(2)]
                ],
                metadata: [
                    "keys": .array([.object(["tonic": .string("C"), "scale": .string(mode), "beat": .number(1)])]),
                    "tempos": .array([.object(["bpm": .number(120)])]),
                    "endBeat": .number(5)
                ]
            )
            try await catalog.writeHarvested(
                song: CatalogSong(id: slug, artist: artist, title: title, url: URL(string: "https://www.hooktheory.com/theorytab/view/sample-artist/seed-song")),
                payload: JSONEncoder().encode(["verse": section]),
                alphaGroup: String(title.prefix(1)),
                modes: [mode == "major" ? "ionian" : "aeolian"]
            )
        }
        return try await catalog.songCount()
    }
}

#if DEBUG
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
    let installFixture: InstallFixture
    private let lock = NSLock()
    private var downloadAttempts = 0
    private var harvestAttempts = 0
    private var firstHarvestURL: URL?

    init(scenario: CatalogMaintenanceUITestScenario, installFixture: @escaping InstallFixture) {
        self.scenario = scenario
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
                continuation.finish(throwing: CatalogMaintenanceUITestError.downloadFailed)
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
