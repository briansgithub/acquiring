import AcquiringCore
import Foundation
import GRDB
import XCTest
@testable import AcquiringCatalog

/// A catalog install replaces the database as a whole file, so a manually
/// harvested song written only into the catalog is destroyed by the next
/// download. These tests pin the ledger that survives that swap.
final class HarvestLedgerTests: XCTestCase {

    // MARK: Manual harvests survive an install

    func testHarvestSurvivesAnInstallWhoseCatalogOmitsIt() async throws {
        let fixture = try makeFixture()
        defer { fixture.tearDown() }
        try await fixture.coordinator.prepare()
        try await fixture.harvest(slug: "artist__mine", title: "My Harvest", modes: ["Ionian"])

        let staged = try fixture.makePayload(slugs: ["catalog-a", "catalog-b"])
        let events = try await fixture.install(payloadURL: staged)

        let restored = try await fixture.coordinator.song(id: "artist__mine")
        XCTAssertEqual(restored?.title, "My Harvest", "a harvest the new catalog lacks must survive the swap")
        let document = try await fixture.coordinator.songDocument(id: "artist__mine")
        XCTAssertEqual(document.sections.count, 1, "its chords must come back with it")
        let count = try await fixture.coordinator.songCount()
        XCTAssertEqual(count, 3, "two catalog songs plus the restored harvest")
        XCTAssertEqual(
            events.last,
            .completed(songCount: 3),
            "the reported count must include what the replay put back"
        )

        let modes = try await fixture.modes(of: "artist__mine")
        XCTAssertEqual(modes, ["Ionian"], "browse membership is rebuilt too, or the song is unreachable")
        let browsed = try await fixture.coordinator.browseSongs(group: .alphabetical("M"), filter: "")
        XCTAssertEqual(browsed.map(\.id), ["artist__mine"])
    }

    func testNewCatalogWinsWhenItCarriesTheSameSlug() async throws {
        let fixture = try makeFixture()
        defer { fixture.tearDown() }
        try await fixture.coordinator.prepare()
        try await fixture.harvest(slug: "shared-song", title: "Stale Harvest Title", modes: ["Aeolian"])

        let staged = try fixture.makePayload(slugs: ["shared-song"], complexityRating: 42)
        _ = try await fixture.install(payloadURL: staged)

        let song = try await fixture.coordinator.song(id: "shared-song")
        XCTAssertEqual(song?.title, "Song shared-song", "the fresher catalog row wins")
        XCTAssertEqual(song?.complexityRating, 42, "including the rating a harvest can never produce")
        let count = try await fixture.coordinator.songCount()
        XCTAssertEqual(count, 1, "the ledger must not duplicate a song the catalog already carries")
    }

    // MARK: Legacy amnesty

    func testSongsHarvestedBeforeTheLedgerExistedAreAdoptedOnceAndOnlyOnce() async throws {
        let fixture = try makeFixture()
        defer { fixture.tearDown() }
        try await fixture.coordinator.prepare()
        // No ledger entry: exactly the state left by a build that predates it.
        try await fixture.writeCatalogOnlySong(slug: "legacy-harvest", title: "Legacy Harvest")

        let first = try fixture.makePayload(slugs: ["catalog-a", "catalog-b"])
        _ = try await fixture.install(payloadURL: first)

        let adopted = try await fixture.coordinator.song(id: "legacy-harvest")
        XCTAssertEqual(adopted?.title, "Legacy Harvest", "the pre-ledger harvest is rescued by the one-time sweep")

        // Second install: "catalog-b" is a catalog row the new catalog drops on
        // purpose. The amnesty is spent, so it must not be resurrected.
        let second = try fixture.makePayload(slugs: ["catalog-a"])
        _ = try await fixture.install(payloadURL: second)

        let pruned = try await fixture.coordinator.song(id: "catalog-b")
        XCTAssertNil(pruned, "a deliberate catalog prune must stick once the amnesty is spent")
        let stillAdopted = try await fixture.coordinator.song(id: "legacy-harvest")
        XCTAssertNotNil(stillAdopted, "but a song already in the ledger keeps coming back")
    }

    // MARK: Replay durability

    func testReplayIsIdempotent() async throws {
        let fixture = try makeFixture()
        defer { fixture.tearDown() }
        try await fixture.coordinator.prepare()
        try await fixture.harvest(slug: "artist__mine", title: "My Harvest", modes: ["Ionian"])

        let first = try await fixture.coordinator.replayHarvestLedger()
        let second = try await fixture.coordinator.replayHarvestLedger()
        XCTAssertEqual(first, 1)
        XCTAssertEqual(second, 1, "replay visits every entry every time")
        let count = try await fixture.coordinator.songCount()
        XCTAssertEqual(count, 1, "but never writes a second copy")
    }

    func testASwapThatDiesBeforeItsReplayIsRepairedOnTheNextLaunch() async throws {
        let fixture = try makeFixture()
        defer { fixture.tearDown() }
        try await fixture.coordinator.prepare()
        try await fixture.harvest(slug: "artist__mine", title: "My Harvest", modes: ["Ionian"])

        // Swap the database directly: the process dies before any replay runs.
        let staged = try fixture.makePayload(slugs: ["catalog-a"])
        try await fixture.coordinator.replaceLiveDatabase(with: staged)
        let lost = try await fixture.coordinator.song(id: "artist__mine")
        XCTAssertNil(lost, "precondition: the raw swap really does drop the harvest")

        let relaunched = fixture.makeCoordinator()
        try await relaunched.prepare()
        let restored = try await relaunched.song(id: "artist__mine")
        XCTAssertEqual(restored?.title, "My Harvest", "prepare() replays what the interrupted install could not")
    }

