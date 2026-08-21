package com.acquiring.android

import android.content.Context
import android.media.AudioManager

/**
 * The one audio session every track in the app plays on.
 *
 * An AudioTrack built without a session id is given a fresh one, which is harmless for
 * the section transport — it builds a single track and keeps it — but not for card
 * previews, which build a track per tap. A system-wide equaliser attaches its effect
 * chain per session, so a new session per tap makes it stand a chain up and tear it
 * down on every card, and that churn is audible.
 *
 * Naming one session up front means the chain is built once and the section and the
 * cards are heard through the same one.
 */
internal object AppAudioSession {

    /**
     * Until [initialize] runs there is no [AudioManager] to ask, so tracks fall back to
     * asking the framework for a session of their own — the behaviour this replaces.
     * Unit tests never initialize, and so are unaffected.
     */
    @Volatile
    private var allocated: Int = AudioManager.AUDIO_SESSION_ID_GENERATE

    /** Session id to build every AudioTrack against. */
    val id: Int get() = allocated

    /** Whether a real session has been claimed, rather than the per-track fallback. */
    val isAllocated: Boolean get() = allocated != AudioManager.AUDIO_SESSION_ID_GENERATE

    /**
     * Claims the session. Called once from the Activity, before anything can sound.
     * A failure here is not worth crashing over: tracks simply keep their old
     * behaviour of taking a session each.
     */
    fun initialize(context: Context) {
        if (isAllocated) return
        allocated = runCatching {
            context.getSystemService(AudioManager::class.java)?.generateAudioSessionId()
        }.getOrNull()
            ?.takeIf { it != AudioManager.ERROR }
            ?: AudioManager.AUDIO_SESSION_ID_GENERATE
    }
}
