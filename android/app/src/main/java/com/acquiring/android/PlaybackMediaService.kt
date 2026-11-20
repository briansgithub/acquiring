package com.acquiring.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState as SessionPlaybackState
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/** Title and subtitle shown on the media notification and lock screen. */
internal data class PlaybackNowPlaying(val title: String = "", val subtitle: String? = null)

/**
 * What the media service should do for one snapshot of the controller. Kept free of
 * Android types so the rules can be unit tested.
 */
internal enum class MediaServiceMode {
    /** Stop the service and remove its notification. */
    STOPPED,

    /** Foreground media playback: ongoing notification, wake lock held. */
    PLAYING,

    /** Playback paused; the notification stays, dismissible, with a play button. */
    PAUSED
}

internal fun mediaServiceMode(
    backgroundEnabled: Boolean,
    ownerAttached: Boolean,
    phase: PlaybackPhase
): MediaServiceMode = when {
    !backgroundEnabled || !ownerAttached -> MediaServiceMode.STOPPED
    phase == PlaybackPhase.PLAYING || phase == PlaybackPhase.BUFFERING -> MediaServiceMode.PLAYING
    else -> MediaServiceMode.PAUSED
}

/**
 * Foreground media-playback service. It only publishes the notification and
 * [MediaSession] for the process's one [PlaybackController] engine, so the
 * transport, audio focus and noisy-route handling stay in one place. The service
 * runs only while the "background playback" switch is on.
 */
