package com.acquiring.android

import android.content.Context
import android.media.AudioManager

/**
 * The output configuration every AudioTrack in the app is built against.
 *
 * Two things are shared deliberately. An AudioTrack built without a session id is given
 * a fresh one, which is harmless for the section transport — it builds a single track
 * and keeps it — but card previews build a track per tap, so each tap claimed a session
 * of its own. A system-wide equaliser attaches its effect chain per session, so that
 * made it stand a chain up and tear it down on every card.
 *
 * The sample rate is shared for a different reason: the app synthesises every sample it
 * plays, so it can generate at any rate for free, and generating at anything other than
 * the device's own output rate only buys a resampling pass in front of whatever effects
 * are attached. Asking the platform what it wants costs nothing and removes that pass.
 */
internal object AppAudioOutput {

    /**
     * Until [initialize] runs there is no [AudioManager] to ask, so tracks fall back to
     * asking the framework for a session of their own — the behaviour this replaces.
     * Unit tests never initialize, and so are unaffected.
     */
    @Volatile
    private var allocatedSession: Int = AudioManager.AUDIO_SESSION_ID_GENERATE

    @Volatile
    private var resolvedSampleRate: Int = FALLBACK_SAMPLE_RATE

    /** Session id to build every AudioTrack against. */
    val sessionId: Int get() = allocatedSession

    /** Rate to synthesise and play at: the device's own, once it has been asked. */
    val sampleRate: Int get() = resolvedSampleRate

    /** Whether a real session has been claimed, rather than the per-track fallback. */
    val isSessionAllocated: Boolean get() = allocatedSession != AudioManager.AUDIO_SESSION_ID_GENERATE

    /**
     * Reads the output configuration. Called once from the Activity, before anything can
     * sound. Failure is not worth crashing over: the session falls back to one per track
     * and the rate to [FALLBACK_SAMPLE_RATE], which is what the app used throughout.
     */
    fun initialize(context: Context) {
        val audioManager = runCatching {
            context.getSystemService(AudioManager::class.java)
        }.getOrNull() ?: return

        if (!isSessionAllocated) {
            allocatedSession = runCatching { audioManager.generateAudioSessionId() }
                .getOrNull()
                ?.takeIf { it != AudioManager.ERROR }
                ?: AudioManager.AUDIO_SESSION_ID_GENERATE
        }

        resolvedSampleRate = runCatching {
            audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull()
        }.getOrNull()
            ?.takeIf { it in MIN_SAMPLE_RATE..MAX_SAMPLE_RATE }
            ?: FALLBACK_SAMPLE_RATE
    }

    const val FALLBACK_SAMPLE_RATE = 44_100
    private const val MIN_SAMPLE_RATE = 8_000
    private const val MAX_SAMPLE_RATE = 192_000
}
