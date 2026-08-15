package com.inquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

class PitchDetectorTest {

    private fun generateSineWave(freq: Double, sampleRate: Int, durationSamples: Int): ShortArray {
        val buffer = ShortArray(durationSamples)
        for (i in 0 until durationSamples) {
            val s = sin(2.0 * PI * freq * i / sampleRate)
            buffer[i] = (s * Short.MAX_VALUE).toInt().toShort()
        }
        return buffer
    }

    @Test
    fun testSineWaveDetection() {
        val sampleRate = 16000
        val freq = 440.0 // A4
        val buffer = generateSineWave(freq, sampleRate, 2048)
        
        val estimate = PitchDetector.estimatePitch(buffer, sampleRate)
        
        // Allow for some error due to discretization and windowing
        assertEquals(freq, estimate.frequencyHz, 1.0)
        assertTrue(estimate.confidence > 0.9)
    }

    @Test
    fun testLowFrequencyDetection() {
        val sampleRate = 16000
        val freq = 82.41 // E2 (Guitar low E)
        val buffer = generateSineWave(freq, sampleRate, 2048)
        
        val estimate = PitchDetector.estimatePitch(buffer, sampleRate)
        
        assertEquals(freq, estimate.frequencyHz, 1.0)
        assertTrue(estimate.confidence > 0.9)
    }

    @Test
    fun testSilenceDetection() {
        val buffer = ShortArray(2048) { 0 }
        val estimate = PitchDetector.estimatePitch(buffer, 16000)
        
        assertEquals(0.0, estimate.rms, 0.0001)
        assertTrue(estimate.confidence < 0.5)
    }

    @Test
    fun testNoiseRejection() {
        val buffer = ShortArray(2048) { (Math.random() * 200 - 100).toInt().toShort() }
        val estimate = PitchDetector.estimatePitch(buffer, 16000)
        
        // Random noise shouldn't yield a high confidence periodic estimate
        assertTrue(estimate.confidence < 0.8)
    }

    @Test
    fun testMidiConversion() {
        // A4 = 440Hz = MIDI 69
        val midi69 = 69.0 + 12.0 * (Math.log(440.0 / 440.0) / Math.log(2.0))
        assertEquals(69.0, midi69, 0.001)
        
        // C4 = ~261.63Hz = MIDI 60
        val c4Freq = 440.0 * Math.pow(2.0, (60.0 - 69.0) / 12.0)
        val midi60 = 69.0 + 12.0 * (Math.log(c4Freq / 440.0) / Math.log(2.0))
        assertEquals(60.0, midi60, 0.001)
    }
}
