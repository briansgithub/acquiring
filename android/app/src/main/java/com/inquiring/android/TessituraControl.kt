package com.inquiring.android

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

private const val CALIBRATION_CAPTURE_MS = 3000
private const val CALIBRATION_SAMPLE_WINDOW_MS = 2000
private const val CALIBRATION_DROPOUT_GRACE_MS = 1000

internal const val TESSITURA_CALIBRATION_CARD_TEST_TAG = "tessitura-calibration-card"
internal const val TESSITURA_CALIBRATION_MODAL_TEST_TAG = "tessitura-calibration-modal"
internal const val TESSITURA_CONTROL_TEST_TAG = "tessitura-control"
internal val QUIZ_HEADER_CONTROL_HEIGHT = 52.dp

internal sealed interface TessituraCalibrationStatus {
    object Idle : TessituraCalibrationStatus
    object AwaitingPermission : TessituraCalibrationStatus
    data class Capturing(
        val remainingMs: Int,
        val hasSignal: Boolean
    ) : TessituraCalibrationStatus
    data class Error(val reason: String) : TessituraCalibrationStatus
}

private sealed interface CalibrationAction {
    object Idle : CalibrationAction
    object AwaitingPermission : CalibrationAction
    data class Capturing(val sessionId: Int) : CalibrationAction
}

/**
 * Hum a note to shift every singing target up/down by octaves so they land in the
 * singer's own tessitura (comfortable vocal range). This only re-aims what the mic
 * listens for; it never changes the pitch/octave the song itself plays back.
 *
 * The control owns its own microphone lease, so starting a calibration supersedes
 * whatever the quiz or the interval singing tool was listening to.
 */
