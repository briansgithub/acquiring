import AcquiringCore
import SwiftData
import XCTest
@testable import Acquiring

final class AcquiringTests: XCTestCase {
    @MainActor
    func testFavoritesMembershipIsUniqueAndNewestFirst() throws {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: PlaylistRecord.self, PlaylistEntryRecord.self,
            configurations: configuration
        )
        let store = try UserLibraryStore(context: container.mainContext)
        XCTAssertFalse(try store.contains(slug: "artist__first-song"))
        XCTAssertTrue(try store.toggle(slug: "artist__first-song"))
        XCTAssertTrue(try store.toggle(slug: "artist__second-song"))
        XCTAssertEqual(try store.newestSlugs(playlistID: UserLibraryStore.favoritesID), ["artist__second-song", "artist__first-song"])
        XCTAssertFalse(try store.toggle(slug: "artist__first-song"))
        XCTAssertEqual(try store.newestSlugs(playlistID: UserLibraryStore.favoritesID), ["artist__second-song"])
    }

    @MainActor
    func testDeletingCustomPlaylistCascadesEntries() throws {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: PlaylistRecord.self, PlaylistEntryRecord.self,
            configurations: configuration
        )
        let playlist = PlaylistRecord(id: "custom", name: "Custom")
        let entry = PlaylistEntryRecord(playlistID: playlist.id, slug: "artist__song", playlist: playlist)
        container.mainContext.insert(playlist)
        container.mainContext.insert(entry)
        try container.mainContext.save()
        container.mainContext.delete(playlist)
        try container.mainContext.save()
        XCTAssertTrue(try container.mainContext.fetch(FetchDescriptor<PlaylistEntryRecord>()).isEmpty)
    }

    func testHistoryUsesAndroidOrderingLimitAndArtistCanonicalization() async throws {
        let suite = "AcquiringTests.\(UUID().uuidString)"
        let history = HistoryStore(suiteName: suite)
        for index in 0..<12 { await history.addSong("song-\(index)") }
        await history.addArtist("The-Beatles")
        await history.addArtist("the beatles")
        let songs = await history.songSlugs()
        let artists = await history.artists()
        XCTAssertEqual(songs, (2..<12).reversed().map { "song-\($0)" })
        XCTAssertEqual(artists, ["the beatles"])
        await history.removeAll()
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

    func testSharedChordCorpusMatchesAndroid() throws {
        struct Fixture: Decodable {
            let id: String
            let json: String
            let key: KeyInfo
            let expectedRoman: String
            let expectedLetter: String
            let expectedPcs: [Int]
        }
        let fixtureURL = try XCTUnwrap(
            Bundle(for: AcquiringTests.self).url(forResource: "corpus_parity", withExtension: "json")
        )
        let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: fixtureURL))
        for fixture in fixtures {
            let chord = try JSONDecoder().decode([String: JSONValue].self, from: Data(fixture.json.utf8))
            XCTAssertEqual(ChordInterpreter.romanSymbol(for: chord, key: fixture.key), fixture.expectedRoman, fixture.id)
            XCTAssertEqual(ChordInterpreter.letterName(for: chord, key: fixture.key), fixture.expectedLetter, fixture.id)
            let pitchClasses = Set(ChordInterpreter.chordNotes(for: chord, key: fixture.key).map { (($0 % 12) + 12) % 12 }).sorted()
            XCTAssertEqual(pitchClasses, fixture.expectedPcs, fixture.id)
        }
    }
}
