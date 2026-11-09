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
        assertEquals(SpokenChordSuffix.SEVEN, events.first().spokenChordSuffix)
        assertEquals(null, events.last().spokenChordSuffix)
    }

    @Test
    fun timelineUsesTheAgreedSuffixesFromRomanNotation() {
        val section = Json.decodeFromString<ExtractedSection>(
            """
            {
              "chords": [
                {"beat": 1, "root": 1},
                {"beat": 2, "root": 2},
                {"beat": 3, "root": 5, "type": 7, "inversion": 1},
                {"beat": 4, "root": 1, "type": 7},
                {"beat": 5, "root": 2, "type": 7},
                {"beat": 6, "root": 7},
                {"beat": 7, "root": 7, "type": 7, "borrowed": "harmonicMinor"},
                {"beat": 8, "root": 7, "type": 7},
                {"beat": 9, "root": 1, "alterations": ["#5"]},
                {"beat": 10, "root": 5, "suspensions": [4], "type": 7}
              ]
            }
            """.trimIndent()
        )
        val events = buildPlaybackTimeline(section, emptyList(), endBeat = 11.0).events
        assertEquals(
            listOf(
                null, SpokenChordSuffix.MIN, SpokenChordSuffix.SEVEN, SpokenChordSuffix.SEV_MAJ,
                SpokenChordSuffix.SEV_MIN, SpokenChordSuffix.DIM, SpokenChordSuffix.DIM_SEV,
                SpokenChordSuffix.HALF_DIM, SpokenChordSuffix.AUG, SpokenChordSuffix.SUS
            ),
            events.map { it.spokenChordSuffix }
        )
        assertEquals(55, events[2].rootMidiNote)
        assertEquals(67, events[2].fullChordRootMidiNote)
    }

    @Test
    fun romanSuffixIgnoresBorrowingTagsAndRecognizesInvertedSevenths() {
        assertEquals(SpokenChordSuffix.SEVEN, spokenSuffixForRoman("V6(b9)5/ii(min)"))
        assertEquals(SpokenChordSuffix.SEV_MAJ, spokenSuffixForRoman("I△⁴₃"))
        assertEquals(SpokenChordSuffix.SEV_MIN, spokenSuffixForRoman("ii⁴₂"))
        assertEquals(SpokenChordSuffix.MIN, spokenSuffixForRoman("♭vi64(maj)"))
        assertEquals(null, spokenSuffixForRoman("♭VI64(min)"))
        assertEquals(null, spokenSuffixForRoman("I(add9)"))
    }

    @Test
    fun bothModesRenderExactlyTheDegreeNumberOfAttacksOnFractionalChords() {
        val duration = 0.525
        for (mode in PlaybackChordMode.entries) {
            for (degree in listOf(1, 5, 7)) {
                val chord = chord(1.0, 1.0 + duration, degree)
                val samples = render(listOf(chord), mode, bpm = 120.0)
                val attacks = attackStarts(samples)
                assertEquals("$mode degree $degree", degree, attacks.size)
                attacks.forEachIndexed { slot, actual ->
                    val expected = (slot * duration / degree * SAMPLE_RATE / 2).roundToInt()
                    assertTrue("attack $slot at $actual, expected $expected", abs(actual - expected) < 40)
                }
            }
        }
    }

    @Test
    fun rootPulsesReplaceTheChordAndSuppressArpeggiationButKeepMelody() {
        val chord = chord(1.0, 2.0, 5).copy(fullMidiNotes = intArrayOf(52, 55))
        val melody = chord.copy(id = 2L, layer = PlaybackAudioLayer.MELODY, fullMidiNotes = intArrayOf(69))
        val events = listOf(chord, melody)
        val melodyOnly = render(listOf(melody), PlaybackChordMode.FULL)
        val pulsed = render(events, PlaybackChordMode.FULL, arpeggiateCycles = 3.0)
        assertArrayEquals(render(events, PlaybackChordMode.ROOT_ONLY), pulsed)
        assertEquals(5, attackStarts(pulsed, melodyOnly).size)
        val gap = 1_450..1_550
        assertTrue("melody remains audible in the pulse gap", gap.any { pulsed[it].toInt() != 0 })
        assertArrayEquals(melodyOnly.sliceArray(gap), pulsed.sliceArray(gap))
        assertArrayEquals(melodyOnly, render(listOf(chord.copy(rootMidiNote = null), melody), PlaybackChordMode.FULL))
    }

    @Test
    fun spokenNumberUsesTheResolvedDegreeAndPreservesPlaybackAndArpeggiation() {
        val events = listOf(chord(1.0, 2.0, 5).copy(fullChordRootMidiNote = 60))
        val clips = SpokenRootDegreeClips(List(7) { degreeIndex ->
            SPOKEN_ROOT_DEGREE_PITCHES.map { pitch ->
                ShortArray(2_400) {
                    when {
                        degreeIndex == 4 && pitch == 50 -> 16_000
                        degreeIndex == 4 && pitch == 38 -> 12_000
                        else -> -12_000
                    }
                }
            }
        })
        for (mode in PlaybackChordMode.entries) {
            val backing = render(events, mode, arpeggiateCycles = 3.0,
                cue = PlaybackRootDegreeCue.OFF, transpose = 2)
            val spoken = render(events, mode, arpeggiateCycles = 3.0,
                cue = PlaybackRootDegreeCue.SPOKEN_NUMBER, spokenRootDegrees = clips, transpose = 2)
            val expectedLevel = if (mode == PlaybackChordMode.FULL) 6_400 else 4_800
            assertTrue("speaks degree five an octave below the transposed root in $mode",
                abs(spoken[200] - backing[200] - expectedLevel) <= 2)
            assertArrayEquals(backing.copyOfRange(800, backing.size), spoken.copyOfRange(800, spoken.size))
        }
    }

    @Test
    fun sungSuffixRequiresTheDetailedModeAndEnoughTimeForTheCompleteLabel() {
        val mode = PlaybackChordMode.FULL
        val clips = SpokenRootDegreeClips(
            listOf(List(SPOKEN_ROOT_DEGREE_PITCHES.count()) { ShortArray(2_400) { 12_000 } }),
            mapOf(SpokenChordSuffix.SEV_MAJ to SPOKEN_ROOT_DEGREE_PITCHES.map { pitch ->
                ShortArray(2_400) { if (pitch == 36) -12_000 else 12_000 }
            })
        )
        for (duration in listOf(0.15, 0.4)) {
            val events = listOf(chord(1.0, 1.0 + duration, 1).copy(spokenChordSuffix = SpokenChordSuffix.SEV_MAJ))
            val backing = render(events, mode, cue = PlaybackRootDegreeCue.OFF)
            val spoken = render(events, mode, cue = PlaybackRootDegreeCue.SPOKEN_NUMBER, spokenRootDegrees = clips)
            val sung = render(events, mode, cue = PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS,
                spokenRootDegrees = clips)
            assertTrue(spoken[200] - backing[200] > 4_000)
            assertEquals(spoken[200], sung[200])
            assertEquals(backing[1_000], spoken[1_000])
            if (duration < 0.2) {
                assertEquals(backing[1_000], sung[1_000])
            } else {
                assertTrue(sung[1_000] - backing[1_000] < -4_000)
            }
        }
    }

    @Test
    fun spokenNumberStopsAtTheChordBoundary() {
        val events = listOf(chord(1.0, 1.03, 1), chord(1.03, 2.0, 5).copy(rootDegree = null))
        val mode = PlaybackChordMode.FULL
        val backing = render(events, mode, cue = PlaybackRootDegreeCue.OFF)
        val spoken = render(events, mode, cue = PlaybackRootDegreeCue.SPOKEN_NUMBER,
            spokenRootDegrees = SpokenRootDegreeClips(
                listOf(List(SPOKEN_ROOT_DEGREE_PITCHES.count()) { ShortArray(2_400) { 12_000 } })
            ))
        assertTrue(spoken[80] - backing[80] > 4_000)
        val nextChordFrame = (0.03 * SAMPLE_RATE).roundToInt()
        assertArrayEquals(
            backing.copyOfRange(nextChordFrame, backing.size),
            spoken.copyOfRange(nextChordFrame, spoken.size)
        )
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
        cue: PlaybackRootDegreeCue = PlaybackRootDegreeCue.ROOT_PULSES,
        arpeggiateCycles: Double = 0.0,
        transpose: Int = 0
    ) = PlaybackConfig(
        bpm = bpm,
        transpose = transpose,
        waveform = AudioEngine.Waveform.SQUARE,
        chordMode = mode,
        melodyGain = 1f,
        chordGain = 1f,
        arpeggiateCycles = arpeggiateCycles,
        rootDegreeCue = cue
    )

    private fun renderer(timeline: PlaybackTimeline, mode: PlaybackChordMode) =
        PlaybackPcmRenderer(timeline, config(mode), SAMPLE_RATE)

    private fun render(
        events: List<PlaybackTimelineEvent>,
        mode: PlaybackChordMode,
        bpm: Double = 60.0,
        arpeggiateCycles: Double = 0.0,
        cue: PlaybackRootDegreeCue = PlaybackRootDegreeCue.ROOT_PULSES,
        spokenRootDegrees: SpokenRootDegreeClips = SpokenRootDegreeClips(),
        transpose: Int = 0
    ): ShortArray {
        val endBeat = events.last().endBeat + 0.1
        val timeline = PlaybackTimeline(endBeat = endBeat, events = events, completionKey = "test")
        val renderer = PlaybackPcmRenderer(
            timeline, config(mode, bpm, cue, arpeggiateCycles, transpose), SAMPLE_RATE, spokenRootDegrees
        )
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
