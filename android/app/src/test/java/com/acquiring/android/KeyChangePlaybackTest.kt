package com.acquiring.android

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

class KeyChangePlaybackTest {

    private fun createMultiKeySection(): ExtractedSection {
        val keysArray = buildJsonArray {
            add(buildJsonObject {
                put("tonic", "Bb")
                put("scale", "mixolydian")
                put("beat", 1.0)
            })
            add(buildJsonObject {
                put("tonic", "C")
                put("scale", "major")
                put("beat", 17.0)
            })
        }
        val metadataObj = buildJsonObject {
            put("keys", keysArray)
            put("endBeat", 32.0)
        }
        return ExtractedSection(
            sectionName = "Chorus",
            metadata = metadataObj
        )
    }

    @Test
    fun testBeatLevelKeyResolution() {
        val section = createMultiKeySection()

        val keyBefore17 = section.getKeyAtBeat(1.0)
        assertEquals("Bb", keyBefore17.tonic)
        assertEquals("mixolydian", keyBefore17.scale)

        val keyAt16 = section.getKeyAtBeat(16.5)
        assertEquals("Bb", keyAt16.tonic)
        assertEquals("mixolydian", keyAt16.scale)

        val keyAt17 = section.getKeyAtBeat(17.0)
        assertEquals("C", keyAt17.tonic)
        assertEquals("major", keyAt17.scale)

        val keyAfter17 = section.getKeyAtBeat(24.0)
        assertEquals("C", keyAfter17.tonic)
        assertEquals("major", keyAfter17.scale)
    }

    @Test
    fun testMidiNotePitchShiftsAcrossKeyBoundary() {
        val section = createMultiKeySection()

        // Scale degree 1 at beat 1.0 (Bb Mixolydian) -> Bb4 (70)
        val keyBeat1 = section.getKeyAtBeat(1.0)
        val midiBeat1 = MusicTheory.getMidiNote("1", 0, keyBeat1)
        assertEquals(70, midiBeat1)

        // Scale degree 1 at beat 17.0 (C Major) -> C4 (60)
        val keyBeat17 = section.getKeyAtBeat(17.0)
        val midiBeat17 = MusicTheory.getMidiNote("1", 0, keyBeat17)
        assertEquals(60, midiBeat17)
    }

    @Test
    fun testChordNotesAndRomanSymbolsAcrossKeyModulation() {
        val section = createMultiKeySection()

        // Tonic chord JSON
        val chordJson = buildJsonObject {
            put("root", "1")
            put("type", 1) // Major triad
            put("beat", 1.0)
            put("duration", 4.0)
        }

        // Before modulation (beat 1.0, Bb Mixolydian)
        val keyBeat1 = section.getKeyAtBeat(1.0)
        val symbol1 = ChordInterpreter.getRomanSymbol(chordJson, keyBeat1)
        val notes1 = ChordInterpreter.getChordNotes(chordJson, keyBeat1)
        assertEquals("I", symbol1)
        assertEquals(listOf(58, 62, 65), notes1) // Bb3, D4, F4

        // After modulation (beat 17.0, C Major)
        val keyBeat17 = section.getKeyAtBeat(17.0)
        val symbol17 = ChordInterpreter.getRomanSymbol(chordJson, keyBeat17)
        val notes17 = ChordInterpreter.getChordNotes(chordJson, keyBeat17)
        assertEquals("I", symbol17)
        assertEquals(listOf(48, 52, 55), notes17) // C3, E3, G3
    }
}
