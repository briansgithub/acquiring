package com.sacredring.android

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
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
        // Root Position C major: C3 (48), E3 (52), G3 (55) -> Root is bass note
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
        // 1st Inversion C major: E3 (52), G3 (55), C4 (60) -> 3rd is bass note!
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
        // 2nd Inversion C major: G3 (55), C4 (60), E4 (64) -> 5th is bass note!
        assertEquals(listOf(55, 60, 64), notes)
    }

    @Test
    fun testThirdInversionSeventhChordNotes_startsOnSeventh() {
        val chord = buildJsonObject {
            put("root", 5) // V chord (G)
            put("type", 7) // V7
            put("inversion", 3) // 3rd inversion (4/2)
        }
        val notes = ChordInterpreter.getChordNotes(chord, cMajorKey)
        // G7 in 3rd inversion: F4 (65), G4 (67), B4 (71), D5 (74) -> 7th (F4) is bass note!
        assertEquals(listOf(65, 67, 71, 74), notes)
    }
}
