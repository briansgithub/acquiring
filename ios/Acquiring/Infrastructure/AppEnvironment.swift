import AcquiringAudio
import AcquiringCatalog
import AcquiringCore
import Foundation
import Observation
import SwiftData

@MainActor
@Observable
final class AppEnvironment {
    let catalog: CatalogCoordinator
    let maintenance: any CatalogMaintenanceService
    let history: HistoryStore
    let userLibrary: UserLibraryStore
    let audio: AppAudioSystem
    private let seedsUITestCatalog: Bool

    init(modelContext: ModelContext) throws {
        let arguments = ProcessInfo.processInfo.arguments
        let isUITesting = arguments.contains("--ui-testing")
        seedsUITestCatalog = isUITesting && !arguments.contains("--ui-testing-catalog-empty")
        guard let contractURL = Bundle.main.url(forResource: "contract", withExtension: "json") else {
            throw CatalogError.invalidSchema("Bundled catalog contract is missing")
        }
        let contract = try CatalogContract.load(from: contractURL)
        let configuration: CatalogConfiguration
        if isUITesting {
            configuration = CatalogConfiguration(
                directoryURL: FileManager.default.temporaryDirectory.appending(path: "AcquiringUITests-\(UUID().uuidString)"),
                downloadURL: URL(string: "https://example.invalid/catalog.db.gz")!,
                contract: contract
            )
        } else {
            configuration = try CatalogConfiguration.live(contract: contract)
        }
        let coordinator = CatalogCoordinator(configuration: configuration)
        catalog = coordinator
        if isUITesting, let scenario = CatalogMaintenanceUITestScenario(arguments: arguments) {
            maintenance = CatalogMaintenanceUITestService(scenario: scenario)
        } else {
            maintenance = DefaultCatalogMaintenanceService(coordinator: coordinator, configuration: configuration)
        }
        history = HistoryStore()
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
    }
}

private enum CatalogMaintenanceUITestScenario: Sendable {
    case failure
    case cancellable
    case success

    init?(arguments: [String]) {
        if arguments.contains("--ui-testing-catalog-install-failure") {
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

private struct CatalogMaintenanceUITestService: CatalogMaintenanceService, Sendable {
    let scenario: CatalogMaintenanceUITestScenario

    func downloadAndInstall() -> AsyncThrowingStream<CatalogProgress, any Error> {
        switch scenario {
        case .failure:
            AsyncThrowingStream { continuation in
                continuation.yield(.connecting)
                continuation.yield(.downloading(fraction: 0.25))
                continuation.finish(throwing: CatalogMaintenanceUITestError.failed)
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
        case .success:
            AsyncThrowingStream { continuation in
                continuation.yield(.connecting)
                continuation.yield(.preparing)
                continuation.yield(.validating)
                continuation.yield(.installing)
                continuation.yield(.completed(songCount: 2))
                continuation.finish()
            }
        }
    }

    func harvest(url: URL) -> AsyncThrowingStream<CatalogProgress, any Error> {
        AsyncThrowingStream { continuation in
            continuation.finish(throwing: CatalogMaintenanceUITestError.failed)
        }
    }
}

private enum CatalogMaintenanceUITestError: LocalizedError, Sendable {
    case failed

    var errorDescription: String? {
        "The test catalog update failed. The current catalog is still available."
    }
}
