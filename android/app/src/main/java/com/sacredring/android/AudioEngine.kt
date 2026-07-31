package com.sacredring.android

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

import kotlin.math.PI
import kotlin.math.sin

object AudioEngine {
    private const val SAMPLE_RATE = 44100

    enum class Waveform {
        SINE, SQUARE, SAWTOOTH, TRIANGLE, STRINGS, ELECTRIC_PIANO
    }

    var currentWaveform = Waveform.ELECTRIC_PIANO
    var globalTranspose = 0

    private val activeTracks = java.util.Collections.synchronizedList(mutableListOf<AudioTrack>())

    fun stopAllPlayback() {
        synchronized(activeTracks) {
            val iterator = activeTracks.iterator()
            while (iterator.hasNext()) {
                val track = iterator.next()
                try {
                    track.stop()
                    track.release()
                } catch (_: Exception) {}
            }
            activeTracks.clear()
        }
    }

    suspend fun playChord(
        midiNotes: List<Int>,
        durationMs: Int = 450,
        arpeggiate: Boolean = false,
        stepMs: Int = 80,
        volume: Float = 1.0f
    ) = withContext(Dispatchers.Default) {
        val validNotes = midiNotes.filter { it > 0 }.map { it + globalTranspose }
        if (validNotes.isEmpty()) return@withContext

        val numNotes = validNotes.size
        val stepSamples = (SAMPLE_RATE * stepMs / 1000.0).toInt().coerceAtLeast(200)

        val numSamples = if (arpeggiate && numNotes > 1) {
            numNotes * stepSamples
        } else {
            (SAMPLE_RATE * durationMs / 1000.0).toInt()
        }.coerceAtLeast(200)

        val samples = ShortArray(numSamples)

        // Pre-calculate per-note synthesis data
        class NoteState(
            val midi: Int,
            val freq: Double,
            val period: Double,
            var phase: Double = 0.0,
            var modPhase: Double = 0.0,
            // Karplus-Strong delay line
            val delayLine: DoubleArray = DoubleArray(0),
            var delayPtr: Int = 0
        )

        val noteStates = validNotes.map { midi ->
            val freq = 440.0 * Math.pow(2.0, (midi - 69) / 12.0)
            val period = SAMPLE_RATE / freq
            val dl = if (currentWaveform == Waveform.STRINGS) {
                val size = period.toInt().coerceAtLeast(2)
                DoubleArray(size) { Math.random() * 2.0 - 1.0 }
            } else DoubleArray(0)
            NoteState(midi, freq, period, delayLine = dl)
        }

        for (i in 0 until numSamples) {
            var sum = 0.0

            if (!arpeggiate || numNotes <= 1) {
                // Simultaneous block chord
                val env = when {
                    i < 200 -> i / 200.0
                    i > numSamples - 1000 -> ((numSamples - i) / 1000.0).coerceAtLeast(0.0)
                    else -> 1.0
                }
                
                for (state in noteStates) {
                    val wave = when (currentWaveform) {
                        Waveform.SINE -> sin(2.0 * PI * state.phase)
                        Waveform.SQUARE -> if (state.phase < 0.5) 1.0 else -1.0
                        Waveform.SAWTOOTH -> state.phase * 2.0 - 1.0
                        Waveform.TRIANGLE -> if (state.phase < 0.5) 4.0 * state.phase - 1.0 else 3.0 - 4.0 * state.phase
                        Waveform.STRINGS -> {
                            val dl = state.delayLine
                            val out = dl[state.delayPtr]
                            val nextIdx = (state.delayPtr + 1) % dl.size
                            val avg = (out + dl[nextIdx]) * 0.496 // Attenuation for decay
                            dl[state.delayPtr] = avg
                            state.delayPtr = nextIdx
                            out
                        }
                        Waveform.ELECTRIC_PIANO -> {
                            // Simple 2-operator FM
                            val modFreq = state.freq * 2.0
                            val modIndex = 2.0 * env
                            val modulator = sin(2.0 * PI * state.modPhase) * modIndex
                            val carrier = sin(2.0 * PI * state.phase + modulator)
                            
                            state.modPhase = (state.modPhase + modFreq / SAMPLE_RATE) % 1.0
                            carrier
                        }
                    }
                    
                    state.phase = (state.phase + state.freq / SAMPLE_RATE) % 1.0
                    sum += wave * (0.25 / numNotes) * env * volume
                }
            } else {
                // Non-overlapping monophonic arpeggiated chord
                val noteIdx = (i / stepSamples).coerceIn(0, numNotes - 1)
                val noteSampleIdx = i % stepSamples
                val state = noteStates[noteIdx]

                val attackSamples = (stepSamples * 0.08).toInt().coerceIn(10, 80)
                val releaseSamples = (stepSamples * 0.12).toInt().coerceIn(15, 120)

                val env = when {
                    noteSampleIdx < attackSamples -> noteSampleIdx.toDouble() / attackSamples
                    noteSampleIdx > stepSamples - releaseSamples -> (stepSamples - noteSampleIdx).toDouble() / releaseSamples
                    else -> 1.0
                }

                val wave = when (currentWaveform) {
                    Waveform.SINE -> sin(2.0 * PI * state.phase)
                    Waveform.SQUARE -> if (state.phase < 0.5) 1.0 else -1.0
                    Waveform.SAWTOOTH -> state.phase * 2.0 - 1.0
                    Waveform.TRIANGLE -> if (state.phase < 0.5) 4.0 * state.phase - 1.0 else 3.0 - 4.0 * state.phase
                    Waveform.STRINGS -> {
                        val dl = state.delayLine
                        val out = dl[state.delayPtr]
                        val nextIdx = (state.delayPtr + 1) % dl.size
                        val avg = (out + dl[nextIdx]) * 0.498
                        dl[state.delayPtr] = avg
                        state.delayPtr = nextIdx
                        out
                    }
                    Waveform.ELECTRIC_PIANO -> {
                        val modFreq = state.freq * 1.5 // Slightly different ratio for monophonic
                        val modIndex = 3.0 * env
                        val modulator = sin(2.0 * PI * state.modPhase) * modIndex
                        val carrier = sin(2.0 * PI * state.phase + modulator)
                        state.modPhase = (state.modPhase + modFreq / SAMPLE_RATE) % 1.0
                        carrier
                    }
                }
                
                state.phase = (state.phase + state.freq / SAMPLE_RATE) % 1.0
                sum = wave * 0.45 * env * volume
            }

            samples[i] = (sum * Short.MAX_VALUE).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }

        // A paused/restarted timeline cancels its child playback jobs.  Do not
        // create a late AudioTrack after that cancellation has already happened.
        if (!currentCoroutineContext().isActive) return@withContext

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
                activeTracks.add(track)
                val totalDurationMs = (numSamples * 1000L / SAMPLE_RATE) + 100L
                CoroutineScope(Dispatchers.Default).launch {
                    delay(totalDurationMs)
                    try {
                        activeTracks.remove(track)
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
