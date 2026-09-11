package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class PracticeNavigationTest {
    @Test
    fun songDetailBackReturnsToQuiz() {
        assertEquals(
            PracticeDestination.QUIZ,
            practiceBack(PracticeDestination.SONG_DETAIL, SongOrigin.LIBRARY)
        )
    }

    @Test
    fun quizBackReturnsToOriginList() {
        assertEquals(
            PracticeDestination.LIBRARY,
            practiceBack(PracticeDestination.QUIZ, SongOrigin.LIBRARY)
        )
        assertEquals(
            PracticeDestination.ARTIST,
            practiceBack(PracticeDestination.QUIZ, SongOrigin.ARTIST)
        )
        assertEquals(
            PracticeDestination.ALL_SONGS,
            practiceBack(PracticeDestination.QUIZ, SongOrigin.ALL_SONGS)
        )
    }

    @Test
    fun quizBackPrefersLiveArtistListOverLibraryOrigin() {
        assertEquals(
            PracticeDestination.ARTIST,
            practiceBack(PracticeDestination.QUIZ, SongOrigin.ARTIST)
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
