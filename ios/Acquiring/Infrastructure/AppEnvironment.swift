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
    let maintenance: DefaultCatalogMaintenanceService
    let history: HistoryStore
    let userLibrary: UserLibraryStore
    let audio: AppAudioSystem
    private let seedsUITestCatalog: Bool

    init(modelContext: ModelContext) throws {
        let isUITesting = ProcessInfo.processInfo.arguments.contains("--ui-testing")
        seedsUITestCatalog = isUITesting
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
        maintenance = DefaultCatalogMaintenanceService(coordinator: coordinator, configuration: configuration)
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
