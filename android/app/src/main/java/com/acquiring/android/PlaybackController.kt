package com.acquiring.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Owns the process's one [PlaybackEngine] while a visible Playback owns its transport.
 * Audio focus and noisy-route handling live here. With "background playback" off the
 * transport pauses whenever the app is not visible. With it on, [PlaybackMediaService]
 * publishes the notification and media session and playback survives minimizing and
 * locking; the engine, focus and transport rules stay in this object either way.
 */
private const val BACKGROUND_PREFS = "playback_background_v1"
private const val BACKGROUND_KEY = "enabled"

internal object PlaybackController {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()

    private var engine: PlaybackEngine? = null
    private var mirror: Job? = null
    private var audioManager: AudioManager? = null
    private var focusRequest: AudioFocusRequest? = null
    private var holdsFocus = false
    private var ownsFocusRequest = false
    private var resumeAfterTransientFocusLoss = false
    private var activePlaybackOwner: Any? = null
    private var loadedTimelineIdentity: String? = null
    private var initialized = false
    private var spokenRootDegrees = SpokenRootDegreeClips()

    private val mutableState = MutableStateFlow(PlaybackState())
    val state: StateFlow<PlaybackState> = mutableState.asStateFlow()

    private val mutableBackground = MutableStateFlow(false)

    /** User switch: play as a regular media stream that survives minimizing and locking. */
    val backgroundPlayback: StateFlow<Boolean> = mutableBackground.asStateFlow()

    private val mutableOwnerAttached = MutableStateFlow(false)

    /** True while a Playback screen (visible, or backgrounded with playback kept) owns the transport. */
    val ownerAttached: StateFlow<Boolean> = mutableOwnerAttached.asStateFlow()

    private val mutableNowPlaying = MutableStateFlow(PlaybackNowPlaying())
    val nowPlaying: StateFlow<PlaybackNowPlaying> = mutableNowPlaying.asStateFlow()

    /** True when leaving the foreground must not pause the transport. */
    fun keepsPlayingInBackground(): Boolean =
        mutableBackground.value && engine?.isPlaybackRequested == true

