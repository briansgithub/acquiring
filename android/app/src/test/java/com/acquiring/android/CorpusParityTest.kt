package com.acquiring.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

@Serializable
data class ParityTestCase(
    val id: String,
    val json: String,
    val key: KeyInfo,
    val expectedRoman: String,
    val expectedLetter: String,
    val expectedPcs: List<Int>
)

class CorpusParityTest {

    private val jsonParser = Json { ignoreUnknownKeys = true }

    @Test
    fun testCorpusParityWithWebPlayerEngine() {
        val resourceStream = javaClass.classLoader?.getResourceAsStream("corpus_parity.json")
            ?: throw IllegalStateException("Could not find corpus_parity.json in test resources")
        val jsonText = resourceStream.bufferedReader().use { it.readText() }
        val testCases = jsonParser.decodeFromString<List<ParityTestCase>>(jsonText)

        var romanPassed = 0
        var letterPassed = 0
        var pcsPassed = 0
        val total = testCases.size

        val romanFailures = mutableListOf<String>()
        val letterFailures = mutableListOf<String>()
        val pcsFailures = mutableListOf<String>()

        for (tc in testCases) {
            val chordJson = jsonParser.decodeFromString<JsonObject>(tc.json)
            val roman = ChordInterpreter.getRomanSymbol(chordJson, tc.key)
            val letter = ChordInterpreter.getLetterName(chordJson, tc.key)
            val notes = ChordInterpreter.getChordNotes(chordJson, tc.key)
            val pcs = notes.map { ((it % 12) + 12) % 12 }.toSet().sorted()

            val expectedPcsSorted = tc.expectedPcs.sorted()

            if (roman == tc.expectedRoman) romanPassed++
            else romanFailures.add("[${tc.id}] Expected Roman: '${tc.expectedRoman}', Actual: '$roman'")

            if (letter == tc.expectedLetter) letterPassed++
            else letterFailures.add("[${tc.id}] Expected Letter: '${tc.expectedLetter}', Actual: '$letter'")

            if (pcs == expectedPcsSorted) pcsPassed++
            else pcsFailures.add("[${tc.id}] Expected PCs: $expectedPcsSorted, Actual: $pcs")
        }

        println("================ PARITY BENCHMARK REPORT ================")
        println("Total Benchmark Test Cases: $total")
        println("Roman Numeral Parity: $romanPassed / $total (${String.format("%.1f", romanPassed * 100.0 / total)}%)")
        println("Letter Name Parity:    $letterPassed / $total (${String.format("%.1f", letterPassed * 100.0 / total)}%)")
        println("Pitch-Class Set Parity: $pcsPassed / $total (${String.format("%.1f", pcsPassed * 100.0 / total)}%)")
        println("=========================================================")

        if (romanFailures.isNotEmpty()) {
            println("\n--- ROMAN NUMERAL DISCREPANCIES (${romanFailures.size}) ---")
            romanFailures.forEach { println("  - $it") }
        }

        if (letterFailures.isNotEmpty()) {
            println("\n--- LETTER NAME DISCREPANCIES (${letterFailures.size}) ---")
            letterFailures.forEach { println("  - $it") }
        }

        if (pcsFailures.isNotEmpty()) {
            println("\n--- PITCH CLASS DISCREPANCIES (${pcsFailures.size}) ---")
            pcsFailures.forEach { println("  - $it") }
        }

        // Assert 100% parity across all dimensions
        assertEquals("Roman Symbol Failures:\n" + romanFailures.joinToString("\n"), 0, romanFailures.size)
        assertEquals("Letter Name Failures:\n" + letterFailures.joinToString("\n"), 0, letterFailures.size)
        assertEquals("Pitch Class Failures:\n" + pcsFailures.joinToString("\n"), 0, pcsFailures.size)
    }
}
