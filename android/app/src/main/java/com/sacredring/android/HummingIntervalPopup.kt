package com.sacredring.android

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.ui.text.ExperimentalTextApi::class)
@Composable
internal fun HummingIntervalPopup(
    modifier: Modifier = Modifier
) {
    var isExpanded by remember { mutableStateOf(false) }
    var slot1 by remember { mutableStateOf<PitchData?>(null) }
    var slot2 by remember { mutableStateOf<PitchData?>(null) }
    
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pitchTracker = remember { MicrophonePitchTracker() }
    
    DisposableEffect(pitchTracker) {
        onDispose {
            pitchTracker.release()
        }
    }
    
    val pitchResult by pitchTracker.pitchFlow.collectAsState()
    
    var recordingSlot by remember { mutableStateOf<Int?>(null) }
    var recordingTimeRemaining by remember { mutableStateOf(0) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted && recordingSlot != null) {
            // Permission granted, start recording for the pending slot
            val slotId = recordingSlot!!
            recordingSlot = null // Reset so startRecording can trigger properly
            startRecording(slotId, pitchTracker, scope, onUpdate = { recordingSlot = it }, onTimeUpdate = { recordingTimeRemaining = it }, onFinished = { id, estimate ->
                if (estimate != null) {
                    val nearestMidi = estimate.midi.roundToInt()
                    val centsFromNearest = (estimate.midi - nearestMidi) * 100
                    val spelled = if (id == 2 && slot1 != null) {
                        SpelledPitch.spellRelative(slot1!!.pitch, nearestMidi)
                    } else {
                        SpelledPitch.fromMidi(nearestMidi)
                    }
                    val data = PitchData(spelled, centsFromNearest, estimate.midi)
                    if (id == 1) slot1 = data else slot2 = data
                }
            })
        } else {
            recordingSlot = null
        }
    }

    // Handle real-time updates for the active recording slot
    LaunchedEffect(pitchResult, recordingSlot) {
        if (recordingSlot != null && pitchResult is MicrophonePitchTracker.PitchResult.Estimate) {
            val estimate = pitchResult as MicrophonePitchTracker.PitchResult.Estimate
            val nearestMidi = estimate.midi.roundToInt()
            val centsFromNearest = (estimate.midi - nearestMidi) * 100
            val spelled = if (recordingSlot == 2 && slot1 != null) {
                SpelledPitch.spellRelative(slot1!!.pitch, nearestMidi)
            } else {
                SpelledPitch.fromMidi(nearestMidi)
            }
            val data = PitchData(
                pitch = spelled,
                cents = centsFromNearest,
                rawMidi = estimate.midi
            )
            if (recordingSlot == 1) slot1 = data else slot2 = data
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.95f))
            .clickable { if (!isExpanded) isExpanded = true }
            .padding(8.dp)
    ) {
        // Handle/Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(32.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isExpanded) {
                IconButton(onClick = { isExpanded = false }) {
                    Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Collapse")
                }
            } else {
                Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Expand Humming Tool")
                Text("Humming Interval Tool", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 8.dp))
            }
        }

        AnimatedVisibility(
            visible = isExpanded,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Slot 1
                HummingSlotView(
                    label = "Pitch 1",
                    data = slot1,
                    isRecording = recordingSlot == 1,
                    recordingTimeRemaining = if (recordingSlot == 1) recordingTimeRemaining else 0,
                    onSingleClick = {
                        slot1?.let {
                            scope.launch {
                                AudioEngine.playChord(
                                    listOf(it.rawMidi.roundToInt()),
                                    durationMs = 1000,
                                    channel = AudioEngine.PlaybackChannel.PREVIEW
                                )
                            }
                        }
                    },
                    onDoubleClick = {
                        if (slot1 != null) {
                            slot1 = null
                            slot2 = null
                            return@HummingSlotView
                        }
                        val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                        if (hasPermission) {
                            startRecording(1, pitchTracker, scope, onUpdate = { recordingSlot = it }, onTimeUpdate = { recordingTimeRemaining = it }, onFinished = { id, estimate ->
                                if (estimate != null) {
                                    val nearestMidi = estimate.midi.roundToInt()
                                    val centsFromNearest = (estimate.midi - nearestMidi) * 100
                                    val spelled = SpelledPitch.fromMidi(nearestMidi)
                                    val data = PitchData(spelled, centsFromNearest, estimate.midi)
                                    if (id == 1) slot1 = data
                                }
                            })
                        } else {
                            recordingSlot = 1
                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                )

                // Slot 2
                HummingSlotView(
                    label = "Pitch 2",
                    data = slot2,
                    isRecording = recordingSlot == 2,
                    recordingTimeRemaining = if (recordingSlot == 2) recordingTimeRemaining else 0,
                    onSingleClick = {
                        slot2?.let {
                            scope.launch {
                                AudioEngine.playChord(
                                    listOf(it.rawMidi.roundToInt()),
                                    durationMs = 1000,
                                    channel = AudioEngine.PlaybackChannel.PREVIEW
                                )
                            }
                        }
                    },
                    onDoubleClick = {
                        if (slot2 != null) {
                            slot2 = null
                            return@HummingSlotView
                        }
                        val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                        if (hasPermission) {
                            startRecording(2, pitchTracker, scope, onUpdate = { recordingSlot = it }, onTimeUpdate = { recordingTimeRemaining = it }, onFinished = { id, estimate ->
                                if (estimate != null) {
                                    val nearestMidi = estimate.midi.roundToInt()
                                    val centsFromNearest = (estimate.midi - nearestMidi) * 100
                                    val spelled = if (slot1 != null) {
                                        SpelledPitch.spellRelative(slot1!!.pitch, nearestMidi)
                                    } else {
                                        SpelledPitch.fromMidi(nearestMidi)
                                    }
                                    val data = PitchData(spelled, centsFromNearest, estimate.midi)
                                    if (id == 2) slot2 = data
                                }
                            })
                        } else {
                            recordingSlot = 2
                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                )

                // Result Slot
                val interval = if (slot1 != null && slot2 != null) {
                    calculateMeasuredInterval(slot1!!.rawMidi, slot2!!.rawMidi)
                } else null

                val intervalCentsDeviation = interval?.centsDeviation

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .height(120.dp)
                        .padding(4.dp)
                        .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(8.dp))
                        .clickable(enabled = slot1 != null && slot2 != null) {
                            val s1 = slot1
                            val s2 = slot2
                            if (s1 != null && s2 != null) {
                                scope.launch {
                                    val note1 = s1.pitch.chromaticPosition + 12
                                    val note2 = s2.pitch.chromaticPosition + 12
                                    AudioEngine.playChord(listOf(note1), durationMs = 450, channel = AudioEngine.PlaybackChannel.PREVIEW)
                                    delay(450)
                                    AudioEngine.playChord(listOf(note2), durationMs = 450, channel = AudioEngine.PlaybackChannel.PREVIEW)
                                    delay(450)
                                    AudioEngine.playChord(listOf(note1, note2), durationMs = 1000, channel = AudioEngine.PlaybackChannel.PREVIEW)
                                }
                            }
                        }
                        .padding(8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text("Interval", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(8.dp))
                    if (interval != null) {
                        Text(
                            text = interval.shorthand,
                            style = MaterialTheme.typography.headlineMedium,
                            color = MaterialTheme.colorScheme.primary,
                            textAlign = TextAlign.Center
                        )
                        if (intervalCentsDeviation != null) {
                            val cents = intervalCentsDeviation.roundToInt()
                            val sign = if (cents >= 0) "+" else ""
                            Text(
                                text = "$sign${cents}¢",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (kotlin.math.abs(cents) < 15) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        Text("—", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f))
                    }
                }
            }
        }
    }
}

internal data class PitchData(
    val pitch: SpelledPitch,
    val cents: Double,
    val rawMidi: Double
)

@Composable
internal fun RowScope.HummingSlotView(
    label: String,
    data: PitchData?,
    isRecording: Boolean,
    recordingTimeRemaining: Int,
    onSingleClick: () -> Unit,
    onDoubleClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .weight(1f)
            .height(120.dp)
            .padding(4.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (isRecording) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
            .pointerInput(isRecording) {
                if (!isRecording) {
                    detectTapGestures(
                        onTap = { onSingleClick() },
                        onDoubleTap = { onDoubleClick() }
                    )
                }
            }
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        
        val centsValue = data?.cents ?: 0.0
        val gaugeColor = getPitchColor(centsValue)

        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            if (isRecording || data != null) {
                PitchRollingIndicator(
                    midi = data?.rawMidi ?: 60.0,
                    isRecording = isRecording,
                    cents = centsValue
                )
                
                if (data != null) {
                    val cents = centsValue.roundToInt()
                    val sign = if (cents >= 0) "+" else ""
                    Text(
                        text = "$sign${cents}¢",
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(4.dp)
                            .background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 4.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isRecording) Color.White else gaugeColor
                    )
                }
            } else {
                Text("Double tap\nto record", fontSize = 10.sp, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
            }
            
            if (isRecording) {
                Text(
                    text = "${(recordingTimeRemaining / 1000f).roundToInt()}s",
                    modifier = Modifier.align(Alignment.TopEnd),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

    }
}

private fun getPitchColor(cents: Double): Color {
    val absCents = kotlin.math.abs(cents)
    return when {
        absCents < 15 -> Color(0xFF4CAF50) // Green
        absCents < 50 -> Color(0xFFFFEB3B) // Yellow
        else -> Color(0xFFF44336) // Red
    }
}

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
@Composable
internal fun PitchRollingIndicator(
    midi: Double,
    isRecording: Boolean,
    cents: Double,
    modifier: Modifier = Modifier
) {
    val animatedMidi by animateFloatAsState(targetValue = midi.toFloat(), label = "MidiAnimation")
    val textMeasurer = rememberTextMeasurer()
    val noteStyle = TextStyle(fontSize = 12.sp, color = Color.White.copy(alpha = 0.7f), textAlign = TextAlign.Center)
    val centerNoteStyle = TextStyle(fontSize = 14.sp, color = Color.White, textAlign = TextAlign.Center)
    val barColor = getPitchColor(cents)

    Canvas(modifier = modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        val centerY = size.height / 2f
        clipRect {
            val noteHeight = 24.dp.toPx()
            
            // Draw the "tape"
            val startMidi = (animatedMidi - 5).toInt()
            val endMidi = (animatedMidi + 5).toInt()
            
            for (m in startMidi..endMidi) {
                val offsetFromCenter = (m - animatedMidi) * noteHeight
                val y = centerY - offsetFromCenter
                
                if (y > -noteHeight && y < size.height + noteHeight) {
                    val spelled = SpelledPitch.fromMidi(m)
                    val label = spelled.displayName.replace(Regex("\\d+"), "")
                    
                    val style = if (Math.abs(m - animatedMidi) < 0.5) centerNoteStyle else noteStyle
                    val measured = textMeasurer.measure(label, style)
                    
                    drawText(
                        textLayoutResult = measured,
                        topLeft = Offset((size.width - measured.size.width) / 2f, y - measured.size.height / 2f)
                    )
                    
                    // Tick marks
                    drawLine(
                        color = if (style == centerNoteStyle) Color.White else Color.White.copy(alpha = 0.3f),
                        start = Offset(0f, y),
                        end = Offset(10.dp.toPx(), y),
                        strokeWidth = 1.dp.toPx()
                    )
                    drawLine(
                        color = if (style == centerNoteStyle) Color.White else Color.White.copy(alpha = 0.3f),
                        start = Offset(size.width - 10.dp.toPx(), y),
                        end = Offset(size.width, y),
                        strokeWidth = 1.dp.toPx()
                    )
                }
            }
        }
        
        // Center pointer lines
        drawLine(
            color = barColor.copy(alpha = 0.9f),
            start = Offset(0f, centerY),
            end = Offset(size.width, centerY),
            strokeWidth = 2.dp.toPx()
        )
    }
}

private fun startRecording(
    slotId: Int,
    pitchTracker: MicrophonePitchTracker,
    scope: kotlinx.coroutines.CoroutineScope,
    onUpdate: (Int?) -> Unit,
    onTimeUpdate: (Int) -> Unit,
    onFinished: (Int, MicrophonePitchTracker.PitchResult.Estimate?) -> Unit
) {
    onUpdate(slotId)
    pitchTracker.start(60) // Target doesn't strictly matter for raw midi, but tracker requires it
    
    scope.launch {
        var remaining = 3000
        while (remaining > 0) {
            onTimeUpdate(remaining)
            delay(100)
            remaining -= 100
        }
        
        val finalResult = pitchTracker.pitchFlow.value
        pitchTracker.stop()
        onUpdate(null)
        
        onFinished(slotId, finalResult as? MicrophonePitchTracker.PitchResult.Estimate)
    }
}
