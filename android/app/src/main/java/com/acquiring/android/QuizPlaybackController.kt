package com.acquiring.android

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** What the notification, lock screen, and Bluetooth display show for a section. */
internal data class QuizNowPlaying(
    val title: String,
    val artist: String,
    val sectionLabel: String
) {
    /** Second line of the notification: the artist, narrowed to the section in play. */
    val subtitle: String
        get() = listOf(artist, sectionLabel).filter { it.isNotBlank() }.joinToString(" — ")
}

/**
 * Owns the process's one [QuizPlaybackEngine].
 *
 * Playback used to live and die with the Quiz composable, which is fine for a tab you
 * are looking at and wrong for a media app: the transport has to keep its place while
 * the screen is off, and a notification has to be able to reach it. The engine lives
 * here instead, and [QuizPlaybackService] mirrors this state into a MediaSession.
 *
 * Every transport entry point — the on-screen button, the notification, a headset
 * button, audio-focus loss — arrives here, so there is one place where "is it
 * sounding" is decided.
 */
internal object QuizPlaybackController {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()

    private var engine: QuizPlaybackEngine? = null
    private var mirror: Job? = null
    private var appContext: Context? = null

    private var timeline: QuizTimeline? = null
    private var config: QuizPlaybackConfig? = null

    private val mutableState = MutableStateFlow(QuizPlaybackState())

    /** Stable across engine construction, so the UI can collect it before playing. */
    val state: StateFlow<QuizPlaybackState> = mutableState.asStateFlow()

    private val mutableNowPlaying = MutableStateFlow<QuizNowPlaying?>(null)
    val nowPlaying: StateFlow<QuizNowPlaying?> = mutableNowPlaying.asStateFlow()

    val isPlaybackRequested: Boolean get() = engine?.isPlaybackRequested == true

    /** Milliseconds from the top of the section to the beat now sounding. */
    val positionMs: Long
        get() = beatToMs(mutableState.value.beat)

    /** Length of the loaded section in milliseconds, or 0 when nothing is loaded. */
    val durationMs: Long
        get() = timeline?.let { beatToMs(it.endBeat) } ?: 0L

    private fun beatToMs(beat: Double): Long {
        val loaded = timeline ?: return 0L
        val bpm = config?.bpm ?: 0.0
        if (bpm <= 0.0) return 0L
        val beatsIn = (beat - loaded.startBeat).coerceAtLeast(0.0)
        return (beatsIn * 60_000.0 / bpm).toLong()
    }

    private fun msToBeat(positionMs: Long): Double {
        val loaded = timeline ?: return 1.0
        val bpm = config?.bpm ?: 0.0
        if (bpm <= 0.0) return loaded.startBeat
        return loaded.startBeat + positionMs.coerceAtLeast(0L) * bpm / 60_000.0
    }

    /** Called once from the Activity so the controller can raise its own service. */
    fun initialize(context: Context) {
        synchronized(lock) { appContext = context.applicationContext }
    }

    /**
     * Builds the engine on first use and keeps its config current afterwards. Safe to
     * call on every recomposition: an unchanged config is handed straight to the
     * engine, which coalesces it.
     */
    fun configure(newConfig: QuizPlaybackConfig) {
        val target = synchronized(lock) {
            config = newConfig
            val existing = engine
            if (existing != null) {
                existing
            } else {
                val created = QuizPlaybackEngine(newConfig)
                engine = created
                mirror = scope.launch {
                    created.state.collect { mutableState.value = it }
                }
                created
            }
        }
        target.updateConfig(newConfig)
    }

    /** Names what is loaded, for the notification and the lock screen. */
    fun setNowPlaying(value: QuizNowPlaying) {
        mutableNowPlaying.value = value
    }

    fun load(newTimeline: QuizTimeline, metadata: QuizNowPlaying?, continuePlaying: Boolean) {
        synchronized(lock) { timeline = newTimeline }
        metadata?.let { mutableNowPlaying.value = it }
        engine?.load(newTimeline, continuePlaying = continuePlaying)
        if (continuePlaying) startService()
    }

    fun play() {
        engine?.play()
        startService()
    }

    fun pause() {
        engine?.pause()
    }

    fun togglePlayPause() {
        if (isPlaybackRequested) pause() else play()
    }

    fun pauseForScrub(): Boolean = engine?.pauseForScrub() ?: false

    fun seek(beat: Double, resume: Boolean) {
        engine?.seek(beat, resume)
        if (resume) startService()
    }

    fun seekToMs(positionMs: Long) {
        seek(msToBeat(positionMs), resume = isPlaybackRequested)
    }

    fun reset() {
        engine?.reset()
    }

    /** Stops the transport and lets the service drop its notification. */
    fun stop() {
        engine?.reset()
        appContext?.let { QuizPlaybackService.stop(it) }
    }

    private fun startService() {
        appContext?.let { QuizPlaybackService.start(it) }
    }
}