@Composable
internal fun TessituraControl(
    modifier: Modifier = Modifier,
    octaveShift: Int = 0,
    canCalibrate: Boolean = true,
    onCalibrationCaptured: (Double) -> Unit = {},
    onOctaveShiftChange: (Int) -> Unit = {},
    pitchSource: PitchSource = LocalContext.current.applicationContext.let { appContext ->
        remember(appContext) { MicrophonePitchTracker(appContext) }
    },
    recordAudioPermissionOverride: Boolean? = null
) {
    val context = LocalContext.current
    val pitchTracker = pitchSource
    val exclusivePitchTracker = pitchTracker as? ExclusivePitchSource
    val alwaysOwnsMicrophone = remember { mutableStateOf(true) }
    val ownsMicrophone by exclusivePitchTracker?.ownsMicrophone?.collectAsState()
        ?: alwaysOwnsMicrophone

    var calibrationAction by remember { mutableStateOf<CalibrationAction>(CalibrationAction.Idle) }
    var calibrationSessionId by remember { mutableStateOf(0) }
    var calibrationStatus by remember {
        mutableStateOf<TessituraCalibrationStatus>(TessituraCalibrationStatus.Idle)
    }
    val latestCalibrationAction by rememberUpdatedState(calibrationAction)

    fun stopCalibration() {
        calibrationAction = CalibrationAction.Idle
        calibrationStatus = TessituraCalibrationStatus.Idle
        pitchTracker.stop()
    }

    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, pitchTracker) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            when (event) {
                androidx.lifecycle.Lifecycle.Event.ON_PAUSE -> {
                    // Opening Android's runtime-permission sheet pauses the Activity.
                    // Keep that request armed so its result can still start the capture,
                    // while disarming a capture that already owns the microphone.
                    if (latestCalibrationAction is CalibrationAction.Capturing) {
                        calibrationAction = CalibrationAction.Idle
                        calibrationStatus = TessituraCalibrationStatus.Idle
                        pitchTracker.stop()
                    }
                }
                androidx.lifecycle.Lifecycle.Event.ON_STOP -> {
                    // A true background transition follows ON_PAUSE with ON_STOP; unlike
                    // the translucent permission sheet it must also disarm a request that
                    // has not received its permission result yet.
                    calibrationAction = CalibrationAction.Idle
                    calibrationStatus = TessituraCalibrationStatus.Idle
                    pitchTracker.stop()
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(canCalibrate) {
        if (!canCalibrate && calibrationAction !is CalibrationAction.Idle) {
            calibrationAction = CalibrationAction.Idle
            calibrationStatus = TessituraCalibrationStatus.Idle
            pitchTracker.stop()
        }
    }

    LaunchedEffect(ownsMicrophone) {
        if (!ownsMicrophone && calibrationAction is CalibrationAction.Capturing) {
            // Another microphone feature took the shared tracker. Clear only our own
            // logical action; this lease is intentionally unable to stop the new owner.
            calibrationAction = CalibrationAction.Idle
            calibrationStatus = TessituraCalibrationStatus.Idle
        }
    }

    fun beginCapture() {
        calibrationSessionId++
        calibrationStatus = TessituraCalibrationStatus.Capturing(
            remainingMs = CALIBRATION_CAPTURE_MS,
            hasSignal = false
        )
        calibrationAction = CalibrationAction.Capturing(calibrationSessionId)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (calibrationAction is CalibrationAction.AwaitingPermission) {
            if (isGranted) {
                beginCapture()
            } else {
                calibrationAction = CalibrationAction.Idle
                pitchTracker.stop()
                calibrationStatus =
                    TessituraCalibrationStatus.Error("Microphone permission denied")
            }
        }
    }

    fun requestCalibration() {
        if (!canCalibrate) return
        // Stop any earlier calibration, then reserve exclusive access. Reserving before
        // the permission sheet also supersedes the other microphone features immediately
        // while allowing the pending permission request to survive ON_PAUSE.
        pitchTracker.stop()
        exclusivePitchTracker?.claim()
        val hasPermission = recordAudioPermissionOverride
            ?: (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED)
        if (hasPermission) {
            beginCapture()
        } else {
            calibrationAction = CalibrationAction.AwaitingPermission
            calibrationStatus = TessituraCalibrationStatus.AwaitingPermission
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    LaunchedEffect(calibrationAction) {
        val action = calibrationAction
        if (action !is CalibrationAction.Capturing) return@LaunchedEffect
        try {
            val capture = ComfortablePitchCapture(
                captureMs = CALIBRATION_CAPTURE_MS,
                sampleWindowMs = CALIBRATION_SAMPLE_WINDOW_MS,
                dropoutGraceMs = CALIBRATION_DROPOUT_GRACE_MS
            )
            var lastTick = System.currentTimeMillis()
            pitchTracker.start(60)

            while (
                !capture.progress().isComplete &&
                calibrationAction == action &&
                currentCoroutineContext().isActive
            ) {
                val now = System.currentTimeMillis()
                val delta = (now - lastTick).toInt().coerceAtLeast(0)
                lastTick = now
                when (val currentPitch = pitchTracker.pitchFlow.value) {
                    is MicrophonePitchTracker.PitchResult.Estimate -> {
                        // A held reading is the previous live frame surviving a dropout.
                        // Observing it again would let a pause read as a rock-steady hum.
                        capture.observe(delta, currentPitch.midi.takeIf { !currentPitch.isHeld })
                    }
                    is MicrophonePitchTracker.PitchResult.Error -> {
                        calibrationStatus =
                            TessituraCalibrationStatus.Error(currentPitch.message)
                        calibrationAction = CalibrationAction.Idle
                    }
                    MicrophonePitchTracker.PitchResult.NoSignal -> {
                        capture.observe(delta, null)
                    }
                }

                if (calibrationAction == action) {
                    val progress = capture.progress()
                    calibrationStatus = TessituraCalibrationStatus.Capturing(
                        remainingMs = progress.remainingMs,
                        hasSignal = progress.hasSignal
                    )
                    if (!progress.isComplete) delay(30)
                }
            }

            val comfortableMidi = capture.averageMidiOrNull()
            if (calibrationAction == action && comfortableMidi != null) {
                onCalibrationCaptured(comfortableMidi)
                calibrationStatus = TessituraCalibrationStatus.Idle
                calibrationAction = CalibrationAction.Idle
            }
        } finally {
            pitchTracker.stop()
        }
    }

    Row(
        modifier = modifier
            .height(QUIZ_HEADER_CONTROL_HEIGHT)
            .testTag(TESSITURA_CONTROL_TEST_TAG),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            onClick = { requestCalibration() },
            enabled = canCalibrate,
            shape = RoundedCornerShape(50),
            color = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            modifier = Modifier
                .fillMaxHeight()
                .semantics {
                    contentDescription = "Match target pitch to your comfortable singing tessitura. Hum a note to calibrate. Song and source-object playback are unaffected; target previews follow this setting."
                }
        ) {
            Row(
                modifier = Modifier
                    .fillMaxHeight()
                    .padding(horizontal = 10.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("🎤", fontSize = 14.sp)
                Spacer(modifier = Modifier.width(4.dp))
                Column(horizontalAlignment = Alignment.Start) {
                    Text("Set Tessitura", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                    Text("Singing octave", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        Spacer(modifier = Modifier.width(6.dp))
        val octaveShiftText = if (octaveShift > 0) "+$octaveShift" else "$octaveShift"
        Column(
            modifier = Modifier.fillMaxHeight(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                Icons.Default.KeyboardArrowUp,
                contentDescription = "Raise tessitura shift by one octave",
                modifier = Modifier
                    .size(16.dp)
                    .clickable(enabled = octaveShift < 4) { onOctaveShiftChange(octaveShift + 1) },
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (octaveShift < 4) 1f else 0.3f)
            )
            Text(
                text = octaveShiftText,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription = "Tessitura shifted $octaveShift octaves from the song's actual pitch"
                }
            )
            Icon(
                Icons.Default.KeyboardArrowDown,
                contentDescription = "Lower tessitura shift by one octave",
                modifier = Modifier
                    .size(16.dp)
                    .clickable(enabled = octaveShift > -4) { onOctaveShiftChange(octaveShift - 1) },
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (octaveShift > -4) 1f else 0.3f)
            )
        }
    }

    if (calibrationStatus !is TessituraCalibrationStatus.Idle) {
        TessituraCalibrationDialog(
            status = calibrationStatus,
            onRetry = { requestCalibration() },
            onCancel = { stopCalibration() }
        )
    }
}

@Composable
private fun TessituraCalibrationDialog(
    status: TessituraCalibrationStatus,
    onRetry: () -> Unit,
    onCancel: () -> Unit
) {
    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(
            dismissOnBackPress = false,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.38f))
                .testTag(TESSITURA_CALIBRATION_MODAL_TEST_TAG)
        ) {
            when (status) {
                TessituraCalibrationStatus.Idle -> Unit
                TessituraCalibrationStatus.AwaitingPermission -> {
                    TessituraCalibrationCard(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 20.dp),
                        message = "Microphone permission is needed to capture a comfortable pitch.",
                        detail = "Waiting for permission…",
                        onCancel = onCancel
                    )
                }
                is TessituraCalibrationStatus.Capturing -> {
                    TessituraCalibrationCard(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 20.dp),
                        message = "Hum one comfortable pitch",
                        detail = if (status.hasSignal) {
                            "Capturing… ${"%.1f".format(status.remainingMs / 1000f)}s"
                        } else {
                            "Waiting for signal…"
                        },
                        onCancel = onCancel
                    )
                }
                is TessituraCalibrationStatus.Error -> {
                    TessituraCalibrationCard(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 20.dp),
                        message = status.reason,
                        detail = "Your previous tessitura setting is unchanged.",
                        onRetry = onRetry,
                        onCancel = onCancel
                    )
                }
            }
        }
    }
}

@Composable
private fun TessituraCalibrationCard(
    modifier: Modifier = Modifier,
    message: String,
    detail: String,
    onRetry: (() -> Unit)? = null,
    onCancel: () -> Unit
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .testTag(TESSITURA_CALIBRATION_CARD_TEST_TAG),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                textAlign = TextAlign.Center
            )
            Row(horizontalArrangement = Arrangement.Center) {
                if (onRetry != null) {
                    TextButton(onClick = onRetry) { Text("Retry") }
                }
                TextButton(onClick = onCancel) { Text("Cancel") }
            }
        }
    }
}
