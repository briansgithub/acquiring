package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ComfortablePitchCaptureTest {
    @Test
    fun silenceDoesNotConsumeCountdown() {
        val capture = ComfortablePitchCapture()

        repeat(20) { capture.observe(elapsedMs = 100, midi = null) }

        assertEquals(3000, capture.progress().remainingMs)
        assertFalse(capture.progress().hasSignal)
        assertNull(capture.averageMidiOrNull())
    }

    @Test
    fun successfulCaptureAveragesOnlyFinalWindow() {
        val capture = ComfortablePitchCapture()

        capture.observe(elapsedMs = 500, midi = 50.0)
        capture.observe(elapsedMs = 500, midi = 52.0)
        capture.observe(elapsedMs = 1000, midi = 60.0)
        val completed = capture.observe(elapsedMs = 1000, midi = 64.0)

        assertTrue(completed.isComplete)
        assertEquals((52.0 + 60.0 + 64.0) / 3.0, capture.averageMidiOrNull()!!, 0.0001)
    }

    @Test
    fun briefDropoutPausesButLongDropoutRestarts() {
        val capture = ComfortablePitchCapture()

        capture.observe(elapsedMs = 500, midi = 60.0)
        val briefDropout = capture.observe(elapsedMs = 500, midi = null)
        val resumed = capture.observe(elapsedMs = 500, midi = 61.0)
        capture.observe(elapsedMs = 1000, midi = null)
        val restarted = capture.observe(elapsedMs = 1, midi = null)

        assertEquals(2500, briefDropout.remainingMs)
        assertEquals(2000, resumed.remainingMs)
        assertEquals(3000, restarted.remainingMs)
        assertFalse(restarted.hasSignal)
        assertNull(capture.averageMidiOrNull())
    }

    @Test
    fun oneLongDropoutObservationRestartsImmediately() {
        val capture = ComfortablePitchCapture()

        capture.observe(elapsedMs = 500, midi = 60.0)
        val restarted = capture.observe(elapsedMs = 1001, midi = null)

        assertEquals(3000, restarted.remainingMs)
        assertFalse(restarted.hasSignal)
        assertNull(capture.averageMidiOrNull())
    }
}
