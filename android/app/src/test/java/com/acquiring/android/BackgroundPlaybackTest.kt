package com.acquiring.android

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BackgroundPlaybackTest {
    @get:Rule val compose = createComposeRule()

    @Test fun serviceModeFollowsTheSwitchOwnerAndPhase() {
        fun mode(enabled: Boolean, owner: Boolean, phase: PlaybackPhase) = mediaServiceMode(enabled, owner, phase)
        assertEquals(MediaServiceMode.STOPPED, mode(false, true, PlaybackPhase.PLAYING))
        assertEquals(MediaServiceMode.STOPPED, mode(true, false, PlaybackPhase.PLAYING))
        assertEquals(MediaServiceMode.PLAYING, mode(true, true, PlaybackPhase.PLAYING))
        assertEquals(MediaServiceMode.PLAYING, mode(true, true, PlaybackPhase.BUFFERING))
        for (phase in listOf(PlaybackPhase.PAUSED, PlaybackPhase.STOPPED, PlaybackPhase.COMPLETED, PlaybackPhase.ERROR)) {
            assertEquals(MediaServiceMode.PAUSED, mode(true, true, phase))
        }
    }

    @Test fun backgroundSwitchPersistsAndDefaultsOff() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.getSharedPreferences("playback_background_v1", Context.MODE_PRIVATE).edit().clear().commit()
        PlaybackController.setBackgroundPlayback(context, false)
        assertFalse(PlaybackController.backgroundPlayback.value)
        PlaybackController.setBackgroundPlayback(context, true)
        assertTrue(PlaybackController.backgroundPlayback.value)
        assertTrue(
            context.getSharedPreferences("playback_background_v1", Context.MODE_PRIVATE).getBoolean("enabled", false)
        )
        PlaybackController.setBackgroundPlayback(context, false)
        assertFalse(PlaybackController.keepsPlayingInBackground())
    }

    @Test fun nothingIsKeptWhileAppIsInBackgroundUnlessThereIsPlaybackToKeep() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        PlaybackController.setBackgroundPlayback(context, true)
        // No engine is playing in this test process, so even with the switch on there is nothing to keep.
        assertFalse(PlaybackController.keepsPlayingInBackground())
        PlaybackController.setBackgroundPlayback(context, false)
    }

    @Test fun headerSwitchReflectsAndReportsTheBackgroundSetting() {
        var enabled by mutableStateOf(false)
        compose.setContent {
            MaterialTheme {
                PlaybackScreenHeader(
                    titleText = "Song by Artist",
                    onBack = {},
                    onTitleClick = {},
                    useRelativeIonianContext = false,
                    onLockInMajorChange = {},
                    keyDisplay = null,
                    onPlayHomeNote = {},
                    onPlayHomeChord = {},
                    isMonitoring = false,
                    onToggleMonitoring = {},
                    onShowHelp = {},
                    backgroundPlayback = enabled,
                    onBackgroundPlaybackChange = { enabled = it }
                )
            }
        }
        compose.onNodeWithTag(PLAYBACK_BACKGROUND_TOGGLE_TEST_TAG).assertIsOff().performClick()
        assertTrue(enabled)
        compose.onNodeWithTag(PLAYBACK_BACKGROUND_TOGGLE_TEST_TAG).assertIsOn().performClick()
        assertFalse(enabled)
    }

    @Test fun manifestDeclaresTheMediaPlaybackServiceAndPermissions() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val info = context.packageManager.getPackageInfo(
            context.packageName,
            android.content.pm.PackageManager.GET_SERVICES or android.content.pm.PackageManager.GET_PERMISSIONS
        )
        val service = info.services.orEmpty().single { it.name == PlaybackMediaService::class.java.name }
        assertFalse(service.exported)
        assertTrue(
            service.foregroundServiceType and android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK != 0
        )
        val requested = info.requestedPermissions.orEmpty().toSet()
        for (permission in listOf(
            "android.permission.FOREGROUND_SERVICE",
            "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
            "android.permission.POST_NOTIFICATIONS"
        )) assertTrue(permission, permission in requested)
    }

    @Test fun startingTheServicePromotesImmediatelyThenFollowsTheTransport() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        PlaybackController.setBackgroundPlayback(context, true)
        val owner = Any()
        PlaybackController.attachPlayback(owner)
        val controller = org.robolectric.Robolectric.buildService(
            PlaybackMediaService::class.java,
            android.content.Intent(context, PlaybackMediaService::class.java)
                .setAction(PlaybackMediaService.ACTION_START)
        ).create().startCommand(0, 1)
        // No engine is playing, so the observer demotes it to a dismissible paused notification
        // after the mandatory startForeground() call.
        val notification = shadowOf(context.getSystemService(android.app.NotificationManager::class.java))
            .getNotification(PlaybackMediaService.NOTIFICATION_ID)
        org.junit.Assert.assertNotNull(notification)
        assertEquals(2, notification.actions.size)
        assertEquals("Play", notification.actions[0].title.toString())
        assertTrue(notification.flags and android.app.Notification.FLAG_ONGOING_EVENT == 0)
        // Leaving the Playback screen (owner detached) ends the service and its notification.
        PlaybackController.detachPlayback(owner)
        org.junit.Assert.assertNull(
            shadowOf(context.getSystemService(android.app.NotificationManager::class.java))
                .getNotification(PlaybackMediaService.NOTIFICATION_ID)
        )
        controller.destroy()
        PlaybackController.setBackgroundPlayback(context, false)
    }
}
