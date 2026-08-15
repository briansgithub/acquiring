package com.inquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class SpelledIntervalTest {
    private fun pitch(name: String, octave: Int): SpelledPitch =
        requireNotNull(SpelledPitch.parse(name, octave))

    @Test
    fun enharmonicTritonesKeepTheirWrittenQuantity() {
        assertEquals("d5 ↑", calculateNamedInterval(pitch("C#", 4), pitch("G", 4)).shorthand)
        assertEquals("A4 ↑", calculateNamedInterval(pitch("C#", 4), pitch("F##", 4)).shorthand)
        assertEquals("A4 ↑", calculateNamedInterval(pitch("C", 4), pitch("F#", 4)).shorthand)
        assertEquals("d5 ↑", calculateNamedInterval(pitch("C", 4), pitch("Gb", 4)).shorthand)
    }

    @Test
    fun directionAndCompoundsComeFromWrittenStaffPosition() {
        assertEquals("M3 ↓", calculateNamedInterval(pitch("E", 4), pitch("C", 4)).shorthand)
        assertEquals("m9 ↑", calculateNamedInterval(pitch("C", 4), pitch("Db", 5)).shorthand)
        assertEquals("P15 ↑", calculateNamedInterval(pitch("C", 4), pitch("C", 6)).shorthand)
        assertEquals("m2 ↑", calculateNamedInterval(pitch("B", 3), pitch("C", 4)).shorthand)
        assertEquals("m2 ↓", calculateNamedInterval(pitch("C", 5), pitch("B", 4)).shorthand)
        assertEquals("P5 ↓", calculateNamedInterval(pitch("G", 4), pitch("C", 4)).shorthand)
        assertEquals("m9 ↓", calculateNamedInterval(pitch("Db", 5), pitch("C", 4)).shorthand)
    }

    @Test
    fun samePitchSpellingAndRepeatedNotesRemainDistinct() {
        assertEquals("d2 ↑", calculateNamedInterval(pitch("C#", 4), pitch("Db", 4)).shorthand)
        assertEquals("P1 ·", calculateNamedInterval(pitch("C", 4), pitch("C", 4)).shorthand)
    }

    @Test
    fun repeatedAugmentedAndDiminishedQualitiesUseStandardShorthand() {
        assertEquals("AA4 ↑", calculateNamedInterval(pitch("C", 4), pitch("F##", 4)).shorthand)
        assertEquals("dd5 ↑", calculateNamedInterval(pitch("C", 4), pitch("Gbb", 4)).shorthand)
    }
}
