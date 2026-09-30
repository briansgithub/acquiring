package com.acquiring.android

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackHomeReferenceTest {
    @Test
    fun homeTriadUsesEachSupportedScalesFirstThirdAndFifth() {
        val expectedChords = mapOf(
            "major" to listOf(48, 52, 55),
            "minor" to listOf(48, 51, 55),
            "dorian" to listOf(48, 51, 55),
            "phrygian" to listOf(48, 51, 55),
            "lydian" to listOf(48, 52, 55),
            "mixolydian" to listOf(48, 52, 55),
            "locrian" to listOf(48, 51, 54),
            "harmonicMinor" to listOf(48, 51, 55),
            "phrygianDominant" to listOf(48, 52, 55),
            "ionian" to listOf(48, 52, 55),
            "aeolian" to listOf(48, 51, 55)
        )
        expectedChords.forEach { (scale, chord) ->
            val reference = playbackHomeReference(KeyInfo("C", scale))
            assertEquals(scale, 60, reference.note)
            assertEquals(scale, chord, reference.chord)
        }
    }

    @Test
    fun referencesFollowTheCurrentKeyAcrossAMidSongModulation() {
        val section = ExtractedSection(
            sectionName = "Modulating",
            metadata = buildJsonObject {
                put("keys", buildJsonArray {
                    add(buildJsonObject {
                        put("tonic", "Bb")
                        put("scale", "mixolydian")
                        put("beat", 1.0)
                    })
                    add(buildJsonObject {
                        put("tonic", "F#")
                        put("scale", "minor")
                        put("beat", 9.0)
                    })
                })
            }
        )
        assertEquals(
            PlaybackHomeReference(70, listOf(58, 62, 65)),
            playbackHomeReference(section.getKeyAtBeat(8.99))
        )
        assertEquals(
            PlaybackHomeReference(66, listOf(54, 57, 61)),
            playbackHomeReference(section.getKeyAtBeat(9.0))
        )
    }
}
