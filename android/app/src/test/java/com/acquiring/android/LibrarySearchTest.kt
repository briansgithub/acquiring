package com.acquiring.android

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LibrarySearchTest {
    @Test
    fun focusedSearchHidesPlaylistsHooktheoryAndAllSongs() {
        assertTrue(libraryChromeVisible(searchFocused = false))
        assertFalse(libraryChromeVisible(searchFocused = true))
    }
}
