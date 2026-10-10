package com.acquiring.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertTrue
import org.junit.Test

@Serializable
data class RealParityCase(
    val id: String,
    val occurrences: Int,
    val json: String,
    val key: KeyInfo,
    val expectedRoman: String,
    val expectedLetter: String,
    val expectedPcs: List<Int>,
    val expectedMidi: List<Int>,
    val expectedRootMidi: Int?,
    val expectedToneLabels: List<String>,
    val truthRoman: String,
    val truthLetter: String,
    val truthPcs: List<Int>
)

/**
 * Requires exact parity for every rendered output on the real-song corpus.
 * The web source review independently checks the captured Hooktheory evidence;
 * these assertions prevent Android from drifting from the reviewed decoder.
 */
class HooktheoryRealParityTest {

    private val jsonParser = Json { ignoreUnknownKeys = true }

    @Test
    fun testRealSongParity() {
        val stream = javaClass.classLoader?.getResourceAsStream("hooktheory_parity.json")
            ?: throw IllegalStateException("hooktheory_parity.json missing from test resources")
        val cases = jsonParser.decodeFromString<List<RealParityCase>>(
            stream.bufferedReader().use { it.readText() }
        )

        assertTrue("Real-song corpus must retain its reference cases", cases.size > 1000)
        val badShapes = linkedMapOf<String, Int>()
        val badPlays = linkedMapOf<String, Int>()
        val lines = mutableListOf<String>()
        var totalPlays = 0

        for (tc in cases) {
            totalPlays += tc.occurrences
            val chord = jsonParser.decodeFromString<JsonObject>(tc.json)
            val roman = ChordInterpreter.getRomanSymbol(chord, tc.key)
            val letter = ChordInterpreter.getLetterName(chord, tc.key)
            val notes = ChordInterpreter.getChordNotes(chord, tc.key)
            val rootMidi = ChordInterpreter.getResolvedRootMidi(chord, tc.key)
            val pcs = notes.map { ((it % 12) + 12) % 12 }.toSet().sorted()
            val labels = ChordInterpreter.getChordToneLabels(chord, tc.key)

            fun check(name: String, ok: Boolean, detail: () -> String) {
                if (ok) return
                badShapes[name] = (badShapes[name] ?: 0) + 1
                badPlays[name] = (badPlays[name] ?: 0) + tc.occurrences
                lines.add("$name [${tc.id}] x${tc.occurrences} ${detail()}")
            }
            check("roman", roman == tc.expectedRoman) { "expected ${tc.expectedRoman}, got $roman" }
            check("letter", letter == tc.expectedLetter) { "expected ${tc.expectedLetter}, got $letter" }
            check("pcs", pcs == tc.expectedPcs.sorted()) { "expected ${tc.expectedPcs}, got $pcs" }
            check("midi", notes == tc.expectedMidi) { "expected ${tc.expectedMidi}, got $notes" }
            check("rootMidi", rootMidi == tc.expectedRootMidi) { "expected ${tc.expectedRootMidi}, got $rootMidi" }
            check("toneLabels", labels == tc.expectedToneLabels) { "expected ${tc.expectedToneLabels}, got $labels" }
        }

        println("=== Android vs web on ${cases.size} real chord shapes ($totalPlays occurrences) ===")
        for (name in listOf("roman", "letter", "pcs", "midi", "rootMidi", "toneLabels")) {
            val shapes = cases.size - (badShapes[name] ?: 0)
            val plays = totalPlays - (badPlays[name] ?: 0)
            println(
                String.format(
                    "  %-11s shapes %5d/%5d (%5.1f%%)   weighted %6d/%6d (%5.1f%%)",
                    name, shapes, cases.size, shapes * 100.0 / cases.size,
                    plays, totalPlays, plays * 100.0 / totalPlays
                )
            )
        }
        System.getenv("ACQUIRING_REAL_DUMP")?.let { java.io.File(it).writeText(lines.joinToString("\n")) }

        assertTrue("Real-song parity differs: $badShapes\n" + lines.take(40).joinToString("\n"), badShapes.isEmpty())
    }
}
