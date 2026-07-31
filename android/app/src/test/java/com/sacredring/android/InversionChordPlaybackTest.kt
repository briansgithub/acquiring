package com.sacredring.android

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InversionChordPlaybackTest {

    private val cMajorKey = KeyInfo("C", "major")

    @Test
    fun testRootPositionChordNotes_startsOnRoot() {
        val chord = buildJsonObject {
            put("root", 1)
            put("type", 5)
            put("inversion", 0)
        }
        val notes = ChordInterpreter.getChordNotes(chord, cMajorKey)
        assertEquals(listOf(48, 52, 55), notes)
    }

    @Test
    fun testFirstInversionChordNotes_startsOnThird() {
        val chord = buildJsonObject {
            put("root", 1)
            put("type", 5)
            put("inversion", 1)
        }
        val notes = ChordInterpreter.getChordNotes(chord, cMajorKey)
        assertEquals(listOf(52, 55, 60), notes)
    }

    @Test
    fun testSecondInversionChordNotes_startsOnFifth() {
        val chord = buildJsonObject {
            put("root", 1)
            put("type", 5)
            put("inversion", 2)
        }
        val notes = ChordInterpreter.getChordNotes(chord, cMajorKey)
        assertEquals(listOf(55, 60, 64), notes)
    }

    @Test
    fun testThirdInversionSeventhChordNotes_startsOnSeventh() {
        val chord = buildJsonObject {
            put("root", 5)
            put("type", 7)
            put("inversion", 3)
        }
        val notes = ChordInterpreter.getChordNotes(chord, cMajorKey)
        assertEquals(listOf(65, 67, 71, 74), notes)
    }

    @Test
    fun testRootPositionHelper_ignoresInversionForRootIdentification() {
        val chord = buildJsonObject {
            put("root", 1)
            put("type", 5)
            put("inversion", 1)
        }

        assertEquals(listOf(52, 55, 60), ChordInterpreter.getChordNotes(chord, cMajorKey))
        assertEquals(listOf(48, 52, 55), ChordInterpreter.getRootPositionChordNotes(chord, cMajorKey))
    }

    @Test
    fun testAppliedInversionRootPositionHelper_usesSoundingRootNotJsonDenominator() {
        // V6/ii in C: JSON root=2 is the denominator (D), while the
        // sounding chord root is A (scale degree 6 in C).
        val chord = buildJsonObject {
            put("root", 2)
            put("applied", 5)
            put("type", 7)
            put("inversion", 1)
        }

        val inverted = ChordInterpreter.getChordNotes(chord, cMajorKey)
        val rootPosition = ChordInterpreter.getRootPositionChordNotes(chord, cMajorKey)

        assertEquals(61, inverted.first())
        assertEquals(57, rootPosition.first())
        assertEquals("3\u0302", MusicTheory.getRelativeDegreeLabel(inverted[0], rootPosition.first()))
        assertEquals("5\u0302", MusicTheory.getRelativeDegreeLabel(inverted[1], rootPosition.first()))
        assertTrue(MusicTheory.getRelativeDegreeLabel(inverted[2], rootPosition.first()).endsWith("7\u0302"))
        assertEquals("1\u0302", MusicTheory.getRelativeDegreeLabel(inverted[3], rootPosition.first()))
    }
}
