package com.acquiring.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChordTransitionRankingTest {
    @Test
    fun dropsRestsAndImmediateRepeatsThenRanksByFrequency() {
        val section = ExtractedSection(
            chords = listOf(
                chord(root = 1, beat = 1.0, roman = "I"),
                chord(root = 1, beat = 2.0, roman = "I"),
                chord(root = 5, beat = 3.0, roman = "V"),
                chord(root = 1, beat = 4.0, roman = "I"),
                rest(5.0),
                chord(root = 5, beat = 6.0, roman = "V"),
                chord(root = 1, beat = 7.0, roman = "I")
            )
        )
        val ranked = ChordTransitionRanking.transitions(section, rootOnly = false)
        assertTrue(ranked.isNotEmpty())
        assertEquals(2, ranked.maxOf { it.count })
        assertTrue(ranked.none { it.id.contains("Rest", ignoreCase = true) })
        assertTrue(ranked.all { it.from !== it.to })
    }

    @Test
    fun rootOnlyIdentityUsesScaleDegree() {
        val chord = chord(root = 5, beat = 1.0, roman = "V7")
        assertEquals(
            "5",
            ChordTransitionRanking.identity(chord, KeyInfo("C", "major"), rootOnly = true)
        )
    }

    private fun chord(root: Int, beat: Double, roman: String): JsonObject = buildJsonObject {
        put("root", root)
        put("beat", beat)
        put("type", 5)
        put("inversion", 0)
        put("_romanSymbol", roman)
    }

    private fun rest(beat: Double): JsonObject = buildJsonObject {
        put("root", 0)
        put("beat", beat)
        put("isRest", true)
        put("_romanSymbol", "Rest")
    }
}