    // MARK: - Fixture

    private func makeFixture() throws -> Fixture {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return Fixture(root: root)
    }

    private struct Fixture {
        let root: URL
        let coordinator: CatalogCoordinator
        let configuration: CatalogConfiguration

        init(root: URL) {
            self.root = root
            configuration = CatalogConfiguration(
                directoryURL: root.appending(path: "Catalog", directoryHint: .isDirectory),
                downloadURL: URL(string: "https://stub.invalid/catalog.db.gz")!,
                contract: CatalogContract(
                    name: "test",
                    schemaVersion: 3,
                    databaseFilename: "catalog.db",
                    archiveFilename: "catalog.db.gz",
                    compression: "gzip",
                    minimumBrowseRows: 1,
                    requiredTables: CatalogContract.mobileV3.requiredTables,
                    requiredIndexes: CatalogContract.mobileV3.requiredIndexes
                ),
                ledgerDirectoryURL: root.appending(path: "UserHarvests", directoryHint: .isDirectory)
            )
            coordinator = CatalogCoordinator(configuration: configuration)
        }

        func makeCoordinator() -> CatalogCoordinator {
            CatalogCoordinator(configuration: configuration)
        }

        func tearDown() {
            try? FileManager.default.removeItem(at: root)
        }

        /// Writes a song the way a real manual harvest does: into the catalog
        /// and into the ledger.
        func harvest(slug: String, title: String, modes: Set<String>) async throws {
            let song = CatalogSong(
                id: slug,
                artist: "Harvest Artist",
                title: title,
                url: URL(string: "https://www.hooktheory.com/theorytab/view/\(slug)"),
                status: "enriched"
            )
            let alphaGroup = BrowseGrouping.alphabeticalGroup(for: title)
            try await coordinator.writeHarvested(
                song: song,
                payload: Self.payload,
                alphaGroup: alphaGroup,
                modes: modes
            )
            let opened = await coordinator.harvestLedger()
            let ledger = try XCTUnwrap(opened, "prepare() must have opened the ledger")
            try ledger.record(
                slug: slug,
                artist: song.artist,
                title: title,
                url: song.url?.absoluteString ?? "",
                status: song.status,
                payload: Self.payload,
                alphaGroup: alphaGroup,
                modes: modes
            )
        }

        /// A song in the catalog with no ledger entry, as left by a build that
        /// shipped before the ledger existed.
        func writeCatalogOnlySong(slug: String, title: String) async throws {
            try await coordinator.writeHarvested(
                song: CatalogSong(id: slug, artist: "Harvest Artist", title: title, status: "enriched"),
                payload: Self.payload,
                alphaGroup: BrowseGrouping.alphabeticalGroup(for: title),
                modes: ["Ionian"]
            )
        }

        func modes(of slug: String) async throws -> [String] {
            let songs = try await coordinator.browseSongs(group: .mode("Ionian"), filter: "")
            return songs.contains { $0.id == slug } ? ["Ionian"] : []
        }

        /// A contract-shaped catalog served as though downloaded. The install
        /// pipeline accepts an uncompressed payload, so no gzip step is needed.
        func makePayload(slugs: [String], complexityRating: Double? = nil) throws -> URL {
            let url = root.appending(path: UUID().uuidString + ".db")
            let queue = try DatabaseQueue(path: url.path)
            try queue.write { db in
                try CatalogCoordinator.createSchema(in: db)
                for slug in slugs {
                    let title = "Song \(slug)"
                    try db.execute(
                        sql: "INSERT INTO songs (slug, artist, title, url, status, dataBlob) VALUES (?, ?, ?, ?, ?, ?)",
                        arguments: [slug, "Catalog Artist", title, "https://example.com/\(slug)", "ready", Self.payload]
                    )
                    try db.execute(
                        sql: """
                            INSERT INTO song_browse_entries (slug, artist, title, alphaGroup, complexityRating)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                        arguments: [slug, "Catalog Artist", title, "S", complexityRating]
                    )
                }
            }
            return url
        }

        @discardableResult
        func install(payloadURL: URL) async throws -> [CatalogProgress] {
            let service = DefaultCatalogMaintenanceService(
                coordinator: coordinator,
                configuration: configuration,
                fetchArchive: { url in
                    let destination = FileManager.default.temporaryDirectory
                        .appending(path: UUID().uuidString + ".archive")
                    try FileManager.default.copyItem(at: payloadURL, to: destination)
                    let response = HTTPURLResponse(
                        url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil
                    )!
                    return (destination, response)
                }
            )
            var events: [CatalogProgress] = []
            for try await event in service.downloadAndInstall().events { events.append(event) }
            return events
        }

        static let payload = Data(#"{"verse":{"sectionName":"Verse","sectionIndex":0,"chords":[]}}"#.utf8)
    }
}
