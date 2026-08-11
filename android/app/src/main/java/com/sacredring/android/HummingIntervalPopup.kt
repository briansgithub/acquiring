package com.sacredring.android

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private const val EXPAND_ANIMATION_MS = 300
private const val AUTO_LISTEN_DELAY_MS = 500L
private const val LISTEN_TIMEOUT_MS = 3000

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.ui.text.ExperimentalTextApi::class)
@Composable
internal fun HummingIntervalPopup(
    modifier: Modifier = Modifier,
    targetRequest: SingingTargetRequest? = null,
    globalTranspose: Int = 0,
    octaveShift: Int = 0,
    onCalibrateRequested: () -> Unit = {},
    onCalibrateResetRequested: () -> Unit = {}
) {
    var isExpanded by remember { mutableStateOf(false) }
    var slot1 by remember { mutableStateOf<PitchData?>(null) }
    var slot2 by remember { mutableStateOf<PitchData?>(null) }
    var activeTarget by remember { mutableStateOf<SingingTargetRequest?>(null) }
    var activeListenSlot by remember { mutableStateOf<Int?>(null) }
    var listenTimeRemaining by remember { mutableStateOf(0) }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pitchTracker = remember { MicrophonePitchTracker(context.applicationContext) }

    DisposableEffect(pitchTracker) {
        onDispose {
            pitchTracker.release()
        }
    }

    val pitchResult by pitchTracker.pitchFlow.collectAsState()

    var recordingSlot by remember { mutableStateOf<Int?>(null) }
    var recordingTimeRemaining by remember { mutableStateOf(0) }
    var flipFlopEnabled by remember { mutableStateOf(false) }
    var pendingFlipFlopStart by remember { mutableStateOf(false) }
    var pendingListenSlot by remember { mutableStateOf<Int?>(null) }

    // Begins continuous singing-back for the given slot, scored against that
    // slot's own target note, and automatically stops it again after
    // LISTEN_TIMEOUT_MS — the same duration a normal timed recording uses —
    // unless the user (or a fresh double-tap) has already moved it on.
    fun targetForSlot(target: SingingTargetRequest, slotId: Int): SingingTargetNote? =
        if (slotId == 1) target.first else target.second

    fun startListenTimer(slotId: Int, target: SingingTargetRequest) {
        val assignedTarget = targetForSlot(target, slotId) ?: return
        activeListenSlot = slotId
        pitchTracker.start(assignedTarget.effectiveTargetMidi(globalTranspose, octaveShift))
        scope.launch {
            var remaining = LISTEN_TIMEOUT_MS
            while (remaining > 0 && activeListenSlot == slotId) {
                listenTimeRemaining = remaining
                delay(100)
                remaining -= 100
            }
            if (activeListenSlot == slotId) {
                activeListenSlot = null
                pitchTracker.stop()
            }
            listenTimeRemaining = 0
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted && pendingFlipFlopStart) {
            pendingFlipFlopStart = false
            activeTarget = null
            activeListenSlot = null
            listenTimeRemaining = 0
            flipFlopEnabled = true
        } else if (isGranted && pendingListenSlot != null) {
            val slotId = pendingListenSlot!!
            pendingListenSlot = null
            val target = activeTarget
            if (target != null) {
                startListenTimer(slotId, target)
            }
        } else if (isGranted && recordingSlot != null) {
            // Permission granted, start recording for the pending slot
            val slotId = recordingSlot!!
            recordingSlot = null // Reset so startRecording can trigger properly
            startRecording(slotId, pitchTracker, scope, onStart = {
                if (slotId == 1) slot1 = null else slot2 = null
            }, onUpdate = { recordingSlot = it }, onTimeUpdate = { recordingTimeRemaining = it }, onFinished = { id, estimate ->
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
            pendingFlipFlopStart = false
            pendingListenSlot = null
            recordingSlot = null
        }
    }

    // Shared by the manual Pitch 1/Pitch 2 double-tap handlers and the
    // auto-start below: begin continuous singing-back for the given slot,
    // scored against that slot's own target note.
    fun beginListeningSlot(slotId: Int, target: SingingTargetRequest) {
        if (targetForSlot(target, slotId) == null) return
        val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (hasPermission) {
            startListenTimer(slotId, target)
        } else {
            pendingListenSlot = slotId
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    // Double-tapping a melody/root relative-interval object elsewhere in the quiz
    // hands us its two target notes here: expand the tool and assign the first
    // note to the left slot and the second to the middle slot as reference
    // labels. The user can double-tap Pitch 1 or Pitch 2 to begin singing back
    // and checking against that slot's target, just like double-tapping a
    // scale-degree object — and Pitch 1 also starts automatically shortly
    // after the tool finishes expanding, so singing can begin right away.
    LaunchedEffect(targetRequest?.requestId) {
        val request = targetRequest
        if (request == null) {
            pendingListenSlot = null
            recordingSlot = null
            activeListenSlot = null
            listenTimeRemaining = 0
            pitchTracker.stop()
            activeTarget = null
            slot1 = null
            slot2 = null
            return@LaunchedEffect
        }
        flipFlopEnabled = false
        pendingFlipFlopStart = false
        pendingListenSlot = null
        recordingSlot = null
        activeListenSlot = null
        listenTimeRemaining = 0
        pitchTracker.stop()
        activeTarget = request
        isExpanded = true
        slot1 = null
        slot2 = null

        delay(EXPAND_ANIMATION_MS + AUTO_LISTEN_DELAY_MS)
        // Only auto-start if nothing has changed in the meantime (still the
        // same request, nobody already started listening or switched modes).
        if (request.first != null && activeTarget?.requestId == request.requestId && activeListenSlot == null && !flipFlopEnabled) {
            beginListeningSlot(1, request)
        }
    }

    // While a slot is actively being listened to, live pitch estimates are
    // scored against that slot's own target note so its bar/cents reflect how
    // close the user's current pitch is to the target.
    LaunchedEffect(pitchResult, activeListenSlot, activeTarget) {
        val target = activeTarget ?: return@LaunchedEffect
        val slotId = activeListenSlot ?: return@LaunchedEffect
        val estimate = pitchResult as? MicrophonePitchTracker.PitchResult.Estimate ?: return@LaunchedEffect
        val targetMidi = targetForSlot(target, slotId)
            ?.effectiveTargetMidi(globalTranspose, octaveShift)
            ?: return@LaunchedEffect
        val cents = (estimate.midi - targetMidi) * 100.0
        val nearestMidi = estimate.midi.roundToInt()
        val data = PitchData(SpelledPitch.fromMidi(nearestMidi), cents, estimate.midi)
        if (slotId == 1) slot1 = data else slot2 = data
    }

    // Manual transpose and tessitura are independent layers. If either changes
    // during a target session, retarget the microphone without replacing the
    // request or mutating a captured user pitch.
    LaunchedEffect(globalTranspose, octaveShift, activeTarget?.requestId, activeListenSlot) {
        val target = activeTarget ?: return@LaunchedEffect
        val slotId = activeListenSlot ?: return@LaunchedEffect
        val assignedTarget = targetForSlot(target, slotId) ?: return@LaunchedEffect
        pitchTracker.start(assignedTarget.effectiveTargetMidi(globalTranspose, octaveShift))
    }

    // Flip-Flop owns the mic while the tool is expanded. Each completed capture
    // updates its slot, which in turn recalculates the interval display.
    LaunchedEffect(flipFlopEnabled, isExpanded) {
        if (!flipFlopEnabled || !isExpanded) return@LaunchedEffect

        var nextSlot = 1
        try {
            while (currentCoroutineContext().isActive) {
                val slotId = nextSlot
                recordingSlot = slotId
                pitchTracker.start(60)

                var remaining = 3000
                while (remaining > 0 && currentCoroutineContext().isActive) {
                    recordingTimeRemaining = remaining
                    delay(100)
                    remaining -= 100
                }

                val estimate = pitchTracker.pitchFlow.value as? MicrophonePitchTracker.PitchResult.Estimate
                pitchTracker.stop()
                recordingSlot = null
                recordingTimeRemaining = 0

                if (estimate != null) {
                    val nearestMidi = estimate.midi.roundToInt()
                    val centsFromNearest = (estimate.midi - nearestMidi) * 100
                    val spelled = if (slotId == 2 && slot1 != null) {
                        SpelledPitch.spellRelative(slot1!!.pitch, nearestMidi)
                    } else {
                        SpelledPitch.fromMidi(nearestMidi)
                    }
                    val data = PitchData(spelled, centsFromNearest, estimate.midi)
                    if (slotId == 1) slot1 = data else slot2 = data
                }
                if (slotId == 2) {
                    delay(2000)
                }
                nextSlot = if (slotId == 1) 2 else 1
            }
        } finally {
            pitchTracker.stop()
            recordingSlot = null
            recordingTimeRemaining = 0
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

    fun displayedSlotData(slotId: Int, captured: PitchData?): PitchData? {
        val assignedTarget = activeTarget?.let { targetForSlot(it, slotId) } ?: return captured
        val effectiveTargetMidi = assignedTarget.effectiveTargetMidi(globalTranspose, octaveShift)
        return if (captured == null) {
            PitchData(
                pitch = SpelledPitch.fromMidi(effectiveTargetMidi),
                cents = 0.0,
                rawMidi = effectiveTargetMidi.toDouble()
            )
        } else {
            captured.copy(cents = (captured.rawMidi - effectiveTargetMidi) * 100.0)
        }
    }

    val displayedSlot1 = displayedSlotData(1, slot1)
    val displayedSlot2 = displayedSlotData(2, slot2)

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
                IconButton(onClick = {
                    pendingFlipFlopStart = false
                    flipFlopEnabled = false
                    pendingListenSlot = null
                    activeTarget = null
                    activeListenSlot = null
                    listenTimeRemaining = 0
                    pitchTracker.stop()
                    slot1 = null
                    slot2 = null
                    isExpanded = false
                }) {
                    Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Collapse")
                }
            } else {
                Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Expand Humming Tool")
                Text("Interval Singing Tool", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 8.dp))
            }
        }

        AnimatedVisibility(
            visible = isExpanded,
            enter = expandVertically(animationSpec = tween(EXPAND_ANIMATION_MS)),
            exit = shrinkVertically(animationSpec = tween(EXPAND_ANIMATION_MS))
        ) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Hum a note to shift every target pitch up/down by octaves so
                    // they land in the singer's own tessitura (comfortable vocal
                    // range) — this only re-aims what the mic listens for; it never
                    // changes the pitch/octave the song itself plays back.
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            onClick = onCalibrateRequested,
                            shape = RoundedCornerShape(50),
                            color = MaterialTheme.colorScheme.primaryContainer,
                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.semantics {
                                contentDescription = "Match target pitch to your comfortable singing tessitura. Hum a note to calibrate. Playback pitch is unaffected."
                            }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("🎤", fontSize = 14.sp)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Match My Tessitura", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        Spacer(modifier = Modifier.width(6.dp))
                        val octaveShiftText = if (octaveShift > 0) "+$octaveShift" else "$octaveShift"
                        Text(
                            text = octaveShiftText,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.semantics {
                                contentDescription = "Tessitura shifted $octaveShift octaves from the song's actual pitch"
                            }
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Box(
                            modifier = Modifier
                                .size(26.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { onCalibrateResetRequested() }
                                .semantics { contentDescription = "Clear tessitura calibration and reset to the default octave" },
                            contentAlignment = Alignment.Center
                        ) {
                            Text("✕", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Flip-Flop", style = MaterialTheme.typography.labelMedium)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = flipFlopEnabled,
                            onCheckedChange = { enabled ->
                                if (!enabled) {
                                    pendingFlipFlopStart = false
                                    flipFlopEnabled = false
                                } else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                    activeTarget = null
                                    activeListenSlot = null
                                    listenTimeRemaining = 0
                                    flipFlopEnabled = true
                                } else {
                                    pendingFlipFlopStart = true
                                    permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                }
                            }
                        )
                    }
                }

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
                    data = displayedSlot1,
                    isRecording = recordingSlot == 1,
                    isListening = activeListenSlot == 1,
                    isInteractionEnabled = !flipFlopEnabled,
                    recordingTimeRemaining = if (recordingSlot == 1) recordingTimeRemaining else if (activeListenSlot == 1) listenTimeRemaining else 0,
                    onSingleClick = {
                        val assignedTarget = activeTarget?.first
                        if (assignedTarget != null) {
                            scope.launch {
                                AudioEngine.playChord(
                                    listOf(assignedTarget.targetPlaybackMidiInput(octaveShift)),
                                    durationMs = 1000,
                                    channel = AudioEngine.PlaybackChannel.PREVIEW
                                )
                            }
                        } else {
                            slot1?.let {
                                scope.launch {
                                    AudioEngine.playExactFrequencies(
                                        listOf(midiToFrequency(it.rawMidi)),
                                        durationMs = 1000,
                                        channel = AudioEngine.PlaybackChannel.PREVIEW
                                    )
                                }
                            }
                        }
                    },
                    onDoubleClick = {
                        val target = activeTarget
                        if (target?.first != null) {
                            // Target mode: double-tap toggles continuous singing-back
                            // for this slot's assigned target note.
                            if (activeListenSlot == 1) {
                                activeListenSlot = null
                                listenTimeRemaining = 0
                                pitchTracker.stop()
                            } else {
                                beginListeningSlot(1, target)
                            }
                        } else {
                            val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                            if (hasPermission) {
                                startRecording(1, pitchTracker, scope, onStart = { slot1 = null }, onUpdate = { recordingSlot = it }, onTimeUpdate = { recordingTimeRemaining = it }, onFinished = { id, estimate ->
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
                    }
                )

                // Slot 2
                HummingSlotView(
                    label = "Pitch 2",
                    data = displayedSlot2,
                    isRecording = recordingSlot == 2,
                    isListening = activeListenSlot == 2,
                    isInteractionEnabled = !flipFlopEnabled,
                    recordingTimeRemaining = if (recordingSlot == 2) recordingTimeRemaining else if (activeListenSlot == 2) listenTimeRemaining else 0,
                    onSingleClick = {
                        val assignedTarget = activeTarget?.second
                        if (assignedTarget != null) {
                            scope.launch {
                                AudioEngine.playChord(
                                    listOf(assignedTarget.targetPlaybackMidiInput(octaveShift)),
                                    durationMs = 1000,
                                    channel = AudioEngine.PlaybackChannel.PREVIEW
                                )
                            }
                        } else {
                            slot2?.let {
                                scope.launch {
                                    AudioEngine.playExactFrequencies(
                                        listOf(midiToFrequency(it.rawMidi)),
                                        durationMs = 1000,
                                        channel = AudioEngine.PlaybackChannel.PREVIEW
                                    )
                                }
                            }
                        }
                    },
                    onDoubleClick = {
                        val target = activeTarget
                        if (target?.second != null) {
                            // Target mode: double-tap toggles continuous singing-back
                            // for this slot's assigned target note.
                            if (activeListenSlot == 2) {
                                activeListenSlot = null
                                listenTimeRemaining = 0
                                pitchTracker.stop()
                            } else {
                                beginListeningSlot(2, target)
                            }
                        } else {
                            val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                            if (hasPermission) {
                                startRecording(2, pitchTracker, scope, onStart = { slot2 = null }, onUpdate = { recordingSlot = it }, onTimeUpdate = { recordingTimeRemaining = it }, onFinished = { id, estimate ->
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
                    }
                )

                // Result Slot
                val interval = if (displayedSlot1 != null && displayedSlot2 != null) {
                    calculateMeasuredInterval(displayedSlot1.rawMidi, displayedSlot2.rawMidi)
                } else null

                val intervalCentsDeviation = interval?.centsDeviation

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .height(120.dp)
                        .padding(4.dp)
                        .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(8.dp))
                        .clickable(enabled = displayedSlot1 != null && displayedSlot2 != null) {
                            val s1 = displayedSlot1
                            val s2 = displayedSlot2
                            if (s1 != null && s2 != null) {
                                scope.launch {
                                    val firstTarget = activeTarget?.first
                                    val secondTarget = activeTarget?.second
                                    val firstPlaybackMidi = firstTarget
                                        ?.targetPlaybackMidiInput(octaveShift)
                                        ?.toDouble()
                                        ?: s1.rawMidi
                                    val secondPlaybackMidi = secondTarget
                                        ?.targetPlaybackMidiInput(octaveShift)
                                        ?.toDouble()
                                        ?: s2.rawMidi
                                    AudioEngine.playExactFrequencies(
                                        listOf(midiToFrequency(firstPlaybackMidi)),
                                        durationMs = 1000,
                                        channel = AudioEngine.PlaybackChannel.PREVIEW
                                    )
                                    delay(1000)
                                    AudioEngine.playExactFrequencies(
                                        listOf(midiToFrequency(secondPlaybackMidi)),
                                        durationMs = 1000,
                                        channel = AudioEngine.PlaybackChannel.PREVIEW
                                    )
                                    delay(1000)
                                    AudioEngine.playExactFrequencies(
                                        listOf(midiToFrequency(firstPlaybackMidi), midiToFrequency(secondPlaybackMidi)),
                                        durationMs = 1000,
                                        channel = AudioEngine.PlaybackChannel.PREVIEW
                                    )
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
}

internal data class PitchData(
    val pitch: SpelledPitch,
    val cents: Double,
    val rawMidi: Double
)

private fun midiToFrequency(midi: Double): Double = 440.0 * Math.pow(2.0, (midi - 69) / 12.0)

@Composable
internal fun RowScope.HummingSlotView(
    label: String,
    data: PitchData?,
    isRecording: Boolean,
    isListening: Boolean = false,
    isInteractionEnabled: Boolean,
    recordingTimeRemaining: Int,
    onSingleClick: () -> Unit,
    onDoubleClick: () -> Unit
) {
    Box(modifier = Modifier.weight(1f).height(120.dp).padding(4.dp)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(8.dp))
                .background(if (isRecording || isListening) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
                .pointerInput(isRecording, isInteractionEnabled) {
                    if (!isRecording && isInteractionEnabled) {
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

                if (isRecording || isListening) {
                    Text(
                        text = "${(recordingTimeRemaining / 1000f).roundToInt()}s",
                        modifier = Modifier.align(Alignment.TopEnd),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
        if (isInteractionEnabled && !isRecording) DoubleTapHint(modifier = Modifier.padding(6.dp))
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

    Box(modifier = modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        Canvas(modifier = Modifier.matchParentSize()) {
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
        Text(
            text = "Oct ${kotlin.math.floor(midi / 12.0).toInt() - 1}",
            modifier = Modifier.align(Alignment.BottomStart).padding(2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = Color.White.copy(alpha = 0.55f)
        )
    }
}

private fun startRecording(
    slotId: Int,
    pitchTracker: MicrophonePitchTracker,
    scope: kotlinx.coroutines.CoroutineScope,
    onStart: (() -> Unit)?,
    onUpdate: (Int?) -> Unit,
    onTimeUpdate: (Int) -> Unit,
    onFinished: (Int, MicrophonePitchTracker.PitchResult.Estimate?) -> Unit
) {
    onStart?.invoke()
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
