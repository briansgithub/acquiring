import AcquiringCore
import GRDB
import XCTest
@testable import AcquiringCatalog

/// Repository-level parity coverage for Android's `AllSongsDaoTest` contract.
/// These tests exercise the real GRDB projections used by the native All Songs
/// screen without involving SwiftUI or loading a song's chord document.
final class CatalogBrowseTests: XCTestCase {
    func testGroupsAllowCrossModeMembershipAndSortEveryGroupByTitle() async throws {
        let fixture = try await makeFixture([
            .init(slug: "zulu", title: "zulu", artist: "Artist", complexity: 12, modes: ["ionian", "dorian"]),
            .init(slug: "alpha-upper", title: "Alpha", artist: "Artist B", complexity: 12, modes: ["dorian"]),
            .init(slug: "alpha-lower", title: "alpha", artist: "Artist A", complexity: 25, modes: ["ionian"]),
            .init(slug: "number", title: "7 Nation Army", artist: "Artist", complexity: nil)
        ])
        defer { fixture.cleanup() }

        let alphabeticalTitles = try await fixture.coordinator
            .browseSongs(group: .alphabetical("A"), filter: "").map(\.title)
        let complexityTitles = try await fixture.coordinator
            .browseSongs(group: .complexity(1), filter: "").map(\.title)
        let ionianTitles = try await fixture.coordinator
            .browseSongs(group: .mode("ionian"), filter: "").map(\.title)
        let dorianTitles = try await fixture.coordinator
            .browseSongs(group: .mode("dorian"), filter: "").map(\.title)
        let unratedTitles = try await fixture.coordinator
            .browseSongs(group: .complexity(nil), filter: "").map(\.title)
        let alphabeticalRatings = try await fixture.coordinator
            .browseSongs(group: .alphabetical("A"), filter: "").map(\.complexityRating)
        let complexityRatings = try await fixture.coordinator
            .browseSongs(group: .complexity(1), filter: "").map(\.complexityRating)
        let unratedRatings = try await fixture.coordinator
            .browseSongs(group: .complexity(nil), filter: "").map(\.complexityRating)
        let modeRatings = try await fixture.coordinator
            .browseSongs(group: .mode("dorian"), filter: "").map(\.complexityRating)
        let complexityCounts = countMap(
            try await fixture.coordinator.browseCounts(mode: .complexity, filter: "")
        )
        let modeCounts = countMap(
            try await fixture.coordinator.browseCounts(mode: .mode, filter: "")
        )
        let metadata = try await fixture.coordinator.browseMetadata()

        XCTAssertEqual(alphabeticalTitles, ["alpha", "Alpha"])
        XCTAssertEqual(complexityTitles, ["Alpha", "zulu"])
        XCTAssertEqual(ionianTitles, ["alpha", "zulu"])
        XCTAssertEqual(dorianTitles, ["Alpha", "zulu"])
        XCTAssertEqual(unratedTitles, ["7 Nation Army"])
        // Browse rows carry the score itself, not just the bucket, so the list
        // can label each song when it is grouped by complexity.
        XCTAssertEqual(alphabeticalRatings, [25, 12])
        XCTAssertEqual(complexityRatings, [12, 12])
        XCTAssertEqual(unratedRatings, [nil])
        XCTAssertEqual(modeRatings, [12, 12])
        XCTAssertEqual(complexityCounts, ["1": 2, "2": 1, BrowseGrouping.unratedKey: 1])
        XCTAssertEqual(modeCounts, ["dorian": 2, "ionian": 2])
        XCTAssertEqual(
            metadata,
            BrowseMetadataStatus(browseCount: 4, ratedSongCount: 3, modeMembershipCount: 4)
        )
    }

