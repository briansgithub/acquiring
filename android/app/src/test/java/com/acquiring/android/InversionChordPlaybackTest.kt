package com.acquiring.android

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InversionChordPlaybackTest {

    private val cMajorKey = KeyInfo("C", "major")
    private val abMajorKey = KeyInfo("Ab", "major")

    @Test
    fun testGladiolusCustomBorrowedSecondInversion_matchesWebMidi() {
        val chord = buildJsonObject {
            put("root", 2)
            put("type", 5)
            put("inversion", 2)
            put("borrowed", JsonArray(listOf(1, 3, 4, 6, 8, 9, 11).map(::JsonPrimitive)))
        }

        assertEquals(listOf(65, 71, 74), ChordInterpreter.getChordNotes(chord, abMajorKey))
    }

    @Test
    fun testGladiolusAppliedFirstInversion_matchesWebMidi() {
        val chord = buildJsonObject {
            put("root", 6)
            put("applied", 5)
            put("type", 7)
            put("inversion", 1)
        }

        assertEquals(listOf(40, 55, 58, 48), ChordInterpreter.getChordNotes(chord, abMajorKey))
    }

    @Test
    fun testGladiolusAppliedThirdInversion_matchesWebMidi() {
        val chord = buildJsonObject {
            put("root", 4)
            put("applied", 5)
            put("type", 7)
            put("inversion", 3)
        }

        assertEquals(listOf(54, 68, 60, 63), ChordInterpreter.getChordNotes(chord, abMajorKey))
    }

    @Test
    fun testGladiolusAppliedRootPositionDim7_matchesWebSpreadVoicing() {
        val chord = buildJsonObject {
            put("root", 5)
            put("applied", 7)
            put("type", 7)
            put("inversion", 0)
        }

        assertEquals(listOf(50, 59, 65, 68), ChordInterpreter.getChordNotes(chord, abMajorKey))
    }

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

        assertEquals(listOf(49, 64, 67, 69), inverted)
        assertEquals(57, rootPosition.first())
        assertEquals("3\u0302", MusicTheory.getRelativeDegreeLabel(inverted[0], rootPosition.first()))
        assertEquals("5\u0302", MusicTheory.getRelativeDegreeLabel(inverted[1], rootPosition.first()))
        assertTrue(MusicTheory.getRelativeDegreeLabel(inverted[2], rootPosition.first()).endsWith("7\u0302"))
        assertEquals("1\u0302", MusicTheory.getRelativeDegreeLabel(inverted[3], rootPosition.first()))
    }
}
