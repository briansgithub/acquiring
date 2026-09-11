package com.acquiring.android

import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/** Stateful oscillator shared by the preview and streaming playback paths. */
internal class SynthVoice(
    val frequencyHz: Double,
    private val waveform: AudioEngine.Waveform,
    private val sampleRate: Int
) {
    // Matched to iOS using frequency-weighted levels across representative notes:
    // 100 ms attacks for strings, nylon guitar and marimba; 300 ms for the others.
    // Apply once per voice so previews, chords and streaming share the same balance.
    private val instrumentGain = when (waveform) {
        AudioEngine.Waveform.SINE -> 1.00
        AudioEngine.Waveform.SQUARE -> 0.49
        AudioEngine.Waveform.SAWTOOTH -> 0.74
        AudioEngine.Waveform.TRIANGLE -> 1.18
        AudioEngine.Waveform.STRINGS -> 1.74
        AudioEngine.Waveform.ELECTRIC_PIANO -> 0.61
        AudioEngine.Waveform.WARM_ORGAN -> 1.22
        AudioEngine.Waveform.CHURCH_ORGAN -> 1.57
        AudioEngine.Waveform.CLARINET -> 1.13
        AudioEngine.Waveform.FLUTE -> 1.09
        AudioEngine.Waveform.REED_ORGAN -> 1.26
        AudioEngine.Waveform.MARIMBA -> 1.31
        AudioEngine.Waveform.VIBRAPHONE -> 0.65
    }

    private var phase = 0.0
    private var modPhase = 0.0
    private val delayLine: DoubleArray
    private var delayPointer = 0
    // Pipe ranks from 16-foot through mixtures, referenced to the suboctave.
    // Filter once per voice so high notes do not fold upper ranks below Nyquist.
    private val churchOrganPartials = if (waveform == AudioEngine.Waveform.CHURCH_ORGAN) {
        listOf(
            1.0 to 0.16, 2.0 to 0.44, 4.0 to 0.18, 6.0 to 0.10,
            8.0 to 0.07, 12.0 to 0.035, 16.0 to 0.015
        ).filter { (ratio, _) -> frequencyHz * 0.5 * ratio < sampleRate * 0.5 }
    } else {
        emptyList()
    }

    init {
        val period = sampleRate / frequencyHz
        delayLine = when (waveform) {
            AudioEngine.Waveform.STRINGS -> {
                val noise = DoubleArray(period.toInt().coerceAtLeast(2)) {
                    Math.random() * 2.0 - 1.0
                }
                for (index in 1 until noise.size) {
                    noise[index] = noise[index] * 0.35 + noise[index - 1] * 0.65
                }
                noise
            }

            else -> DoubleArray(0)
        }
    }

    fun nextSample(
        envelope: Double,
        elapsedSeconds: Double,
        arpeggiated: Boolean = false
    ): Double {
        val wave = when (waveform) {
            AudioEngine.Waveform.SINE -> sin(2.0 * PI * phase)
            AudioEngine.Waveform.SQUARE -> if (phase < 0.5) 1.0 else -1.0
            AudioEngine.Waveform.SAWTOOTH -> phase * 2.0 - 1.0
            AudioEngine.Waveform.TRIANGLE -> {
                if (phase < 0.5) 4.0 * phase - 1.0 else 3.0 - 4.0 * phase
            }

            AudioEngine.Waveform.STRINGS -> {
                val output = delayLine[delayPointer]
                val next = (delayPointer + 1) % delayLine.size
                delayLine[delayPointer] = (output + delayLine[next]) * 0.497
                delayPointer = next
                output
            }

            AudioEngine.Waveform.ELECTRIC_PIANO -> {
                val modulationRatio = if (arpeggiated) 1.5 else 2.0
                val modulationIndex = if (arpeggiated) 3.0 * envelope else 2.0 * envelope
                val modulator = sin(2.0 * PI * modPhase) * modulationIndex
                val output = sin(2.0 * PI * phase + modulator)
                modPhase = wrapUnitPhase(modPhase + frequencyHz * modulationRatio / sampleRate)
                output
            }

            AudioEngine.Waveform.WARM_ORGAN -> {
                val radians = 2.0 * PI * phase
                0.68 * sin(radians) + 0.22 * sin(radians * 2.0) + 0.10 * sin(radians * 3.0)
            }

            AudioEngine.Waveform.CHURCH_ORGAN -> {
                val radians = 2.0 * PI * modPhase
                var output = 0.0
                for (index in churchOrganPartials.indices) {
                    val (ratio, weight) = churchOrganPartials[index]
                    output += weight * sin(radians * ratio)
                }
                modPhase = wrapUnitPhase(modPhase + frequencyHz * 0.5 / sampleRate)
                output
            }

            AudioEngine.Waveform.CLARINET -> {
                val radians = 2.0 * PI * phase
                0.74 * sin(radians) + 0.19 * sin(radians * 3.0) + 0.07 * sin(radians * 5.0)
            }

            AudioEngine.Waveform.FLUTE -> {
                val vibratoPhase = phase + 0.0025 * sin(2.0 * PI * modPhase)
                val radians = 2.0 * PI * vibratoPhase
                val output = 0.91 * sin(radians) + 0.07 * sin(radians * 2.0) + 0.02 * sin(radians * 4.0)
                modPhase = wrapUnitPhase(modPhase + 5.2 / sampleRate)
                output
            }

            AudioEngine.Waveform.REED_ORGAN -> {
                val radians = 2.0 * PI * phase
                0.54 * sin(radians) + 0.25 * sin(radians * 2.0) +
                    0.14 * sin(radians * 3.0) + 0.07 * sin(radians * 4.0)
            }

            AudioEngine.Waveform.MARIMBA -> {
                val radians = 2.0 * PI * phase
                val bodyDecay = exp(-3.0 * elapsedSeconds)
                val overtoneDecay = exp(-9.0 * elapsedSeconds)
                0.82 * sin(radians) * bodyDecay +
                    0.18 * sin(radians * 3.0) * overtoneDecay
            }

            AudioEngine.Waveform.VIBRAPHONE -> {
                val ring = exp(-0.75 * elapsedSeconds)
                val tremolo = 0.88 + 0.12 * sin(2.0 * PI * 5.5 * elapsedSeconds)
                val modulationIndex = 1.35 * exp(-1.6 * elapsedSeconds)
                val modulator = sin(2.0 * PI * modPhase) * modulationIndex
                val output = sin(2.0 * PI * phase + modulator)
                modPhase = wrapUnitPhase(modPhase + frequencyHz * 4.0 / sampleRate)
                output * ring * tremolo
            }
        }

        phase = wrapUnitPhase(phase + frequencyHz / sampleRate)
        return wave * instrumentGain
    }

    private fun wrapUnitPhase(value: Double): Double = when {
        value >= 1.0 -> value - value.toInt()
        value < 0.0 -> value - kotlin.math.floor(value)
        else -> value
    }
}
