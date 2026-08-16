package com.inquiring.android

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

data class AudiationTarget(
    val id: Int,
    val label: String,
    val untransposedMidi: Int,
    val transposedMidi: Int
)

sealed class AudiationState {
    object Idle : AudiationState()
    data class AwaitingPermission(val target: AudiationTarget) : AudiationState()
    data class Listening(val target: AudiationTarget, val pitch: MicrophonePitchTracker.PitchResult) : AudiationState()
    data class Calibrating(val remainingMs: Int, val pitch: MicrophonePitchTracker.PitchResult) : AudiationState()
    data class Error(val target: AudiationTarget?, val reason: String) : AudiationState()
}

@Composable
fun AudiationPitchPracticeContainer(
    modifier: Modifier = Modifier,
    targets: List<AudiationTarget>,
    onTargetSelected: (AudiationTarget) -> Unit,
    onSessionCanceled: () -> Unit,
    onCalibrated: (Double) -> Unit = {},
    pitchSource: PitchSource = LocalContext.current.applicationContext.let { appContext ->
        remember(appContext) { MicrophonePitchTracker(appContext) }
    },
    content: @Composable (
        AudiationState,
        (AudiationTarget) -> Unit,
        () -> Unit,
        (Int, LayoutCoordinates) -> Unit
    ) -> Unit
) {
    var state by remember { mutableStateOf<AudiationState>(AudiationState.Idle) }
    var containerOffsetInRoot by remember { mutableStateOf(Offset.Zero) }
    val targetBounds = remember { mutableStateMapOf<Int, Rect>() }
    val context = LocalContext.current

    val pitchResult by pitchSource.pitchFlow.collectAsState()

    // Calibration logic
    val calibrationPitches = remember { mutableListOf<Double>() }
    // Use a derived key so the effect doesn't restart when timer/pitch data updates
    val isCalibrating = state is AudiationState.Calibrating
    LaunchedEffect(isCalibrating) {
        if (isCalibrating) {
            calibrationPitches.clear()
            var remainingMs = 3000
            var lastTick = System.currentTimeMillis()
            var dropoutGraceMs = 0
            pitchSource.start(60) // Start tracker
            
            while (remainingMs > 0) {
                val now = System.currentTimeMillis()
                val delta = (now - lastTick).toInt()
                lastTick = now

                // Read latest directly from flow to avoid Compose state observation issues in loop
                val currentPitch = pitchSource.pitchFlow.value

                if (currentPitch is MicrophonePitchTracker.PitchResult.Estimate) {
                    dropoutGraceMs = 1000 // 1s grace
                    remainingMs -= delta
                    // Take average from 2s to 0s
                    if (remainingMs <= 2000) {
                        calibrationPitches.add(currentPitch.midi)
                    }
                } else {
                    if (remainingMs < 3000) { // Countdown has started
                        if (dropoutGraceMs > 0) {
                            dropoutGraceMs -= delta
                        } else {
                            // Reset
                            remainingMs = 3000
                            calibrationPitches.clear()
                        }
                    }
                }

                state = AudiationState.Calibrating(remainingMs.coerceAtLeast(0), currentPitch)
                kotlinx.coroutines.delay(30)
                
                // If state was changed to Idle/Error externally, stop
                if (state !is AudiationState.Calibrating) break
            }
            
            if (calibrationPitches.isNotEmpty() && state is AudiationState.Calibrating) {
                onCalibrated(calibrationPitches.average())
            }
            if (state is AudiationState.Calibrating) {
                state = AudiationState.Idle
            }
            pitchSource.stop()
        }
    }

    // Sync tracker result to state
    LaunchedEffect(pitchResult, state) {
        val s = state
        if (s is AudiationState.Listening) {
            state = s.copy(pitch = pitchResult)
            if (pitchResult is MicrophonePitchTracker.PitchResult.Error) {
                state = AudiationState.Error(s.target, (pitchResult as MicrophonePitchTracker.PitchResult.Error).message)
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        val s = state
        if (isGranted) {
            if (s is AudiationState.AwaitingPermission) {
                state = AudiationState.Listening(s.target, MicrophonePitchTracker.PitchResult.NoSignal)
                pitchSource.start(s.target.transposedMidi)
            }
        } else {
            if (s is AudiationState.AwaitingPermission) {
                state = AudiationState.Error(s.target, "Microphone permission denied")
            }
        }
    }

    fun startListening(target: AudiationTarget) {
        onTargetSelected(target)
        val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
            context, Manifest.permission.RECORD_AUDIO
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

        if (hasPermission) {
            state = AudiationState.Listening(target, MicrophonePitchTracker.PitchResult.NoSignal)
            pitchSource.start(target.transposedMidi)
        } else {
            state = AudiationState.AwaitingPermission(target)
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun stopListening() {
        state = AudiationState.Idle
        pitchSource.stop()
        onSessionCanceled()
    }

    DisposableEffect(pitchSource) {
        onDispose {
            pitchSource.release()
        }
    }

    // Disarm on lifecycle changes or when app backgrounded
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, pitchSource) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            when (event) {
                androidx.lifecycle.Lifecycle.Event.ON_PAUSE -> pitchSource.stop()
                // Coming back to a target that is still selected should start listening
                // again — otherwise the gauge stays visible but permanently dead.
                androidx.lifecycle.Lifecycle.Event.ON_RESUME -> {
                    val s = state
                    if (s is AudiationState.Listening) pitchSource.start(s.target.transposedMidi)
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Disarm if the target is no longer valid (e.g. chord changed)
    // OR update the target if its transposition changed
    LaunchedEffect(targets) {
        val s = state
        if (s is AudiationState.Listening) {
            val updatedTarget = targets.find { 
                it.untransposedMidi == s.target.untransposedMidi && it.label == s.target.label 
            }
            if (updatedTarget == null) {
                stopListening()
            } else if (updatedTarget.transposedMidi != s.target.transposedMidi) {
                // Transposition changed, update target in state and restart tracker with new pitch
                state = AudiationState.Listening(updatedTarget, s.pitch)
                pitchSource.start(updatedTarget.transposedMidi)
            }
        }
    }

    Box(modifier = modifier
        .fillMaxSize()
        .onGloballyPositioned { containerOffsetInRoot = it.positionInRoot() }
        .pointerInput(Unit) {
            // Observe every touch-down without consuming it, so a tap that lands
            // outside the currently-listened-to target's bounds stops the mic
            // session while still letting the tapped element handle its own click.
            awaitEachGesture {
                val down = awaitFirstDown(pass = PointerEventPass.Initial, requireUnconsumed = false)
                val s = state
                if (s is AudiationState.Listening) {
                    val activeBounds = targetBounds[s.target.id]
                    if (activeBounds == null || !activeBounds.contains(down.position)) {
                        stopListening()
                    }
                }
            }
        }
    ) {
        content(
            state,
            { target ->
                val s = state
                if (s is AudiationState.Listening && s.target.id == target.id) {
                    // Double-tapping the object that's already singing back toggles it off.
                    stopListening()
                } else {
                    startListening(target)
                }
            },
            { state = AudiationState.Calibrating(3000, MicrophonePitchTracker.PitchResult.NoSignal) },
            { id, coords -> targetBounds[id] = coords.boundsInRoot().translate(-containerOffsetInRoot) }
        )

        // Error Message
        if (state is AudiationState.Error) {
            val s = state as AudiationState.Error
            Card(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
            ) {
                Column(modifier = Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = s.reason, color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { stopListening() }) {
                        Text("Dismiss", color = MaterialTheme.colorScheme.onErrorContainer)
                    }
                }
            }
        }

        // Calibration Popup
        if (state is AudiationState.Calibrating) {
            val s = state as AudiationState.Calibrating
            Card(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Calibrating: Hum a comfortable pitch...",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "${(s.remainingMs / 1000f).format(1)}s remaining",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.primary
                    )
                    
                    if (s.remainingMs < 3000) {
                        Text(
                            text = "Calibrating...",
                            color = Color.Green,
                            style = MaterialTheme.typography.labelSmall
                        )
                    } else {
                        Text(
                            text = "Waiting for signal...",
                            color = MaterialTheme.colorScheme.secondary,
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }
        }
    }
}

private fun Float.format(digits: Int) = "%.${digits}f".format(this)

internal fun pitchFeedbackColor(centsError: Double): Color {
    val absoluteCents = Math.abs(centsError)
    return when {
        absoluteCents < 15 -> Color(0xFF4CAF50) // Green
        absoluteCents < 50 -> Color(0xFFFFEB3B) // Yellow
        else -> Color(0xFFF44336) // Red
    }
}

internal fun formatPitchCentsError(centsError: Double): String {
    val roundedCents = centsError.roundToInt()
    return "${if (roundedCents > 0) "+" else ""}$roundedCents¢"
}

@Composable
fun PitchGauge(
    modifier: Modifier = Modifier,
    pitchResult: MicrophonePitchTracker.PitchResult,
    targetLabel: String
) {
    Box(modifier = modifier.background(Color.Black.copy(alpha = 0.1f))) {
        Canvas(modifier = Modifier.fillMaxSize().semantics {
            contentDescription = when (pitchResult) {
                is MicrophonePitchTracker.PitchResult.Estimate -> {
                    val cents = pitchResult.centsError.roundToInt()
                    "Pitch estimate for $targetLabel: $cents cents ${if (cents > 0) "sharp" else "flat"}"
                }
                else -> "Pitch gauge for $targetLabel, no signal"
            }
        }) {
            val centerY = size.height / 2f
            val halfHeight = size.height / 2f
            val barThickness = 8.dp.toPx()
            val usableHalfHeight = halfHeight - barThickness / 2f

            // Faint horizontal center reference
            drawLine(
                color = Color.White.copy(alpha = 0.5f),
                start = Offset(0f, centerY),
                end = Offset(size.width, centerY),
                strokeWidth = 1.dp.toPx()
            )

            if (pitchResult is MicrophonePitchTracker.PitchResult.Estimate) {
                val gaugeColor = pitchFeedbackColor(pitchResult.centsError)
                // Allow error beyond 200 cents for pinning behavior
                val normalized = (pitchResult.centsError / 200.0).coerceIn(-1.2, 1.2)
                val barY = centerY - normalized.toFloat() * usableHalfHeight
                
                // Main moving pitch bar
                drawRect(
                    color = gaugeColor,
                    topLeft = Offset(0f, barY - barThickness / 2f),
                    size = Size(size.width, barThickness)
                )

                // Visual arrows when pinned to edges
                if (pitchResult.centsError >= 200) {
                    val arrowSize = 10.dp.toPx()
                    val path = androidx.compose.ui.graphics.Path().apply {
                        moveTo(size.width / 2f - arrowSize, arrowSize)
                        lineTo(size.width / 2f, 0f)
                        lineTo(size.width / 2f + arrowSize, arrowSize)
                        close()
                    }
                    drawPath(path, gaugeColor)
                } else if (pitchResult.centsError <= -200) {
                    val arrowSize = 10.dp.toPx()
                    val path = androidx.compose.ui.graphics.Path().apply {
                        moveTo(size.width / 2f - arrowSize, size.height - arrowSize)
                        lineTo(size.width / 2f, size.height)
                        lineTo(size.width / 2f + arrowSize, size.height - arrowSize)
                        close()
                    }
                    drawPath(path, gaugeColor)
                }
            }
        }
        
        if (pitchResult is MicrophonePitchTracker.PitchResult.Estimate) {
            // Same statistic, cadence and pin-suppression as the melody timeline percentage,
            // so the card and the timeline can never disagree about how far off the singer is.
            val sampledCentsError = rememberSampledPitchErrorCents(pitchResult.centsError)

            sampledCentsError
                ?.takeIf(::showsLivePitchErrorPercentage)
                ?.let { centsError ->
                    Text(
                        text = formatPitchErrorPercentage(centsError),
                        color = pitchFeedbackColor(centsError),
                        fontSize = 12.sp,
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(4.dp)
                            .background(Color.Black.copy(alpha = 0.5f), CircleShape)
                            .padding(horizontal = 4.dp)
                    )
                }
        } else {
            Text(
                text = "Hum a steady note...",
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 10.sp,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 4.dp)
            )
        }
    }
}


