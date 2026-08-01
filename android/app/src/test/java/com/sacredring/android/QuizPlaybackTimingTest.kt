package com.sacredring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QuizPlaybackTimingTest {

    @Test
    fun remainingDuration_usesOnlyTheUnplayedBeatFraction() {
        assertEquals(1_000, remainingPlaybackDurationMs(eventEndBeat = 5.0, currentBeat = 3.5, bpm = 90.0))
    }

    @Test
    fun remainingDuration_rescalesImmediatelyWithTempo() {
        val slow = remainingPlaybackDurationMs(eventEndBeat = 5.0, currentBeat = 3.0, bpm = 60.0)
        val fast = remainingPlaybackDurationMs(eventEndBeat = 5.0, currentBeat = 3.0, bpm = 120.0)

        assertEquals(2_000, slow)
        assertEquals(1_000, fast)
    }

    @Test
    fun remainingDuration_keepsVeryShortTailsAudible() {
        assertEquals(40, remainingPlaybackDurationMs(eventEndBeat = 4.0001, currentBeat = 4.0, bpm = 200.0))
    }

    @Test
    fun remainingDuration_rejectsStoppedTempoAndFinishedEvents() {
        assertNull(remainingPlaybackDurationMs(eventEndBeat = 5.0, currentBeat = 3.0, bpm = 0.0))
        assertNull(remainingPlaybackDurationMs(eventEndBeat = 5.0, currentBeat = 5.0, bpm = 120.0))
    }
}
