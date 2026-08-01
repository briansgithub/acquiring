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

    enum class PlaybackChannel {
        MELODY, CHORD, PREVIEW
    }

    var currentWaveform = Waveform.SAWTOOTH
    var globalTranspose = 0

    private data class ActiveTrack(
        val track: AudioTrack,
        val channel: PlaybackChannel,
        val baseVolume: Float,
        val sampleCount: Int
    )

    private val activeTracks = mutableListOf<ActiveTrack>()
    private var melodyGain = 1f
    private var chordGain = 1f
    // Incremented whenever the timeline is replaced. A synthesis job that
    // started before the replacement must not register a late AudioTrack.
    private var playbackGeneration = 0L

    private fun gainFor(channel: PlaybackChannel): Float = when (channel) {
        PlaybackChannel.MELODY -> melodyGain
        PlaybackChannel.CHORD -> chordGain
        PlaybackChannel.PREVIEW -> 1f
    }

    private fun applyTrackGain(active: ActiveTrack) {
        try {
            active.track.setVolume((active.baseVolume * gainFor(active.channel)).coerceIn(0f, 1f))
        } catch (_: Exception) {}
    }

    fun setLayerVolumes(melody: Float, chords: Float) {
        synchronized(activeTracks) {
            melodyGain = melody.coerceIn(0f, 1f)
            chordGain = chords.coerceIn(0f, 1f)
            activeTracks.forEach(::applyTrackGain)
        }
    }

    fun pauseAllPlayback() {
        synchronized(activeTracks) {
            activeTracks.forEach { active ->
                try {
                    if (active.track.playState == AudioTrack.PLAYSTATE_PLAYING) active.track.pause()
                } catch (_: Exception) {}
            }
        }
    }

    fun resumeAllPlayback() {
        synchronized(activeTracks) {
            activeTracks.forEach { active ->
                try {
                    if (active.track.playState == AudioTrack.PLAYSTATE_PAUSED) active.track.play()
                } catch (_: Exception) {}
            }
        }
    }

    fun stopPreviewPlayback() {
        synchronized(activeTracks) {
            val previews = activeTracks.filter { it.channel == PlaybackChannel.PREVIEW }
            previews.forEach { active ->
                try {
                    active.track.stop()
                    active.track.release()
                } catch (_: Exception) {}
                activeTracks.remove(active)
            }
        }
    }

    fun stopAllPlayback() {
        synchronized(activeTracks) {
            playbackGeneration++
            activeTracks.forEach { active ->
                try {
                    active.track.stop()
                    active.track.release()
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
        volume: Float = 1.0f,
        channel: PlaybackChannel = PlaybackChannel.CHORD
    ) = withContext(Dispatchers.Default) {
        val generation = synchronized(activeTracks) { playbackGeneration }
        val playbackContext = currentCoroutineContext()
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
            // Synthesis can take longer than a short note. Stop promptly when
            // its parent playback job is cancelled or the timeline is replaced.
            if ((i and 2047) == 0 &&
                (!playbackContext.isActive || synchronized(activeTracks) { playbackGeneration != generation })) {
                return@withContext
            }
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
                    sum += wave * (0.25 / numNotes) * env
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
                sum = wave * 0.45 * env
            }

            samples[i] = (sum * Short.MAX_VALUE).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }

        // A paused/restarted timeline cancels its child playback jobs.  Do not
        // create a late AudioTrack after that cancellation has already happened.
        if (!playbackContext.isActive || synchronized(activeTracks) { playbackGeneration != generation }) {
            return@withContext
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
                val active = ActiveTrack(track, channel, volume.coerceIn(0f, 1f), numSamples)
                synchronized(activeTracks) {
                    // Cancellation and stopAllPlayback are both respected
                    // while holding the same lock used for track replacement.
                    if (!playbackContext.isActive || playbackGeneration != generation) {
                        try {
                            track.stop()
                            track.release()
                        } catch (_: Exception) {}
                        return@withContext
                    }
                    applyTrackGain(active)
                    track.play()
                    activeTracks.add(active)
                }
                CoroutineScope(Dispatchers.Default).launch {
                    while (true) {
                        val stillPlaying = try {
                            track.playState != AudioTrack.PLAYSTATE_STOPPED &&
                                track.playbackHeadPosition < numSamples
                        } catch (_: Exception) {
                            false
                        }
                        if (!stillPlaying) break
                        delay(20)
                    }
                    try {
                        synchronized(activeTracks) { activeTracks.remove(active) }
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
