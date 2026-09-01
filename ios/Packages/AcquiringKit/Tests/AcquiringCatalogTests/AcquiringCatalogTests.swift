import XCTest
@testable import AcquiringCatalog
import GRDB

final class AcquiringCatalogTests: XCTestCase {
    func testEmptyCatalogBootstrapsAtSchemaThree() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let coordinator = CatalogCoordinator(
            configuration: CatalogConfiguration(
                directoryURL: directory,
                downloadURL: URL(string: "https://example.invalid/catalog.db.gz")!
            )
        )
        try await coordinator.prepare()
        let count = try await coordinator.songCount()
        let status = try await coordinator.status()
        let metadata = try await coordinator.browseMetadata()
        XCTAssertEqual(count, 0)
        XCTAssertEqual(status, .unavailable)
        XCTAssertEqual(metadata, .init(browseCount: 0, ratedSongCount: 0, modeMembershipCount: 0))
    }

    func testRawAndGzipPayloadDecoderAcceptsRawJSON() throws {
        let payload = Data(#"{"verse":{"sectionName":"Verse","sectionIndex":0,"chords":[]}}"#.utf8)
        let result = try SongPayloadDecoder.decode(payload)
        XCTAssertEqual(result["verse"]?.safeSectionName, "Verse")
    }

    func testCandidateValidationChecksContractFloorPayloadsAndIndexes() throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let databaseURL = directory.appending(path: "candidate.db")
        let queue = try DatabaseQueue(path: databaseURL.path)
        try queue.write { db in
            try CatalogCoordinator.createSchema(in: db)
            for index in 1...2 {
                try db.execute(
                    sql: "INSERT INTO songs (slug, artist, title, url, status, dataBlob) VALUES (?, ?, ?, ?, ?, ?)",
                    arguments: ["song-\(index)", "Artist", "Song \(index)", "https://example.com", "ready", Data("{}".utf8)]
                )
                try db.execute(
                    sql: "INSERT INTO song_browse_entries (slug, artist, title, alphaGroup) VALUES (?, ?, ?, ?)",
                    arguments: ["song-\(index)", "Artist", "Song \(index)", "S"]
                )
            }
        }
        let contract = miniatureContract(minimumRows: 2)
        XCTAssertEqual(try CatalogCandidate.validate(at: databaseURL, contract: contract).browseCount, 2)
        try queue.write { db in
            try db.execute(sql: "UPDATE songs SET dataBlob = NULL WHERE slug = 'song-2'")
        }
        XCTAssertThrowsError(try CatalogCandidate.validate(at: databaseURL, contract: contract)) { error in
            XCTAssertEqual(error as? CatalogError, .incomplete(browseRows: 2, payloadRows: 1))
        }
        try queue.write { db in
            try db.execute(sql: "UPDATE songs SET dataBlob = ? WHERE slug = 'song-2'", arguments: [Data("{}".utf8)])
            try db.execute(sql: "DROP INDEX index_song_browse_modes_mode")
        }
        XCTAssertThrowsError(try CatalogCandidate.validate(at: databaseURL, contract: contract))
    }

    func testVersionOneCandidateReceivesBrowseCompatibilitySchema() throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let databaseURL = directory.appending(path: "legacy.db")
        let queue = try DatabaseQueue(path: databaseURL.path)
        try queue.write { db in
            try db.execute(sql: """
                PRAGMA user_version = 1;
                CREATE TABLE songs (slug TEXT NOT NULL PRIMARY KEY, artist TEXT, title TEXT, url TEXT NOT NULL, status TEXT NOT NULL, dataBlob BLOB);
                INSERT INTO songs VALUES ('legacy', 'Artist', 'Legacy', 'https://example.com', 'ready', X'7B7D');
                """)
        }
        try CatalogCandidate.prepare(at: databaseURL)
        let result = try CatalogCandidate.validate(
            at: databaseURL,
            contract: miniatureContract(minimumRows: 1)
        )
        XCTAssertEqual(result.browseCount, 1)
        XCTAssertEqual(result.payloadCount, 1)
    }

    func testHooktheorySectionParserPreservesOrderAndDistinctTypes() throws {
        let html = """
            <a class="tb-section-tab" href="#tab-42">Verse</a>
            <a class="tb-section-tab" href="#tab-42">Chorus</a>
            <a class="tb-section-tab" href="#tab-84">Chorus</a>
            <a class="tb-section-tab" href="#tab-player">All Sections</a>
            """
        XCTAssertEqual(
            try HooktheoryHarvester.sectionReferences(html: html),
            [SectionReference(id: "42", name: "Verse"), SectionReference(id: "42", name: "Chorus")]
        )
    }

    private func miniatureContract(minimumRows: Int) -> CatalogContract {
        CatalogContract(
            name: "test",
            schemaVersion: 3,
            databaseFilename: "catalog.db",
            archiveFilename: "catalog.db.gz",
            compression: "gzip",
            minimumBrowseRows: minimumRows,
            requiredTables: CatalogContract.mobileV3.requiredTables,
            requiredIndexes: CatalogContract.mobileV3.requiredIndexes
        )
    }
}
