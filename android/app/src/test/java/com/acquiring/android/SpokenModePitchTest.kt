package com.acquiring.android

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

class SpokenModePitchTest {
    @Test
    fun modePhraseShiftsOntoTheRequestedTonic() {
        val sourceHz = 220.0
        val source = sine(sourceHz)
        val measured = estimateSpeechPitchHz(source)
        assertTrue(measured != null && abs(measured - sourceHz) < 8.0)

        val tonic = 69 // A4, 440 Hz
        val shifted = pitchShiftSpokenClip(source, tonic)
        val shiftedHz = estimateSpeechPitchHz(shifted)
        assertTrue(shiftedHz != null && abs(shiftedHz - 440.0) < 25.0)
    }

    @Test
    fun timelineStoresTheNewKeyTonicForTheModeAnnouncement() {
        val section = Json.decodeFromString<ExtractedSection>(
            """
            {
              "chords":[{"beat":1,"root":1,"duration":1},{"beat":2,"root":1,"duration":1}],
              "metadata":{"keys":[
                {"beat":1,"tonic":"C","scale":"major"},
                {"beat":2,"tonic":"D","scale":"dorian"}
              ]}
            }
            """.trimIndent()
        )
        val events = buildPlaybackTimeline(section, emptyList(), 3.0).events
        assertEquals(listOf(60, 62), events.map { it.keyTonicMidi })
    }

    private fun sine(hz: Double): ShortArray {
        val rate = SPOKEN_ROOT_DEGREE_SAMPLE_RATE
        return ShortArray(rate / 2) { index ->
            (sin(2.0 * PI * hz * index / rate) * 16_000).toInt().toShort()
        }
    }
}
