package com.acquiring.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/**
 * Publishes the Quiz transport as a media session, so a song section behaves like
 * anything else that plays through the media stream: a notification with a play/pause
 * button, lock-screen and headset controls, and audio focus that yields to a call.
 *
 * The service owns none of the audio. [QuizPlaybackController] holds the engine; this
 * mirrors its state outwards and routes transport commands back to it, which keeps the
 * notification and the on-screen button reading from the same source.
 */
internal class QuizPlaybackService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private lateinit var mediaSession: MediaSession
    private lateinit var notificationManager: NotificationManager
    private lateinit var audioManager: AudioManager

    private var focusRequest: AudioFocusRequest? = null
    private var holdsFocus = false
    private var pausedByFocusLoss = false
    private var isForeground = false

    private var lastPhase: QuizPlaybackPhase? = null
    /**
     * The controller's state flow opens on STOPPED, which arrives here the moment the
     * collector starts — before onStartCommand has had its chance to post the
     * notification. Tearing down on that first emission would kill the service between
     * startForegroundService and startForeground, which the platform treats as a crash.
     * Only a STOPPED that follows something audible ends the service.
     */
    private var hasSounded = false
    private var lastMetadata: QuizNowPlaying? = null
    private var lastSessionPublishNanos = 0L
    private var lastPublishedPositionMs = 0L
    /** lastMetadata starts null, which is also a legitimate value, so track the send. */
    private var hasPublishedMetadata = false

    /** Pause when the headphones come out, the way every other media app does. */
    private val becomingNoisy = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                QuizPlaybackController.pause()
            }
        }
    }

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                pausedByFocusLoss = false
                QuizPlaybackController.pause()
            }

            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                // Remember only a pause we caused, so a call does not resurrect a
                // section the listener had already stopped themselves.
                pausedByFocusLoss = QuizPlaybackController.isPlaybackRequested
                QuizPlaybackController.pause()
            }

            AudioManager.AUDIOFOCUS_GAIN -> {
                if (pausedByFocusLoss) {
                    pausedByFocusLoss = false
                    QuizPlaybackController.play()
                }
            }
            // LOSS_TRANSIENT_CAN_DUCK is handled by the platform: the focus request
            // below opts into system ducking rather than pausing for a notification.
        }
    }

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(NotificationManager::class.java)
        audioManager = getSystemService(AudioManager::class.java)
        createChannel()

        mediaSession = MediaSession(this, MEDIA_SESSION_TAG).apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = QuizPlaybackController.play()
                override fun onPause() = QuizPlaybackController.pause()
                override fun onStop() = QuizPlaybackController.stop()
                override fun onSeekTo(pos: Long) = QuizPlaybackController.seekToMs(pos)
                override fun onSkipToPrevious() = QuizPlaybackController.seekToMs(0L)
            })
            isActive = true
        }

        ContextCompat.registerReceiver(
            this,
            becomingNoisy,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        scope.launch {
            combine(
                QuizPlaybackController.state,
                QuizPlaybackController.nowPlaying
            ) { playback, metadata -> playback to metadata }
                .collect { (playback, metadata) -> onPlaybackChanged(playback, metadata) }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // A started foreground service has a few seconds to post its notification,
        // whatever the command turns out to be.
        enterForeground(buildNotification(QuizPlaybackController.isPlaybackRequested))

        when (intent?.action) {
            // ACTION_ATTACH is the controller raising the service after it has already
            // started the transport; it carries no command of its own.
            ACTION_ATTACH -> Unit
            ACTION_PLAY -> QuizPlaybackController.play()
            ACTION_PAUSE -> QuizPlaybackController.pause()
            ACTION_TOGGLE -> QuizPlaybackController.togglePlayPause()
            ACTION_STOP -> {
                QuizPlaybackController.pause()
                teardown()
                return START_NOT_STICKY
            }
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        scope.cancel()
        abandonFocus()
        runCatching { unregisterReceiver(becomingNoisy) }
        mediaSession.isActive = false
        mediaSession.release()
        super.onDestroy()
    }

    // ------------------------------------------------------------------ state out

    private fun onPlaybackChanged(playback: QuizPlaybackState, metadata: QuizNowPlaying?) {
        val identityChanged = playback.phase != lastPhase || metadata != lastMetadata
        val now = System.nanoTime()
        // The transport publishes a beat every frame, but a MediaSession does not need
        // to hear most of them: it carries a playback speed and extrapolates position
        // between updates. Every publish is a binder call that fans out to the system's
        // Bluetooth and BLE media services, so it is only worth making when the session
        // could not have worked the answer out for itself -- the phase or the metadata
        // changed, or the position jumped somewhere extrapolation would not have gone,
        // which is what a loop wrap or a seek looks like from here.
        val republish = identityChanged ||
            positionDivergedFromExtrapolation(now) ||
            now - lastSessionPublishNanos >= SESSION_RESYNC_NANOS
        if (!republish) return
        lastSessionPublishNanos = now
        lastPublishedPositionMs = QuizPlaybackController.positionMs
        lastPhase = playback.phase
        val metadataChanged = metadata != lastMetadata || !hasPublishedMetadata
        lastMetadata = metadata

        val playing = playback.phase == QuizPlaybackPhase.PLAYING ||
            playback.phase == QuizPlaybackPhase.BUFFERING
        if (playing || playback.phase == QuizPlaybackPhase.PAUSED) hasSounded = true

        publishSession(playback, metadata, playing, metadataChanged)

        if (playing) requestFocus() else if (playback.phase != QuizPlaybackPhase.PAUSED) abandonFocus()

        if (!identityChanged) return
        val notification = buildNotification(playing, metadata)
        when {
            playing -> enterForeground(notification)
            playback.phase == QuizPlaybackPhase.STOPPED && hasSounded -> teardown()
            playback.phase == QuizPlaybackPhase.STOPPED -> Unit
            else -> {
                // Paused: keep the notification so playback can be resumed from it,
                // but let the system reclaim the service if it needs the memory.
                leaveForeground(removeNotification = false)
                notificationManager.notify(NOTIFICATION_ID, notification)
            }
        }
    }

    /**
     * Whether the transport has moved somewhere the session would not have predicted.
     * Extrapolation only holds while playing and only forwards, so a loop back to the
     * top or a seek shows up here as a gap between where it would be and where it is.
     */
    private fun positionDivergedFromExtrapolation(now: Long): Boolean {
        if (lastPhase != QuizPlaybackPhase.PLAYING) return false
        val elapsedMs = (now - lastSessionPublishNanos) / 1_000_000L
        val predictedMs = lastPublishedPositionMs + elapsedMs
        return kotlin.math.abs(QuizPlaybackController.positionMs - predictedMs) > POSITION_DRIFT_MS
    }

    private fun publishSession(
        playback: QuizPlaybackState,
        metadata: QuizNowPlaying?,
        playing: Boolean,
        metadataChanged: Boolean
    ) {
        // Metadata only moves when the section does, so re-sending it on every position
        // resync would be pure traffic.
        if (metadataChanged) {
            hasPublishedMetadata = true
            mediaSession.setMetadata(
                MediaMetadata.Builder()
                    .putString(
                        MediaMetadata.METADATA_KEY_TITLE,
                        metadata?.title ?: getString(R.string.app_name)
                    )
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, metadata?.subtitle.orEmpty())
                    .putLong(
                        MediaMetadata.METADATA_KEY_DURATION,
                        QuizPlaybackController.durationMs
                    )
                    .build()
            )
        }
        mediaSession.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or
                        PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_PLAY_PAUSE or
                        PlaybackState.ACTION_SEEK_TO or
                        PlaybackState.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackState.ACTION_STOP
                )
                .setState(
                    when (playback.phase) {
                        QuizPlaybackPhase.PLAYING -> PlaybackState.STATE_PLAYING
                        QuizPlaybackPhase.BUFFERING -> PlaybackState.STATE_BUFFERING
                        QuizPlaybackPhase.PAUSED -> PlaybackState.STATE_PAUSED
                        QuizPlaybackPhase.ERROR -> PlaybackState.STATE_ERROR
                        QuizPlaybackPhase.STOPPED -> PlaybackState.STATE_STOPPED
                    },
                    QuizPlaybackController.positionMs,
                    if (playing) 1f else 0f
                )
                .apply { playback.error?.let { setErrorMessage(it) } }
                .build()
        )
    }

    // ---------------------------------------------------------------- notification

    private fun createChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.playback_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.playback_channel_description)
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        notificationManager.createNotificationChannel(channel)
    }

    private fun buildNotification(
        playing: Boolean,
        metadata: QuizNowPlaying? = QuizPlaybackController.nowPlaying.value
    ): Notification {
        val toggle = Notification.Action.Builder(
            Icon.createWithResource(
                this,
                if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
            ),
            getString(if (playing) R.string.playback_pause else R.string.playback_play),
            servicePendingIntent(ACTION_TOGGLE)
        ).build()

        val stop = Notification.Action.Builder(
            Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
            getString(R.string.playback_stop),
            servicePendingIntent(ACTION_STOP)
        ).build()

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(metadata?.title ?: getString(R.string.app_name))
            .setContentText(metadata?.subtitle.orEmpty())
            .setContentIntent(openAppIntent())
            .setDeleteIntent(servicePendingIntent(ACTION_STOP))
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(playing)
            .addAction(toggle)
            .addAction(stop)
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0)
            )
            .build()
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this,
        REQUEST_OPEN_APP,
        Intent(this, MainActivity::class.java)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    private fun servicePendingIntent(action: String): PendingIntent = PendingIntent.getService(
        this,
        action.hashCode(),
        Intent(this, QuizPlaybackService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    // ------------------------------------------------------------------- lifecycle

    private fun enterForeground(notification: Notification) {
        if (isForeground) {
            notificationManager.notify(NOTIFICATION_ID, notification)
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        isForeground = true
    }

    @Suppress("DEPRECATION")
    private fun leaveForeground(removeNotification: Boolean) {
        if (!isForeground) {
            if (removeNotification) notificationManager.cancel(NOTIFICATION_ID)
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(if (removeNotification) STOP_FOREGROUND_REMOVE else STOP_FOREGROUND_DETACH)
        } else {
            stopForeground(removeNotification)
        }
        isForeground = false
    }

    private fun teardown() {
        leaveForeground(removeNotification = true)
        abandonFocus()
        stopSelf()
    }

    // ----------------------------------------------------------------- audio focus

    private fun requestFocus() {
        if (holdsFocus) return
        val request = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            // Let the platform duck us for a notification instead of pausing a section
            // mid-phrase; only a real loss stops playback.
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener(focusListener)
            .build()
            .also { focusRequest = it }
        holdsFocus = audioManager.requestAudioFocus(request) ==
            AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private fun abandonFocus() {
        val request = focusRequest
        if (!holdsFocus || request == null) return
        audioManager.abandonAudioFocusRequest(request)
        holdsFocus = false
    }

    companion object {
        private const val CHANNEL_ID = "quiz_section_playback"
        private const val MEDIA_SESSION_TAG = "AcquiringQuizPlayback"
        private const val NOTIFICATION_ID = 1001
        private const val REQUEST_OPEN_APP = 1
        /** Backstop resync, in case a jump ever slips past the drift check. */
        private const val SESSION_RESYNC_NANOS = 10_000_000_000L
        /** How far the session's extrapolated position may drift before it is corrected. */
        private const val POSITION_DRIFT_MS = 400L

        const val ACTION_ATTACH = "com.acquiring.android.playback.ATTACH"
        const val ACTION_PLAY = "com.acquiring.android.playback.PLAY"
        const val ACTION_PAUSE = "com.acquiring.android.playback.PAUSE"
        const val ACTION_TOGGLE = "com.acquiring.android.playback.TOGGLE"
        const val ACTION_STOP = "com.acquiring.android.playback.STOP"

        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, QuizPlaybackService::class.java).setAction(ACTION_ATTACH)
            )
        }

        fun stop(context: Context) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, QuizPlaybackService::class.java).setAction(ACTION_STOP)
            )
        }
    }
}
