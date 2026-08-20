package com.acquiring.android

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt

object AudioEngine {
    private const val SAMPLE_RATE = 44100
    private const val MAX_STATIC_PLAYBACK_MS = 30_000
    private const val TAG = "AudioEngine"

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

    class PlaybackToken internal constructor(
        internal val channel: PlaybackChannel,
        internal val generation: Long
    )

    class PreparedPlayback internal constructor(
        internal val track: AudioTrack,
        internal val channel: PlaybackChannel,
        internal val baseVolume: Float,
        internal val sampleCount: Int,
        internal val fadeInMs: Int,
        internal val generation: Long
    ) {
        internal val consumed = AtomicBoolean(false)
    }

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

    internal fun staticPlaybackSampleCount(
        durationMs: Int,
        arpeggiate: Boolean,
        noteCount: Int,
        stepMs: Int
    ): Int {
        val maxStaticSamples = SAMPLE_RATE.toLong() * MAX_STATIC_PLAYBACK_MS / 1_000L
        val requestedSamples = if (arpeggiate && noteCount > 1) {
            val stepSamples = SAMPLE_RATE.toLong() * stepMs.coerceAtLeast(1) / 1_000L
            noteCount.toLong() * stepSamples.coerceAtLeast(200L)
        } else {
            SAMPLE_RATE.toLong() * durationMs.coerceAtLeast(1) / 1_000L
        }
        return requestedSamples.coerceIn(200L, maxStaticSamples).toInt()
    }

    internal fun cyclesPerBeatStepSamples(
        bpm: Double,
        noteCount: Int,
        cyclesPerBeat: Double,
        sampleRate: Int = SAMPLE_RATE
    ): Int {
        if (bpm <= 0.0 || noteCount <= 0 || cyclesPerBeat <= 0.0) return 0
        return (sampleRate * 60.0 / (bpm * noteCount * cyclesPerBeat))
            .roundToInt()
            .coerceAtLeast(1)
    }

    internal fun staticTrackCanAcceptData(state: Int): Boolean =
        state == AudioTrack.STATE_INITIALIZED || state == AudioTrack.STATE_NO_STATIC_DATA

    fun capturePlaybackToken(channel: PlaybackChannel): PlaybackToken = synchronized(activeTracks) {
        PlaybackToken(channel, playbackGenerations[channel.ordinal])
    }

