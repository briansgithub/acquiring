package com.sacredring.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class ChordInterpreterTest {

    private val json = Json { ignoreUnknownKeys = true }
    private val key = KeyInfo("C", "major")

    @Test
    fun testBlankAndRestChords_doesNotCrash() {
        val testChords = listOf(
            "{}",
            """{"rest": true}""",
            """{"root": 0}""",
            """{"root": null}""",
            """{"root": -1}""",
            """{"root": "0"}""",
            """{"root": "invalid"}"""
        )

        for (chordStr in testChords) {
            val chordJson = json.decodeFromString<JsonObject>(chordStr)
            
            val roman = ChordInterpreter.getRomanSymbol(chordJson, key)
            val letter = ChordInterpreter.getLetterName(chordJson, key)
            val notes = ChordInterpreter.getChordNotes(chordJson, key)

            println("Tested '$chordStr' -> Roman='$roman', Letter='$letter', Notes=$notes")

            assertTrue("Roman symbol should be 'Rest' or empty for blank chord", roman == "Rest" || roman.isEmpty())
            assertTrue("Letter name should be empty for rest/blank chord", letter.isEmpty())
            assertTrue("Notes list should be empty for rest/blank chord", notes.isEmpty())
        }

        println("✅ Successfully verified zero crashes for all blank/rest chord formats!")
    }
}
