package com.sacredring.android

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class SpelledPitchResolutionTest {
    @Test
    fun sourceAccidentalModifiesTheKeySpellingRatherThanReplacingIt() {
        val eNatural = MusicTheory.resolveScaleDegreePitch("b3", 0, KeyInfo("C#", "major"))
        val cNatural = MusicTheory.resolveScaleDegreePitch("#3", 0, KeyInfo("Ab", "minor"))

        assertEquals("E", eNatural?.noteName)
        assertEquals("C", cNatural?.noteName)
        assertEquals(4, eNatural?.octave)
        assertEquals(5, cNatural?.octave)
    }

    @Test
    fun malformedScaleDegreesDoNotBecomeFalseTonicIntervals() {
        listOf("", "#", "0", "-1", "degree3").forEach { source ->
            assertNull(MusicTheory.resolveScaleDegreePitch(source, 0, KeyInfo("C", "major")))
        }
    }

    @Test
    fun degreeOverflowAndRelativeOctaveShareTheSameWrittenPosition() {
        val degreeEight = MusicTheory.resolveScaleDegreePitch("8", 0, KeyInfo("C", "major"))
        val raisedTonic = MusicTheory.resolveScaleDegreePitch("1", 1, KeyInfo("C", "major"))

        assertEquals(raisedTonic, degreeEight)
        assertEquals(5, degreeEight?.octave)
    }

    @Test
    fun chordRootResolverPreservesNativeAndBorrowedEnharmonics() {
        val native = buildJsonObject { put("root", 3) }
        val borrowed = buildJsonObject {
            put("root", 6)
            put("borrowed", "minor")
        }

        assertEquals(
            "E#",
            ChordInterpreter.resolveChordRoot(native, KeyInfo("C#", "major"))?.pitch?.noteName
        )
        assertEquals(
            "Ab",
            ChordInterpreter.resolveChordRoot(borrowed, KeyInfo("C", "major"))?.pitch?.noteName
        )
    }

    @Test
    fun appliedAndTritoneSubstitutionRootsUseStructuredSpelling() {
        val applied = buildJsonObject {
            put("root", 5)
            put("applied", 7)
        }
        val triSub = buildJsonObject {
            put("root", 5)
            put("applied", 5)
            put("substitutions", buildJsonArray { add(JsonPrimitive("tri")) })
        }

        val appliedRoot = ChordInterpreter.resolveChordRoot(applied, KeyInfo("C", "major"))
        val triSubRoot = ChordInterpreter.resolveChordRoot(triSub, KeyInfo("C", "major"))

        assertNotNull(appliedRoot)
        assertEquals("F#", appliedRoot?.pitch?.noteName)
        assertEquals(ChordRootContext.APPLIED, appliedRoot?.context)
        assertEquals("Ab", triSubRoot?.pitch?.noteName)
        assertEquals(ChordRootContext.TRITONE_SUBSTITUTION, triSubRoot?.context)
    }

    @Test
    fun appliedRootsStayInTheSourceScaleDegreeRegister() {
        val dominantOfDominant = buildJsonObject {
            put("root", 5)
            put("applied", 5)
        }

        val root = ChordInterpreter.resolveChordRoot(
            dominantOfDominant,
            KeyInfo("C", "major")
        )

        assertEquals("D", root?.pitch?.noteName)
        assertEquals(3, root?.pitch?.octave)
        assertEquals(1, root?.genericStepsFromTonic)
        assertEquals(2, root?.specificSemitonesFromTonic)
    }

    @Test
    fun borrowingTakesPrecedenceOverAnInapplicableAppliedField() {
        val borrowed = buildJsonObject {
            put("root", 6)
            put("borrowed", "minor")
            put("applied", 5)
        }

        val root = ChordInterpreter.resolveChordRoot(borrowed, KeyInfo("C", "major"))

        assertEquals("Ab", root?.pitch?.noteName)
        assertEquals(ChordRootContext.BORROWED, root?.context)
    }
}
