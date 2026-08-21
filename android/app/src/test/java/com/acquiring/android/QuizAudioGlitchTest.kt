package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Sample-level audit of the two paths that sound in the Quiz tab: the streaming
 * [QuizPcmRenderer] that plays the song section, and the static buffers
 * [AudioEngine.renderStaticSamples] builds for a tapped scale-degree / chord /
 * chord-tone / interval card.
 *
 * Clicks and crackle in PCM have three measurable signatures, and each test below
 * isolates one of them:
 *  - a buffer that does not start and end at silence (the track is stopped on a step),
 *  - a sample-to-sample jump larger than the waveform can legitimately produce,
 *  - samples pinned to full scale (clipping).
 *
 * SINE is used wherever a discontinuity is being measured: it is the only preset with
 * no inherent full-scale edge, so any large jump is the envelope's fault, not the
 * waveform's. SAWTOOTH — the app default — is used for the headroom tests.
 */
class QuizAudioGlitchTest {

    private companion object {
        const val FULL_SCALE = 32_767.0
        const val SAMPLE_RATE = 44_100

        /** A tapped card is 450ms, the quiz preview duration. */
        const val CARD_TAP_MS = 450

        fun peak(samples: ShortArray): Int = samples.maxOf { kotlin.math.abs(it.toInt()) }

        fun clippedCount(samples: ShortArray): Int =
            samples.count { it >= Short.MAX_VALUE || it <= Short.MIN_VALUE }

        /** Largest single-sample step, as a fraction of full scale. */
        fun maxSlew(samples: ShortArray): Double {
            var worst = 0
            for (i in 1 until samples.size) {
                val jump = kotlin.math.abs(samples[i] - samples[i - 1])
                if (jump > worst) worst = jump
            }
            return worst / FULL_SCALE
        }

        fun edgeLevel(sample: Short): Double = kotlin.math.abs(sample.toInt()) / FULL_SCALE

        fun midiHz(midi: Int): Double = 440.0 * Math.pow(2.0, (midi - 69) / 12.0)

        fun chordHz(vararg midi: Int): List<Double> = midi.map(::midiHz)

        fun renderTap(
            freqs: List<Double>,
            waveform: AudioEngine.Waveform,
            durationMs: Int = CARD_TAP_MS,
            arpeggiate: Boolean = false,
            stepMs: Int = 80
        ): ShortArray = AudioEngine.renderStaticSamples(
            freqs = freqs,
            durationMs = durationMs,
            arpeggiate = arpeggiate,
            stepMs = stepMs,
            waveform = waveform
        )!!

        /** Renders [frames] of a song section through the real streaming renderer. */
        fun renderStream(
            timeline: QuizTimeline,
            config: QuizPlaybackConfig,
            frames: Int
        ): ShortArray {
            val renderer = QuizPcmRenderer(timeline, config)
            val out = ShortArray(frames)
            val block = ShortArray(256)
            var written = 0
            while (written < frames) {
                val count = minOf(block.size, frames - written)
                renderer.renderAudioInto(block, count)
                block.copyInto(out, written, 0, count)
                written += count
            }
            return out
        }

        /** A four-bar section: a sustained melody line over held chords. */
        fun sectionTimeline(chordNotes: IntArray = intArrayOf(48, 52, 55)): QuizTimeline {
            val events = mutableListOf<QuizTimelineEvent>()
            var id = 1L
            var beat = 1.0
            repeat(8) {
                events += QuizTimelineEvent(
                    id = id++,
                    startBeat = beat,
                    endBeat = beat + 1.0,
                    layer = QuizAudioLayer.MELODY,
                    fullMidiNotes = intArrayOf(72)
                )
                beat += 1.0
            }
            beat = 1.0
            repeat(2) {
                events += QuizTimelineEvent(
                    id = id++,
                    startBeat = beat,
                    endBeat = beat + 4.0,
                    layer = QuizAudioLayer.CHORD,
                    fullMidiNotes = chordNotes,
                    rootMidiNote = chordNotes.first()
                )
                beat += 4.0
            }
            return QuizTimeline(
                endBeat = 9.0,
                events = events.sortedWith(compareBy({ it.startBeat }, { it.id }))
            )
        }

        fun config(
            waveform: AudioEngine.Waveform = AudioEngine.Waveform.SAWTOOTH,
            melodyGain: Float = 0.5f,
            chordGain: Float = 0.5f,
            arpeggiateCycles: Double = 0.0
        ) = QuizPlaybackConfig(
            bpm = 120.0,
            transpose = 0,
            waveform = waveform,
            chordMode = QuizChordMode.FULL,
            melodyGain = melodyGain,
            chordGain = chordGain,
            arpeggiateCycles = arpeggiateCycles
        )
    }

