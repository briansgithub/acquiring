package com.acquiring.android

import android.media.AudioManager
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class AppAudioOutputTest {

    @Test
    fun claimsOneSessionAndKeepsIt() {
        AppAudioOutput.initialize(ApplicationProvider.getApplicationContext())
        val first = AppAudioOutput.sessionId

        assertTrue("session was never claimed", AppAudioOutput.isSessionAllocated)
        assertTrue("session id $first is not usable", first > 0)

        // Every track in the app has to land on the same session, so a second call must
        // not hand out a new one — that would put the cards back on a session of their
        // own and an equaliser back to rebuilding its chain per tap.
        AppAudioOutput.initialize(ApplicationProvider.getApplicationContext())
        assertEquals("session changed on a second initialize", first, AppAudioOutput.sessionId)
    }

    @Test
    fun reportsAUsableSampleRate() {
        AppAudioOutput.initialize(ApplicationProvider.getApplicationContext())

        // Whatever the platform reports has to be something the synth and the AudioTrack
        // can both be built at; an unparseable or absurd answer falls back rather than
        // propagating into every buffer length in the app.
        assertTrue(
            "sample rate ${AppAudioOutput.sampleRate} is not a plausible output rate",
            AppAudioOutput.sampleRate in 8_000..192_000
        )
    }

    @Test
    fun fallbacksAreTheBehaviourTheyReplace() {
        // Before initialize, and if AudioManager ever refuses, tracks are built with
        // these. AUDIO_SESSION_ID_GENERATE is what AudioTrack.Builder reads as "allocate
        // me one", and the rate is what the app synthesised at throughout — so both
        // fallbacks are a no-op, not a crash.
        assertEquals(0, AudioManager.AUDIO_SESSION_ID_GENERATE)
        assertEquals(44_100, AppAudioOutput.FALLBACK_SAMPLE_RATE)
    }
}
