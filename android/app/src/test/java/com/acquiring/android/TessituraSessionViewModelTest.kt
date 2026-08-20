package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TessituraSessionViewModelTest {
    @Test
    fun reenteringSameSessionRetainsAnchorAndContinuity() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a:verse")
        state.updateComfortablePitch(57.0)
        state.updateContinuity(source = 60, target = 48)

        state.enterSession("song-a:verse")

        assertEquals(57.0, state.comfortablePitchMidi)
        assertEquals(60, state.lastSourceMidi)
        assertEquals(48, state.lastTargetMidi)
    }

    @Test
    fun aDifferentSectionEndsTheSequenceButKeepsTheSingersAnchor() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a:verse")
        state.updateComfortablePitch(57.0)
        state.updateContinuity(source = 60, target = 48)

        state.enterSession("song-a:chorus")

        // The anchor belongs to the singer, the contour to the section.
        assertEquals(57.0, state.comfortablePitchMidi)
        assertNull(state.lastSourceMidi)
        assertNull(state.lastTargetMidi)
    }

    @Test
    fun recordingANewPitchDiscardsRegistersChosenAgainstTheOldOne() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a:verse")
        state.updateComfortablePitch(57.0)
        state.updateContinuity(source = 60, target = 48)

        state.updateComfortablePitch(64.0)

        assertEquals(64.0, state.comfortablePitchMidi)
        assertNull(state.lastSourceMidi)
        assertNull(state.lastTargetMidi)
    }

    @Test
    fun aCalibrationArrivingWithoutASessionIsStillKept() {
        val state = TessituraSessionViewModel()

        state.updateComfortablePitch(57.0)

        assertEquals(57.0, state.comfortablePitchMidi)
        assertNull(state.sessionKey)
    }

    @Test
    fun clearOnlyResetsTheTessituraAndLeavesTheSessionInPlace() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a:verse")
        state.updateComfortablePitch(57.0)
        state.updateContinuity(source = 60, target = 48)

        state.clearAdjustment()

        assertNull(state.comfortablePitchMidi)
        assertNull(state.lastSourceMidi)
        assertNull(state.lastTargetMidi)
        assertEquals("song-a:verse", state.sessionKey)
    }

    @Test
    fun leavingTheSongClearsEverything() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a:verse")
        state.updateComfortablePitch(57.0)
        state.updateContinuity(source = 60, target = 48)

        state.clearSession()

        assertNull(state.sessionKey)
        assertNull(state.comfortablePitchMidi)
        assertNull(state.lastSourceMidi)
        assertNull(state.lastTargetMidi)
    }
}