    fun setBackgroundPlayback(context: Context, enabled: Boolean) {
        context.applicationContext.getSharedPreferences(BACKGROUND_PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(BACKGROUND_KEY, enabled).apply()
        mutableBackground.value = enabled
    }

    fun setNowPlaying(title: String, subtitle: String?) {
        mutableNowPlaying.value = PlaybackNowPlaying(title, subtitle)
    }

    val isPlaybackRequested: Boolean get() = engine?.isPlaybackRequested == true
    fun isCurrentCompletion(state: PlaybackState): Boolean = engine?.isCurrentCompletion(state) == true

    private val becomingNoisy = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                pauseAndClearResume(abandonAudioFocus = true)
            }
        }
    }

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                synchronized(lock) {
                    holdsFocus = false
                    ownsFocusRequest = false
                    resumeAfterTransientFocusLoss = false
                    engine?.pauseForLifecycle()
                }
            }

            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                synchronized(lock) {
                    resumeAfterTransientFocusLoss =
                        activePlaybackOwner != null && engine?.isPlaybackRequested == true
                    holdsFocus = false
                    engine?.pauseForLifecycle()
                }
            }

            AudioManager.AUDIOFOCUS_GAIN -> {
                synchronized(lock) {
                    val validRequest = ownsFocusRequest && activePlaybackOwner != null
                    holdsFocus = validRequest
                    if (validRequest && resumeAfterTransientFocusLoss) engine?.play()
                    resumeAfterTransientFocusLoss = false
                }
            }
        }
    }

    /** Idempotent process initialization; the receiver belongs to the application. */
    fun initialize(context: Context) {
        synchronized(lock) {
            if (initialized) return
            val applicationContext = context.applicationContext
            spokenRootDegrees = loadSpokenRootDegrees(applicationContext.resources)
            mutableBackground.value = applicationContext
                .getSharedPreferences(BACKGROUND_PREFS, Context.MODE_PRIVATE)
                .getBoolean(BACKGROUND_KEY, false)
            audioManager = applicationContext.getSystemService(AudioManager::class.java)
            focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener(focusListener)
                .build()
            ContextCompat.registerReceiver(
                applicationContext,
                becomingNoisy,
                IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
            initialized = true
        }
    }

    fun attachPlayback(owner: Any) {
        synchronized(lock) { activePlaybackOwner = owner }
        mutableOwnerAttached.value = true
    }

    /** Pauses only if [owner] still owns the visible Playback. */
    fun detachPlayback(owner: Any, retainedScrubBeat: Double? = null) {
        val shouldAbandonFocus = synchronized(lock) {
            if (activePlaybackOwner !== owner) return
            activePlaybackOwner = null
            mutableOwnerAttached.value = false
            resumeAfterTransientFocusLoss = false
            if (retainedScrubBeat != null) {
                engine?.seek(retainedScrubBeat, resume = false)
            } else {
                engine?.pauseForLifecycle()
            }
            true
        }
        if (shouldAbandonFocus) abandonFocus()
    }

    fun configure(newConfig: PlaybackConfig) {
        val target = synchronized(lock) {
            val existing = engine
            if (existing != null) {
                existing
            } else {
                val created = PlaybackEngine(newConfig, spokenRootDegrees = spokenRootDegrees)
                engine = created
                mirror = scope.launch {
                    created.state.collect { mutableState.value = it }
                }
                created
            }
        }
        target.updateConfig(newConfig)
    }

    /**
     * Returns true when this replaced the performance and playback starts at the
     * beginning. A Loop/Song toggle keeps the same identity; that path only updates
     * the completion key and leaves the playhead where it is.
     */
    fun load(identity: String, newTimeline: PlaybackTimeline, continuePlaying: Boolean): Boolean {
        val sameIdentity = synchronized(lock) {
            val same = loadedTimelineIdentity == identity
            if (!same) loadedTimelineIdentity = identity
            same
        }
        if (sameIdentity && engine?.updateCompletion(newTimeline) == true) return false
        if (!sameIdentity && engine?.adoptIfPlaying(newTimeline) == true) return false
        val focusOwner = if (continuePlaying) requestFocus() else null
        val shouldPlay = synchronized(lock) {
            val permitted = focusOwner != null && activePlaybackOwner === focusOwner
            engine?.load(newTimeline, continuePlaying = permitted, performanceId = identity)
            permitted
        }
        if (focusOwner != null && !shouldPlay) abandonFocus()
        return true
    }

    fun setSectionContinuation(afterPerformanceId: String, sections: List<QueuedSection>) {
        engine?.setSectionContinuation(afterPerformanceId, sections)
    }

    fun play() {
        val focusOwner = requestFocus() ?: return
        val shouldAbandonFocus = synchronized(lock) {
            if (activePlaybackOwner !== focusOwner) return@synchronized true
            resumeAfterTransientFocusLoss = false
            engine?.play()
            false
        }
        if (shouldAbandonFocus) abandonFocus()
    }

    fun pause() {
        pauseAndClearResume(abandonAudioFocus = true)
    }

    /**
     * Activity-level backstop for app backgrounding, including focus-loss races.
     * Background playback deliberately keeps a playing transport and its audio focus.
     */
    fun pauseForAppInactive() {
        if (keepsPlayingInBackground()) return
        pauseAndClearResume(abandonAudioFocus = true)
    }

    fun pauseForScrub(): Boolean = engine?.pauseForScrub() ?: false

    fun seek(beat: Double, resume: Boolean) {
        val focusOwner = if (resume) requestFocus() else null
        val shouldResume = synchronized(lock) {
            val permitted = focusOwner != null && activePlaybackOwner === focusOwner
            if (!permitted) resumeAfterTransientFocusLoss = false
            engine?.seek(beat, permitted)
            permitted
        }
        if (!shouldResume) abandonFocus()
    }

    fun reset() {
        synchronized(lock) { resumeAfterTransientFocusLoss = false }
        AudioDiagnostics.record("playback.reset")
        engine?.reset()
        abandonFocus()
    }

    private fun pauseAndClearResume(abandonAudioFocus: Boolean) {
        synchronized(lock) {
            resumeAfterTransientFocusLoss = false
            engine?.pauseForLifecycle()
        }
        if (abandonAudioFocus) abandonFocus()
    }

    /** Returns the Playback owner for which focus was granted, or null. */
    private fun requestFocus(): Any? {
        val manager: AudioManager
        val request: AudioFocusRequest
        val owner: Any
        synchronized(lock) {
            owner = activePlaybackOwner ?: return null
            if (holdsFocus && ownsFocusRequest) return owner
            manager = audioManager ?: return null
            request = focusRequest ?: return null
        }
        val granted = manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        val accepted = synchronized(lock) {
            val stillOwned = granted && activePlaybackOwner === owner
            holdsFocus = stillOwned
            ownsFocusRequest = stillOwned
            stillOwned
        }
        if (granted && !accepted) manager.abandonAudioFocusRequest(request)
        return owner.takeIf { accepted }
    }

    private fun abandonFocus() {
        val manager: AudioManager
        val request: AudioFocusRequest
        synchronized(lock) {
            if (!ownsFocusRequest) return
            manager = audioManager ?: return
            request = focusRequest ?: return
            holdsFocus = false
            ownsFocusRequest = false
        }
        manager.abandonAudioFocusRequest(request)
    }
}
