package com.inquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SingingIntervalPlaybackTest {

    @Test
    fun pitchCardPlaybackUsesCapturedFractionalMidiWithoutQuantizing() {
        val captured = PitchData(
            pitch = SpelledPitch.fromMidi(69),
            cents = 37.0,
            rawMidi = 69.37
        )

        val frequency = requireNotNull(recordedPitchPlaybackFrequency(captured))
        val expected = 440.0 * Math.pow(2.0, 0.37 / 12.0)

        assertEquals(expected, frequency, 1e-9)
        assertNotEquals(440.0, frequency, 1e-6)
    }

    @Test
    fun pitchCardPlaybackRequiresARealFiniteCapture() {
        assertNull(recordedPitchPlaybackFrequency(null))
        assertNull(
            recordedPitchPlaybackFrequency(
                PitchData(SpelledPitch.fromMidi(69), cents = 0.0, rawMidi = Double.NaN)
            )
        )
    }

    @Test
    fun intervalCardPlaybackUsesAssignedIdealTargets() {
        val target = SingingTargetRequest(
            first = SingingTargetNote(sourceMidi = 60, scaleDegreeLabel = "1\u0302"),
            second = SingingTargetNote(sourceMidi = 67, scaleDegreeLabel = "5\u0302"),
            requestId = 1
        )

        assertEquals(72 to 79, idealIntervalPlaybackMidis(target, octaveShift = 1))
        assertNull(idealIntervalPlaybackMidis(target.copy(second = null), octaveShift = 1))
    }

    @Test
    fun literalFrequencyPlaybackDoesNotApplyGlobalTranspose() {
        val originalTranspose = AudioEngine.globalTranspose
        try {
            AudioEngine.globalTranspose = 7

            assertEquals(
                listOf(446.7),
                AudioEngine.literalPlaybackFrequencies(listOf(446.7))
            )
        } finally {
            AudioEngine.globalTranspose = originalTranspose
        }
    }

    @Test
    fun literalFrequencyPlaybackRejectsInvalidValues() {
        assertEquals(
            listOf(220.0, 440.0),
            AudioEngine.literalPlaybackFrequencies(
                listOf(Double.NaN, -1.0, 0.0, 220.0, Double.POSITIVE_INFINITY, 440.0)
            )
        )
    }
}
