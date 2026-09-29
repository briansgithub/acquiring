package com.acquiring.android

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuralPitchAssessmentTest {
    private fun voice(midi: Double, start: Long = 0L, count: Int = 12, confidence: Double = 0.98, held: Boolean = false) =
        List(count) { AuralPitchFrame(start + it * 40L, midi, confidence, held) }
    private fun silence(start: Long, count: Int = 4) = List(count) { AuralPitchFrame(start + it * 40L, null) }
    private fun status(frames: List<AuralPitchFrame>, vararg target: Int) = assessAuralPitch(frames, target.toList()).status

    private class FakeSource(var result: MicrophonePitchTracker.PitchResult = MicrophonePitchTracker.PitchResult.Estimate(60.0, 0.0, 0.99)) : PitchSource {
        override val pitchFlow = MutableStateFlow<MicrophonePitchTracker.PitchResult>(MicrophonePitchTracker.PitchResult.NoSignal)
        var stops = 0
        var target: Int? = null
        var denied = false
        override fun start(targetMidi: Int) {
            if (denied) throw SecurityException("Microphone permission denied")
            target = targetMidi
            pitchFlow.value = result
        }
        override fun stop() { stops++; pitchFlow.value = MicrophonePitchTracker.PitchResult.NoSignal }
        override fun release() = stop()
    }

    @Test fun stablePitchIsGradedWithExplicitOctavePolicy() {
        assertEquals(AuralPitchStatus.CORRECT, status(voice(60.0), 60))
        assertEquals(AuralPitchStatus.CORRECT, status(voice(72.0), 60))
        assertEquals(AuralPitchStatus.INCORRECT, assessAuralPitch(voice(72.0), listOf(60), octaveEquivalent = false).status)
        assertEquals(AuralPitchStatus.INCORRECT, status(voice(61.0), 60))
        assertEquals(AuralPitchStatus.CORRECT, status(voice(60.35), 60))
    }

    @Test fun silenceLowConfidenceHeldAndShortFramesAreTechnicalUncertainty() {
        assertEquals(AuralPitchStatus.UNCERTAIN, status(emptyList(), 60))
        assertEquals(AuralPitchStatus.UNCERTAIN, status(silence(0, 25), 60))
        assertEquals(AuralPitchStatus.UNCERTAIN, status(voice(60.0, count = 3), 60))
        assertEquals(AuralPitchStatus.UNCERTAIN, status(voice(60.0, confidence = 0.4), 60))
        assertEquals(AuralPitchStatus.UNCERTAIN, status(voice(60.0, held = true), 60))
        assertEquals(AuralPitchStatus.UNCERTAIN, status(voice(60.0) + silence(480, 60), 60))
        assertEquals(AuralPitchStatus.UNCERTAIN, status(voice(Double.NaN), 60))
    }

    @Test fun rootSequencePreservesOrderAndRequiresRepeatedNoteSeparation() {
        val sequence = voice(60.0) + voice(65.0, 480) + voice(67.0, 960)
        assertEquals(AuralPitchStatus.CORRECT, status(sequence, 48, 53, 55))
        assertEquals(AuralPitchStatus.INCORRECT, status(sequence, 48, 55, 53))
        assertEquals(AuralPitchStatus.UNCERTAIN, status(voice(60.0, count = 30), 60, 60))
        assertEquals(AuralPitchStatus.CORRECT, status(voice(60.0) + silence(480) + voice(60.0, 640), 60, 60))
        assertEquals(AuralPitchStatus.UNCERTAIN, status(voice(60.0) + voice(61.0, 480), 60))
    }

    @Test fun deviceErrorCanNeverBecomeMusicalMistake() {
        val assessment = assessAuralPitch(voice(61.0) + AuralPitchFrame(480, null, error = "Device disconnected"), listOf(60))
        assertEquals(AuralPitchStatus.UNCERTAIN, assessment.status)
        assertEquals("Device disconnected", assessment.reason)
    }

    @Test fun captureFinishesWithStructuredFramesAndStopsMicrophone() = runTest {
        val source = FakeSource()
        val job = async { captureAuralPitch(source, 60, 400L) { testScheduler.currentTime } }
        advanceUntilIdle()
        val frames = job.await()
        assertEquals(10, frames.size)
        assertEquals((0L..360L step 40L).toList(), frames.map { it.timeMs })
        assertEquals(AuralPitchStatus.CORRECT, status(frames, 60))
        assertEquals(2, source.stops)
    }

    @Test fun captureCancellationAndPermissionFailureAlwaysStopMicrophone() = runTest {
        val source = FakeSource()
        val job = async { captureAuralPitch(source, 60) { testScheduler.currentTime } }
        runCurrent()
        job.cancel()
        runCurrent()
        assertTrue(job.isCancelled)
        assertEquals(2, source.stops)
        val denied = FakeSource().apply { this.denied = true }
        var failed = false
        try { captureAuralPitch(denied, 60) { testScheduler.currentTime } } catch (_: SecurityException) { failed = true }
        assertTrue(failed)
        assertEquals(2, denied.stops)
    }
}
