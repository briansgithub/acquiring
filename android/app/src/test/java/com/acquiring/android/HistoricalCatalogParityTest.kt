package com.acquiring.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Exact platform parity for the complete deduplicated historical catalog inputs. */
class HistoricalCatalogParityTest {
    @Test
    fun historicalCatalogMatchesEveryContractField() {
        val parser = Json { ignoreUnknownKeys = true }
        val resource = javaClass.classLoader?.getResourceAsStream("historic_catalog_parity.json")
            ?: error("Missing historic_catalog_parity.json")
        val cases = parser.decodeFromString<List<ParityTestCase>>(resource.bufferedReader().use { it.readText() })
        assertEquals("Historical input coverage changed", 21464, cases.size)
        assertEquals("Historical fixture IDs must be unique", cases.size, cases.map { it.id }.toSet().size)
        val failures = linkedMapOf<String, MutableList<String>>(
            "roman" to mutableListOf(), "letter" to mutableListOf(), "pcs" to mutableListOf(),
            "midi" to mutableListOf(), "rootMidi" to mutableListOf(), "toneLabels" to mutableListOf())
        fun compare(id: String, field: String, expected: Any?, actual: Any?) {
            if (expected != actual) failures.getValue(field) += "[$id] expected '$expected', got '$actual'"
        }
        for (case in cases) {
            val chord = parser.decodeFromString<JsonObject>(case.json)
            val midi = ChordInterpreter.getChordNotes(chord, case.key)
            val labels = ChordInterpreter.getChordToneLabels(chord, case.key)
            compare(case.id, "roman", case.expectedRoman, ChordInterpreter.getRomanSymbol(chord, case.key))
            compare(case.id, "letter", case.expectedLetter, ChordInterpreter.getLetterName(chord, case.key))
            compare(case.id, "pcs", case.expectedPcs.sorted(), midi.map { Math.floorMod(it, 12) }.toSet().sorted())
            compare(case.id, "midi", case.expectedMidi, midi)
            compare(case.id, "rootMidi", case.expectedRootMidi, ChordInterpreter.getResolvedRootMidi(chord, case.key))
            compare(case.id, "toneLabels", case.expectedToneLabels, labels)
            assertEquals("${case.id}: every sounding tone needs a label", midi.size, labels.size)
        }
        val report = failures.entries.flatMap { (field, errors) -> errors.map { "$field $it" } }
        System.getenv("ACQUIRING_HISTORIC_PARITY_DUMP")?.let { java.io.File(it).writeText(report.joinToString("\n")) }
        println("Exact historical catalog parity over ${cases.size} cases: ${failures.mapValues { it.value.size }}")
        assertTrue("Historical catalog parity differs: ${failures.mapValues { it.value.size }}\n" + report.take(30).joinToString("\n"), report.isEmpty())
    }
}
