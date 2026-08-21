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
class AppAudioSessionTest {

    @Test
    fun claimsOneSessionAndKeepsIt() {
        AppAudioSession.initialize(ApplicationProvider.getApplicationContext())
        val first = AppAudioSession.id

        assertTrue("session was never claimed", AppAudioSession.isAllocated)
        assertTrue("session id $first is not usable", first > 0)

        // Every track in the app has to land on the same session, so a second call
        // must not hand out a new one — that would put the cards back on a session of
        // their own and an equaliser back to rebuilding its chain per tap.
        AppAudioSession.initialize(ApplicationProvider.getApplicationContext())
        assertEquals("session changed on a second initialize", first, AppAudioSession.id)
    }

    @Test
    fun fallbackIdIsTheOneAudioTrackAcceptsAsAskForOne() {
        // Before initialize, and if AudioManager ever refuses, tracks are built with
        // this value. AudioTrack.Builder treats it as "allocate me one", which is the
        // behaviour the shared session replaces — so the fallback is a no-op, not a
        // crash.
        assertEquals(0, AudioManager.AUDIO_SESSION_ID_GENERATE)
    }
}
