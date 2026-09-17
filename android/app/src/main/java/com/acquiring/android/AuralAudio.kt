package com.acquiring.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

internal data class AuralAudioPlan(val timeline: PlaybackTimeline, val frameCount: Int, val durationMs: Double)

/** Rest events preserve their complete beat duration but create no sounding voices. */
internal fun auralPlaybackPlan(events: List<AuralEvent>, tempo: Double, sampleRate: Int): AuralAudioPlan {
    require(events.isNotEmpty()) { "No listening example is available." }
    require(tempo.isFinite() && tempo in 20.0..400.0) { "Invalid listening tempo." }
    require(sampleRate in 8_000..192_000) { "Invalid output sample rate." }
    var beat = 0.0
    val sounding = events.mapIndexedNotNull { index, event ->
        require(event.beats.isFinite() && event.beats > 0.0) { "Invalid event duration." }
        require(event.notes.size <= 16 && event.notes.all { it in 1..127 }) { "Invalid playback pitches." }
        val start = beat
        beat += event.beats
        // Overlap adjacent chord attacks briefly, never a written rest or prompt end.
        val next = events.getOrNull(index + 1)
        val overlapBeats = if (next != null && next.notes.isNotEmpty())
            minOf(0.020 * tempo / 60.0, next.beats / 2.0) else 0.0
        if (event.notes.isEmpty()) null else PlaybackTimelineEvent(
            id = index.toLong(), startBeat = start, endBeat = beat + overlapBeats,
            layer = PlaybackAudioLayer.CHORD, fullMidiNotes = event.notes.toIntArray(), rootMidiNote = event.rootMidi
        )
    }
    val seconds = beat * 60.0 / tempo
    require(seconds in 0.001..120.0) { "Listening examples must fit within two minutes." }
    return AuralAudioPlan(PlaybackTimeline(0.0, beat, sounding), (seconds * sampleRate).roundToInt(), seconds * 1000.0)
}

internal fun auralWaveform(instrument: String): AudioEngine.Waveform = when (instrument) {
    "sine" -> AudioEngine.Waveform.SINE
    "triangle" -> AudioEngine.Waveform.TRIANGLE
    "soft" -> AudioEngine.Waveform.WARM_ORGAN
    else -> AudioEngine.Waveform.entries.firstOrNull { it.name == instrument }
        ?: throw IllegalArgumentException("Unknown practice instrument: $instrument")
}

/** Small injectable output boundary; production uses the app's shared output session. */
internal interface AuralAudioSink {
    fun prepare(samples: ShortArray, sampleRate: Int)
    fun play()
    val playedFrames: Int
    fun close()
}

private class AndroidAuralAudioSink : AuralAudioSink {
    private var track: AudioTrack? = null
    override fun prepare(samples: ShortArray, sampleRate: Int) {
        val output = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
            .setSessionId(AppAudioOutput.sessionId)
            .setBufferSizeInBytes(samples.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC).build()
        track = output
        check(output.state != AudioTrack.STATE_UNINITIALIZED) { "Audio output could not initialize." }
        var written = 0
        while (written < samples.size) {
            val count = output.write(samples, written, samples.size - written)
            check(count > 0) { "Audio output could not prepare the listening example." }
            written += count
        }
    }
    override fun play() { checkNotNull(track).play() }
    override val playedFrames: Int get() = checkNotNull(track).playbackHeadPosition
    override fun close() {
        val output = track ?: return
        track = null
        // Called on the audio dispatcher, including cancellation; never block the UI.
        runCatching {
            if (output.playState == AudioTrack.PLAYSTATE_PLAYING) {
                for (step in 4 downTo 0) { output.setVolume(step / 5f); Thread.sleep(3) }
            }
            output.pause()
            output.flush()
        }
        runCatching { output.release() }
    }
}

/**
 * One-shot curriculum playback, independent of the looping song transport. Literal
 * MIDI pitches bypass global transpose. Completion follows the actual output head,
 * so trailing silence and device buffering finish before an answer or microphone.
 */
internal class AuralAudio(
    context: Context? = null,
    private val sampleRate: Int = AppAudioOutput.sampleRate,
    private val sinkFactory: () -> AuralAudioSink = { AndroidAuralAudioSink() },
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val clockMs: () -> Long = { System.nanoTime() / 1_000_000L }
) {
    private val applicationContext = context?.applicationContext
    private val manager = applicationContext?.getSystemService(AudioManager::class.java)
    private val lock = Any()
    private var active: Job? = null
    private var disposed = false
    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) cancel()
        }
    }
    init {
        applicationContext?.let {
            ContextCompat.registerReceiver(it, noisyReceiver,
                IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED)
        }
    }

    suspend fun play(events: List<AuralEvent>, tempo: Int, instrument: String) =
        play(events, tempo.toDouble(), auralWaveform(instrument))

    suspend fun play(
        events: List<AuralEvent>, tempo: Double = 80.0,
        instrument: AudioEngine.Waveform = AudioEngine.Waveform.TRIANGLE
    ): Unit = coroutineScope {
        val plan = auralPlaybackPlan(events, tempo, sampleRate)
        val thisJob = currentCoroutineContext()[Job]!!
        val previous = synchronized(lock) {
            check(!disposed) { "Practice audio has been disposed." }
            active.also { active = thisJob }
        }
        previous?.cancelAndJoin()
        var sink: AuralAudioSink? = null
        var request: AudioFocusRequest? = null
        try {
            withContext(dispatcher) {
                ensureActive()
                val config = PlaybackConfig(tempo, 0, instrument, PlaybackChordMode.FULL, 0f, 0.72f)
                val renderer = PlaybackPcmRenderer(plan.timeline, config, sampleRate)
                val samples = ShortArray(plan.frameCount)
                val block = ShortArray(2048)
                var offset = 0
                while (offset < samples.size) {
                    ensureActive()
                    val count = minOf(block.size, samples.size - offset)
                    renderer.renderAudioInto(block, count)
                    block.copyInto(samples, offset, 0, count)
                    offset += count
                }
                request = manager?.let { audioManager ->
                    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                        .setOnAudioFocusChangeListener { change ->
                            if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) thisJob.cancel()
                        }.build().also { focus ->
                            check(audioManager.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                                "Audio is busy. Try listening again."
                            }
                        }
                }
                sink = sinkFactory()
                sink!!.prepare(samples, sampleRate)
                ensureActive()
                sink!!.play()
                val deadline = clockMs() + plan.durationMs.toLong() + 5000L
                while (sink!!.playedFrames < samples.size) {
                    ensureActive()
                    check(clockMs() < deadline) { "Audio playback stalled. Try listening again." }
                    delay(12)
                }
            }
        } finally {
            withContext(NonCancellable + dispatcher) {
                sink?.close()
                request?.let { manager?.abandonAudioFocusRequest(it) }
            }
            synchronized(lock) { if (active === thisJob) active = null }
        }
    }

    fun cancel() { synchronized(lock) { active?.cancel() } }

    fun dispose() {
        synchronized(lock) { disposed = true; active?.cancel() }
        applicationContext?.let { runCatching { it.unregisterReceiver(noisyReceiver) } }
    }
}