    // ---------------------------------------------------------------- card taps

    @Test
    fun cardTap_blockChord_startsAndEndsAtSilence() {
        val samples = renderTap(chordHz(60, 64, 67), AudioEngine.Waveform.SINE)
        val head = edgeLevel(samples.first())
        val tail = edgeLevel(samples.last())
        println("block-chord tap: head=%.4f tail=%.4f peak=%d".format(head, tail, peak(samples)))

        assertTrue("tap begins on a step of $head full scale", head < 0.01)
        assertTrue("tap ends on a step of $tail full scale", tail < 0.01)
    }

    @Test
    fun arpeggiatedChord_endsOnASilentSlotBoundary() {
        // The Chords tab still arpeggiates one-shot chords. Every slot fades itself
        // in and out, so the buffer has to finish on a slot boundary or it stops at
        // full envelope and the AudioTrack turns that step into a click.
        val stepMs = 70
        val samples = renderTap(
            chordHz(60, 64, 67),
            AudioEngine.Waveform.SINE,
            arpeggiate = true,
            stepMs = stepMs
        )
        val stepSamples = SAMPLE_RATE * stepMs / 1_000
        val tail = edgeLevel(samples.last())
        println(
            "arpeggiated chord: %d samples, step=%d, remainder=%d, tail=%.4f".format(
                samples.size, stepSamples, samples.size % stepSamples, tail
            )
        )

        assertEquals("buffer does not end on a slot boundary", 0, samples.size % stepSamples)
        assertTrue("arpeggiated chord is cut mid-slot at $tail full scale", tail < 0.01)
    }

    @Test
    fun arpeggiatedChord_hasNoStepDiscontinuityBetweenSlots() {
        val samples = renderTap(
            chordHz(60, 64, 67),
            AudioEngine.Waveform.SINE,
            arpeggiate = true,
            stepMs = 70
        )
        val slew = maxSlew(samples)
        println("arpeggiated chord: max slew %.4f full scale".format(slew))

        // A 1kHz sine at 44.1kHz moves at most ~14% of full scale per sample.
        assertTrue("slot boundary jumps $slew of full scale", slew < 0.15)
    }

    @Test
    fun cardTap_extendedChord_hasHeadroom() {
        // Voice sum is a flat 0.15 per note with no normalisation, so headroom
        // runs out as chords get denser. SAWTOOTH is the app default preset.
        val report = (1..7).map { noteCount ->
            val notes = intArrayOf(48, 52, 55, 58, 62, 65, 69).take(noteCount).toIntArray()
            val samples = renderTap(chordHz(*notes), AudioEngine.Waveform.SAWTOOTH)
            Triple(noteCount, peak(samples) / FULL_SCALE, clippedCount(samples))
        }
        report.forEach { (n, pk, clipped) ->
            println("%d-note sawtooth tap: peak=%.3f clipped=%d".format(n, pk, clipped))
        }

        val clipping = report.filter { it.third > 0 }
        assertTrue(
            "chords clip on their own: " +
                clipping.joinToString { "${it.first} notes -> ${it.third} samples" },
            clipping.isEmpty()
        )
    }

    // ------------------------------------------------------------ song section

    @Test
    fun songSection_streamHasHeadroomAtEveryBalanceSetting() {
        val timeline = sectionTimeline(intArrayOf(48, 52, 55, 58, 62))
        val offenders = mutableListOf<String>()
        // melodyChordBalance drives melodyGain = balance, chordGain = 1 - balance.
        listOf(0f, 0.25f, 0.5f, 0.75f, 1f).forEach { balance ->
            val samples = renderStream(
                timeline,
                config(melodyGain = balance, chordGain = 1f - balance),
                SAMPLE_RATE * 2
            )
            val clipped = clippedCount(samples)
            println(
                "stream balance=%.2f: peak=%.3f clipped=%d".format(
                    balance, peak(samples) / FULL_SCALE, clipped
                )
            )
            if (clipped > 0) offenders += "balance=$balance -> $clipped samples"
        }
        assertTrue("song stream clips: ${offenders.joinToString()}", offenders.isEmpty())
    }

