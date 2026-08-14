package com.sacredring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/**
 * Locks the invariant that [MicrophonePitchTracker] previously broke: a published estimate's
 * `centsError` must always equal `100 * (midi - targetMidi)`.
 *
 * The old tracker smoothed `centsError` but published the raw instantaneous `midi` alongside it,
 * so the two fields described different instants. Consumers are split — `PitchGauge` reads
 * `centsError` while `HummingIntervalPopup` and the tessitura calibration recompute from `midi` —
 * which meant two UI surfaces could disagree about the same held note, and the calibration
 * averaged unsmoothed values.
 */
class PitchSmootherTest {

    private val target = 60

    /** Feeds a run of frames and returns every estimate that was actually published. */
    private fun publish(smoother: PitchSmoother, midis: List<Double>) =
        midis.mapNotNull { smoother.accept(it, 0.9) }

    @Test
    fun publishedCentsAlwaysMatchesPublishedMidi() {
        val smoother = PitchSmoother(target)
        val frames = listOf(
            60.0, 60.2, 59.8, 60.1, 60.4, 60.3, 59.9, 60.05, 61.2, 60.7, 60.0, 59.6
        )
        val published = publish(smoother, frames)
        assertTrue("expected some published frames", published.isNotEmpty())
        published.forEach {
            assertEquals(
                "centsError must be derived from the published midi",
                100.0 * (it.midi - target),
                it.centsError,
                1e-9
            )
        }
    }

    @Test
    fun warmsUpBeforePublishingAnything() {
        val smoother = PitchSmoother(target)
        // Median window is 3 and two valid frames are required before publishing.
        assertNull(smoother.accept(60.0, 0.9))
        assertNull(smoother.accept(60.0, 0.9))
        assertNull(smoother.accept(60.0, 0.9))
        assertNotNull(smoother.accept(60.0, 0.9))
    }

    @Test
    fun medianRejectsASingleOutlierFrame() {
        val smoother = PitchSmoother(target)
        // Settle on 60.0, then inject one frame 3 semitones off — within the octave-reject
        // window, so it reaches the median filter and must be outvoted by its neighbours.
        publish(smoother, listOf(60.0, 60.0, 60.0, 60.0))
        val afterOutlier = publish(smoother, listOf(63.0, 60.0))
        afterOutlier.forEach {
            assertTrue(
                "a single outlier moved the estimate to ${it.midi}",
                abs(it.midi - 60.0) < 0.5
            )
        }
    }

    @Test
    fun discardsIsolatedOctaveErrors() {
        val smoother = PitchSmoother(target)
        publish(smoother, listOf(60.0, 60.0, 60.0, 60.0))
        // One frame an octave up is the classic YIN harmonic lock. It must not be published
        // and must not contaminate the running estimate.
        assertNull(smoother.accept(72.0, 0.9))
        val recovered = smoother.accept(60.0, 0.9)
        assertNotNull(recovered)
        assertEquals(60.0, recovered!!.midi, 0.1)
    }

    @Test
    fun acceptsASustainedJumpAsARealNoteChange() {
        val smoother = PitchSmoother(target)
        publish(smoother, listOf(60.0, 60.0, 60.0, 60.0))
        // The singer genuinely moves an octave up and stays there. Rejecting forever would
        // freeze the gauge on the old note, so the filter must re-seed.
        val afterJump = publish(smoother, List(8) { 72.0 })
        assertTrue("filter never re-seeded after a sustained jump", afterJump.isNotEmpty())
        val last = afterJump.last()
        assertEquals(72.0, last.midi, 0.1)
        assertEquals(100.0 * (72.0 - target), last.centsError, 1e-9)
    }

    @Test
    fun resetClearsAllState() {
        val smoother = PitchSmoother(target)
        publish(smoother, listOf(60.0, 60.0, 60.0, 60.0))
        smoother.reset()
        // Back to warm-up: nothing publishes until the median window refills.
        assertNull(smoother.accept(64.0, 0.9))
        assertNull(smoother.accept(64.0, 0.9))
        assertNull(smoother.accept(64.0, 0.9))
        val first = smoother.accept(64.0, 0.9)
        assertNotNull(first)
        assertEquals(64.0, first!!.midi, 1e-9)
    }

    @Test
    fun centsErrorTracksTheTargetItWasBuiltWith() {
        val smoother = PitchSmoother(69) // A4
        val published = publish(smoother, List(6) { 69.0 })
        assertTrue(published.isNotEmpty())
        published.forEach { assertEquals(0.0, it.centsError, 1e-9) }
    }

    @Test
    fun maximumSpeedProfilePublishesTheFirstFrameWithoutEmaLag() {
        val smoother = PitchSmoother(target, PitchTrackingMode.MELODY_FAST)

        val first = smoother.accept(60.25, 0.9)
        val second = smoother.accept(60.75, 0.9)

        assertNotNull(first)
        assertNotNull(second)
        assertEquals(60.25, first!!.midi, 0.0)
        assertEquals(60.75, second!!.midi, 0.0)
    }

    @Test
    fun maximumSpeedProfileDropsOneOctaveErrorFrameThenReseeds() {
        val smoother = PitchSmoother(target, PitchTrackingMode.MELODY_FAST)
        assertNotNull(smoother.accept(60.0, 0.9))

        assertNull(smoother.accept(72.0, 0.9))
        val reseeded = smoother.accept(72.0, 0.9)

        assertNotNull(reseeded)
        assertEquals(72.0, reseeded!!.midi, 0.0)
    }
}
