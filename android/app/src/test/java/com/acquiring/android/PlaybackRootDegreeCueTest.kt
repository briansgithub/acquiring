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
        assertEquals(listOf(0, -1, 0, 0), events.map { it.rootDegreeAlteration })
        assertEquals(listOf(50, 56, 57, 50), events.map { it.rootMidiNote })
        assertEquals(SpokenChordSuffix.SEVEN, events.first().spokenChordSuffix)
        assertEquals(null, events.last().spokenChordSuffix)
    }

    @Test
    fun accidentalPrecedesTheNumberInBothVoiceModes() {
        val pitches = SPOKEN_ROOT_DEGREE_PITCHES.count()
        fun bank(size: Int, value: Short) = List(pitches) { ShortArray(size) { value } }
        val clips = SpokenRootDegreeClips(
            numbers = listOf(bank(4800, 12000)),
            accidentals = listOf(bank(480, -12000), bank(480, 6000))
        )
        for (cue in listOf(PlaybackRootDegreeCue.SPOKEN_NUMBER, PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS)) {
            for (alteration in listOf(-1, 1)) {
                val event = chord(1.0, 1.3, 1).copy(rootDegreeAlteration = alteration)
                val spoken = render(listOf(event), PlaybackChordMode.ROOT_ONLY, cue = cue, spokenRootDegrees = clips)
                val backing = render(listOf(event), PlaybackChordMode.ROOT_ONLY, cue = PlaybackRootDegreeCue.OFF)
                val direction = if (alteration < 0) -1 else 1
                assertTrue((spoken[100] - backing[100]) * direction > 1_000)
                assertTrue(spoken[400] - backing[400] > 4_000)
                assertEquals(backing[2_000], spoken[2_000])
            }
        }
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
                SpokenChordSuffix.HALF_DIM, SpokenChordSuffix.AUG, SpokenChordSuffix.SEVENTH_SUS_FOUR
            ),
            events.map { it.spokenChordSuffix }
        )
        assertEquals(55, events[2].rootMidiNote)
        assertEquals(67, events[2].fullChordRootMidiNote)
    }

    @Test
    fun seventhDescriptorsRequireSeventhChordIdentity() {
        fun suffix(symbol: String, fields: String = "") = spokenSuffixForChord(
            Json.decodeFromString("{$fields}"), symbol, null
        )
        for (symbol in listOf("I", "I6", "I64", "I46", "I42", "I(add6)", "I(add9)")) {
            assertEquals(symbol, null, suffix(symbol))
        }
        for (symbol in listOf("V7", "V6(b9)5/ii(min)", "V⁴₃", "V⁴₂")) {
            assertEquals(symbol, SpokenChordSuffix.SEVEN, suffix(symbol, "\"type\":7"))
        }
        for (type in listOf(9, 11, 13)) {
            assertEquals(null, suffix("V65", "\"type\":$type"))
            assertEquals(SpokenChordSuffix.MIN, suffix("ii43", "\"type\":$type"))
            assertEquals(SpokenChordSuffix.DIM, suffix("viiø$type", "\"type\":$type"))
        }
        assertEquals(SpokenChordSuffix.SEV_MAJ, suffix("I△⁴₃", "\"type\":7"))
        assertEquals(SpokenChordSuffix.SEV_MIN, suffix("ii⁴₂", "\"type\":7"))
        assertEquals(SpokenChordSuffix.MIN_SEV_MAJ, suffix("i△7", "\"type\":7"))
        assertEquals(SpokenChordSuffix.MIN, suffix("♭vi64(maj)"))
        assertEquals(null, suffix("♭VI64(min)"))
        assertEquals(null, suffix("V7(no7)", "\"type\":7,\"omits\":[7]"))
    }

    @Test
    fun suspendedChordsNameTheSuspensionAndOnlyTrueSeventhChordsSaySeventh() {
        val section = Json.decodeFromString<ExtractedSection>(
            """
            {"chords":[
                {"beat":1,"root":5,"suspensions":[2]},
                {"beat":2,"root":5,"suspensions":[4],"inversion":2},
                {"beat":3,"root":5,"suspensions":[2],"type":7,"inversion":1},
                {"beat":4,"root":5,"suspensions":[4],"type":7},
                {"beat":5,"root":5,"suspensions":[4],"type":9},
                {"beat":6,"root":5,"suspensions":[2],"type":7,"omits":[7]},
                {"beat":7,"root":5,"suspensions":[4,2]},
                {"beat":8,"root":5,"suspensions":[4,2],"type":7}
            ]}
            """.trimIndent()
        )
        val events = buildPlaybackTimeline(section, emptyList(), 9.0).events
        assertEquals(List(8) { 5 }, events.map { it.rootDegree })
        assertEquals(
            listOf(
                SpokenChordSuffix.SUS_TWO, SpokenChordSuffix.SUS_FOUR,
                SpokenChordSuffix.SEVENTH_SUS_TWO, SpokenChordSuffix.SEVENTH_SUS_FOUR,
                SpokenChordSuffix.SUS_FOUR, SpokenChordSuffix.SUS_TWO,
                SpokenChordSuffix.SUS_TWO_FOUR, SpokenChordSuffix.SEVENTH_SUS_TWO_FOUR
            ),
            events.map { it.spokenChordSuffix }
        )
    }

    @Test
    fun tonicTriadInversionsDoNotAnnounceASeventh() {
        val section = Json.decodeFromString<ExtractedSection>(
            """
            {"chords":[
                {"beat":1,"root":1,"type":5,"inversion":1},
                {"beat":2,"root":1,"type":5,"inversion":2},
                {"beat":3,"root":1,"type":5,"inversion":3},
                {"beat":4,"root":1,"type":7,"inversion":3},
                {"beat":5,"root":1,"type":7,"inversion":1,"omits":[7]}
            ]}
            """.trimIndent()
        )
        val events = buildPlaybackTimeline(section, emptyList(), 6.0).events
        assertEquals(listOf(null, null, null, SpokenChordSuffix.SEV_MAJ, null), events.map { it.spokenChordSuffix })
    }

    @Test
    fun relativeMajorVoiceUsesTheSectionContextThroughLocalKeyChanges() {
        val section = Json.decodeFromString<ExtractedSection>(
            """
            {
              "chords": [{"beat":1,"root":1,"duration":1},{"beat":2,"root":1,"duration":1}],
              "metadata":{"keys":[{"beat":1,"tonic":"A","scale":"minor"},{"beat":2,"tonic":"G","scale":"major"}]}
            }
            """.trimIndent()
        )
        val timeline = buildPlaybackTimeline(section, emptyList(), 3.0)
        val (tonic, localTonic) = timeline.events
        assertEquals(1, tonic.rootDegree)
        assertEquals(SpokenChordSuffix.MIN, tonic.spokenChordSuffix)
        assertEquals(RelativeIonianDegree(6, 0), tonic.relativeMajorRootDegree)
        assertEquals(1, localTonic.rootDegree)
        assertEquals(RelativeIonianDegree(5, 0), localTonic.relativeMajorRootDegree)
        val clips = SpokenRootDegreeClips(List(7) { degreeIndex ->
            List(SPOKEN_ROOT_DEGREE_PITCHES.count()) {
                ShortArray(2400) { if (degreeIndex == 0) 12_000 else -12_000 }
            }
        })
        val settings = config(PlaybackChordMode.ROOT_ONLY, cue = PlaybackRootDegreeCue.SPOKEN_NUMBER).copy(chordGain = 0f)
        val renderer = PlaybackPcmRenderer(timeline, settings, SAMPLE_RATE, clips)
        assertTrue(ShortArray(200).also { renderer.renderAudioInto(it) }.last() > 4000)
        val beat = renderer.currentBeat
        renderer.updateConfig(settings.copy(useRelativeIonianContext = true))
        assertEquals(beat, renderer.currentBeat, 0.0)
        assertTrue(ShortArray(200).also { renderer.renderAudioInto(it) }.last() < -4000)
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
            assertArrayEquals(backing.copyOfRange(2_667, backing.size), spoken.copyOfRange(2_667, spoken.size))
        }
    }

    @Test
    fun voiceVolumeScalesOnlySpeechWithoutRestartingTheCue() {
        val events = listOf(
            chord(1.0, 3.0, 1),
            PlaybackTimelineEvent(2, 1.0, 3.0, PlaybackAudioLayer.MELODY, intArrayOf(60))
        )
        val timeline = PlaybackTimeline(endBeat = 3.0, events = events)
        val bank = List(SPOKEN_ROOT_DEGREE_PITCHES.count()) { ShortArray(2_400) { 8_000 } }
        val clips = SpokenRootDegreeClips(listOf(bank))
        val settings = config(PlaybackChordMode.FULL, cue = PlaybackRootDegreeCue.SPOKEN_NUMBER)
        val voice = PlaybackPcmRenderer(timeline, settings, SAMPLE_RATE, clips)
        val backing = PlaybackPcmRenderer(timeline, settings.copy(voiceVolume = 0f), SAMPLE_RATE, clips)
        fun PlaybackPcmRenderer.renderBlock(frames: Int) = ShortArray(frames).also { renderAudioInto(it) }
        assertTrue(abs(voice.renderBlock(200).last() - backing.renderBlock(200).last() - 3_200) <= 1)
        voice.updateConfig(settings.copy(voiceVolume = 1f))
        assertTrue(abs(voice.renderBlock(200).last() - backing.renderBlock(200).last() - 6_400) <= 20)
        voice.updateConfig(settings.copy(voiceVolume = 0f))
        voice.renderBlock(200)
        backing.renderBlock(200)
        assertArrayEquals(backing.renderBlock(200), voice.renderBlock(200))

        // A muted cue still advances and finishes, so turning volume up
        // later in the same chord cannot make the label repeat.
        voice.renderBlock(5_000)
        backing.renderBlock(5_000)
        voice.updateConfig(settings)
        assertArrayEquals(backing.renderBlock(200), voice.renderBlock(200))
    }

    @Test
    fun detailedModeFitsTheCompletePhraseToShortChords() {
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
            val numberEnd = (maxOf(0.1, duration / 3) * SAMPLE_RATE).roundToInt() + 1
            assertArrayEquals(backing.copyOfRange(numberEnd, backing.size), spoken.copyOfRange(numberEnd, spoken.size))
            assertTrue((850 until 1_150).any { sung[it] - backing[it] < -4_000 })
            val end = (duration * SAMPLE_RATE).roundToInt()
            assertArrayEquals(backing.copyOfRange(end, backing.size), sung.copyOfRange(end, sung.size))
        }
    }

    @Test
    fun durationTracksFractionalChordLengthAndTempoWithoutChangingPitch() {
        val pitch = 200.0
        val source = ShortArray(2400) { index ->
            (12000 * kotlin.math.sin(2 * Math.PI * pitch * index / SPOKEN_ROOT_DEGREE_SAMPLE_RATE)).roundToInt().toShort()
        }
        val bank = List(SPOKEN_ROOT_DEGREE_PITCHES.count()) { source }
        val clips = SpokenRootDegreeClips(listOf(bank), mapOf(SpokenChordSuffix.MIN to bank), listOf(bank, bank))
        val cache = SpokenPhraseCache(clips)
        val phrase = SpokenPhrase(RelativeIonianDegree(1, -1), 36, SpokenChordSuffix.MIN)
        for ((beats, bpm) in listOf(3.75 to 60.0, 2.25 to 120.0, 2.25 to 135.0, 0.8 to 120.0, 0.3 to 120.0)) {
            val chordSeconds = beats * 60 / bpm
            val expected = ((chordSeconds / 3).coerceIn(0.3, 1.2).coerceAtMost(chordSeconds) * SPOKEN_ROOT_DEGREE_SAMPLE_RATE).roundToInt()
            val samples = requireNotNull(cache.prepare(phrase, beats, bpm))
            assertTrue(abs(expected - samples.size) <= 1)
            val rises = samples.indices.filter { it > 0 && samples[it - 1] <= 0 && samples[it] > 0 }
            val periods = rises.zipWithNext { a, b -> b - a }.sorted()
            assertEquals(pitch, SPOKEN_ROOT_DEGREE_SAMPLE_RATE.toDouble() / periods[periods.size / 2], 5.0)
        }
        val lower = requireNotNull(cache.prepare(phrase.copy(midi = 24), 3.75, 60.0))
        val rises = lower.indices.filter { it > 0 && lower[it - 1] <= 0 && lower[it] > 0 }
        val periods = rises.zipWithNext { a, b -> b - a }.sorted()
        assertEquals(pitch / 2, SPOKEN_ROOT_DEGREE_SAMPLE_RATE.toDouble() / periods[periods.size / 2], 5.0)
        assertEquals(28_800, cache.prepare(phrase, 4.0, 0.4)?.size)
    }

    @Test
    fun tempoChangesDoNotRestartFinishedPhrasesAndSeeksRespectTheCueWindow() {
        val event = chord(1.0, 3.0, 1)
        val timeline = PlaybackTimeline(endBeat = 3.0, events = listOf(event))
        val settings = config(PlaybackChordMode.ROOT_ONLY, cue = PlaybackRootDegreeCue.SPOKEN_NUMBER).copy(chordGain = 0f)
        val clips = SpokenRootDegreeClips(listOf(List(SPOKEN_ROOT_DEGREE_PITCHES.count()) { ShortArray(2400) { 12_000 } }))
        val renderer = PlaybackPcmRenderer(timeline, settings, SAMPLE_RATE, clips)
        renderer.seek(1.2)
        assertTrue(ShortArray(200).also { renderer.renderAudioInto(it) }.any { it > 4_000 })
        renderer.updateConfig(settings.copy(bpm = 135.0))
        assertTrue(ShortArray(200).also { renderer.renderAudioInto(it) }.any { it > 4_000 })
        renderer.renderAudioInto(ShortArray(3_000))
        renderer.updateConfig(settings.copy(bpm = 200.0))
        assertTrue(ShortArray(200).also { renderer.renderAudioInto(it) }.all { it.toInt() == 0 })
        renderer.seek(2.0)
        assertTrue(ShortArray(200).also { renderer.renderAudioInto(it) }.all { it.toInt() == 0 })
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
