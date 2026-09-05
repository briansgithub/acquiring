package com.acquiring.android

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.log10

class InstrumentVolumeTest {
    @Test
    fun instrumentsHaveComparableWeightedLoudnessAcrossRepresentativeNotes() {
        val notes = intArrayOf(48, 55, 60, 64, 69, 72)
        fun level(waveform: AudioEngine.Waveform, durationMs: Int): Double = notes.map { midi ->
            // Plucked presets start from random excitation. Average multiple attacks
            // without changing the instrument's production randomness for this test.
            val repeats = if (waveform.isPlucked) 8 else 1
            val power = (0 until repeats).map {
                weightedPower(renderPreview(waveform, intArrayOf(midi), durationMs = durationMs))
            }.average()
            10.0 * log10(power)
        }.average()

        val sustainedReference = level(AudioEngine.Waveform.SINE, 300)
        val attackReference = level(AudioEngine.Waveform.SINE, 100)
        AudioEngine.Waveform.entries.forEach { waveform ->
            val useAttack = waveform.isPlucked || waveform == AudioEngine.Waveform.MARIMBA
            val reference = if (useAttack) attackReference else sustainedReference
            val differenceDb = level(waveform, if (useAttack) 100 else 300) - reference
            // Natural pluck decay and random excitation need a wider tolerance.
            val toleranceDb = if (waveform.isPlucked) 6.0 else 1.5
            assertTrue(
                "$waveform differs from sine by $differenceDb dB across the note range",
                differenceDb.isFinite() && abs(differenceDb) < toleranceDb
            )
        }
    }

    @Test
    fun everyInstrumentHasHeadroomInDensePreviewsAndArpeggios() {
        AudioEngine.Waveform.entries.forEach { waveform ->
            listOf(-12, 0, 12).forEach { transpose ->
                val notes = chordNotes.map { it + transpose }.toIntArray()
                listOf(false, true).forEach { arpeggiated ->
                    assertHeadroom(
                        "$waveform preview, transpose=$transpose, arpeggiated=$arpeggiated",
                        renderPreview(waveform, notes, arpeggiated = arpeggiated)
                    )
                }
            }
        }
    }

    @Test
    fun everyInstrumentHasHeadroomInStreamingChordsAndArpeggios() {
        AudioEngine.Waveform.entries.forEach { waveform ->
            listOf(-12, 0, 12).forEach { transpose ->
                val notes = chordNotes.map { it + transpose }.toIntArray()
                listOf(false, true).forEach { arpeggiated ->
                    listOf(0f, 0.5f, 1f).forEach { balance ->
                        assertHeadroom(
                            "$waveform stream, transpose=$transpose, arpeggiated=$arpeggiated, balance=$balance",
                            renderStream(waveform, balance, 1f - balance, arpeggiated, notes)
                        )
                    }
                }
            }
        }
    }

    @Test
    fun instrumentCompensationPreservesMuteAndUserGain() {
        AudioEngine.Waveform.entries.forEach { waveform ->
            assertTrue(renderPreview(waveform, chordNotes, gain = 0f).all { it == 0.toShort() })
            assertTrue(renderStream(waveform, 0f, 0f).all { it == 0.toShort() })
            if (!waveform.isPlucked) {
                assertQuarterGain(
                    "$waveform preview",
                    renderPreview(waveform, chordNotes),
                    renderPreview(waveform, chordNotes, gain = 0.25f)
                )
                assertQuarterGain(
                    "$waveform stream",
                    renderStream(waveform, 0.5f, 0.5f),
                    renderStream(waveform, 0.125f, 0.125f)
                )
            }
        }
    }

    private fun renderPreview(
        waveform: AudioEngine.Waveform,
        notes: IntArray,
        arpeggiated: Boolean = false,
        gain: Float = 1f,
        durationMs: Int = 450
    ): ShortArray = AudioEngine.renderStaticSamples(
        freqs = notes.map { 440.0 * Math.pow(2.0, (it - 69) / 12.0) },
        durationMs = durationMs,
        arpeggiate = arpeggiated,
        stepMs = 80,
        waveform = waveform,
        gain = gain
    )!!

    private fun renderStream(
        waveform: AudioEngine.Waveform,
        melodyGain: Float,
        chordGain: Float,
        arpeggiated: Boolean = false,
        notes: IntArray = chordNotes
    ): ShortArray {
        val timeline = QuizTimeline(
            endBeat = 5.0,
            events = listOf(
                QuizTimelineEvent(1L, 1.0, 5.0, QuizAudioLayer.CHORD, notes, notes.first()),
                QuizTimelineEvent(2L, 1.0, 5.0, QuizAudioLayer.MELODY, intArrayOf(72))
            )
        )
        val renderer = QuizPcmRenderer(
            timeline,
            QuizPlaybackConfig(
                bpm = 120.0,
                transpose = 0,
                waveform = waveform,
                chordMode = QuizChordMode.FULL,
                melodyGain = melodyGain,
                chordGain = chordGain,
                arpeggiateCycles = if (arpeggiated) 1.0 else 0.0
            ),
            sampleRate = sampleRate
        )
        return ShortArray(sampleRate * 2).also { output ->
            val block = ShortArray(256)
            var offset = 0
            while (offset < output.size) {
                val count = minOf(block.size, output.size - offset)
                renderer.renderAudioInto(block, count)
                block.copyInto(output, offset, 0, count)
                offset += count
            }
        }
    }

    private fun assertHeadroom(label: String, samples: ShortArray) {
        assertTrue("$label is silent", samples.any { it != 0.toShort() })
        assertTrue("$label clips", samples.none { it == Short.MIN_VALUE || it == Short.MAX_VALUE })
    }

    private fun assertQuarterGain(label: String, full: ShortArray, quarter: ShortArray) {
        val error = full.indices.maxOf { abs(quarter[it] - full[it] * 0.25) }
        assertTrue("$label ignores user gain (maximum PCM error $error)", error <= 1.0)
    }

    private val AudioEngine.Waveform.isPlucked: Boolean
        get() = this == AudioEngine.Waveform.STRINGS || this == AudioEngine.Waveform.NYLON_GUITAR

    private fun weightedPower(samples: ShortArray): Double {
        // A-weighting at 44.1 kHz, expressed as three stable biquads. Weighting
        // counts the bright presets' harmonics instead of equating peak amplitudes.
        val sections = arrayOf(
            doubleArrayOf(0.2557411252042577, 0.5114822504085154, 0.2557411252042577,
                -0.14053608242071078, 0.004937597615540203),
            doubleArrayOf(1.0, -2.0, 1.0, -1.884901217428792, 0.8864214718161674),
            doubleArrayOf(1.0, -2.0, 1.0, -1.9941388812663283, 0.9941474694445309)
        )
        val delays = Array(sections.size) { DoubleArray(2) }
        var power = 0.0
        for (sample in samples) {
            var value = sample / Short.MAX_VALUE.toDouble()
            for (index in sections.indices) {
                val c = sections[index]
                val d = delays[index]
                val input = value - c[3] * d[0] - c[4] * d[1]
                value = c[0] * input + c[1] * d[0] + c[2] * d[1]
                d[1] = d[0]
                d[0] = input
            }
            power += value * value
        }
        return power / samples.size
    }

    private companion object {
        const val sampleRate = 44_100
        val chordNotes = intArrayOf(48, 52, 55, 58, 62, 65, 69)
    }
}
