package com.sacredring.android

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

class RelativeIonianContextTest {
    private fun chord(
        root: Int,
        type: Int = 5,
        applied: Int = 0
    ) = buildJsonObject {
        put("root", root)
        put("type", type)
        if (applied > 0) put("applied", applied)
    }

    @Test
    fun everySupportedModeResolvesToItsIonianTonic() {
        val modalKeys = listOf(
            KeyInfo("C", "major"),
            KeyInfo("C", "ionian"),
            KeyInfo("D", "dorian"),
            KeyInfo("E", "phrygian"),
            KeyInfo("F", "lydian"),
            KeyInfo("G", "mixolydian"),
            KeyInfo("A", "minor"),
            KeyInfo("A", "aeolian"),
            KeyInfo("B", "locrian"),
            KeyInfo("A", "harmonicMinor"),
            KeyInfo("E", "phrygianDominant")
        )

        modalKeys.forEach { source ->
            assertEquals("Failed for ${source.scale}", KeyInfo("C", "major"), relativeIonianKey(source))
        }
        assertEquals(KeyInfo("Ab", "major"), relativeIonianKey(KeyInfo("Bb", "dorian")))
    }

    @Test
    fun scaleDegreesAndStaffPositionsRotateWithoutChangingPitch() {
        val key = KeyInfo("A", "minor")
        val tonic = MusicTheory.resolveScaleDegreePitch("1", 0, key)!!
        val mediant = MusicTheory.resolveScaleDegreePitch("3", 0, key)!!

        assertEquals("6\u0302", relativeIonianDegreeLabel(tonic, key))
        assertEquals("1\u0302", relativeIonianDegreeLabel(mediant, key))
        assertEquals("♭7\u0302", relativeIonianDegreeLabel(70, key))
        assertEquals(6, relativeIonianStaffDegree("1", 0, key))
        assertEquals(8, relativeIonianStaffDegree("3", 0, key))
    }

    @Test
    fun naturalMinorChordsUseTheirRelativeMajorNumerals() {
        val key = KeyInfo("A", "minor")

        assertEquals("vi", ChordInterpreter.getRelativeIonianRomanSymbol(chord(1), key))
        assertEquals("I", ChordInterpreter.getRelativeIonianRomanSymbol(chord(3), key))
        assertEquals("ii", ChordInterpreter.getRelativeIonianRomanSymbol(chord(4), key))
        assertEquals("iii", ChordInterpreter.getRelativeIonianRomanSymbol(chord(5), key))
        assertEquals("V/iii", ChordInterpreter.getRelativeIonianRomanSymbol(chord(5, applied = 5), key))
    }

    @Test
    fun alteredModalQualitySurvivesTheContextChange() {
        val key = KeyInfo("A", "harmonicMinor")

        assertEquals("III", ChordInterpreter.getRelativeIonianRomanSymbol(chord(5), key))
        assertEquals("♯v\u00b0", ChordInterpreter.getRelativeIonianRomanSymbol(chord(7), key))
    }

    @Test
    fun generatingALabelDoesNotMutatePlaybackInputs() {
        val key = KeyInfo("A", "minor")
        val sourceChord = chord(root = 1, type = 7)
        val notesBefore = ChordInterpreter.getChordNotes(sourceChord, key)

        assertEquals("vi7", ChordInterpreter.getRelativeIonianRomanSymbol(sourceChord, key))
        assertEquals(notesBefore, ChordInterpreter.getChordNotes(sourceChord, key))
        assertEquals(1, sourceChord["root"]?.jsonPrimitive?.int)
        assertEquals(KeyInfo("A", "minor"), key)
    }
}
