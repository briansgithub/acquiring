import SwiftData
import XCTest
@testable import Acquiring

final class AcquiringTests: XCTestCase {
    @MainActor
    func testPlaylistPersistsInMemory() throws {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: PlaylistRecord.self,
            configurations: configuration
        )
        let playlist = PlaylistRecord(name: "Favorites")
        container.mainContext.insert(playlist)
        try container.mainContext.save()

        let playlists = try container.mainContext.fetch(FetchDescriptor<PlaylistRecord>())
        XCTAssertEqual(playlists.map(\.name), ["Favorites"])
    }

    func testSharedParityCorpusIsBundledAndDecodable() throws {
        let fixtureURL = try XCTUnwrap(
            Bundle(for: AcquiringTests.self).url(
                forResource: "corpus_parity",
                withExtension: "json"
            )
        )
        let data = try Data(contentsOf: fixtureURL)
        let cases = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [[String: Any]])

        XCTAssertFalse(cases.isEmpty)
        XCTAssertNotNil(cases.first?["expectedRoman"])
        XCTAssertNotNil(cases.first?["expectedPcs"])
    }
}