    fun isPlaybackTokenCurrent(token: PlaybackToken): Boolean = synchronized(activeTracks) {
        playbackGenerations[token.channel.ordinal] == token.generation
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

    fun releasePreparedPlayback(prepared: PreparedPlayback) {
        if (!prepared.consumed.compareAndSet(false, true)) return
        try {
            prepared.track.release()
        } catch (_: Exception) {}
    }

    private fun activatePreparedPlaybackLocked(
        prepared: PreparedPlayback,
        skipMs: Int = 0
    ): ActiveTrack? {
        if (!prepared.consumed.compareAndSet(false, true)) return null
        return try {
            if (skipMs > 0 && prepared.sampleCount > 1) {
                val skipFrames = (SAMPLE_RATE.toLong() * skipMs.coerceAtLeast(0) / 1_000L)
                    .coerceAtMost(Int.MAX_VALUE.toLong())
                    .toInt()
                    .coerceIn(0, prepared.sampleCount - 1)
                prepared.track.setPlaybackHeadPosition(skipFrames)
            }
            val active = ActiveTrack(
                id = nextTrackId++,
                track = prepared.track,
                channel = prepared.channel,
                baseVolume = prepared.baseVolume,
                sampleCount = prepared.sampleCount,
                transitionGain = if (prepared.fadeInMs > 0) 0f else 1f
            )
            applyTrackGain(active)
            prepared.track.play()
            activeTracks.add(active)
            active
        } catch (error: Exception) {
            Log.w(TAG, "Unable to start prepared playback", error)
            try {
                prepared.track.release()
            } catch (_: Exception) {}
            null
        }
    }

    private fun monitorPlayback(active: ActiveTrack) {
        CoroutineScope(Dispatchers.Default).launch {
            while (true) {
                val stillPlaying = try {
                    active.track.playState != AudioTrack.PLAYSTATE_STOPPED &&
                        active.track.playbackHeadPosition < active.sampleCount
                } catch (_: Exception) {
                    false
                }
                if (!stillPlaying) break
                delay(20)
            }
            try {
                synchronized(activeTracks) { activeTracks.remove(active) }
                active.track.stop()
                active.track.release()
            } catch (_: Exception) {}
        }
    }

    fun startPreparedPlayback(prepared: PreparedPlayback, skipMs: Int = 0): Boolean {
        val active = synchronized(activeTracks) {
            if (playbackGenerations[prepared.channel.ordinal] != prepared.generation) {
                null
            } else {
                activatePreparedPlaybackLocked(prepared, skipMs)
            }
        }
        if (active == null) {
            releasePreparedPlayback(prepared)
            return false
        }
        if (prepared.fadeInMs > 0) fadeInPlayback(active.id, prepared.fadeInMs)
        monitorPlayback(active)
        return true
    }

    /**
     * Replaces the current timeline with tracks rendered during the current
     * generation. Synthesis and AudioTrack writes are already complete, so the
     * old-to-new handoff contains only stop/play operations.
     */
    fun replacePlaybackWithPrepared(
        channels: Set<PlaybackChannel>,
        preparedPlayback: List<PreparedPlayback>,
        skipMs: Int = 0
    ): Boolean {
        if (preparedPlayback.isEmpty() || preparedPlayback.any { it.channel !in channels }) return false

        val started = mutableListOf<Pair<ActiveTrack, PreparedPlayback>>()
        val replaced = synchronized(activeTracks) {
            val isCurrent = preparedPlayback.all { prepared ->
                !prepared.consumed.get() &&
                    playbackGenerations[prepared.channel.ordinal] == prepared.generation
            }
            if (!isCurrent) return@synchronized false

            val oldTracks = activeTracks.filter { it.channel in channels }
            activeTracks.removeAll { it.channel in channels }
            invalidatePendingPlayback(channels)
            stopAndRelease(oldTracks)

            preparedPlayback.forEach { prepared ->
                activatePreparedPlaybackLocked(prepared, skipMs)?.let { active ->
                    started += active to prepared
                }
            }
            started.size == preparedPlayback.size
        }

        if (!replaced) {
            val partialTracks = synchronized(activeTracks) {
                val partialIds = started.mapTo(mutableSetOf()) { (active, _) -> active.id }
                val removed = activeTracks.filter { it.id in partialIds }
                activeTracks.removeAll { it.id in partialIds }
                removed
            }
            stopAndRelease(partialTracks)
            preparedPlayback.forEach(::releasePreparedPlayback)
            return false
        }
        started.forEach { (active, prepared) ->
            if (prepared.fadeInMs > 0) fadeInPlayback(active.id, prepared.fadeInMs)
            monitorPlayback(active)
        }
        return true
    }

    private suspend fun prepareChordPlayback(
        midiNotes: List<Int>,
        durationMs: Int = 450,
        arpeggiate: Boolean = false,
        stepMs: Int = 80,
        arpeggiateCycles: Double = 0.0,
        bpm: Double = 120.0,
        volume: Float = 1.0f,
        channel: PlaybackChannel = PlaybackChannel.CHORD,
        fadeInMs: Int = 0,
        playbackToken: PlaybackToken? = null
    ): PreparedPlayback? {
        val validNotes = midiNotes.filter { it > 0 }.map { it + globalTranspose }
        if (validNotes.isEmpty()) return null
        val freqs = validNotes.map { midi -> 440.0 * Math.pow(2.0, (midi - 69) / 12.0) }
        return synthesizeNotes(
            freqs,
            durationMs,
            arpeggiate,
            stepMs,
            arpeggiateCycles,
            bpm,
            volume,
            channel,
            fadeInMs,
            playbackToken
        )
    }

    /**
     * Synthesizes and plays literal frequencies (Hz), bypassing MIDI/note quantization and the
     * app-wide transpose. Callers use this path for already-measured physical pitches, where
     * applying transpose again would no longer reproduce what the microphone captured.
     */
    suspend fun playExactFrequencies(
        frequenciesHz: List<Double>,
        durationMs: Int = 1000,
        volume: Float = 1.0f,
        channel: PlaybackChannel = PlaybackChannel.PREVIEW,
        fadeInMs: Int = 0,
        playbackToken: PlaybackToken? = null
    ) {
        val exactFrequencies = literalPlaybackFrequencies(frequenciesHz)
        if (exactFrequencies.isEmpty()) return
        val prepared = synthesizeNotes(
            exactFrequencies,
            durationMs,
            arpeggiate = false,
            stepMs = 80,
            arpeggiateCycles = 0.0,
            bpm = 120.0,
            volume = volume,
            channel = channel,
            fadeInMs = fadeInMs,
            playbackToken = playbackToken
        )
            ?: return
        if (!currentCoroutineContext().isActive) {
            releasePreparedPlayback(prepared)
            return
        }
        startPreparedPlayback(prepared)
    }

    internal fun literalPlaybackFrequencies(frequenciesHz: List<Double>): List<Double> =
        frequenciesHz.filter { it.isFinite() && it > 0.0 }

    private suspend fun synthesizeNotes(
        freqs: List<Double>,
        durationMs: Int,
        arpeggiate: Boolean,
        stepMs: Int,
        arpeggiateCycles: Double,
        bpm: Double,
        volume: Float,
        channel: PlaybackChannel,
        fadeInMs: Int,
        playbackToken: PlaybackToken?
    ): PreparedPlayback? = withContext(Dispatchers.Default) {
        if (playbackToken != null && playbackToken.channel != channel) return@withContext null
        val generation = playbackToken?.generation
            ?: synchronized(activeTracks) { playbackGenerations[channel.ordinal] }
        if (synchronized(activeTracks) { playbackGenerations[channel.ordinal] != generation }) {
            return@withContext null
        }
        val playbackContext = currentCoroutineContext()
        // Keep one preset for the entire rendered buffer. The dropdown may be
        // changed while synthesis is running, and preset-specific state (such
        // as a plucked-string delay line) is allocated below.
        val waveform = currentWaveform
        val validNotes = freqs
        if (validNotes.isEmpty()) return@withContext null

        val numNotes = validNotes.size
        val cycleMode = arpeggiateCycles > 0.0 && bpm > 0.0 && numNotes > 1
        val stepSamples = if (cycleMode) {
            cyclesPerBeatStepSamples(bpm, numNotes, arpeggiateCycles)
        } else {
            (SAMPLE_RATE.toLong() * stepMs.coerceAtLeast(1) / 1_000L)
                .coerceIn(200L, Int.MAX_VALUE.toLong())
                .toInt()
        }
        val numSamples = if (cycleMode) {
            (SAMPLE_RATE.toLong() * durationMs.coerceAtLeast(1) / 1_000L)
                .coerceIn(200L, SAMPLE_RATE.toLong() * MAX_STATIC_PLAYBACK_MS / 1_000L)
                .toInt()
        } else {
            staticPlaybackSampleCount(
                durationMs = durationMs,
                arpeggiate = arpeggiate,
                noteCount = numNotes,
                stepMs = stepMs
            )
        }

        val samples = ShortArray(numSamples)

        val voices = validNotes.map { frequency -> SynthVoice(frequency, waveform, SAMPLE_RATE) }

        for (i in 0 until numSamples) {
            // Synthesis can take longer than a short note. Stop promptly when
            // its parent playback job is cancelled or the timeline is replaced.
            if ((i and 2047) == 0 &&
                (!playbackContext.isActive || synchronized(activeTracks) { playbackGenerations[channel.ordinal] != generation })) {
                return@withContext null
            }
            var sum = 0.0

            if ((!arpeggiate && !cycleMode) || numNotes <= 1) {
                // Simultaneous block chord
                val env = when {
                    i < 200 -> i / 200.0
                    i > numSamples - 1000 -> ((numSamples - i) / 1000.0).coerceAtLeast(0.0)
                    else -> 1.0
                }
                
                for (voice in voices) {
                    val elapsedSeconds = i / SAMPLE_RATE.toDouble()
                    val wave = voice.nextSample(env, elapsedSeconds)
                    // Use a fixed scaling factor instead of 1/numNotes so that the 
                    // root note volume remains consistent relative to the melody 
                    // regardless of the chord's complexity.
                    sum += wave * 0.15 * env
                }
            } else {
                // Non-overlapping monophonic arpeggiated chord
                val noteIdx = if (cycleMode) {
                    (i / stepSamples) % numNotes
                } else {
                    (i / stepSamples).coerceIn(0, numNotes - 1)
                }
                val noteSampleIdx = i % stepSamples
                val voice = voices[noteIdx]
                val noteElapsedSeconds = noteSampleIdx / SAMPLE_RATE.toDouble()

                val attackSamples = (stepSamples * 0.08).toInt().coerceIn(10, 80)
                val releaseSamples = (stepSamples * 0.12).toInt().coerceIn(15, 120)

                val env = when {
                    noteSampleIdx < attackSamples -> noteSampleIdx.toDouble() / attackSamples
                    noteSampleIdx > stepSamples - releaseSamples -> (stepSamples - noteSampleIdx).toDouble() / releaseSamples
                    else -> 1.0
                }

                val wave = voice.nextSample(env, noteElapsedSeconds, arpeggiated = true)
                // Match the perceived loudness of the block chord scaling.
                sum = wave * 0.25 * env
            }

            samples[i] = (sum * Short.MAX_VALUE).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }

        // A paused/restarted timeline cancels its child playback jobs.  Do not
        // create a late AudioTrack after that cancellation has already happened.
        if (!playbackContext.isActive || synchronized(activeTracks) { playbackGenerations[channel.ordinal] != generation }) {
            return@withContext null
        }

        var trackToRelease: AudioTrack? = null
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
            trackToRelease = track
            check(staticTrackCanAcceptData(track.state)) {
                "Static AudioTrack failed to initialize (state=${track.state})"
            }

            var written = 0
            while (written < numSamples) {
                // The three-argument overload is the established blocking API for
                // MODE_STATIC tracks. Loop so a valid partial write is completed.
                val count = track.write(samples, written, numSamples - written)
                if (count <= 0) break
                written += count
            }
            if (written == numSamples) {
                if (!playbackContext.isActive ||
                    synchronized(activeTracks) { playbackGenerations[channel.ordinal] != generation }
                ) {
                    try {
                        track.release()
                    } catch (_: Exception) {}
                    return@withContext null
                }
                PreparedPlayback(
                    track = track,
                    channel = channel,
                    baseVolume = volume.coerceIn(0f, 1f),
                    sampleCount = numSamples,
                    fadeInMs = fadeInMs,
                    generation = generation
                ).also { trackToRelease = null }
            } else {
                try {
                    track.release()
                } catch (_: Exception) {}
                trackToRelease = null
                null
            }
        } catch (error: Exception) {
            Log.w(TAG, "Unable to prepare static preview playback", error)
            try {
                trackToRelease?.release()
            } catch (_: Exception) {}
            null
        }
    }

