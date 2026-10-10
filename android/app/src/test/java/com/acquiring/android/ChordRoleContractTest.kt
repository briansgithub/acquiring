package com.acquiring.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@Serializable
private data class ChordRoleCase(
    val id: String,
    val chord: JsonObject,
    val key: KeyInfo,
    val expectedRootMidi: Int?,
    val expectedToneLabels: List<String>,
    val expectedRelativeIonianRoman: String? = null,
    val displayContext: ParityDisplayContext? = null
)

class ChordRoleContractTest {
    @Test
    fun preservesReviewedMusicalRolesAndResolvedRoot() {
        val parser = Json { ignoreUnknownKeys = true }
        val stream = javaClass.classLoader?.getResourceAsStream("chord_role_contract.json")
            ?: error("chord_role_contract.json missing from test resources")
        val cases = parser.decodeFromString<List<ChordRoleCase>>(stream.bufferedReader().use { it.readText() })
        assertTrue("Reviewed role contract must contain its reference cases", cases.size >= 12)
        for (case in cases) {
            val result = ChordInterpreter.interpret(case.chord, case.key)
            assertEquals("${case.id}: resolved root", case.expectedRootMidi, result.rootMidi)
            assertEquals("${case.id}: ordered tone roles", case.expectedToneLabels, result.toneLabels)
            assertEquals("${case.id}: each voiced tone has a role", result.midi.size, result.toneLabels.size)
            case.expectedRelativeIonianRoman?.let { expected ->
                val context = case.displayContext?.let { KeyInfo(it.tonic, "major") } ?: relativeIonianKey(case.key)
                assertEquals("${case.id}: relative Ionian numeral", expected,
                    ChordInterpreter.getRelativeIonianRomanSymbol(case.chord, case.key, context))
            }
        }
    }
}
