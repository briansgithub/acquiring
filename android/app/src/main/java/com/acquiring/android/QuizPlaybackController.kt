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
 * Owns the process's one [QuizPlaybackEngine] while a visible Quiz owns its transport.
 * Audio focus and noisy-route handling live here because they remain necessary without
 * publishing a media service, notification, or external transport controls.
 */
internal object QuizPlaybackController {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()

    private var engine: QuizPlaybackEngine? = null
    private var mirror: Job? = null
    private var audioManager: AudioManager? = null
    private var focusRequest: AudioFocusRequest? = null
    private var holdsFocus = false
    private var ownsFocusRequest = false
    private var resumeAfterTransientFocusLoss = false
    private var activeQuizOwner: Any? = null
    private var loadedTimelineIdentity: String? = null
    private var initialized = false

    private val mutableState = MutableStateFlow(QuizPlaybackState())
    val state: StateFlow<QuizPlaybackState> = mutableState.asStateFlow()

    val isPlaybackRequested: Boolean get() = engine?.isPlaybackRequested == true

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
                }
                engine?.pauseForLifecycle()
            }

            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                synchronized(lock) {
                    resumeAfterTransientFocusLoss =
                        activeQuizOwner != null && engine?.isPlaybackRequested == true
                    holdsFocus = false
                }
                engine?.pauseForLifecycle()
            }

            AudioManager.AUDIOFOCUS_GAIN -> {
                val shouldResume = synchronized(lock) {
                    val validRequest = ownsFocusRequest && activeQuizOwner != null
                    holdsFocus = validRequest
                    val resume = validRequest && resumeAfterTransientFocusLoss
                    resumeAfterTransientFocusLoss = false
                    resume
                }
                if (shouldResume) engine?.play()
            }
        }
    }

    /** Idempotent process initialization; the receiver belongs to the application. */
    fun initialize(context: Context) {
        synchronized(lock) {
            if (initialized) return
            val applicationContext = context.applicationContext
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

    fun attachQuiz(owner: Any) {
        synchronized(lock) { activeQuizOwner = owner }
    }

    /** Pauses only if [owner] still owns the visible Quiz. */
    fun detachQuiz(owner: Any, retainedScrubBeat: Double? = null) {
        val shouldPause = synchronized(lock) {
            if (activeQuizOwner !== owner) return
            activeQuizOwner = null
            resumeAfterTransientFocusLoss = false
            true
        }
        if (shouldPause) {
            if (retainedScrubBeat != null) {
                engine?.seek(retainedScrubBeat, resume = false)
            } else {
                engine?.pauseForLifecycle()
            }
            abandonFocus()
        }
    }

    fun configure(newConfig: QuizPlaybackConfig) {
        val target = synchronized(lock) {
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

    fun load(identity: String, newTimeline: QuizTimeline, continuePlaying: Boolean) {
        val needsLoad = synchronized(lock) {
            if (loadedTimelineIdentity == identity) {
                false
            } else {
                loadedTimelineIdentity = identity
                true
            }
        }
        if (!needsLoad) return
        val shouldPlay = continuePlaying && hasActiveQuiz() && requestFocus()
        engine?.load(newTimeline, continuePlaying = shouldPlay)
    }

    fun play() {
        if (!hasActiveQuiz() || !requestFocus()) return
        synchronized(lock) { resumeAfterTransientFocusLoss = false }
        engine?.play()
    }

    fun pause() {
        pauseAndClearResume(abandonAudioFocus = true)
    }

    /** Activity-level backstop for app backgrounding, including focus-loss races. */
    fun pauseForAppInactive() {
        pauseAndClearResume(abandonAudioFocus = true)
    }

    fun pauseForScrub(): Boolean = engine?.pauseForScrub() ?: false

    fun seek(beat: Double, resume: Boolean) {
        val shouldResume = resume && hasActiveQuiz() && requestFocus()
        if (!shouldResume) synchronized(lock) { resumeAfterTransientFocusLoss = false }
        engine?.seek(beat, shouldResume)
        if (!shouldResume) abandonFocus()
    }

    fun reset() {
        synchronized(lock) { resumeAfterTransientFocusLoss = false }
        engine?.reset()
        abandonFocus()
    }

    private fun pauseAndClearResume(abandonAudioFocus: Boolean) {
        synchronized(lock) { resumeAfterTransientFocusLoss = false }
        engine?.pauseForLifecycle()
        if (abandonAudioFocus) abandonFocus()
    }

    private fun hasActiveQuiz(): Boolean = synchronized(lock) { activeQuizOwner != null }

    private fun requestFocus(): Boolean {
        val manager: AudioManager
        val request: AudioFocusRequest
        synchronized(lock) {
            if (holdsFocus) return true
            manager = audioManager ?: return false
            request = focusRequest ?: return false
        }
        val granted = manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        synchronized(lock) {
            holdsFocus = granted
            ownsFocusRequest = granted
        }
        return granted
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
