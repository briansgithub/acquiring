package com.sacredring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.sin

/**
 * Accuracy tests for [PitchDetector], asserted in CENTS rather than Hz.
 *
 * A Hz tolerance is not a musically meaningful bar: +/-1 Hz is ~3.9 cents at A4 but ~21 cents at
 * E2, so a single Hz figure is far stricter at the top of the range than at the bottom. A singing
 * tuner needs to be trustworthy to a few cents everywhere, so every assertion here is in cents.
 *
 * The signals are harmonic-rich as well as pure. Humming is not a sine wave, and YIN's
 * threshold-crossing behaviour differs sharply between the two: the regression these tests lock
 * down (picking the first lag under the threshold instead of descending to the local minimum)
 * read 440 Hz as 435 Hz on a pure sine and was worse still on a harmonic-rich tone.
 */
class PitchDetectorAccuracyTest {

    private val sampleRate = 16000
    private val bufferLength = 2048

    /** Tolerance for a steady, noise-free tone. Comfortably below what a singer can perceive. */
    private val toleranceCents = 5.0

    private fun cents(measured: Double, reference: Double) = 1200.0 * (ln(measured / reference) / ln(2.0))

    private fun sine(
        freq: Double,
        phase: Double = 0.0,
        length: Int = bufferLength
    ): ShortArray =
        ShortArray(length) { i ->
            (sin(2.0 * PI * freq * i / sampleRate + phase) * 32767).toInt().toShort()
        }

    /** Harmonic-rich tone: partials 1..[partials] at 1/k amplitude, approximating a sung vowel. */
    private fun harmonic(
        freq: Double,
        partials: Int,
        phase: Double = 0.0,
        length: Int = bufferLength
    ): ShortArray {
        val raw = DoubleArray(length) { i ->
            var s = 0.0
            for (k in 1..partials) {
                if (k * freq >= sampleRate / 2.0) break
                s += (1.0 / k) * sin(2.0 * PI * k * freq * i / sampleRate + phase * k * 0.7)
            }
            s
        }
        val peak = raw.maxOf { abs(it) }
        return ShortArray(length) { i -> ((raw[i] / peak) * 26000).toInt().toShort() }
    }

    private fun assertDetectsWithinTolerance(signal: ShortArray, expectedHz: Double, label: String) {
        val estimate = PitchDetector.estimatePitch(signal, sampleRate)
        assertTrue(
            "$label: expected a detection for $expectedHz Hz but got none",
            estimate.frequencyHz > 0.0
        )
        val error = cents(estimate.frequencyHz, expectedHz)
        assertTrue(
            "$label: $expectedHz Hz detected as ${estimate.frequencyHz} Hz " +
                "(${"%.1f".format(error)} cents, tolerance +/-$toleranceCents)",
            abs(error) <= toleranceCents
        )
    }

    /**
     * Direct regression lock on the threshold-crossing bug. Before the local-minimum descent was
     * added, these two exact inputs produced 435.107 Hz and 80.560 Hz respectively.
     */
    @Test
    fun detectsReferenceTonesWithinFiveCents() {
        assertDetectsWithinTolerance(sine(440.0), 440.0, "A4 sine")
        assertDetectsWithinTolerance(sine(82.41), 82.41, "E2 sine")
    }

    @Test
    fun maximumSpeedWindowDetectsRepresentativeVocalTones() {
        val fastWindowSize = PitchTrackingMode.MELODY_FAST.windowSizeOverride
            ?: error("melody fast mode must override the analysis window")
        val frequencies = listOf(82.41, 110.0, 220.0, 440.0, 587.33)

        frequencies.forEach { frequency ->
            val signals = listOf(
                "sine" to sine(frequency, length = fastWindowSize),
                "harmonic" to harmonic(frequency, partials = 6, length = fastWindowSize)
            )
            signals.forEach { (label, signal) ->
                val estimate = PitchDetector.estimatePitch(signal, sampleRate)
                assertTrue(
                    "$label: expected a fast-window detection for $frequency Hz",
                    estimate.frequencyHz > 0.0
                )
                val error = abs(cents(estimate.frequencyHz, frequency))
                assertTrue(
                    "$label: fast-window error was ${"%.1f".format(error)} cents at $frequency Hz",
                    error <= 8.0
                )
            }
        }
    }