    func testNumeralAndSymbolGroupsSupportNormalizedSubstringFiltering() async throws {
        let fixture = try await makeFixture([
            .init(slug: "seven", title: "7 Nation Army", artist: "The White-Stripes", complexity: 12, modes: ["ionian"]),
            .init(slug: "zero", title: "007 Theme", artist: "Film Artist", complexity: 22, modes: ["dorian"]),
            .init(slug: "symbol", title: "! Anthem", artist: "Symbolic", complexity: 32),
            .init(slug: "beta-filter", title: "Beta Song", artist: "Other", complexity: 12),
            .init(slug: "unrated-filter", title: "Quiet Tune", artist: "Sparse_Artist", complexity: nil)
        ])
        defer { fixture.cleanup() }

        let zeroTitles = try await fixture.coordinator
            .browseSongs(group: .alphabetical("0"), filter: "").map(\.title)
        let sevenTitles = try await fixture.coordinator
            .browseSongs(group: .alphabetical("7"), filter: "").map(\.title)
        let symbolTitles = try await fixture.coordinator
            .browseSongs(group: .alphabetical("#"), filter: "").map(\.title)
        let titleFiltered = try await fixture.coordinator
            .browseSongs(group: .alphabetical("7"), filter: "NATION_army").map(\.id)
        let artistFiltered = try await fixture.coordinator
            .browseSongs(group: .alphabetical("7"), filter: "white stripes").map(\.id)
        let complexityFiltered = try await fixture.coordinator
            .browseSongs(group: .complexity(1), filter: "  WHITE_stripes  ").map(\.id)
        let modeFiltered = try await fixture.coordinator
            .browseSongs(group: .mode("ionian"), filter: "nation-army").map(\.id)
        let unratedFiltered = try await fixture.coordinator
            .browseSongs(group: .complexity(nil), filter: "SPARSE artist").map(\.id)
        let alphabeticalCounts = countMap(
            try await fixture.coordinator.browseCounts(mode: .alphabetical, filter: "white_stripes")
        )
        let complexityCounts = countMap(
            try await fixture.coordinator.browseCounts(mode: .complexity, filter: "white-stripes")
        )
        let modeCounts = countMap(
            try await fixture.coordinator.browseCounts(mode: .mode, filter: "white stripes")
        )
        let unrelated = try await fixture.coordinator
            .browseSongs(group: .alphabetical("A"), filter: "unrelated")

        XCTAssertEqual(zeroTitles, ["007 Theme"])
        XCTAssertEqual(sevenTitles, ["7 Nation Army"])
        XCTAssertEqual(symbolTitles, ["! Anthem"])
        XCTAssertEqual(titleFiltered, ["seven"])
        XCTAssertEqual(artistFiltered, ["seven"])
        XCTAssertEqual(complexityFiltered, ["seven"])
        XCTAssertEqual(modeFiltered, ["seven"])
        XCTAssertEqual(unratedFiltered, ["unrated-filter"])
        XCTAssertEqual(alphabeticalCounts, ["7": 1])
        XCTAssertEqual(complexityCounts, ["1": 1])
        XCTAssertEqual(modeCounts, ["ionian": 1])
        XCTAssertEqual(unrelated, [])
    }

    func testLegacyBrowseRowsRemainAlphabeticalAndUnratedWithoutInventingModes() async throws {
        let fixture = try await makeFixture([
            .init(slug: "legacy", title: "Migration Song", artist: "Legacy Artist", complexity: nil),
            .init(slug: "numeric", title: "7 Nation Army", artist: "Legacy Artist", complexity: nil),
            .init(slug: "symbol", title: "! Anthem", artist: "Legacy Artist", complexity: nil)
        ])
        defer { fixture.cleanup() }

        let metadata = try await fixture.coordinator.browseMetadata()
        let alphabeticalCounts = countMap(
            try await fixture.coordinator.browseCounts(mode: .alphabetical, filter: "")
        )
        let complexityCounts = countMap(
            try await fixture.coordinator.browseCounts(mode: .complexity, filter: "")
        )
        let modeCounts = try await fixture.coordinator.browseCounts(mode: .mode, filter: "")
        let alphabeticalSongs = try await fixture.coordinator
            .browseSongs(group: .alphabetical("M"), filter: "").map(\.id)
        let unratedSongs = try await fixture.coordinator
            .browseSongs(group: .complexity(nil), filter: "").map(\.id)
        let ionianSongs = try await fixture.coordinator
            .browseSongs(group: .mode("ionian"), filter: "")

        XCTAssertEqual(
            metadata,
            BrowseMetadataStatus(browseCount: 3, ratedSongCount: 0, modeMembershipCount: 0)
        )
        XCTAssertEqual(alphabeticalCounts, ["#": 1, "7": 1, "M": 1])
        XCTAssertEqual(complexityCounts, [BrowseGrouping.unratedKey: 3])
        XCTAssertEqual(modeCounts, [])
        XCTAssertEqual(alphabeticalSongs, ["legacy"])
        XCTAssertEqual(unratedSongs, ["symbol", "numeric", "legacy"])
        XCTAssertEqual(ionianSongs, [])
    }

