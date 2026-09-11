package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TessituraSessionViewModelTest {
    @Test
    fun reenteringSameSessionKeepsTheOffset() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a", "song-a:verse")
        state.updateOctaveOffset(-1)

        state.enterSession("song-a", "song-a:verse")

        assertEquals(-1, state.octaveOffset)
        assertEquals("song-a:verse", state.sessionKey)
    }

    @Test
    fun offsetIsClampedToTheAgreedRange() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a", "song-a:verse")
        state.updateOctaveOffset(-8)
        assertEquals(OCTAVE_OFFSET_MIN, state.octaveOffset)
        state.updateOctaveOffset(9)
        assertEquals(OCTAVE_OFFSET_MAX, state.octaveOffset)
        state.updateOctaveOffset(0)
        assertEquals(0, state.octaveOffset)
    }

    @Test
    fun leavingTheSongClearsTheSession() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a", "song-a:verse")
        state.updateOctaveOffset(2)

        state.clearSession()

        assertNull(state.sessionKey)
        assertNull(state.songSlug)
        assertEquals(0, state.octaveOffset)
    }
}
