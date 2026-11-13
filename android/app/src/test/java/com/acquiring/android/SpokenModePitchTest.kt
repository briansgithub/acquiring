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
    fun spokenKeyStaysOnTheTonicPitchClassInsideOctaveThree() {
        assertEquals(48, spokenKeyTonicMidi(60))
        assertEquals(50, spokenKeyTonicMidi(62))
        assertEquals(48, spokenKeyTonicMidi(36))
        assertEquals(59, spokenKeyTonicMidi(47))
        assertEquals(48, spokenKeyTonicMidi(84))
        assertEquals(59, spokenKeyTonicMidi(71 + 24))
        assertEquals(55, spokenKeyTonicMidi(31))
        assertEquals(Math.floorMod(67, 12), Math.floorMod(spokenKeyTonicMidi(31), 12))
    }

    @Test
    fun modeNameIsScheduledAtTheEndOfTheChordBeforeTheChange() {
        val major = chord(1, 1.0, 5.0, "major")
        val dorian = chord(2, 5.0, 9.0, "dorian")
        val chords = listOf(major, dorian)
        assertEquals(
            dorian.id,
            followingModeChord(chords, major, loops = false, PlaybackRootDegreeCue.SPOKEN_NUMBER, majorLocked = false)?.id
        )
        assertEquals(
            null,
            followingModeChord(chords, dorian, loops = false, PlaybackRootDegreeCue.SPOKEN_NUMBER, majorLocked = false)
        )
        assertEquals(
            null,
            followingModeChord(chords, major, loops = false, PlaybackRootDegreeCue.SPOKEN_NUMBER, majorLocked = true)
        )
        val window = modeAnnouncementWindow(
            hostStart = 1.0,
            hostEnd = 5.0,
            nextStart = 5.0,
            sampleCount = SPOKEN_ROOT_DEGREE_SAMPLE_RATE,
            samplesPerBeat = SPOKEN_ROOT_DEGREE_SAMPLE_RATE.toDouble()
        )
        assertEquals(4.0, window?.first)
        assertEquals(5.0, window?.second)
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

    private fun chord(id: Long, start: Double, end: Double, scale: String) = PlaybackTimelineEvent(
        id = id,
        startBeat = start,
        endBeat = end,
        layer = PlaybackAudioLayer.CHORD,
        fullMidiNotes = intArrayOf(60),
        keyScale = scale
    )

    private fun sine(hz: Double): ShortArray {
        val rate = SPOKEN_ROOT_DEGREE_SAMPLE_RATE
        return ShortArray(rate / 2) { index ->
            (sin(2.0 * PI * hz * index / rate) * 16_000).toInt().toShort()
        }
    }
}
