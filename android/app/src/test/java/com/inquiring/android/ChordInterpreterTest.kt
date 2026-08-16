package com.inquiring.android

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

    @Test
    fun testRegressionSuite_ParityWithWebApp() {
        val testCases = listOf(
            // Fix 015/016: Maple Leaf Rag vii°7/V (dim7 voicing)
            RegressionTestCase(
                json = """{"root": 5, "applied": 7, "type": 7}""",
                key = KeyInfo("C", "major"),
                expectedRoman = "vii°7/V",
                expectedPcs = setOf(6, 9, 0, 3) // F#, A, C, Eb
            ),
            // Fix 006: Penny Lane I△42
            RegressionTestCase(
                json = """{"root": 1, "type": 7, "inversion": 3}""",
                key = KeyInfo("C", "major"),
                expectedRoman = "I△42",
                expectedPcs = setOf(0, 4, 7, 11) // C, E, G, B
            ),
            // Fix 023: Type 11 and 13
            RegressionTestCase(
                json = """{"root": 5, "type": 11}""",
                key = KeyInfo("C", "major"),
                expectedRoman = "V11",
                expectedPcs = setOf(7, 11, 2, 5, 9, 0) // G, B, D, F, A, C (Diatonic G11)
            ),
            // Fix 018: Suspensions (no 3rd)
            RegressionTestCase(
                json = """{"root": 1, "suspensions": [4]}""",
                key = KeyInfo("C", "major"),
                expectedRoman = "Isus4",
                expectedPcs = setOf(0, 5, 7) // C, F, G
            ),
            // Fix 019-022: Modifier Pipeline
            RegressionTestCase(
                json = """{"root": 1, "omits": [3], "alterations": ["#5"], "adds": [9]}""",
                key = KeyInfo("C", "major"),
                expectedRoman = "I+(add9)(no3)(#5)",
                expectedPcs = setOf(0, 8, 2) // C, G#, D
            )
        )

        for (test in testCases) {
            val chordJson = json.decodeFromString<JsonObject>(test.json)
            val roman = ChordInterpreter.getRomanSymbol(chordJson, test.key)
            val notes = ChordInterpreter.getChordNotes(chordJson, test.key)
            val pcs = notes.map { it % 12 }.toSet()

            println("Testing ${test.json} in ${test.key.tonic} ${test.key.scale}")
            println("  Expected Roman: ${test.expectedRoman}, Actual: $roman")
            println("  Expected PCs: ${test.expectedPcs}, Actual: $pcs")

            assertEquals("Roman mismatch for ${test.json}", test.expectedRoman, roman)
            assertEquals("PC set mismatch for ${test.json}", test.expectedPcs, pcs)
        }
    }

    data class RegressionTestCase(
        val json: String,
        val key: KeyInfo,
        val expectedRoman: String,
        val expectedPcs: Set<Int>
    )
}
