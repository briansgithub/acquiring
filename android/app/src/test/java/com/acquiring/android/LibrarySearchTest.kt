package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LibrarySearchTest {
    @Test
    fun focusedSearchHidesPlaylistsHooktheoryAndAllSongs() {
        assertTrue(libraryChromeVisible(searchFocused = false))
        assertFalse(libraryChromeVisible(searchFocused = true))
    }

    @Test
    fun catalogSearchKeyMatchesIosAlphanumericFold() {
        assertEquals("500miles", catalogSearchKey("500 Miles"))
        assertEquals("500miles", catalogSearchKey("500-miles"))
        assertEquals("dontstop", catalogSearchKey("Don't Stop"))
        assertEquals("beyonce", catalogSearchKey("Beyoncé"))
        assertEquals("acdc", catalogSearchKey("AC/DC"))
        assertEquals("", catalogSearchKey(" --- "))
    }

    @Test
    fun suggestionsMatchDisplayNamesEntitiesAndSlugIdentities() {
        val index = CatalogSearchIndex()
        index.replaceAll(
            listOf(
                row("the-proclaimers__500-miles", "the-proclaimers", "500-miles"),
                row("queen__dont-stop-me-now", "Queen", "Don&#39;t Stop Me Now"),
                row("smash-mouth__all-star", "smash-mouth", "All Star"),
                row("untitled", "Someone", null)
            )
        )

        assertEquals(listOf("the-proclaimers__500-miles"), slugs(index, "500 Miles"))
        assertEquals(listOf("the-proclaimers__500-miles"), slugs(index, "500miles"))
        assertEquals(listOf("the-proclaimers__500-miles"), slugs(index, "The Proclaimers"))
        assertEquals(listOf("queen__dont-stop-me-now"), slugs(index, "Don't Stop"))
        assertEquals(listOf("smash-mouth__all-star"), slugs(index, "allstar"))
        assertEquals(listOf("smash-mouth__all-star"), slugs(index, " ALL-STAR "))
        assertTrue(index.songSuggestions("proclaimers").any { it.slug == "the-proclaimers__500-miles" })
    }

    @Test
    fun titleSearchDoesNotReturnArtistOnlyHits() {
        val index = CatalogSearchIndex()
        index.replaceAll(
            listOf(
                row("smash-mouth__all-star", "smash-mouth", "All Star"),
                row("other__tonight", "the-smashing-pumpkins", "Tonight Tonight")
            )
        )
        assertEquals(emptyList<String>(), index.songsByTitle("smash").map { it.slug })
        assertEquals(listOf("other__tonight"), index.songsByTitle("tonight").map { it.slug })
        assertEquals(
            listOf("smash-mouth__all-star", "other__tonight"),
            index.songsByArtist("smash").map { it.slug }
        )
    }

    @Test
    fun artistSuggestionsCollapseHyphenAndSpaceVariants() {
        val index = CatalogSearchIndex()
        index.replaceAll(
            listOf(
                row("the-artists__hyphen-song", "The-Artists", "Hyphen Song"),
                row("the-artists__space-song", "The Artists", "Space Song")
            )
        )
        assertEquals(listOf("The Artists"), index.artistSuggestions("The Artists"))
        assertEquals(listOf("The Artists"), index.artistSuggestions("theartists"))
    }

    @Test
    fun suggestionOrderKeepsEmptyTitlesLastThenTitleArtistSlug() {
        val index = CatalogSearchIndex()
        index.replaceAll(
            listOf(
                row("z-empty", "Artist", null),
                row("b-beta", "Artist", "Beta"),
                row("a-alpha", "Artist", "Alpha")
            )
        )
        assertEquals(
            listOf("a-alpha", "b-beta", "z-empty"),
            index.songSuggestions("artist").map { it.slug }
        )
    }

    @Test
    fun suggestionsPageInTwenties() {
        val index = CatalogSearchIndex()
        index.replaceAll(
            (1..25).map { index ->
                row("song-$index", "Artist", "Love $index")
            }
        )
        val first = index.songSuggestions("love", limit = 20, offset = 0)
        val second = index.songSuggestions("love", limit = 20, offset = 20)
        assertEquals(20, first.size)
        assertEquals(5, second.size)
        assertTrue(first.map { it.slug }.intersect(second.map { it.slug }.toSet()).isEmpty())
    }

    private fun slugs(index: CatalogSearchIndex, query: String): List<String> =
        index.songSuggestions(query).map { it.slug }

    private fun row(slug: String, artist: String?, title: String?): SongBrowseRow =
        SongBrowseRow(slug, artist, title)
}
