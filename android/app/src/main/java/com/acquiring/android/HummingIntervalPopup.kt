package com.acquiring.android

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
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

/** Height of the two pitch cards and the interval readout beside them. */
private val SINGING_CARD_HEIGHT = 104.dp

/** Half-period of the pulse that marks the card the microphone is feeding. */
private const val ACTIVE_CARD_PULSE_MS = 650
internal const val SINGING_TARGET_ROW_TEST_TAG = "singing-target-row"
internal const val SINGING_INTERVAL_RESULT_TEST_TAG = "singing-interval-result"

private sealed interface RequestedMicrophoneAction {
    data class Listen(val slotId: Int) : RequestedMicrophoneAction
    data class Record(val slotId: Int) : RequestedMicrophoneAction
    object FlipFlop : RequestedMicrophoneAction
}

private sealed interface ActiveMicrophoneAction {
    object Idle : ActiveMicrophoneAction
    data class AwaitingPermission(val requested: RequestedMicrophoneAction) : ActiveMicrophoneAction
    data class Listening(val slotId: Int) : ActiveMicrophoneAction
    data class Recording(val slotId: Int) : ActiveMicrophoneAction
    object FlipFlop : ActiveMicrophoneAction
}

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.ui.text.ExperimentalTextApi::class)
@Composable
internal fun HummingIntervalPopup(
    modifier: Modifier = Modifier,
    sectionSessionKey: String? = null,
    targetRequest: SingingTargetRequest? = null,
    globalTranspose: Int = 0,
    comfortablePitchMidi: Double? = null,
    pitchSource: PitchSource = LocalContext.current.applicationContext.let { appContext ->
        remember(appContext) { MicrophonePitchTracker(appContext) }
    },
    autoListenOnTargetLoad: Boolean = true,
    recordAudioPermissionOverride: Boolean? = null
) {
    var isExpanded by remember { mutableStateOf(false) }
    var clearAfterCollapse by remember { mutableStateOf(false) }
    var slot1 by remember { mutableStateOf<PitchData?>(null) }
    var slot2 by remember { mutableStateOf<PitchData?>(null) }
    var activeTarget by remember { mutableStateOf<SingingTargetRequest?>(null) }
    var listenTimeRemaining by remember { mutableStateOf(0) }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pitchTracker = pitchSource
    val exclusivePitchTracker = pitchTracker as? ExclusivePitchSource
    val alwaysOwnsMicrophone = remember { mutableStateOf(true) }
    val ownsMicrophone by exclusivePitchTracker?.ownsMicrophone?.collectAsState()
        ?: alwaysOwnsMicrophone

    DisposableEffect(pitchTracker) {
        onDispose {
            pitchTracker.release()
        }
    }

    val pitchResult by pitchTracker.pitchFlow.collectAsState()

    var microphoneAction by remember { mutableStateOf<ActiveMicrophoneAction>(ActiveMicrophoneAction.Idle) }
    var recordingSlot by remember { mutableStateOf<Int?>(null) }
    var recordingTimeRemaining by remember { mutableStateOf(0) }
    var lifecycleGeneration by remember { mutableStateOf(0) }

    val activeListenSlot = (microphoneAction as? ActiveMicrophoneAction.Listening)?.slotId
    val flipFlopEnabled = microphoneAction is ActiveMicrophoneAction.FlipFlop
    val latestMicrophoneAction by rememberUpdatedState(microphoneAction)

    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, pitchTracker) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            when (event) {
                androidx.lifecycle.Lifecycle.Event.ON_PAUSE -> {
                    lifecycleGeneration++
                    // Opening Android's runtime-permission sheet pauses the Activity.
                    // Keep that request armed so its result can activate the intended
                    // action, while still disarming every action that already owns mic.
                    if (latestMicrophoneAction !is ActiveMicrophoneAction.Idle &&
                        latestMicrophoneAction !is ActiveMicrophoneAction.AwaitingPermission
                    ) {
                        microphoneAction = ActiveMicrophoneAction.Idle
                        recordingSlot = null
                        recordingTimeRemaining = 0
                        listenTimeRemaining = 0
                        pitchTracker.stop()
                    }
                }
                androidx.lifecycle.Lifecycle.Event.ON_STOP -> {
                    // A true background transition follows ON_PAUSE with ON_STOP;
                    // unlike the translucent permission sheet, it must also disarm
                    // a request that has not received its permission result yet.
                    microphoneAction = ActiveMicrophoneAction.Idle
                    recordingSlot = null
                    recordingTimeRemaining = 0
                    listenTimeRemaining = 0
                    pitchTracker.stop()
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Begins continuous singing-back for the given slot, scored against that
    // slot's own target note, and automatically stops it again after
    // LISTEN_TIMEOUT_MS — the same duration a normal timed recording uses —
    // unless the user (or a fresh double-tap) has already moved it on.
    fun targetForSlot(target: SingingTargetRequest, slotId: Int): SingingTargetNote? =
        if (slotId == 1) target.first else target.second

    // Resolved once for the whole request: a filled pair is an interval and
    // takes a single shared shift, so its size and direction stay exact even
    // when that leaves one endpoint away from the anchor.
    val resolvedTargetMidis = remember(activeTarget, globalTranspose, comfortablePitchMidi) {
        activeTarget?.let { resolveSingingTargetRequest(it, globalTranspose, comfortablePitchMidi) }
            ?: Pair(null, null)
    }

    fun resolvedTargetForSlot(slotId: Int): Int? =
        if (slotId == 1) resolvedTargetMidis.first else resolvedTargetMidis.second

    fun isSlotTessituraAdjusted(slotId: Int): Boolean {
        val target = activeTarget?.let { targetForSlot(it, slotId) } ?: return false
        val resolved = resolvedTargetForSlot(slotId) ?: return false
        return resolved != target.sourceMidi + globalTranspose
    }

    fun stopMicrophoneAction() {
        microphoneAction = ActiveMicrophoneAction.Idle
        recordingSlot = null
        recordingTimeRemaining = 0
        listenTimeRemaining = 0
        pitchTracker.stop()
    }

    fun clearMicrophoneActionAfterOwnershipLoss() {
        microphoneAction = ActiveMicrophoneAction.Idle
        recordingSlot = null
        recordingTimeRemaining = 0
        listenTimeRemaining = 0
    }

    LaunchedEffect(ownsMicrophone) {
        if (!ownsMicrophone && microphoneAction !is ActiveMicrophoneAction.Idle) {
            // Another quiz interaction now owns the shared tracker. Clear only our
            // logical action; this lease is intentionally unable to stop the new owner.
            clearMicrophoneActionAfterOwnershipLoss()
        }
    }

    fun clearCollapsedToolState() {
        stopMicrophoneAction()
        activeTarget = null
        slot1 = null
        slot2 = null
        clearAfterCollapse = false
    }

    fun activateMicrophoneAction(requested: RequestedMicrophoneAction) {
        recordingSlot = null
        recordingTimeRemaining = 0
        listenTimeRemaining = 0
        microphoneAction = when (requested) {
            is RequestedMicrophoneAction.Listen -> {
                val target = activeTarget
                if (target != null && targetForSlot(target, requested.slotId) != null) {
                    ActiveMicrophoneAction.Listening(requested.slotId)
                } else {
                    ActiveMicrophoneAction.Idle
                }
            }
            is RequestedMicrophoneAction.Record -> ActiveMicrophoneAction.Recording(requested.slotId)
            RequestedMicrophoneAction.FlipFlop -> ActiveMicrophoneAction.FlipFlop
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        val waiting = microphoneAction as? ActiveMicrophoneAction.AwaitingPermission
        if (waiting != null) {
            if (isGranted) {
                activateMicrophoneAction(waiting.requested)
            } else {
                microphoneAction = ActiveMicrophoneAction.Idle
                pitchTracker.stop()
            }
        }
    }

    fun requestMicrophoneAction(requested: RequestedMicrophoneAction) {
        // Stop any earlier action from this feature, then reserve exclusive access.
        // Reserving before the permission sheet also supersedes persistent quiz mode
        // immediately while allowing the pending permission request to survive ON_PAUSE.
        pitchTracker.stop()
        exclusivePitchTracker?.claim()
        val hasPermission = recordAudioPermissionOverride
            ?: (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED)
        if (hasPermission) {
            activateMicrophoneAction(requested)
        } else {
            microphoneAction = ActiveMicrophoneAction.AwaitingPermission(requested)
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    // Shared by the manual target-slot double-tap handlers and the
    // auto-start below: begin continuous singing-back for the given slot,
    // scored against that slot's own target note.
    fun beginListeningSlot(slotId: Int, target: SingingTargetRequest) {
        if (targetForSlot(target, slotId) == null) return
        requestMicrophoneAction(RequestedMicrophoneAction.Listen(slotId))
    }

    // Double-tapping a melody/root relative-interval object elsewhere in the quiz
    // hands us its two target notes here: expand the tool and assign the first
    // note to the left slot and the second to the middle slot as reference
    // labels. The user can double-tap either target slot to begin singing back
    // and checking against that slot's target, just like double-tapping a
    // scale-degree object — and the first target also starts automatically shortly
    // after the tool finishes expanding, so singing can begin right away.
    LaunchedEffect(sectionSessionKey, targetRequest?.requestId) {
        val request = targetRequest
        clearAfterCollapse = false
        stopMicrophoneAction()
        if (request == null) {
            activeTarget = null
            slot1 = null
            slot2 = null
            return@LaunchedEffect
        }
        activeTarget = request
        isExpanded = true
        slot1 = null
        slot2 = null

        if (!autoListenOnTargetLoad) return@LaunchedEffect
        val generationAtLoad = lifecycleGeneration
        delay(EXPAND_ANIMATION_MS + AUTO_LISTEN_DELAY_MS)
        // Only auto-start if nothing has changed in the meantime (still the
        // same request, nobody already started listening or switched modes).
        if (
            request.first != null &&
            activeTarget?.requestId == request.requestId &&
            lifecycleGeneration == generationAtLoad &&
            microphoneAction is ActiveMicrophoneAction.Idle
        ) {
            beginListeningSlot(1, request)
        }
    }

    // Keep the visible targets and status in place while the exit transition
    // runs; clearing them earlier made the collapsing tool flash blank.
    LaunchedEffect(isExpanded, clearAfterCollapse) {
        if (!isExpanded && clearAfterCollapse) {
            delay(EXPAND_ANIMATION_MS.toLong())
            if (!isExpanded && clearAfterCollapse) clearCollapsedToolState()
        }
    }

    // While a slot is actively being listened to, live pitch estimates are
    // scored against that slot's own target note so its bar/cents reflect how
    // close the user's current pitch is to the target.
    LaunchedEffect(pitchResult, activeListenSlot, activeTarget) {
        val target = activeTarget ?: return@LaunchedEffect
        val slotId = activeListenSlot ?: return@LaunchedEffect
        // A held reading is the previous live frame surviving a dropout. Skipping the write
        // leaves the slot showing that same reading, so nothing flickers and nothing is
        // recorded that the microphone is not producing right now.
        val estimate = (pitchResult as? MicrophonePitchTracker.PitchResult.Estimate)
            ?.takeIf { !it.isHeld }
            ?: return@LaunchedEffect
        val targetMidi = resolvedTargetForSlot(slotId) ?: return@LaunchedEffect
        val cents = (estimate.midi - targetMidi) * 100.0
        val nearestMidi = estimate.midi.roundToInt()
        val data = PitchData(SpelledPitch.fromMidi(nearestMidi), cents, estimate.midi)
        if (slotId == 1) slot1 = data else slot2 = data
    }

    // Manual transpose and tessitura are independent layers. If either changes
    // during a target session, retarget the microphone without replacing the
    // request or mutating a captured user pitch.
    LaunchedEffect(globalTranspose, comfortablePitchMidi) {
        val slotId = activeListenSlot ?: return@LaunchedEffect
        val targetMidi = resolvedTargetForSlot(slotId) ?: return@LaunchedEffect
        pitchTracker.retarget(targetMidi)
    }

    // Every microphone feature is represented by exactly one action. Switching
    // actions cancels the previous effect before the next one starts, so a late
    // permission result or capture cannot revive an older session.
    LaunchedEffect(microphoneAction) {
        val action = microphoneAction
        try {
            when (action) {
                ActiveMicrophoneAction.Idle,
                is ActiveMicrophoneAction.AwaitingPermission -> Unit

                is ActiveMicrophoneAction.Listening -> {
                    val targetMidi = resolvedTargetForSlot(action.slotId)
                    if (targetMidi == null) {
                        microphoneAction = ActiveMicrophoneAction.Idle
                        return@LaunchedEffect
                    }
                    pitchTracker.start(targetMidi)
                    var remaining = LISTEN_TIMEOUT_MS
                    while (
                        remaining > 0 &&
                        microphoneAction == action &&
                        currentCoroutineContext().isActive
                    ) {
                        listenTimeRemaining = remaining
                        delay(100)
                        remaining -= 100
                    }
                    if (microphoneAction == action) microphoneAction = ActiveMicrophoneAction.Idle
                }

                is ActiveMicrophoneAction.Recording -> {
                    val slotId = action.slotId
                    recordingSlot = slotId
                    if (slotId == 1) slot1 = null else slot2 = null
                    pitchTracker.start(60)
                    var remaining = 3000
                    while (
                        remaining > 0 &&
                        microphoneAction == action &&
                        currentCoroutineContext().isActive
                    ) {
                        recordingTimeRemaining = remaining
                        delay(100)
                        remaining -= 100
                    }
                    if (microphoneAction == action) {
                        val estimate = (pitchTracker.pitchFlow.value
                            as? MicrophonePitchTracker.PitchResult.Estimate)
                            ?.takeIf { !it.isHeld }
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
                        microphoneAction = ActiveMicrophoneAction.Idle
                    }
                }

                ActiveMicrophoneAction.FlipFlop -> {
                    var nextSlot = 1
                    while (
                        microphoneAction is ActiveMicrophoneAction.FlipFlop &&
                        currentCoroutineContext().isActive
                    ) {
                        val slotId = nextSlot
                        recordingSlot = slotId
                        pitchTracker.start(60)

                        var remaining = 3000
                        while (
                            remaining > 0 &&
                            microphoneAction is ActiveMicrophoneAction.FlipFlop &&
                            currentCoroutineContext().isActive
                        ) {
                            recordingTimeRemaining = remaining
                            delay(100)
                            remaining -= 100
                        }

                        val estimate = (pitchTracker.pitchFlow.value
                            as? MicrophonePitchTracker.PitchResult.Estimate)
                            ?.takeIf { !it.isHeld }
                        pitchTracker.stop()
                        recordingSlot = null
                        recordingTimeRemaining = 0

                        if (estimate != null && microphoneAction is ActiveMicrophoneAction.FlipFlop) {
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
                        if (slotId == 2) delay(2000)
                        nextSlot = if (slotId == 1) 2 else 1
                    }
                }
            }
        } finally {
            pitchTracker.stop()
            recordingSlot = null
            recordingTimeRemaining = 0
            listenTimeRemaining = 0
        }
    }

    // Handle real-time updates for the active recording slot
    LaunchedEffect(pitchResult, recordingSlot) {
        val estimate = (pitchResult as? MicrophonePitchTracker.PitchResult.Estimate)
            ?.takeIf { !it.isHeld }
        if (recordingSlot != null && estimate != null) {
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
        val effectiveTargetMidi = resolvedTargetForSlot(slotId) ?: return captured
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
            .clickable {
                if (!isExpanded) {
                    clearAfterCollapse = false
                    isExpanded = true
                }
            }
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        // Handle/Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(24.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isExpanded) {
                IconButton(
                    onClick = {
                        clearAfterCollapse = true
                        isExpanded = false
                    },
                    modifier = Modifier.size(24.dp)
                ) {
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
                        .padding(horizontal = 8.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // The tessitura control that used to sit here now lives in the quiz
                    // header, above the Transpose picker; this tool only reads the anchor
                    // it produces via `comfortablePitchMidi`.
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Flip-Flop", style = MaterialTheme.typography.labelMedium)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = flipFlopEnabled,
                            onCheckedChange = { enabled ->
                                if (!enabled) {
                                    stopMicrophoneAction()
                                } else {
                                    activeTarget = null
                                    requestMicrophoneAction(RequestedMicrophoneAction.FlipFlop)
                                }
                            }
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 4.dp, vertical = 2.dp)
                        .testTag(SINGING_TARGET_ROW_TEST_TAG),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                // Slot 1
                HummingSlotView(
                    label = activeTarget?.first?.scaleDegreeLabel.orEmpty(),
                    data = displayedSlot1,
                    isRecording = recordingSlot == 1,
                    isListening = activeListenSlot == 1,
                    isInteractionEnabled = !flipFlopEnabled,
                    isTessituraAdjusted = isSlotTessituraAdjusted(1),
                    recordingTimeRemaining = if (recordingSlot == 1) recordingTimeRemaining else if (activeListenSlot == 1) listenTimeRemaining else 0,
                    onSingleClick = {
                        recordedPitchPlaybackFrequency(slot1)?.let { frequencyHz ->
                            scope.launch {
                                AudioEngine.playExactFrequencies(
                                    listOf(frequencyHz),
                                    durationMs = 1000,
                                    channel = AudioEngine.PlaybackChannel.PREVIEW
                                )
                            }
                        }
                    },
                    onDoubleClick = {
                        val target = activeTarget
                        if (target?.first != null) {
                            // Target mode: double-tap toggles continuous singing-back
                            // for this slot's assigned target note.
                            if (activeListenSlot == 1) {
                                stopMicrophoneAction()
                            } else {
                                beginListeningSlot(1, target)
                            }
                        } else {
                            requestMicrophoneAction(RequestedMicrophoneAction.Record(1))
                        }
                    }
                )

                // Slot 2
                HummingSlotView(
                    label = activeTarget?.second?.scaleDegreeLabel.orEmpty(),
                    data = displayedSlot2,
                    isRecording = recordingSlot == 2,
                    isListening = activeListenSlot == 2,
                    isInteractionEnabled = !flipFlopEnabled,
                    isTessituraAdjusted = isSlotTessituraAdjusted(2),
                    recordingTimeRemaining = if (recordingSlot == 2) recordingTimeRemaining else if (activeListenSlot == 2) listenTimeRemaining else 0,
                    onSingleClick = {
                        recordedPitchPlaybackFrequency(slot2)?.let { frequencyHz ->
                            scope.launch {
                                AudioEngine.playExactFrequencies(
                                    listOf(frequencyHz),
                                    durationMs = 1000,
                                    channel = AudioEngine.PlaybackChannel.PREVIEW
                                )
                            }
                        }
                    },
                    onDoubleClick = {
                        val target = activeTarget
                        if (target?.second != null) {
                            // Target mode: double-tap toggles continuous singing-back
                            // for this slot's assigned target note.
                            if (activeListenSlot == 2) {
                                stopMicrophoneAction()
                            } else {
                                beginListeningSlot(2, target)
                            }
                        } else {
                            requestMicrophoneAction(RequestedMicrophoneAction.Record(2))
                        }
                    }
                )

                // Result Slot
                val capturedSlot1 = slot1
                val capturedSlot2 = slot2
                val interval = if (capturedSlot1 != null && capturedSlot2 != null) {
                    calculateMeasuredInterval(capturedSlot1.rawMidi, capturedSlot2.rawMidi)
                } else null

                val intervalCentsDeviation = interval?.centsDeviation

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .height(SINGING_CARD_HEIGHT)
                        .padding(3.dp)
                        .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(8.dp))
                        .testTag(SINGING_INTERVAL_RESULT_TEST_TAG)
                        .clickable(enabled = capturedSlot1 != null && capturedSlot2 != null) {
                            val idealTargetMidis = idealIntervalPlaybackMidis(
                                activeTarget,
                                globalTranspose,
                                comfortablePitchMidi
                            )
                            if (idealTargetMidis != null) {
                                val (firstMidi, secondMidi) = idealTargetMidis
                                scope.launch {
                                    AudioEngine.playChord(
                                        listOf(firstMidi),
                                        durationMs = 1000,
                                        channel = AudioEngine.PlaybackChannel.PREVIEW
                                    )
                                    delay(1000)
                                    AudioEngine.playChord(
                                        listOf(secondMidi),
                                        durationMs = 1000,
                                        channel = AudioEngine.PlaybackChannel.PREVIEW
                                    )
                                    delay(1000)
                                    AudioEngine.playChord(
                                        listOf(firstMidi, secondMidi),
                                        durationMs = 1000,
                                        channel = AudioEngine.PlaybackChannel.PREVIEW
                                    )
                                }
                            } else {
                                val s1 = capturedSlot1
                                val s2 = capturedSlot2
                                if (s1 != null && s2 != null) {
                                    scope.launch {
                                        AudioEngine.playExactFrequencies(
                                            listOf(midiToFrequency(s1.rawMidi)),
                                            durationMs = 1000,
                                            channel = AudioEngine.PlaybackChannel.PREVIEW
                                        )
                                        delay(1000)
                                        AudioEngine.playExactFrequencies(
                                            listOf(midiToFrequency(s2.rawMidi)),
                                            durationMs = 1000,
                                            channel = AudioEngine.PlaybackChannel.PREVIEW
                                        )
                                        delay(1000)
                                        AudioEngine.playExactFrequencies(
                                            listOf(midiToFrequency(s1.rawMidi), midiToFrequency(s2.rawMidi)),
                                            durationMs = 1000,
                                            channel = AudioEngine.PlaybackChannel.PREVIEW
                                        )
                                    }
                                }
                            }
                        }
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text("Interval", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(4.dp))
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

internal fun recordedPitchPlaybackFrequency(data: PitchData?): Double? =
    data?.rawMidi
        ?.takeIf(Double::isFinite)
        ?.let(::midiToFrequency)

private fun midiToFrequency(midi: Double): Double =
    440.0 * Math.pow(2.0, (midi - 69.0) / 12.0)

internal fun idealIntervalPlaybackMidis(
    target: SingingTargetRequest?,
    globalTranspose: Int,
    comfortablePitchMidi: Double?
): Pair<Int, Int>? {
    if (target?.first == null || target.second == null) return null
    // Resolved as a pair so the previewed interval is the one being taught, then
    // de-transposed because AudioEngine applies the manual transpose itself.
    val (first, second) = resolveSingingTargetRequest(target, globalTranspose, comfortablePitchMidi)
    if (first == null || second == null) return null
    return (first - globalTranspose) to (second - globalTranspose)
}

@Composable
internal fun RowScope.HummingSlotView(
    label: String,
    data: PitchData?,
    isRecording: Boolean,
    isListening: Boolean = false,
    isInteractionEnabled: Boolean,
    isTessituraAdjusted: Boolean = false,
    recordingTimeRemaining: Int,
    onSingleClick: () -> Unit,
    onDoubleClick: () -> Unit
) {
    val isActive = isRecording || isListening
    val cardShape = RoundedCornerShape(8.dp)
    // A tinted background alone is easy to miss on a small card beside its twin, so
    // the live card also carries a thick ring that breathes while the microphone is on.
    val pulseAlpha by rememberInfiniteTransition(label = "activeSingingCard").animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(ACTIVE_CARD_PULSE_MS),
            repeatMode = RepeatMode.Reverse
        ),
        label = "activeSingingCardAlpha"
    )
    Box(modifier = Modifier.weight(1f).height(SINGING_CARD_HEIGHT).padding(3.dp)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .clip(cardShape)
                .background(if (isActive) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
                .then(
                    if (isActive) {
                        Modifier.border(
                            width = 3.dp,
                            color = MaterialTheme.colorScheme.primary.copy(alpha = pulseAlpha),
                            shape = cardShape
                        )
                    } else {
                        Modifier
                    }
                )
                .pointerInput(isRecording, isInteractionEnabled) {
                    if (!isRecording && isInteractionEnabled) {
                        detectTapGestures(
                            onTap = { onSingleClick() },
                            onDoubleTap = { onDoubleClick() }
                        )
                    }
                }
                .padding(horizontal = 6.dp, vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(20.dp),
                contentAlignment = Alignment.Center
            ) {
                if (label.isNotEmpty()) {
                    ScaleDegreeText(
                        label = label,
                        fontSize = 16.sp,
                        minFontSize = 10.sp,
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

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

                if (isActive) {
                    Text(
                        text = "${(recordingTimeRemaining / 1000f).roundToInt()}s",
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(4.dp))
                            .padding(horizontal = 4.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                }
            }
        }
        if (isInteractionEnabled && !isRecording) {
            DoubleTapHint(
                modifier = Modifier.padding(6.dp),
                isTessituraAdjusted = isTessituraAdjusted
            )
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
