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
        if isUITesting, let scenario = CatalogMaintenanceUITestScenario(arguments: arguments) {
            maintenance = CatalogMaintenanceUITestService(
                scenario: scenario,
                installFixture: { try await Self.installUITestCatalog(into: coordinator) }
            )
        } else {
            maintenance = DefaultCatalogMaintenanceService(coordinator: coordinator, configuration: configuration)
        }
#else
        maintenance = DefaultCatalogMaintenanceService(coordinator: coordinator, configuration: configuration)
#endif
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

private final class CatalogMaintenanceUITestService: CatalogMaintenanceService, @unchecked Sendable {
    typealias InstallFixture = @Sendable () async throws -> Int

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

    func downloadAndInstall() -> AsyncThrowingStream<CatalogProgress, any Error> {
        lock.lock()
        downloadAttempts += 1
        let attempt = downloadAttempts
        lock.unlock()

        switch scenario {
        case .failure where attempt == 1:
            AsyncThrowingStream { continuation in
                continuation.yield(.connecting)
                continuation.yield(.downloading(fraction: 0.25))
                continuation.finish(throwing: CatalogMaintenanceUITestError.downloadFailed)
            }
        case .cancellable:
            AsyncThrowingStream { continuation in
                let task = Task {
                    continuation.yield(.connecting)
                    continuation.yield(.downloading(fraction: 0.25))
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(60))
                    }
                }
                continuation.onTermination = { _ in task.cancel() }
            }
        case .failure, .success:
            AsyncThrowingStream { continuation in
                let task = Task {
                    do {
                        continuation.yield(.connecting)
                        continuation.yield(.preparing)
                        continuation.yield(.validating)
                        continuation.yield(.installing)
                        let count = try await self.installFixture()
                        continuation.yield(.completed(songCount: count))
                        continuation.finish()
                    } catch is CancellationError {
                        continuation.finish()
                    } catch {
                        continuation.finish(throwing: error)
                    }
                }
                continuation.onTermination = { _ in task.cancel() }
            }
        case .harvestFailure:
            AsyncThrowingStream { continuation in
                continuation.finish(throwing: CatalogMaintenanceUITestError.downloadFailed)
            }
        }
    }

    func harvest(url: URL) -> AsyncThrowingStream<CatalogProgress, any Error> {
        lock.lock()
        harvestAttempts += 1
        let attempt = harvestAttempts
        let expectedURL = firstHarvestURL ?? url
        if firstHarvestURL == nil { firstHarvestURL = url }
        let usesOriginalURL = url == expectedURL
        lock.unlock()

        guard usesOriginalURL else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: CatalogMaintenanceUITestError.unexpectedHarvestURL)
            }
        }
        if scenario == .harvestFailure, attempt == 1 {
            return AsyncThrowingStream { continuation in
                continuation.yield(.connecting)
                continuation.finish(throwing: CatalogMaintenanceUITestError.harvestFailed)
            }
        }
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    continuation.yield(.connecting)
                    continuation.yield(.harvesting(current: 1, total: 1))
                    let count = try await self.installFixture()
                    continuation.yield(.completed(songCount: count))
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
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
