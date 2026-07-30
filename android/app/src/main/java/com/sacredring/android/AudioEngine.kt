package com.sacredring.android

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

import kotlin.math.PI
import kotlin.math.sin

object AudioEngine {
    private const val SAMPLE_RATE = 44100

    enum class Waveform {
        SINE, SQUARE, SAWTOOTH, TRIANGLE
    }

    var currentWaveform = Waveform.SAWTOOTH

    suspend fun playChord(
        midiNotes: List<Int>,
        durationMs: Int = 450,
        arpeggiate: Boolean = false,
        stepMs: Int = 80
    ) = withContext(Dispatchers.Default) {
        val validNotes = midiNotes.filter { it > 0 }
        if (validNotes.isEmpty()) return@withContext

        val numNotes = validNotes.size
        val stepSamples = (SAMPLE_RATE * stepMs / 1000.0).toInt().coerceAtLeast(200)

        val numSamples = if (arpeggiate && numNotes > 1) {
            numNotes * stepSamples
        } else {
            (SAMPLE_RATE * durationMs / 1000.0).toInt()
        }.coerceAtLeast(200)

        val samples = ShortArray(numSamples)

        for (i in 0 until numSamples) {
            var sum = 0.0

            if (!arpeggiate || numNotes <= 1) {
                // Simultaneous block chord
                val env = when {
                    i < 200 -> i / 200.0
                    i > numSamples - 1000 -> ((numSamples - i) / 1000.0).coerceAtLeast(0.0)
                    else -> 1.0
                }
                for (midiNote in validNotes) {
                    val freq = 440.0 * Math.pow(2.0, (midiNote - 69) / 12.0)
                    val period = SAMPLE_RATE / freq
                    val phase = (i % period) / period
                    
                    val wave = when (currentWaveform) {
                        Waveform.SINE -> sin(2.0 * PI * phase)
                        Waveform.SQUARE -> if (phase < 0.5) 1.0 else -1.0
                        Waveform.SAWTOOTH -> phase * 2.0 - 1.0
                        Waveform.TRIANGLE -> if (phase < 0.5) 4.0 * phase - 1.0 else 3.0 - 4.0 * phase
                    }
                    
                    sum += wave * (0.25 / numNotes) * env
                }
            } else {
                // Non-overlapping monophonic arpeggiated chord
                val noteIdx = (i / stepSamples).coerceIn(0, numNotes - 1)
                val noteSampleIdx = i % stepSamples

                val attackSamples = (stepSamples * 0.08).toInt().coerceIn(10, 80)
                val releaseSamples = (stepSamples * 0.12).toInt().coerceIn(15, 120)

                val env = when {
                    noteSampleIdx < attackSamples -> noteSampleIdx.toDouble() / attackSamples
                    noteSampleIdx > stepSamples - releaseSamples -> (stepSamples - noteSampleIdx).toDouble() / releaseSamples
                    else -> 1.0
                }

                val midiNote = validNotes[noteIdx]
                val freq = 440.0 * Math.pow(2.0, (midiNote - 69) / 12.0)
                val period = SAMPLE_RATE / freq
                val phase = (i % period) / period
                
                val wave = when (currentWaveform) {
                    Waveform.SINE -> sin(2.0 * PI * phase)
                    Waveform.SQUARE -> if (phase < 0.5) 1.0 else -1.0
                    Waveform.SAWTOOTH -> phase * 2.0 - 1.0
                    Waveform.TRIANGLE -> if (phase < 0.5) 4.0 * phase - 1.0 else 3.0 - 4.0 * phase
                }
                
                sum = wave * 0.45 * env
            }

            samples[i] = (sum * Short.MAX_VALUE).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }

        try {
            val bufferSizeBytes = numSamples * 2
            val track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(bufferSizeBytes)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()

            val written = track.write(samples, 0, numSamples)
            if (written > 0) {
                track.play()
                val totalDurationMs = (numSamples * 1000L / SAMPLE_RATE) + 100L
                CoroutineScope(Dispatchers.Default).launch {
                    delay(totalDurationMs)
                    try {
                        track.stop()
                        track.release()
                    } catch (_: Exception) {}
                }
            } else {
                try {
                    track.release()
                } catch (_: Exception) {}
            }
        } catch (_: Exception) {
            // Non-critical sound playback error safely caught
        }
    }
}
