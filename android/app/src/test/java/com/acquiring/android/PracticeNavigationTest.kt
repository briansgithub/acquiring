package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class PracticeNavigationTest {
    @Test
    fun songDetailBackReturnsToPlayback() {
        assertEquals(
            PracticeDestination.PLAYBACK,
            practiceBack(PracticeDestination.SONG_DETAIL, SongOrigin.LIBRARY)
        )
    }

    @Test
    fun playbackBackReturnsToOriginList() {
        assertEquals(
            PracticeDestination.LIBRARY,
            practiceBack(PracticeDestination.PLAYBACK, SongOrigin.LIBRARY)
        )
        assertEquals(
            PracticeDestination.ARTIST,
            practiceBack(PracticeDestination.PLAYBACK, SongOrigin.ARTIST)
        )
        assertEquals(
            PracticeDestination.ALL_SONGS,
            practiceBack(PracticeDestination.PLAYBACK, SongOrigin.ALL_SONGS)
        )
    }

    @Test
    fun playbackBackPrefersLiveArtistListOverLibraryOrigin() {
        assertEquals(
            PracticeDestination.ARTIST,
            practiceBack(PracticeDestination.PLAYBACK, SongOrigin.ARTIST)
        )
    }

    @Test
    fun settingsBackReturnsToLibrary() {
        assertEquals(
            PracticeDestination.LIBRARY,
            practiceBack(PracticeDestination.SETTINGS, SongOrigin.LIBRARY)
        )
    }
}