    @Test
    fun sweepPureSineAcrossVocalRange() {
        var worst = 0.0
        var worstAt = 0.0
        var f = 80.0
        while (f <= 600.0) {
            for (phase in listOf(0.0, 1.1, 2.4)) {
                val estimate = PitchDetector.estimatePitch(sine(f, phase), sampleRate)
                assertTrue("no detection at $f Hz (phase $phase)", estimate.frequencyHz > 0.0)
                val error = abs(cents(estimate.frequencyHz, f))
                if (error > worst) { worst = error; worstAt = f }
            }
            f += 5.0
        }
        assertTrue(
            "worst pure-sine error was ${"%.1f".format(worst)} cents at $worstAt Hz",
            worst <= toleranceCents
        )
    }

    @Test
    fun sweepHarmonicRichToneAcrossVocalRange() {
        for (partials in listOf(4, 8)) {
            var worst = 0.0
            var worstAt = 0.0
            var f = 80.0
            while (f <= 600.0) {
                for (phase in listOf(0.0, 1.1, 2.4)) {
                    val estimate = PitchDetector.estimatePitch(harmonic(f, partials, phase), sampleRate)
                    assertTrue("no detection at $f Hz (H1-H$partials, phase $phase)", estimate.frequencyHz > 0.0)
                    val error = abs(cents(estimate.frequencyHz, f))
                    if (error > worst) { worst = error; worstAt = f }
                }
                f += 5.0
            }
            assertTrue(
                "worst H1-H$partials error was ${"%.1f".format(worst)} cents at $worstAt Hz",
                worst <= toleranceCents
            )
        }
    }

    /**
     * Octave errors are the characteristic YIN failure and are far more damaging than a few cents
     * of drift: they move the reading a whole octave and can flip the tessitura calibration.
     */
    @Test
    fun neverReportsAnOctaveError() {
        var f = 80.0
        while (f <= 600.0) {
            for (partials in listOf(1, 4, 8)) {
                val signal = if (partials == 1) sine(f) else harmonic(f, partials)
                val estimate = PitchDetector.estimatePitch(signal, sampleRate)
                if (estimate.frequencyHz <= 0.0) continue
                val error = cents(estimate.frequencyHz, f)
                assertTrue(
                    "octave error at $f Hz (H1-H$partials): detected ${estimate.frequencyHz} Hz " +
                        "(${"%.0f".format(error)} cents)",
                    abs(error) < 600.0
                )
            }
            f += 5.0
        }
    }

    /** A confident detection should be genuinely periodic; white noise must not qualify. */
    @Test
    fun rejectsNoiseAtTheConfidenceGateTheTrackerUses() {
        val random = java.util.Random(20240811L)
        repeat(20) {
            val noise = ShortArray(bufferLength) { (random.nextGaussian() * 3000).toInt().toShort() }
            val estimate = PitchDetector.estimatePitch(noise, sampleRate)
            // 0.4 is the gate in MicrophonePitchTracker.processEstimate.
            assertTrue(
                "white noise passed the tracker's confidence gate (${estimate.confidence})",
                estimate.confidence < 0.4
            )
        }
    }

    @Test
    fun reportsRmsForSilenceAndSignal() {
        assertEquals(0.0, PitchDetector.estimatePitch(ShortArray(bufferLength), sampleRate).rms, 1e-9)
        assertTrue(PitchDetector.estimatePitch(sine(220.0), sampleRate).rms > 0.5)
    }
}
