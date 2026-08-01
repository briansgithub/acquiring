package com.sacredring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class RootIntervalPreviewTest {
    @Test
    fun sequencePlaysPreviousCurrentThenBothWithSharedOctaveShift() {
        val steps = rootIntervalPreviewSteps(
            previousAudioNote = 55,
            currentAudioNote = 60,
            octaveShiftSemitones = 12,
            durationMs = 450
        )

        assertEquals(listOf(listOf(67), listOf(72), listOf(67, 72)), steps.map { it.audioNotes })
        assertEquals(listOf(450L, 450L, 0L), steps.map { it.delayAfterMs })
        assertEquals(listOf(450, 450, 450), steps.map { it.durationMs })
    }

    @Test
    fun unisonFinalStepDoesNotDoubleTheSameAudioPitch() {
        val steps = rootIntervalPreviewSteps(60, 60, octaveShiftSemitones = 0, durationMs = 450)

        assertEquals(listOf(60), steps.last().audioNotes)
    }

    @Test
    fun melodySpellingUsesItsWrittenOctaveInTheSharedPreviewSequence() {
        val previous = requireNotNull(SpelledPitch.parse("C#", 4))
        val current = requireNotNull(SpelledPitch.parse("G", 4))

        val steps = rootIntervalPreviewSteps(
            previousAudioNote = previous.toAudioNoteNumber(),
            currentAudioNote = current.toAudioNoteNumber(),
            octaveShiftSemitones = 0,
            durationMs = 450
        )

        assertEquals(listOf(listOf(61), listOf(67), listOf(61, 67)), steps.map { it.audioNotes })
    }
}