    suspend fun prepareChord(
        midiNotes: List<Int>,
        durationMs: Int = 450,
        arpeggiate: Boolean = false,
        stepMs: Int = 80,
        arpeggiateCycles: Double = 0.0,
        bpm: Double = 120.0,
        volume: Float = 1.0f,
        channel: PlaybackChannel = PlaybackChannel.CHORD,
        fadeInMs: Int = 0,
        playbackToken: PlaybackToken? = null
    ): PreparedPlayback? = prepareChordPlayback(
        midiNotes = midiNotes,
        durationMs = durationMs,
        arpeggiate = arpeggiate,
        stepMs = stepMs,
        arpeggiateCycles = arpeggiateCycles,
        bpm = bpm,
        volume = volume,
        channel = channel,
        fadeInMs = fadeInMs,
        playbackToken = playbackToken
    )

    suspend fun playChord(
        midiNotes: List<Int>,
        durationMs: Int = 450,
        arpeggiate: Boolean = false,
        stepMs: Int = 80,
        arpeggiateCycles: Double = 0.0,
        bpm: Double = 120.0,
        volume: Float = 1.0f,
        channel: PlaybackChannel = PlaybackChannel.CHORD,
        fadeInMs: Int = 0,
        playbackToken: PlaybackToken? = null
    ): Boolean {
        val prepared = prepareChordPlayback(
            midiNotes = midiNotes,
            durationMs = durationMs,
            arpeggiate = arpeggiate,
            stepMs = stepMs,
            arpeggiateCycles = arpeggiateCycles,
            bpm = bpm,
            volume = volume,
            channel = channel,
            fadeInMs = fadeInMs,
            playbackToken = playbackToken
        ) ?: return false

        if (!currentCoroutineContext().isActive) {
            releasePreparedPlayback(prepared)
            return false
        }
        return startPreparedPlayback(prepared)
    }
}
