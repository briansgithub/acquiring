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
        SINE,
        SQUARE,
        SAWTOOTH,
        TRIANGLE,
        STRINGS,
        ELECTRIC_PIANO,
        WARM_ORGAN,
        MARIMBA,
        VIBRAPHONE,
        NYLON_GUITAR
    }

    enum class PlaybackChannel {
        MELODY, CHORD, PREVIEW
    }

    private val allPlaybackChannels = PlaybackChannel.entries.toSet()

    var currentWaveform = Waveform.SAWTOOTH
    var globalTranspose = 0

    class PlaybackSnapshot internal constructor(internal val trackIds: Set<Long>)

    private data class ActiveTrack(
        val id: Long,
        val track: AudioTrack,
        val channel: PlaybackChannel,
        val baseVolume: Float,
        val sampleCount: Int,
        var transitionGain: Float = 1f
    )

    private val activeTracks = mutableListOf<ActiveTrack>()
    private var nextTrackId = 1L
    private var melodyGain = 1f
    private var chordGain = 1f
    // Incremented per layer whenever playback is replaced. A synthesis job
    // that started before its layer changed must not register a late track.
    private val playbackGenerations = LongArray(PlaybackChannel.entries.size)

    private fun invalidatePendingPlayback(channels: Set<PlaybackChannel>) {
        channels.forEach { channel -> playbackGenerations[channel.ordinal]++ }
    }

    private fun gainFor(channel: PlaybackChannel): Float = when (channel) {
        PlaybackChannel.MELODY -> melodyGain
        PlaybackChannel.CHORD -> chordGain
        PlaybackChannel.PREVIEW -> 1f
    }

    private fun applyTrackGain(active: ActiveTrack) {
        try {
            active.track.setVolume(
                (active.baseVolume * gainFor(active.channel) * active.transitionGain).coerceIn(0f, 1f)
            )
        } catch (_: Exception) {}
    }

    fun setLayerVolumes(melody: Float, chords: Float) {
        synchronized(activeTracks) {
            melodyGain = melody.coerceIn(0f, 1f)
            chordGain = chords.coerceIn(0f, 1f)
            activeTracks.forEach(::applyTrackGain)
        }
    }

    fun hasPlayback(channels: Set<PlaybackChannel>): Boolean = synchronized(activeTracks) {
        activeTracks.any { it.channel in channels }
    }

    fun snapshotPlayback(channels: Set<PlaybackChannel>): PlaybackSnapshot = synchronized(activeTracks) {
        PlaybackSnapshot(activeTracks.filter { it.channel in channels }.mapTo(mutableSetOf()) { it.id })
    }

    /** Prevent an in-flight synthesis job from registering a stale track. */
    fun cancelPendingPlayback(channels: Set<PlaybackChannel> = allPlaybackChannels) {
        synchronized(activeTracks) { invalidatePendingPlayback(channels) }
    }

    fun pausePlayback(channels: Set<PlaybackChannel>) {
        synchronized(activeTracks) {
            activeTracks.filter { it.channel in channels }.forEach { active ->
                try {
                    if (active.track.playState == AudioTrack.PLAYSTATE_PLAYING) active.track.pause()
                } catch (_: Exception) {}
            }
        }
    }

    fun resumePlayback(channels: Set<PlaybackChannel>) {
        synchronized(activeTracks) {
            activeTracks.filter { it.channel in channels }.forEach { active ->
                try {
                    if (active.track.playState == AudioTrack.PLAYSTATE_PAUSED) active.track.play()
                } catch (_: Exception) {}
            }
        }
    }

    fun pauseAllPlayback() = pausePlayback(allPlaybackChannels)

    fun resumeAllPlayback() = resumePlayback(allPlaybackChannels)

    private fun removeTracks(trackIds: Set<Long>): List<ActiveTrack> = synchronized(activeTracks) {
        val removed = activeTracks.filter { it.id in trackIds }
        activeTracks.removeAll { it.id in trackIds }
        removed
    }

    private fun stopAndRelease(tracks: List<ActiveTrack>) {
        tracks.forEach { active ->
            try {
                active.track.stop()
                active.track.release()
            } catch (_: Exception) {}
        }
    }

    fun stopPlayback(channels: Set<PlaybackChannel>) {
        val tracks = synchronized(activeTracks) {
            invalidatePendingPlayback(channels)
            val removed = activeTracks.filter { it.channel in channels }
            activeTracks.removeAll { it.channel in channels }
            removed
        }
        stopAndRelease(tracks)
    }

    fun stopPlayback(snapshot: PlaybackSnapshot) {
        stopAndRelease(removeTracks(snapshot.trackIds))
    }

    fun fadeOutAndStopPlayback(snapshot: PlaybackSnapshot, durationMs: Int = 24) {
        if (snapshot.trackIds.isEmpty()) return
        if (durationMs <= 0) {
            stopPlayback(snapshot)
            return
        }

        CoroutineScope(Dispatchers.Default).launch {
            val startingGains = synchronized(activeTracks) {
                activeTracks
                    .filter { it.id in snapshot.trackIds }
                    .associate { it.id to it.transitionGain }
            }
            val steps = (durationMs / 4).coerceIn(2, 12)
            val stepDelayMs = (durationMs / steps).toLong().coerceAtLeast(1L)
            for (step in 1..steps) {
                val fractionRemaining = 1f - step.toFloat() / steps
                synchronized(activeTracks) {
                    activeTracks.filter { it.id in snapshot.trackIds }.forEach { active ->
                        active.transitionGain = (startingGains[active.id] ?: 1f) * fractionRemaining
                        applyTrackGain(active)
                    }
                }
                delay(stepDelayMs)
            }
            stopPlayback(snapshot)
        }
    }

    private fun fadeInPlayback(trackId: Long, durationMs: Int) {
        if (durationMs <= 0) return
        CoroutineScope(Dispatchers.Default).launch {
            val steps = (durationMs / 4).coerceIn(2, 12)
            val stepDelayMs = (durationMs / steps).toLong().coerceAtLeast(1L)
            for (step in 1..steps) {
                val found = synchronized(activeTracks) {
                    val active = activeTracks.firstOrNull { it.id == trackId } ?: return@synchronized false
                    active.transitionGain = step.toFloat() / steps
                    applyTrackGain(active)
                    true
                }
                if (!found) return@launch
                delay(stepDelayMs)
            }
        }
    }

    fun stopPreviewPlayback() {
        stopPlayback(setOf(PlaybackChannel.PREVIEW))
    }

    fun stopAllPlayback() {
        val tracks = synchronized(activeTracks) {
            invalidatePendingPlayback(allPlaybackChannels)
            val removed = activeTracks.toList()
            activeTracks.clear()
            removed
        }
        stopAndRelease(tracks)
    }

    suspend fun playChord(
        midiNotes: List<Int>,
        durationMs: Int = 450,
        arpeggiate: Boolean = false,
        stepMs: Int = 80,
        volume: Float = 1.0f,
        channel: PlaybackChannel = PlaybackChannel.CHORD,
        fadeInMs: Int = 0
    ) = withContext(Dispatchers.Default) {
        val generation = synchronized(activeTracks) { playbackGenerations[channel.ordinal] }
        val playbackContext = currentCoroutineContext()
        // Keep one preset for the entire rendered buffer. The dropdown may be
        // changed while synthesis is running, and preset-specific state (such
        // as a plucked-string delay line) is allocated below.
        val waveform = currentWaveform
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
            val dl = when (waveform) {
                Waveform.STRINGS, Waveform.NYLON_GUITAR -> {
                    val size = period.toInt().coerceAtLeast(2)
                    val noise = DoubleArray(size) { Math.random() * 2.0 - 1.0 }
                    if (waveform == Waveform.NYLON_GUITAR) {
                        // Low-pass the excitation for a rounder nylon-string attack.
                        for (sampleIndex in 1 until noise.size) {
                            noise[sampleIndex] = noise[sampleIndex] * 0.35 + noise[sampleIndex - 1] * 0.65
                        }
                    }
                    noise
                }
                else -> DoubleArray(0)
            }
            NoteState(midi, freq, period, delayLine = dl)
        }

        for (i in 0 until numSamples) {
            // Synthesis can take longer than a short note. Stop promptly when
            // its parent playback job is cancelled or the timeline is replaced.
            if ((i and 2047) == 0 &&
                (!playbackContext.isActive || synchronized(activeTracks) { playbackGenerations[channel.ordinal] != generation })) {
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
                    val elapsedSeconds = i / SAMPLE_RATE.toDouble()
                    val wave = when (waveform) {
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
                        Waveform.WARM_ORGAN -> {
                            val phase = 2.0 * PI * state.phase
                            0.68 * sin(phase) + 0.22 * sin(phase * 2.0) + 0.10 * sin(phase * 3.0)
                        }
                        Waveform.MARIMBA -> {
                            val phase = 2.0 * PI * state.phase
                            val bodyDecay = kotlin.math.exp(-3.0 * elapsedSeconds)
                            val overtoneDecay = kotlin.math.exp(-9.0 * elapsedSeconds)
                            0.82 * sin(phase) * bodyDecay + 0.18 * sin(phase * 3.0) * overtoneDecay
                        }
                        Waveform.VIBRAPHONE -> {
                            val ring = kotlin.math.exp(-0.75 * elapsedSeconds)
                            val tremolo = 0.88 + 0.12 * sin(2.0 * PI * 5.5 * elapsedSeconds)
                            val modIndex = 1.35 * kotlin.math.exp(-1.6 * elapsedSeconds)
                            val modulator = sin(2.0 * PI * state.modPhase) * modIndex
                            val carrier = sin(2.0 * PI * state.phase + modulator)
                            state.modPhase = (state.modPhase + state.freq * 4.0 / SAMPLE_RATE) % 1.0
                            carrier * ring * tremolo
                        }
                        Waveform.NYLON_GUITAR -> {
                            val dl = state.delayLine
                            val out = dl[state.delayPtr]
                            val nextIdx = (state.delayPtr + 1) % dl.size
                            dl[state.delayPtr] = (out + dl[nextIdx]) * 0.497
                            state.delayPtr = nextIdx
                            out
                        }
                    }
                    
                    state.phase = (state.phase + state.freq / SAMPLE_RATE) % 1.0
                    // Use a fixed scaling factor instead of 1/numNotes so that the 
                    // root note volume remains consistent relative to the melody 
                    // regardless of the chord's complexity.
                    sum += wave * 0.15 * env
                }
            } else {
                // Non-overlapping monophonic arpeggiated chord
                val noteIdx = (i / stepSamples).coerceIn(0, numNotes - 1)
                val noteSampleIdx = i % stepSamples
                val state = noteStates[noteIdx]
                val noteElapsedSeconds = noteSampleIdx / SAMPLE_RATE.toDouble()

                val attackSamples = (stepSamples * 0.08).toInt().coerceIn(10, 80)
                val releaseSamples = (stepSamples * 0.12).toInt().coerceIn(15, 120)

                val env = when {
                    noteSampleIdx < attackSamples -> noteSampleIdx.toDouble() / attackSamples
                    noteSampleIdx > stepSamples - releaseSamples -> (stepSamples - noteSampleIdx).toDouble() / releaseSamples
                    else -> 1.0
                }

                val wave = when (waveform) {
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
                    Waveform.WARM_ORGAN -> {
                        val phase = 2.0 * PI * state.phase
                        0.68 * sin(phase) + 0.22 * sin(phase * 2.0) + 0.10 * sin(phase * 3.0)
                    }
                    Waveform.MARIMBA -> {
                        val phase = 2.0 * PI * state.phase
                        val bodyDecay = kotlin.math.exp(-3.0 * noteElapsedSeconds)
                        val overtoneDecay = kotlin.math.exp(-9.0 * noteElapsedSeconds)
                        0.82 * sin(phase) * bodyDecay + 0.18 * sin(phase * 3.0) * overtoneDecay
                    }
                    Waveform.VIBRAPHONE -> {
                        val ring = kotlin.math.exp(-0.75 * noteElapsedSeconds)
                        val tremolo = 0.88 + 0.12 * sin(2.0 * PI * 5.5 * noteElapsedSeconds)
                        val modIndex = 1.35 * kotlin.math.exp(-1.6 * noteElapsedSeconds)
                        val modulator = sin(2.0 * PI * state.modPhase) * modIndex
                        val carrier = sin(2.0 * PI * state.phase + modulator)
                        state.modPhase = (state.modPhase + state.freq * 4.0 / SAMPLE_RATE) % 1.0
                        carrier * ring * tremolo
                    }
                    Waveform.NYLON_GUITAR -> {
                        val dl = state.delayLine
                        val out = dl[state.delayPtr]
                        val nextIdx = (state.delayPtr + 1) % dl.size
                        dl[state.delayPtr] = (out + dl[nextIdx]) * 0.497
                        state.delayPtr = nextIdx
                        out
                    }
                }
                
                state.phase = (state.phase + state.freq / SAMPLE_RATE) % 1.0
                // Match the perceived loudness of the block chord scaling.
                sum = wave * 0.25 * env
            }

            samples[i] = (sum * Short.MAX_VALUE).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }

        // A paused/restarted timeline cancels its child playback jobs.  Do not
        // create a late AudioTrack after that cancellation has already happened.
        if (!playbackContext.isActive || synchronized(activeTracks) { playbackGenerations[channel.ordinal] != generation }) {
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
                val active = synchronized(activeTracks) {
                    ActiveTrack(
                        id = nextTrackId++,
                        track = track,
                        channel = channel,
                        baseVolume = volume.coerceIn(0f, 1f),
                        sampleCount = numSamples,
                        transitionGain = if (fadeInMs > 0) 0f else 1f
                    )
                }
                synchronized(activeTracks) {
                    // Cancellation and channel replacement are both respected
                    // while holding the same lock used for track replacement.
                    if (!playbackContext.isActive || playbackGenerations[channel.ordinal] != generation) {
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
                if (fadeInMs > 0) fadeInPlayback(active.id, fadeInMs)
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
