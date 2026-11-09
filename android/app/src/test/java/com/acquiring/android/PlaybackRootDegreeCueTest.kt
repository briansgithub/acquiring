package com.acquiring.android

import kotlinx.serialization.json.Json
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.roundToInt

class PlaybackRootDegreeCueTest {
    @Test
    fun timelineUsesTheSpelledRootInTheKeyAtChordOnset() {
        val section = Json.decodeFromString<ExtractedSection>(
            """
            {
              "chords": [
                {"beat": 1, "root": 5, "applied": 5, "type": 7, "inversion": 1},
                {"beat": 2, "root": 6, "borrowed": "minor"},
                {"beat": 3, "root": 6},
                {"beat": 4, "isRest": true},
                {"beat": 5, "_letterRootName": "D", "_letterQuality": "major"}
              ],
              "metadata": {
                "keys": [
                  {"beat": 1, "tonic": "C", "scale": "major"},
                  {"beat": 5, "tonic": "G", "scale": "major"}
                ]
              }
            }
            """.trimIndent()
        )

        val events = buildPlaybackTimeline(section, emptyList(), endBeat = 6.0).events
        assertEquals(listOf(1.0, 2.0, 3.0, 5.0), events.map { it.startBeat })
        assertEquals(listOf(2, 6, 6, 5), events.map { it.rootDegree })
        assertEquals(listOf(50, 56, 57, 50), events.map { it.rootMidiNote })
    }

    @Test
    fun bothModesRenderExactlyTheDegreeNumberOfAttacksOnFractionalChords() {
        val duration = 0.525
        for (mode in PlaybackChordMode.entries) {
            for (degree in listOf(1, 5, 7)) {
                val chord = chord(1.0, 1.0 + duration, degree)
                val samples = render(listOf(chord), mode, bpm = 120.0)
                val backing = if (mode == PlaybackChordMode.FULL) {
                    render(listOf(chord.copy(fullMidiNotes = intArrayOf(52, 55), rootDegree = null)), mode, bpm = 120.0)
                } else {
                    ShortArray(samples.size)
                }
                val attacks = attackStarts(samples, backing)
                assertEquals("$mode degree $degree", degree, attacks.size)
                attacks.forEachIndexed { slot, actual ->
                    val expected = (slot * duration / degree * SAMPLE_RATE / 2).roundToInt()
                    assertTrue("attack $slot at $actual, expected $expected", abs(actual - expected) < 40)
                }
            }
        }
    }

    @Test
    fun omittedRootPulsesWhileOtherChordTonesSustainAndArpeggioIsSuppressed() {
        val mode = PlaybackChordMode.FULL
        val chord = chord(1.0, 2.0, 5).copy(fullMidiNotes = intArrayOf(52, 55))
        val backing = render(listOf(chord.copy(rootDegree = null)), mode)
        val pulsed = render(listOf(chord), mode, arpeggiateCycles = 3.0)
        assertArrayEquals(render(listOf(chord), mode), pulsed)
        assertEquals(5, attackStarts(pulsed, backing).size)
        assertTrue("backing sustains during the first pulse gap", (1_450..1_550).any { pulsed[it].toInt() != 0 })

        assertArrayEquals(backing, render(listOf(chord), mode, enabled = false))
        assertArrayEquals(backing, render(listOf(chord.copy(rootMidiNote = null)), mode))
    }

    @Test
    fun consecutiveChordsAndLoopRestartTheirCountsAtTheBoundary() {
        val first = chord(1.0, 1.5, 5)
        val second = chord(1.5, 2.0, 7)
        val renderer = renderer(
            PlaybackTimeline(endBeat = 2.0, events = listOf(first, second)),
            PlaybackChordMode.ROOT_ONLY
        )
        val samples = ShortArray(SAMPLE_RATE * 2)
        renderer.renderAudioInto(samples)
        val attacks = attackStarts(samples)
        assertEquals(24, attacks.size)
        assertEquals(5, attacks.count { it < SAMPLE_RATE / 2 })
        assertEquals(7, attacks.count { it in SAMPLE_RATE / 2 until SAMPLE_RATE })
        assertTrue(abs(attacks[12] - SAMPLE_RATE) < 40)
    }

    @Test
    fun seekAndTempoChangeKeepThePulsesAnchoredToTheChord() {
        val timeline = PlaybackTimeline(
            endBeat = 2.1,
            events = listOf(chord(1.0, 2.0, 5)),
            completionKey = "test"
        )
        val mode = PlaybackChordMode.ROOT_ONLY
        val renderer = renderer(timeline, mode)
        renderer.seek(1.18) // In the gap at the end of the first pulse.
        renderer.updateConfig(config(mode, bpm = 120.0))
        val samples = ShortArray(SAMPLE_RATE / 2)
        renderer.renderAudioInto(samples)
        val attacks = attackStarts(samples)
        assertEquals(4, attacks.size)
        assertTrue(abs(attacks.first() - 80) < 40) // 0.02 beats at 120 BPM.
        assertTrue(abs(attacks.last() - 2_480) < 40)
    }

    private fun chord(start: Double, end: Double, degree: Int) = PlaybackTimelineEvent(
        id = (start * 1_000).roundToInt().toLong(),
        startBeat = start,
        endBeat = end,
        layer = PlaybackAudioLayer.CHORD,
        fullMidiNotes = intArrayOf(48, 52, 55),
        rootMidiNote = 48,
        rootDegree = degree
    )

    private fun config(
        mode: PlaybackChordMode,
        bpm: Double = 60.0,
        enabled: Boolean = true,
        arpeggiateCycles: Double = 0.0
    ) = PlaybackConfig(
        bpm = bpm,
        transpose = 0,
        waveform = AudioEngine.Waveform.SQUARE,
        chordMode = mode,
        melodyGain = 0f,
        chordGain = 1f,
        arpeggiateCycles = arpeggiateCycles,
        audibleRootDegree = enabled
    )

    private fun renderer(timeline: PlaybackTimeline, mode: PlaybackChordMode) =
        PlaybackPcmRenderer(timeline, config(mode), SAMPLE_RATE)

    private fun render(
        events: List<PlaybackTimelineEvent>,
        mode: PlaybackChordMode,
        bpm: Double = 60.0,
        enabled: Boolean = true,
        arpeggiateCycles: Double = 0.0
    ): ShortArray {
        val endBeat = events.last().endBeat + 0.1
        val timeline = PlaybackTimeline(endBeat = endBeat, events = events, completionKey = "test")
        val renderer = PlaybackPcmRenderer(timeline, config(mode, bpm, enabled, arpeggiateCycles), SAMPLE_RATE)
        return ShortArray(((endBeat - 1.0) * 60 * SAMPLE_RATE / bpm).roundToInt())
            .also { renderer.renderAudioInto(it) }
    }

    private fun attackStarts(samples: ShortArray, backing: ShortArray = ShortArray(samples.size)): List<Int> {
        var wasAudible = false
        return buildList {
            // Ignore PCM rounding and use 1 ms windows so waveform zero crossings aren't attacks.
            for (start in samples.indices step 8) {
                val audible = (start until minOf(start + 8, samples.size))
                    .any { abs(samples[it] - backing[it]) > 32 }
                if (audible && !wasAudible) add(start)
                wasAudible = audible
            }
        }
    }

    private companion object {
        const val SAMPLE_RATE = 8_000
    }
}