internal class PlaybackMediaService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var session: MediaSession? = null
    private var observer: Job? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var inForeground = false
    private var lastMode = MediaServiceMode.PAUSED

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                getString(R.string.playback_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.playback_channel_description)
                setShowBadge(false)
            }
        )
        session = MediaSession(this, "AcquiringPlayback").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = PlaybackController.play()
                override fun onPause() = PlaybackController.pause()
                override fun onStop() {
                    PlaybackController.pause()
                    shutDown()
                }
            })
            setSessionActivity(openAppIntent())
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> PlaybackController.play()
            ACTION_PAUSE -> PlaybackController.pause()
            ACTION_STOP -> {
                PlaybackController.pause()
                shutDown()
                return START_NOT_STICKY
            }
        }
        if (intent?.action == ACTION_START) {
            // startForegroundService() obliges a startForeground() call right away,
            // whatever the transport looks like; the observer below then demotes or
            // stops the service if playback is not actually running.
            publishSession(playing = true)
            if (!promote(buildNotification(playing = true))) {
                shutDown()
                return START_NOT_STICKY
            }
            acquireWakeLock()
        }
        if (observer == null) {
            observer = scope.launch {
                combine(
                    PlaybackController.state,
                    PlaybackController.backgroundPlayback,
                    PlaybackController.ownerAttached,
                    PlaybackController.nowPlaying
                ) { _, _, _, _ -> currentMode() }.collect { mode ->
                    if (mode == MediaServiceMode.STOPPED) shutDown() else render(mode)
                }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        observer?.cancel()
        scope.cancel()
        releaseWakeLock()
        session?.run {
            isActive = false
            release()
        }
        session = null
        super.onDestroy()
    }

    private fun currentMode() = mediaServiceMode(
        backgroundEnabled = PlaybackController.backgroundPlayback.value,
        ownerAttached = PlaybackController.ownerAttached.value,
        phase = PlaybackController.state.value.phase
    )

    /** Returns false only when the first foreground promotion was refused. */
    private fun render(mode: MediaServiceMode): Boolean {
        val playing = mode == MediaServiceMode.PLAYING
        publishSession(playing)
        val notification = buildNotification(playing)
        var ok = true
        if (playing) {
            acquireWakeLock()
            ok = promote(notification)
        } else {
            releaseWakeLock()
            if (inForeground) {
                // Keep the notification, but let the user swipe it away.
                stopForeground(STOP_FOREGROUND_DETACH)
                inForeground = false
            }
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification)
        }
        lastMode = mode
        return ok
    }

    private fun promote(notification: Notification): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            inForeground = true
            true
        } catch (error: RuntimeException) {
            // Android 12+ refuses a background start; a resume from a notification
            // button can race that rule. Playback still runs, just without promotion.
            Log.w(TAG, "foreground promotion refused", error)
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification)
            inForeground
        }
    }

    private fun shutDown() {
        observer?.cancel()
        observer = null
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        inForeground = false
        getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
        stopSelf()
    }

    private fun publishSession(playing: Boolean) {
        val now = PlaybackController.nowPlaying.value
        session?.run {
            setMetadata(
                MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, now.title.ifBlank { getString(R.string.app_name) })
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, now.subtitle)
                    .build()
            )
            setPlaybackState(
                SessionPlaybackState.Builder()
                    .setActions(
                        SessionPlaybackState.ACTION_PLAY or SessionPlaybackState.ACTION_PAUSE or
                            SessionPlaybackState.ACTION_PLAY_PAUSE or SessionPlaybackState.ACTION_STOP
                    )
                    .setState(
                        if (playing) SessionPlaybackState.STATE_PLAYING else SessionPlaybackState.STATE_PAUSED,
                        SessionPlaybackState.PLAYBACK_POSITION_UNKNOWN,
                        if (playing) 1f else 0f
                    )
                    .build()
            )
        }
    }

    private fun buildNotification(playing: Boolean): Notification {
        val now = PlaybackController.nowPlaying.value
        val toggle = if (playing) {
            Notification.Action.Builder(
                Icon.createWithResource(this, R.drawable.ic_notification_pause),
                getString(R.string.playback_action_pause),
                actionIntent(ACTION_PAUSE)
            )
        } else {
            Notification.Action.Builder(
                Icon.createWithResource(this, R.drawable.ic_notification_play),
                getString(R.string.playback_action_play),
                actionIntent(ACTION_PLAY)
            )
        }.build()
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_playback)
            .setContentTitle(now.title.ifBlank { getString(R.string.app_name) })
            .setContentText(now.subtitle)
            .setContentIntent(openAppIntent())
            .setDeleteIntent(actionIntent(ACTION_STOP))
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(playing)
            .addAction(toggle)
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(this, R.drawable.ic_notification_stop),
                    getString(R.string.playback_action_stop),
                    actionIntent(ACTION_STOP)
                ).build()
            )
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(session?.sessionToken)
                    .setShowActionsInCompactView(0, 1)
            )
            .apply {
                if (Build.VERSION.SDK_INT >= 31) {
                    setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
                }
            }
            .build()
    }

    private fun actionIntent(action: String): PendingIntent = PendingIntent.getService(
        this,
        action.hashCode(),
        Intent(this, PlaybackMediaService::class.java).setAction(action),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    private fun openAppIntent(): PendingIntent {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(this, MainActivity::class.java)
        return PendingIntent.getActivity(
            this,
            0,
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "acquiring:playback")
            .apply { acquire(WAKE_LOCK_TIMEOUT_MS) }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    companion object {
        private const val TAG = "PlaybackMediaService"
        const val CHANNEL_ID = "playback_media"
        const val NOTIFICATION_ID = 4107
        const val ACTION_START = "com.acquiring.android.playback.START"
        const val ACTION_PLAY = "com.acquiring.android.playback.PLAY"
        const val ACTION_PAUSE = "com.acquiring.android.playback.PAUSE"
        const val ACTION_STOP = "com.acquiring.android.playback.STOP"

        /** Upper bound so a leaked lock cannot outlive any plausible practice session. */
        private const val WAKE_LOCK_TIMEOUT_MS = 6L * 60 * 60 * 1000

        /** Call while the app is visible, as Android 12+ forbids foreground starts from the background. */
        fun start(context: Context) {
            try {
                ContextCompat.startForegroundService(
                    context,
                    Intent(context, PlaybackMediaService::class.java).setAction(ACTION_START)
                )
            } catch (error: RuntimeException) {
                Log.w(TAG, "service start refused", error)
            }
        }
    }
}