    @Test
    fun songSection_loopSeamIsContinuous() {
        val timeline = sectionTimeline()
        val renderer = QuizPcmRenderer(timeline, config(waveform = AudioEngine.Waveform.SINE))
        // Walk right up to the loop point, then across it.
        val beatsPerFrame = renderer.currentBeatsPerFrame
        val framesToLoop = ((timeline.endBeat - timeline.startBeat) / beatsPerFrame).toInt()
        val samples = ShortArray(framesToLoop + SAMPLE_RATE / 2)
        val block = ShortArray(256)
        var written = 0
        while (written < samples.size) {
            val count = minOf(block.size, samples.size - written)
            renderer.renderAudioInto(block, count)
            block.copyInto(samples, written, 0, count)
            written += count
        }
        val seam = samples.copyOfRange(framesToLoop - 512, minOf(samples.size, framesToLoop + 512))
        val slew = maxSlew(seam)
        println("loop seam: max slew %.4f full scale".format(slew))

        assertTrue("loop point jumps $slew of full scale", slew < 0.15)
    }

    // ------------------------------------------- a card tapped over the section

    @Test
    fun cardTappedDuringPlayback_summedOutputHasHeadroom() {
        // The song stream and the tapped card are two separate AudioTracks. The
        // device mixes them; whatever the sum does here is what the speaker hears.
        val timeline = sectionTimeline(intArrayOf(48, 52, 55, 58))
        val stream = renderStream(timeline, config(), SAMPLE_RATE)
        val tap = renderTap(chordHz(60, 64, 67, 71), AudioEngine.Waveform.SAWTOOTH)

        val mixed = ShortArray(stream.size)
        for (i in stream.indices) {
            val sum = stream[i].toInt() + (if (i < tap.size) tap[i].toInt() else 0)
            mixed[i] = sum.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
        val clipped = clippedCount(mixed)
        println(
            "stream peak=%.3f tap peak=%.3f mixed peak=%.3f clipped=%d/%d".format(
                peak(stream) / FULL_SCALE,
                peak(tap) / FULL_SCALE,
                peak(mixed) / FULL_SCALE,
                clipped,
                tap.size
            )
        )

        assertTrue(
            "tapping a card over the song clips the mix on $clipped samples",
            clipped == 0
        )
    }

    // ------------------------------------------------- transport / track churn

    @Test
    fun previewBuffer_isStillLoudWhenARetapArrives() {
        // A 450ms preview holds a flat envelope until its last 1000 samples, so its
        // own release cannot cover an early stop. Releasing the track outright would
        // truncate the note wherever the waveform happens to be; this is the hazard
        // stopPreviewPlayback's fade exists to cover, so keep it measured.
        val samples = renderTap(chordHz(60, 64, 67), AudioEngine.Waveform.SINE)
        val worst = listOf(60, 120, 200, 300).maxOf { tapGapMs ->
            val cutIndex = SAMPLE_RATE * tapGapMs / 1_000
            val level = edgeLevel(samples[cutIndex])
            println("re-tap after %dms: buffer sits at %.4f full scale".format(tapGapMs, level))
            level
        }

        assertTrue(
            "preview buffers now decay on their own; the stop fade may be redundant",
            worst > 0.05
        )
    }

    @Test
    fun stopPreviewPlayback_rampsAllTheWayToSilence() {
        // stopPreviewPlayback hands the sounding track to fadeOutAndStopPlayback
        // instead of releasing it. What makes that a fix rather than a smaller click
        // is the last rung: the track has to reach zero gain before it is stopped.
        val ramp = AudioEngine.fadeOutGainRamp(24)
        println("fade ramp: " + ramp.joinToString { "%.3f".format(it) })

        assertTrue("fade needs more than one rung, got $ramp", ramp.size >= 2)
        assertEquals("fade does not reach silence", 0f, ramp.last())
        ramp.zipWithNext { previous, next ->
            assertTrue("fade rung rises: $previous -> $next", next < previous)
        }
        val worstRung = ramp.zipWithNext { previous, next -> previous - next }.max()
        assertTrue("a single fade rung drops $worstRung of the gain", worstRung <= 0.2f)
    }

    @Test
    fun stopPreviewPlayback_neverReleasesOnADegenerateRamp() {
        // Guard the clamp: any duration still has to end on zero, never on a step.
        listOf(0, 1, 4, 24, 100, 10_000).forEach { durationMs ->
            val ramp = AudioEngine.fadeOutGainRamp(durationMs)
            assertTrue("$durationMs ms yielded an empty ramp", ramp.isNotEmpty())
            assertEquals("$durationMs ms does not reach silence", 0f, ramp.last())
        }
    }

    @Test
    fun songSection_arpeggiatesItsChordsDuringPlayback() {
        // The arpeggio knob steers the transport, and this is the path it steers:
        // QuizPcmRenderer walks one chord tone at a time, fading each slot in and out.
        // So at a slot boundary the chord layer should be near silent, while the same
        // instant in a block chord is just an arbitrary point of a sustained tone.
        val timeline = sectionTimeline(intArrayOf(48, 52, 55))
        val framesPerBeat = SAMPLE_RATE / 2 // 120 bpm
        val cyclesPerBeat = 4.0
        val slotFrames = framesPerBeat / (3 * cyclesPerBeat)

        fun localPeak(samples: ShortArray, centre: Int, half: Int): Double {
            val from = (centre - half).coerceAtLeast(0)
            val to = (centre + half).coerceAtMost(samples.size - 1)
            return (from..to).maxOf { edgeLevel(samples[it]) }
        }

        /** Mean level at slot boundaries, relative to the level mid-slot. */
        fun boundaryDip(arpeggiateCycles: Double): Double {
            val samples = renderStream(
                timeline,
                config(
                    waveform = AudioEngine.Waveform.SINE,
                    melodyGain = 0f, // chord layer only
                    chordGain = 1f,
                    arpeggiateCycles = arpeggiateCycles
                ),
                framesPerBeat * 3
            )
            // Analyse the second beat: past the chord's attack, short of its release.
            val slots = (framesPerBeat / slotFrames).toInt()
            return (slots until slots * 2).map { slot ->
                val boundary = (slot * slotFrames).toInt()
                val midSlot = (boundary + slotFrames / 2).toInt()
                localPeak(samples, boundary, 12) / localPeak(samples, midSlot, 300)
            }.average()
        }

        val block = boundaryDip(0.0)
        val arpeggiated = boundaryDip(cyclesPerBeat)
        println("slot-boundary level: block=%.3f arpeggiated=%.3f".format(block, arpeggiated))

        assertTrue(
            "arpeggio is not audible during playback: chord layer sits at " +
                "%.3f of its mid-slot level at every slot boundary".format(arpeggiated),
            arpeggiated < 0.15
        )
        assertTrue(
            "a block chord should sustain through those instants, measured %.3f".format(block),
            block > arpeggiated * 3
        )
    }

    @Test
    fun stackedCardTaps_overSong_haveHeadroom() {
        // The scale-degree cards do not stop the previous preview, so a run of taps
        // leaves several 450ms static tracks sounding at once, on top of the song.
        val timeline = sectionTimeline(intArrayOf(48, 52, 55, 58))
        val mix = renderStream(timeline, config(), SAMPLE_RATE).map { it.toInt() }.toIntArray()

        // Four cards tapped 120ms apart, the pace of reading down a card row.
        listOf(62, 64, 65, 67).forEachIndexed { index, midi ->
            val tap = renderTap(listOf(midiHz(midi)), AudioEngine.Waveform.SAWTOOTH)
            val offset = SAMPLE_RATE * 120 * index / 1_000
            for (i in tap.indices) {
                val target = offset + i
                if (target < mix.size) mix[target] += tap[i].toInt()
            }
        }

        val mixed = ShortArray(mix.size) {
            mix[it].coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
        val clipped = clippedCount(mixed)
        println(
            "song + 4 stacked taps: peak=%.3f clipped=%d".format(
                mix.maxOf { kotlin.math.abs(it) } / FULL_SCALE, clipped
            )
        )

        assertTrue("stacked previews clip the mix on $clipped samples", clipped == 0)
    }

    @Test
    fun cardTapSynthesis_fitsInsideTheStreamingBufferBudget() {
        // Each tap renders its whole buffer on Dispatchers.Default before any sound
        // starts. QuizPlaybackEngine primes only 80ms and then refills 256 frames
        // (5.8ms) at a time, so a slow tap render competing for CPU shows up as an
        // underrun in the song, not just as latency on the tap.
        val worst = AudioEngine.Waveform.entries.maxOf { waveform ->
            // Warm the JIT so the figure reflects steady-state cost.
            repeat(3) { renderTap(chordHz(60, 64, 67, 71), waveform) }
            val startNanos = System.nanoTime()
            repeat(10) { renderTap(chordHz(60, 64, 67, 71), waveform) }
            val millisPerTap = (System.nanoTime() - startNanos) / 10 / 1_000_000.0
            println("%-16s %.2f ms to render a 450ms tap".format(waveform.name, millisPerTap))
            millisPerTap
        }

        assertTrue("slowest preset takes %.2fms per tap".format(worst), worst < 80.0)
    }
}
