package com.sacredring.android

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

data class AudiationTarget(
    val id: Int,
    val label: String,
    val untransposedMidi: Int,
    val transposedMidi: Int,
    var bounds: Rect = Rect.Zero
)

sealed class AudiationState {
    object Idle : AudiationState()
    data class Dragging(val offset: Offset, val hoveredId: Int?) : AudiationState()
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
    initialOffset: Offset = Offset.Zero,
    pitchSource: PitchSource = remember { MicrophonePitchTracker() },
    content: @Composable (AudiationState, (Int, LayoutCoordinates) -> Unit) -> Unit
) {
    var state by remember { mutableStateOf<AudiationState>(AudiationState.Idle) }
    var puckOffset by remember { mutableStateOf(initialOffset) }
    var containerOffsetInRoot by remember { mutableStateOf(Offset.Zero) }
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
            if (event == androidx.lifecycle.Lifecycle.Event.ON_PAUSE) {
                pitchSource.stop()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Disarm if the target is no longer valid (e.g. chord changed)
    LaunchedEffect(targets) {
        val s = state
        if (s is AudiationState.Listening) {
            val stillExists = targets.any { 
                it.untransposedMidi == s.target.untransposedMidi && it.label == s.target.label 
            }
            if (!stillExists) {
                stopListening()
            }
        }
    }

    Box(modifier = modifier
        .fillMaxSize()
        .onGloballyPositioned { containerOffsetInRoot = it.positionInRoot() }
    ) {
        content(state) { id, coords ->
            targets.find { it.id == id }?.let { target ->
                // Store bounds relative to the container
                val rootBounds = coords.boundsInRoot()
                target.bounds = rootBounds.translate(-containerOffsetInRoot)
            }
        }

        // Draggable Puck (Magnifying Glass)
        val puckSize = 48.dp
        val halfPuck = 24.dp
        Box(
            modifier = Modifier
                .offset {
                    val s = state
                    if (s is AudiationState.Listening) {
                        val target = s.target
                        val center = target.bounds.center
                        // Centering the lens on the target
                        IntOffset(
                            (center.x - halfPuck.toPx()).roundToInt(),
                            (center.y - halfPuck.toPx()).roundToInt()
                        )
                    } else {
                        IntOffset(puckOffset.x.roundToInt(), puckOffset.y.roundToInt())
                    }
                }
                .size(puckSize)
                .pointerInput(targets) {
                    detectTapGestures(
                        onDoubleTap = {
                            state = AudiationState.Calibrating(3000, MicrophonePitchTracker.PitchResult.NoSignal)
                        }
                    )
                }
                .pointerInput(targets) {
                    detectDragGestures(
                        onDragStart = {
                            if (state is AudiationState.Idle || state is AudiationState.Listening || state is AudiationState.Error) {
                                val s = state
                                if (s is AudiationState.Listening) {
                                    puckOffset = s.target.bounds.center - Offset(halfPuck.toPx(), halfPuck.toPx())
                                }
                                pitchSource.stop()
                                state = AudiationState.Dragging(puckOffset, null)
                            }
                        },
                        onDrag = { change, dragAmount ->
                            change.consume()
                            puckOffset += dragAmount
                            val puckCenter = puckOffset + Offset(halfPuck.toPx(), halfPuck.toPx())
                            val hovered = targets.find { it.bounds.contains(puckCenter) }
                            state = AudiationState.Dragging(puckOffset, hovered?.id)
                        },
                        onDragEnd = {
                            val puckCenter = puckOffset + Offset(halfPuck.toPx(), halfPuck.toPx())
                            val target = targets.find { it.bounds.contains(puckCenter) }
                            if (target != null) {
                                startListening(target)
                            } else {
                                stopListening()
                            }
                        },
                        onDragCancel = { stopListening() }
                    )
                }
                .semantics {
                    contentDescription = when (val s = state) {
                        is AudiationState.Listening -> "Listening to ${s.target.label}"
                        is AudiationState.Dragging -> "Dragging practice puck"
                        else -> "Practice puck"
                    }
                },
            contentAlignment = Alignment.Center
        ) {
            val bodyColor = (if (state is AudiationState.Listening)
                MaterialTheme.colorScheme.primary
            else
                MaterialTheme.colorScheme.secondary).copy(alpha = 0.6f)
            val outlineColor = MaterialTheme.colorScheme.outline

            Canvas(modifier = Modifier.fillMaxSize()) {
                val canvasCenter = Offset(size.width / 2, size.height / 2)
                val rimRadius = 14.dp.toPx()

                // Magnifying glass handle at 45 degrees
                // cos(45) = sin(45) = 0.7071
                val cos45 = 0.7071f
                val handleStart = canvasCenter + Offset(rimRadius * cos45, rimRadius * cos45)
                val handleEnd = canvasCenter + Offset(halfPuck.toPx() * 0.95f * cos45, halfPuck.toPx() * 0.95f * cos45)

                drawLine(
                    color = bodyColor,
                    start = handleStart,
                    end = handleEnd,
                    strokeWidth = 6.dp.toPx(),
                    cap = StrokeCap.Round
                )
                drawLine(
                    color = outlineColor,
                    start = handleStart,
                    end = handleEnd,
                    strokeWidth = 1.dp.toPx(),
                    cap = StrokeCap.Round
                )

                // Rim (Translucent body)
                drawCircle(
                    color = bodyColor,
                    radius = rimRadius,
                    center = canvasCenter,
                    style = Stroke(width = 4.dp.toPx())
                )

                // Rim outlines
                drawCircle(
                    color = outlineColor,
                    radius = rimRadius + 2.dp.toPx(),
                    center = canvasCenter,
                    style = Stroke(width = 1.dp.toPx())
                )
                drawCircle(
                    color = outlineColor,
                    radius = rimRadius - 2.dp.toPx(),
                    center = canvasCenter,
                    style = Stroke(width = 1.dp.toPx())
                )

                // Small center crosshair for precision
                val crossSize = 3.dp.toPx()
                drawLine(
                    color = outlineColor.copy(alpha = 0.7f),
                    start = canvasCenter - Offset(crossSize, 0f),
                    end = canvasCenter + Offset(crossSize, 0f),
                    strokeWidth = 1.dp.toPx()
                )
                drawLine(
                    color = outlineColor.copy(alpha = 0.7f),
                    start = canvasCenter - Offset(0f, crossSize),
                    end = canvasCenter + Offset(0f, crossSize),
                    strokeWidth = 1.dp.toPx()
                )
            }
        }
        
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
                // Allow error beyond 200 cents for pinning behavior
                val normalized = (pitchResult.centsError / 200.0).coerceIn(-1.2, 1.2)
                val barY = centerY - normalized.toFloat() * usableHalfHeight
                
                // Main moving pitch bar
                drawRect(
                    color = Color.White,
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
                    drawPath(path, Color.Red)
                } else if (pitchResult.centsError <= -200) {
                    val arrowSize = 10.dp.toPx()
                    val path = androidx.compose.ui.graphics.Path().apply {
                        moveTo(size.width / 2f - arrowSize, size.height - arrowSize)
                        lineTo(size.width / 2f, size.height)
                        lineTo(size.width / 2f + arrowSize, size.height - arrowSize)
                        close()
                    }
                    drawPath(path, Color.Red)
                }
            }
        }
        
        if (pitchResult is MicrophonePitchTracker.PitchResult.Estimate) {
            val cents = pitchResult.centsError.roundToInt()
            
            Text(
                text = "${if (cents > 0) "+" else ""}$cents¢",
                color = Color.White,
                fontSize = 12.sp,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(4.dp)
                    .background(Color.Black.copy(alpha = 0.5f), CircleShape)
                    .padding(horizontal = 4.dp)
            )
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


