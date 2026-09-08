package com.acquiring.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertTrue
import org.junit.Test

@Serializable
data class ParityTestCase(
    val id: String,
    val json: String,
    val key: KeyInfo,
    val expectedRoman: String,
    val expectedLetter: String,
    val expectedPcs: List<Int>,
    val expectedMidi: List<Int>,
    val expectedRootMidi: Int,
    val expectedToneLabels: List<String>
)

/**
 * The cross-platform chord-decoding contract. The fixture is generated from the
 * web player (`npm run parity:export`) and read in place from contracts/fixtures
 * via the test.resources.srcDir wired up in app/build.gradle, so web, Android and
 * iOS all assert against the identical file.
 */
class CorpusParityTest {

    private val jsonParser = Json { ignoreUnknownKeys = true }

    @Test
    fun testCorpusParityWithWebPlayerEngine() {
        val resourceStream = javaClass.classLoader?.getResourceAsStream("corpus_parity.json")
            ?: throw IllegalStateException("Could not find corpus_parity.json in test resources")
        val jsonText = resourceStream.bufferedReader().use { it.readText() }
        val testCases = jsonParser.decodeFromString<List<ParityTestCase>>(jsonText)
        assertTrue("Corpus should not be trivially small", testCases.size > 1000)

        val failures = linkedMapOf<String, MutableList<String>>(
            "roman" to mutableListOf(),
            "letter" to mutableListOf(),
            "pcs" to mutableListOf(),
            "midi" to mutableListOf(),
            "rootMidi" to mutableListOf(),
            "toneLabels" to mutableListOf()
        )

        for (tc in testCases) {
            val chordJson = jsonParser.decodeFromString<JsonObject>(tc.json)
            val roman = ChordInterpreter.getRomanSymbol(chordJson, tc.key)
            val letter = ChordInterpreter.getLetterName(chordJson, tc.key)
            val notes = ChordInterpreter.getChordNotes(chordJson, tc.key)
            val rootMidi = ChordInterpreter.getRootPositionChordNotes(chordJson, tc.key).firstOrNull()
            val pcs = notes.map { ((it % 12) + 12) % 12 }.toSet().sorted()

            if (roman != tc.expectedRoman) {
                failures["roman"]!!.add("[${tc.id}] expected '${tc.expectedRoman}', got '$roman'")
            }
            if (letter != tc.expectedLetter) {
                failures["letter"]!!.add("[${tc.id}] expected '${tc.expectedLetter}', got '$letter'")
            }
            if (pcs != tc.expectedPcs.sorted()) {
                failures["pcs"]!!.add("[${tc.id}] expected ${tc.expectedPcs}, got $pcs")
            }
            if (notes != tc.expectedMidi) {
                failures["midi"]!!.add("[${tc.id}] expected ${tc.expectedMidi}, got $notes")
            }
            if (rootMidi != tc.expectedRootMidi) {
                failures["rootMidi"]!!.add("[${tc.id}] expected ${tc.expectedRootMidi}, got $rootMidi")
            }
            if (rootMidi != null) {
                val labels = notes.map { MusicTheory.getRelativeDegreeLabel(it, rootMidi) }
                if (labels != tc.expectedToneLabels) {
                    failures["toneLabels"]!!.add("[${tc.id}] expected ${tc.expectedToneLabels}, got $labels")
                }
            }
        }

        val total = testCases.size
        System.getenv("ACQUIRING_PARITY_DUMP")?.let { path ->
            java.io.File(path).writeText(
                failures.entries.flatMap { (channel, list) -> list.map { "$channel $it" } }
                    .joinToString("\n")
            )
        }

        ParityBaseline.assertWithinBaseline(
            corpus = "corpus_parity",
            counts = failures.mapValues { it.value.size },
            total = total,
            samples = failures.values.flatten()
        )
    }
}