    func testRestoredPunctuationAndLegacySlugsRemainSearchable() async throws {
        let fixture = try await makeFixture([
            .init(slug: "journey__dont-stop-believin", title: "Don’t Stop Believin’", artist: "Journey", complexity: 12),
            .init(slug: "simon-and-garfunkel__the-sound-of-silence", title: "The Sound of Silence", artist: "Simon & Garfunkel", complexity: 12),
            .init(slug: "beyonce__deja-vu", title: "Déjà Vu", artist: "Beyoncé", complexity: nil)
        ])
        defer { fixture.cleanup() }

        let legacyTitle = try await fixture.coordinator.searchSongs(title: "dont-stop-believin").map(\.id)
        let readableTitle = try await fixture.coordinator.searchSongs(title: "Don't Stop Believin'").map(\.id)
        let accentTitle = try await fixture.coordinator.searchSongs(title: "deja vu").map(\.id)
        let legacyArtist = try await fixture.coordinator.songSuggestions(query: "simon-and-garfunkel").map(\.id)
        let artists = try await fixture.coordinator.artistSuggestions(query: "simon-and-garfunkel")
        let browsed = try await fixture.coordinator.browseSongs(group: .alphabetical("D"), filter: "DONT_stop_BELIEVIN").map(\.id)
        let counts = try await fixture.coordinator.browseCounts(mode: .alphabetical, filter: "simon-and-garfunkel")

        XCTAssertEqual(legacyTitle, ["journey__dont-stop-believin"])
        XCTAssertEqual(readableTitle, legacyTitle)
        XCTAssertEqual(accentTitle, ["beyonce__deja-vu"])
        XCTAssertEqual(legacyArtist, ["simon-and-garfunkel__the-sound-of-silence"])
        XCTAssertEqual(artists, ["Simon & Garfunkel"])
        XCTAssertEqual(browsed, legacyTitle)
        XCTAssertEqual(countMap(counts), ["T": 1])
    }

    func testArtistHistoryUsesStableIdentityAndPreservesDistinctSourceNames() async throws {
        let fixture = try await makeFixture([
            .init(slug: "puff-daddy__song", title: "Song", artist: "Diddy", complexity: nil),
            .init(slug: "ac-slash-dc__thunderstruck", title: "Thunderstruck", artist: "AC/DC", complexity: nil),
            .init(slug: "ac-dc__another-song", title: "Another Song", artist: "AC-DC", complexity: nil)
        ])
        defer { fixture.cleanup() }

        let resolved = try await fixture.coordinator.resolvedArtistName("puff daddy")
        let legacySongs = try await fixture.coordinator.songs(artist: "puff-daddy").map(\.id)
        let exactSongs = try await fixture.coordinator.songs(artist: "AC/DC").map(\.id)
        let hyphenatedSongs = try await fixture.coordinator.songs(artist: "AC-DC").map(\.id)
        let sourceNames = try await fixture.coordinator.artistSuggestions(query: "ac")

        XCTAssertEqual(resolved, "Diddy")
        XCTAssertEqual(legacySongs, ["puff-daddy__song"])
        XCTAssertEqual(exactSongs, ["ac-slash-dc__thunderstruck"])
        XCTAssertEqual(hyphenatedSongs, ["ac-dc__another-song"])
        XCTAssertEqual(sourceNames, ["AC-DC", "AC/DC"])
    }

    func testAmbiguousLegacyArtistNameDoesNotOpenAnArbitraryArtist() async throws {
        let fixture = try await makeFixture([
            .init(slug: "first__song", title: "Song", artist: "A.B.", complexity: nil),
            .init(slug: "second__song", title: "Song", artist: "A B", complexity: nil)
        ])
        defer { fixture.cleanup() }
        let resolved = try await fixture.coordinator.resolvedArtistName("a-b")
        let repository: any CatalogRepository = fixture.coordinator
        let repositoryResolved = try await repository.resolvedArtistName("a-b")
        let songs = try await fixture.coordinator.songs(artist: "a-b")
        XCTAssertNil(resolved)
        XCTAssertNil(repositoryResolved)
        XCTAssertTrue(songs.isEmpty)
    }

