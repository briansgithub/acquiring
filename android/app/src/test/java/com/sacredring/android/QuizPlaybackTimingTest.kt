package com.sacredring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QuizPlaybackTimingTest {

    @Test
    fun playbackEnd_usesEverythingYouKnowIsWrongIntroContentInsteadOfSilentMetadataTail() {
        val endBeat = resolvePlaybackEndBeat(
            metadataEndBeat = 33.0,
            audibleEventEndBeats = listOf(23.0, 25.0)
        )

        assertEquals(25.0, endBeat, 0.0)
    }

    @Test
    fun playbackEnd_usesExactLatestReleaseWithoutRoundingOrMeasurePadding() {
        assertEquals(
            9.25,
            resolvePlaybackEndBeat(
                metadataEndBeat = 13.0,
                audibleEventEndBeats = listOf(5.0, 9.25, Double.NaN)
            ),
            0.0
        )
    }

    @Test
    fun playbackEnd_neverLetsMetadataCutOffAudibleContent() {
        assertEquals(
            17.5,
            resolvePlaybackEndBeat(
                metadataEndBeat = 13.0,
                audibleEventEndBeats = listOf(17.5)
            ),
            0.0
        )
    }

    @Test
    fun playbackEnd_usesMetadataOnlyWhenThereAreNoTimedEvents() {
        assertEquals(
            33.0,
            resolvePlaybackEndBeat(
                metadataEndBeat = 33.0,
                audibleEventEndBeats = listOf(Double.NaN, Double.POSITIVE_INFINITY)
            ),
            0.0
        )
    }

    @Test
    fun playbackEventEnd_normalizesLegacyZeroBeatToFirstBeat() {
        assertEquals(5.0, playbackEventEndBeat(beat = 0.0, duration = 4.0)!!, 0.0)
    }

    @Test
    fun playbackEnd_ignoresAnExplicitTrailingRest() {
        val soundingEventEnd = playbackEventEndBeat(beat = 5.0, duration = 4.0)!!
        val explicitRestEnd = playbackEventEndBeat(beat = 9.0, duration = 4.0, isRest = true)

        assertEquals(
            9.0,
            resolvePlaybackEndBeat(
                metadataEndBeat = 17.0,
                audibleEventEndBeats = listOfNotNull(soundingEventEnd, explicitRestEnd)
            ),
            0.0
        )
        assertNull(explicitRestEnd)
    }

    @Test
    fun loopingPosition_exactEndRestartsOnFirstBeat() {
        val position = loopingPlaybackPosition(tickEndBeat = 25.0, endBeat = 25.0)

        assertTrue(position.looped)
        assertEquals(1.0, position.beat, 0.0)
    }

    @Test
    fun loopingPosition_preservesSchedulerOvershoot() {
        val position = loopingPlaybackPosition(tickEndBeat = 25.25, endBeat = 25.0)

        assertTrue(position.looped)
        assertEquals(1.25, position.beat, 1e-12)
    }

    @Test
    fun loopingPosition_remainsStableAcrossMoreThanOneLoop() {
        val position = loopingPlaybackPosition(tickEndBeat = 49.5, endBeat = 25.0)

        assertTrue(position.looped)
        assertEquals(1.5, position.beat, 1e-12)
    }

    @Test
    fun loopingPosition_leavesInRangeBeatUntouched() {
        val position = loopingPlaybackPosition(tickEndBeat = 12.75, endBeat = 25.0)

        assertFalse(position.looped)
        assertEquals(12.75, position.beat, 0.0)
    }

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
