package com.acquiring.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class ClosedLoopWebVsAndroidChordTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun testCorpusChords_deduplicatedAndNoRestChords() {
        val sampleSectionJson = """
            {
              "songId": "test-song",
              "numericId": 12345,
              "sectionName": "Chorus",
              "songInfo": "Poker Face",
              "chords": [
                {"root": 0, "isRest": true, "beat": 1, "duration": 1},
                {"root": 6, "type": 5, "inversion": 0, "beat": 2, "duration": 4},
                {"root": 6, "type": 5, "inversion": 0, "beat": 6, "duration": 4},
                {"root": 4, "type": 5, "inversion": 0, "beat": 10, "duration": 4},
                {"root": 1, "type": 5, "inversion": 0, "beat": 14, "duration": 4},
                {"root": 1, "type": 5, "inversion": 0, "beat": 18, "duration": 4},
                {"root": 5, "type": 5, "inversion": 0, "beat": 22, "duration": 4}
              ],
              "metadata": {
                "keys": [{"tonic": "Ab", "scale": "minor"}]
              }
            }
        """.trimIndent()

        val section = json.decodeFromString<ExtractedSection>(sampleSectionJson)
        val key = section.getParsedKey()

        val uniqueChords = ChordInterpreter.getUniqueDisplayChords(section.chords, key)

        println("--- Corpus Test: Raw chord count = ${section.chords.size}, Unique chord count = ${uniqueChords.size} ---")

        // 1. Verify Rest chords are omitted
        val hasRest = uniqueChords.any { chord ->
            val roman = ChordInterpreter.getRomanSymbol(chord, key)
            roman == "Rest" || roman.isEmpty()
        }
        assertFalse("Unique display chords should NOT contain rest chords", hasRest)

        // 2. Verify Consecutive Duplicate chords are merged
        // Expected chord sequence: vi (root 6), IV (root 4), i (root 1), v (root 5) -> 4 distinct chords!
        assertEquals("Should deduplicate consecutive identical chords to exactly 4 distinct chord buttons", 4, uniqueChords.size)

        val romanSymbols = uniqueChords.map { ChordInterpreter.getRomanSymbol(it, key) }
        val letterNames = uniqueChords.map { ChordInterpreter.getLetterName(it, key) }
        val chordNotes = uniqueChords.map { ChordInterpreter.getChordNotes(it, key) }

        println("Rendered Roman Numerals: $romanSymbols")
        println("Rendered Letter Names: $letterNames")
        println("Deciphered Note Lists: $chordNotes")

        for (notes in chordNotes) {
            assertTrue("Deciphered chord notes should contain 3+ valid MIDI note integers", notes.size >= 3)
            assertTrue("All deciphered MIDI notes should be valid (> 0)", notes.all { it > 0 })
        }

        println("✅ Closed-loop verification passed 100%! Rest chords excluded & duplicates merged.")
    }

    @Test
    fun testNonConsecutiveRecurringChords_shownOnlyOnce() {
        val sampleSectionJson = """
            {
              "songId": "recurring-test",
              "numericId": 99999,
              "sectionName": "Chorus",
              "songInfo": "Test Song",
              "chords": [
                {"root": 6, "type": 5, "inversion": 0},
                {"root": 4, "type": 5, "inversion": 0},
                {"root": 1, "type": 5, "inversion": 0},
                {"root": 5, "type": 5, "inversion": 0},
                {"root": 6, "type": 5, "inversion": 0},
                {"root": 4, "type": 5, "inversion": 0}
              ],
              "metadata": {
                "keys": [{"tonic": "C", "scale": "major"}]
              }
            }
        """.trimIndent()

        val section = json.decodeFromString<ExtractedSection>(sampleSectionJson)
        val key = section.getParsedKey()
        val uniqueChords = ChordInterpreter.getUniqueDisplayChords(section.chords, key)

        assertEquals("Should contain exactly 4 unique chord buttons for [vi, IV, I, V, vi, IV]", 4, uniqueChords.size)
        val symbols = uniqueChords.map { ChordInterpreter.getRomanSymbol(it, key) }
        assertEquals(listOf("vi", "IV", "I", "V"), symbols)
        println("✅ Verified non-consecutive recurring chords deduplicated: $symbols")
    }
}
