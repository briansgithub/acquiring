package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CatalogDisplayNameTest {
    @Test
    fun legacySlugsBecomeReadableWithoutChangingIdentity() {
        val song = Song(
            slug = "the-proclaimers__500-miles",
            artist = "the-proclaimers",
            title = "500-miles",
            url = "https://www.hooktheory.com/theorytab/view/the-proclaimers/500-miles",
            status = "enriched",
            dataBlob = null
        )
        assertEquals("500 Miles", song.displayTitle)
        assertEquals("The Proclaimers", song.displayArtist)
        assertEquals("the-proclaimers__500-miles", song.slug)
        assertEquals("the-proclaimers", song.artist)
        assertEquals("500-miles", song.title)
        assertEquals(
            "The Long And Winding Road",
            CatalogDisplayName.title("the__long-and-winding_road")
        )
        assertEquals("Dont Stop", CatalogDisplayName.title("dont-stop"))
    }

    @Test
    fun readableSourceNamesKeepTheirSpellingPunctuationAndCase() {
        for (name in listOf(
            "AC/DC", "P!nk", "tUnE-yArDs", "blink-182's Greatest Hits", "Björk",
            "Don't Stop Me Now", "Jay-Z", "will.i.am", "boygenius", "girl in red"
        )) {
            assertEquals(name, CatalogDisplayName.format(name))
        }
        assertEquals("blink-182", CatalogDisplayName.artist("blink-182"))
        assertEquals("queen", CatalogDisplayName.artist("queen"))
    }

    @Test
    fun displayEntitiesUnicodeAndWhitespaceAreCleaned() {
        assertEquals(
            "Don't Stop Me Now",
            CatalogDisplayName.title("  Don&#39;t\n  Stop&nbsp;Me   Now  ")
        )
        assertEquals("Beyoncé & Jay-Z", CatalogDisplayName.artist("Beyonce\u0301 &amp; Jay-Z"))
        assertEquals(
            "Rock ’n’ Roll — Live",
            CatalogDisplayName.title("Rock &amp;#x2019;n&#x2019; Roll &mdash; Live")
        )
        assertEquals("Pokémon 🎵", CatalogDisplayName.title("Pok&eacute;mon &#127925;"))
        assertEquals("One Two", CatalogDisplayName.title("One&#10;Two\u0000"))
        assertEquals("&unknown; &#xD800;", CatalogDisplayName.title("&unknown; &#xD800;"))
    }

    @Test
    fun blankNamesHaveClearFallbacks() {
        assertEquals("Unknown Title", CatalogDisplayName.title(null))
        assertEquals("Unknown Artist", CatalogDisplayName.artist(" \n&nbsp;\t"))
        assertNull(CatalogDisplayName.format("\u00a0"))
    }

    @Test
    fun formattingIsStableForCleanedAndFallbackNames() {
        for (name in listOf(
            "the-proclaimers", "500-miles", "Rock &amp; Roll", "Beyonce\u0301", "AC/DC", "tUnE-yArDs"
        )) {
            val formatted = CatalogDisplayName.format(name)
            assertEquals(formatted, CatalogDisplayName.format(formatted))
        }
    }
}
