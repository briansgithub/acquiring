package com.sacredring.android

import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/** Stateful oscillator shared by the preview and streaming playback paths. */
internal class SynthVoice(
    val frequencyHz: Double,
    private val waveform: AudioEngine.Waveform,
    private val sampleRate: Int
) {
    private var phase = 0.0
    private var modPhase = 0.0
    private val delayLine: DoubleArray
    private var delayPointer = 0

    init {
        val period = sampleRate / frequencyHz
        delayLine = when (waveform) {
            AudioEngine.Waveform.STRINGS,
            AudioEngine.Waveform.NYLON_GUITAR -> {
                val noise = DoubleArray(period.toInt().coerceAtLeast(2)) {
                    Math.random() * 2.0 - 1.0
                }
                if (waveform == AudioEngine.Waveform.NYLON_GUITAR) {
                    for (index in 1 until noise.size) {
                        noise[index] = noise[index] * 0.35 + noise[index - 1] * 0.65
                    }
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
                val attenuation = if (arpeggiated) 0.498 else 0.496
                delayLine[delayPointer] = (output + delayLine[next]) * attenuation
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

            AudioEngine.Waveform.NYLON_GUITAR -> {
                val output = delayLine[delayPointer]
                val next = (delayPointer + 1) % delayLine.size
                delayLine[delayPointer] = (output + delayLine[next]) * 0.497
                delayPointer = next
                output
            }
        }

        phase = wrapUnitPhase(phase + frequencyHz / sampleRate)
        return wave
    }

    private fun wrapUnitPhase(value: Double): Double = when {
        value >= 1.0 -> value - value.toInt()
        value < 0.0 -> value - kotlin.math.floor(value)
        else -> value
    }
}
