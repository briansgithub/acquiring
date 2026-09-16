package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackBeatStepTest {
    @Test
    fun beatStepMovesOneBeatAndStaysInsideTheSection() {
        assertEquals(7.0, steppedPlaybackBeat(8.0, -1.0, 1.0, 16.0), 0.0)
        assertEquals(9.0, steppedPlaybackBeat(8.0, 1.0, 1.0, 16.0), 0.0)
        assertEquals(1.0, steppedPlaybackBeat(1.0, -1.0, 1.0, 16.0), 0.0)
        assertEquals(16.0, steppedPlaybackBeat(16.0, 1.0, 1.0, 16.0), 0.0)
    }
}
