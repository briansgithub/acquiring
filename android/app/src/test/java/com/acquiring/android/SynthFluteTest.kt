package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SynthFluteTest {
    @Test
    fun fluteSitsWithSynthsAndRendersFiniteSamples() {
        assertEquals("Synth Flute", AudioEngine.Waveform.FLUTE.displayName)
        assertEquals("Synths", AudioEngine.Waveform.FLUTE.categoryName())
        val voice = SynthVoice(440.0, AudioEngine.Waveform.FLUTE, 48_000)
        val sample = voice.nextSample(envelope = 1.0, elapsedSeconds = 0.0)
        assertTrue(sample.isFinite())
    }
}