    func testArtistResolutionMatchesThroughConcreteAndRepositoryInterfaces() async throws {
        let fixture = try await makeFixture([
            .init(slug: "puff-daddy__song", title: "Song", artist: "Diddy", complexity: nil),
            .init(slug: "ac-slash-dc__song", title: "Song", artist: "AC/DC", complexity: nil),
            .init(slug: "ac-dc__song", title: "Song", artist: "AC-DC", complexity: nil),
            .init(slug: "first__song", title: "Song", artist: "A.B.", complexity: nil),
            .init(slug: "second__song", title: "Song", artist: "A B", complexity: nil),
            .init(slug: "a-b__song", title: "Song", artist: "Legacy Alias", complexity: nil)
        ])
        defer { fixture.cleanup() }
        let repository: any CatalogRepository = fixture.coordinator
        let cases: [(query: String, expected: String?)] = [
            ("puff daddy", "Diddy"),
            ("puff-daddy", "Diddy"),
            ("Diddy", "Diddy"),
            ("AC/DC", "AC/DC"),
            ("AC-DC", "AC-DC"),
            ("A.B.", "A.B."),
            ("A B", "A B"),
            ("missing artist", nil)
        ]
        for (query, expected) in cases {
            let concrete = try await fixture.coordinator.resolvedArtistName(query)
            let abstract = try await repository.resolvedArtistName(query)
            XCTAssertEqual(concrete, expected, "Concrete lookup: \(query)")
            XCTAssertEqual(abstract, expected, "Repository lookup: \(query)")
        }
    }

    func testReharvestFallbackKeepsExistingNamesAndBrowseGroup() async throws {
        let fixture = try await makeFixture([
            .init(slug: "source-artist__old-title", title: "A Source Title", artist: "Source Artist", complexity: 12)
        ])
        defer { fixture.cleanup() }
        let fallback = CatalogSong(id: "source-artist__old-title", artist: "source-artist", title: "old-title", status: "enriched")
        try await fixture.coordinator.writeHarvested(
            song: fallback,
            payload: Data("{}".utf8),
            alphaGroup: "O",
            modes: [],
            preserveExistingTitle: true,
            preserveExistingArtist: true
        )
        let song = try await fixture.coordinator.song(id: fallback.id)
        let browsed = try await fixture.coordinator.browseSongs(group: .alphabetical("A"), filter: "")
        XCTAssertEqual(song?.title, "A Source Title")
        XCTAssertEqual(song?.artist, "Source Artist")
        XCTAssertEqual(browsed.map(\.id), [fallback.id])
        XCTAssertEqual(browsed.first?.title, song?.title)
        XCTAssertEqual(browsed.first?.artist, song?.artist)
        XCTAssertEqual(browsed.first?.complexityRating, 12)
    }

    private func countMap(_ counts: [BrowseGroupCount]) -> [String: Int] {
        Dictionary(uniqueKeysWithValues: counts.map { ($0.key, $0.count) })
    }

    private func makeFixture(_ rows: [BrowseFixtureRow]) async throws -> BrowseCatalogFixture {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "CatalogBrowseTests-(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let configuration = CatalogConfiguration(
            directoryURL: directory,
            downloadURL: URL(string: "https://example.invalid/catalog.db.gz")!
        )
        let queue = try DatabaseQueue(path: directory.appending(path: "catalog.db").path)
        try await queue.write { db in
            try CatalogCoordinator.createSchema(in: db)
            for row in rows {
                try db.execute(
                    sql: """
                        INSERT INTO songs (slug, artist, title, url, status, dataBlob)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                    arguments: [
                        row.slug,
                        row.artist,
                        row.title,
                        "https://example.test/\(row.slug)",
                        "enriched",
                        Data("payload-\(row.slug)".utf8)
                    ]
                )
                try db.execute(
                    sql: """
                        INSERT INTO song_browse_entries
                            (slug, artist, title, alphaGroup, complexityRating, complexityBucket)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                    arguments: [
                        row.slug,
                        row.artist,
                        row.title,
                        BrowseGrouping.alphabeticalGroup(for: row.title),
                        row.complexity,
                        BrowseGrouping.complexityBucket(for: row.complexity)
                    ]
                )
                for mode in row.modes {
                    try db.execute(
                        sql: "INSERT INTO song_browse_modes (slug, mode) VALUES (?, ?)",
                        arguments: [row.slug, mode]
                    )
                }
            }
        }
        let coordinator = CatalogCoordinator(configuration: configuration)
        try await coordinator.prepare()
        return BrowseCatalogFixture(directory: directory, coordinator: coordinator)
    }
}

private struct BrowseFixtureRow {
    let slug: String
    let title: String?
    let artist: String?
    let complexity: Double?
    let modes: [String]

    init(
        slug: String,
        title: String?,
        artist: String?,
        complexity: Double?,
        modes: [String] = []
    ) {
        self.slug = slug
        self.title = title
        self.artist = artist
        self.complexity = complexity
        self.modes = modes
    }
}

private struct BrowseCatalogFixture {
    let directory: URL
    let coordinator: CatalogCoordinator

    func cleanup() {
        try? FileManager.default.removeItem(at: directory)
    }
}
