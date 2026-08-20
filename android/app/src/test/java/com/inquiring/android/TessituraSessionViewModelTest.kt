package com.inquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TessituraSessionViewModelTest {
    @Test
    fun reenteringSameSessionRetainsAdjustment() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a:verse")
        state.updateShift(2)

        state.enterSession("song-a:verse")

        assertEquals(2, state.shiftOctaves)
    }

    @Test
    fun sectionChangeAndExplicitExitClearAdjustment() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a:verse")
        state.updateShift(-1)

        state.enterSession("song-a:chorus")
        assertEquals(0, state.shiftOctaves)

        state.updateShift(1)
        state.clearSession()
        assertEquals(0, state.shiftOctaves)
        assertNull(state.sessionKey)
    }

    @Test
    fun clearButtonOnlyResetsAdjustmentWithinCurrentSession() {
        val state = TessituraSessionViewModel()
        state.enterSession("song-a:verse")
        state.updateShift(1)

        state.clearAdjustment()

        assertEquals(0, state.shiftOctaves)
        assertEquals("song-a:verse", state.sessionKey)
    }

    @Test
    fun adjustmentIsClampedToTheSupportedVocalRange() {
        val state = TessituraSessionViewModel()
        state.updateShift(20)
        assertEquals(4, state.shiftOctaves)

        state.updateShift(-20)
        assertEquals(-4, state.shiftOctaves)
    }
}
