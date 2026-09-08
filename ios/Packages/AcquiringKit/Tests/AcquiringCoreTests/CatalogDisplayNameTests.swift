import XCTest
@testable import AcquiringCore

final class CatalogDisplayNameTests: XCTestCase {
    func testLegacySlugsBecomeReadableWithoutChangingIdentity() {
        let song = CatalogSong(
            id: "the-proclaimers__500-miles",
            artist: "the-proclaimers",
            title: "500-miles",
            url: URL(string: "https://www.hooktheory.com/theorytab/view/the-proclaimers/500-miles")
        )

        XCTAssertEqual(song.displayTitle, "500 Miles")
        XCTAssertEqual(song.displayArtist, "The Proclaimers")
        XCTAssertEqual(song.id, "the-proclaimers__500-miles")
        XCTAssertEqual(song.artist, "the-proclaimers")
        XCTAssertEqual(song.title, "500-miles")
        XCTAssertEqual(song.url?.lastPathComponent, "500-miles")
        XCTAssertEqual(CatalogDisplayName.title("the__long-and-winding_road"), "The Long And Winding Road")
        XCTAssertEqual(CatalogDisplayName.title("dont-stop"), "Dont Stop", "Unknown punctuation must not be guessed")
    }

    func testReadableSourceNamesKeepTheirSpellingPunctuationAndCase() {
        for name in ["AC/DC", "P!nk", "tUnE-yArDs", "blink-182's Greatest Hits", "Björk", "Don't Stop Me Now", "Jay-Z", "will.i.am", "boygenius", "girl in red"] {
            XCTAssertEqual(CatalogDisplayName.format(name), name)
        }
        XCTAssertEqual(CatalogDisplayName.artist("blink-182"), "blink-182")
        XCTAssertEqual(CatalogDisplayName.artist("queen"), "queen", "Single-word names have no reliable slug marker")
    }

    func testDisplayEntitiesUnicodeAndWhitespaceAreCleaned() {
        XCTAssertEqual(CatalogDisplayName.title("  Don&#39;t\n  Stop&nbsp;Me   Now  "), "Don't Stop Me Now")
        XCTAssertEqual(CatalogDisplayName.artist("Beyonce\u{301} &amp; Jay-Z"), "Beyoncé & Jay-Z")
        XCTAssertEqual(CatalogDisplayName.title("Rock &amp;#x2019;n&#x2019; Roll &mdash; Live"), "Rock ’n’ Roll — Live")
        XCTAssertEqual(CatalogDisplayName.title("Pok&eacute;mon &#127925;"), "Pokémon 🎵")
        XCTAssertEqual(CatalogDisplayName.title("One&#10;Two\u{0000}"), "One Two")
        XCTAssertEqual(CatalogDisplayName.title("&unknown; &#xD800;"), "&unknown; &#xD800;")
    }

    func testBlankNamesHaveClearFallbacks() {
        XCTAssertEqual(CatalogDisplayName.title(nil), "Unknown Title")
        XCTAssertEqual(CatalogDisplayName.artist(" \n&nbsp;\t"), "Unknown Artist")
        XCTAssertNil(CatalogDisplayName.format("\u{00a0}"))
    }

    func testFormattingIsStableForCleanedAndFallbackNames() {
        for name in ["the-proclaimers", "500-miles", "Rock &amp; Roll", "Beyonce\u{301}", "AC/DC", "tUnE-yArDs"] {
            let formatted = CatalogDisplayName.format(name)
            XCTAssertEqual(CatalogDisplayName.format(formatted), formatted)
        }
    }
}
