package com.acquiring.android

import android.content.Context
import android.content.Intent
import android.content.ActivityNotFoundException
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusTarget
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.style.TextAlign

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.exponentialDecay
import androidx.compose.animation.core.tween
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.input.pointer.util.addPointerInputChange
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Info
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.zIndex
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.room.Room
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.*
import kotlin.math.min
import kotlin.math.roundToInt


private const val ROOT_INTERVAL_PREVIEW_DURATION_MS = 450

private val QUIZ_ROW_LABEL_WIDTH = 44.dp

// The full-quiz card stack. Every row keeps its height whether or not it currently has
// cards, so the stack never shifts under the reader.
private val QUIZ_CARD_STACK_TOP_INSET = 8.dp
private val QUIZ_CARD_ROW_SPACING = 8.dp
private val QUIZ_MELODY_ROW_HEIGHT = 64.dp
private val QUIZ_CHORD_ROW_HEIGHT = 60.dp
private val QUIZ_CHORD_TONE_ROW_HEIGHT = 54.dp
/** Row caption in the quiz's left gutter. Pass a blank label to hold the space only. */
@Composable
private fun QuizRowLabel(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .width(QUIZ_ROW_LABEL_WIDTH)
            .fillMaxHeight(),
        contentAlignment = Alignment.CenterStart
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall.copy(lineHeight = 12.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2
        )
    }
}

private fun ringModeColor(scale: String): Color = when (scale) {
    "major", "ionian" -> Color(0xFFFF0000)
    "dorian" -> Color(0xFFFFB014)
    "phrygian", "phrygianDominant" -> Color(0xFFEFE600)
    "lydian" -> Color(0xFF00D300)
    "mixolydian" -> Color(0xFF4800FF)
    "minor", "aeolian", "harmonicMinor" -> Color(0xFFB800E5)
    "locrian" -> Color(0xFFFF00CB)
    else -> Color(0xFFE6E1E5)
}

private data class QuizTimelineChordVisual(
    val beat: Double,
    val duration: Double,
    val display: RomanNumeralDisplay?
)

internal data class QuizArpeggioOption(val label: String, val cyclesPerBeat: Double)

internal val QUIZ_ARPEGGIO_OPTIONS = listOf(
    QuizArpeggioOption("1/4", 0.25),
    QuizArpeggioOption("1/3", 1.0 / 3.0),
    QuizArpeggioOption("1/2", 0.5),
    QuizArpeggioOption("off", 0.0),
    QuizArpeggioOption("1", 1.0),
    QuizArpeggioOption("2", 2.0),
    QuizArpeggioOption("3", 3.0),
    QuizArpeggioOption("4", 4.0)
)
internal const val DEFAULT_QUIZ_ARPEGGIO_OPTION_INDEX = 3

internal fun steppedQuizBeat(
    current: Double,
    delta: Double,
    start: Double,
    end: Double
): Double = (current + delta).coerceIn(start, end)

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun QuizTab(
    section: ExtractedSection,
    isSimpleMode: Boolean,
    onSimpleModeChange: (Boolean) -> Unit,
    useRelativeIonianContext: Boolean,
    currentWaveform: AudioEngine.Waveform,
    onWaveformChange: (AudioEngine.Waveform) -> Unit,
    sectionPicker: @Composable () -> Unit,
    transposePicker: @Composable () -> Unit,
    onKeyDisplayChange: (QuizKeyDisplay?) -> Unit,
    globalTranspose: Int,
    tempoPercent: Float,
    onTempoPercentChange: (Float) -> Unit,
    arpeggioOptionIndex: Int,
    onArpeggioOptionIndexChange: (Int) -> Unit,
    onSingingTargetsRequested: (SingingTargetRequest) -> Unit,
    octaveOffset: Int,
    sessionKey: String,
    persistentPitchSource: PitchSource
) {
    val exclusivePersistentPitchSource = persistentPitchSource as? ExclusivePitchSource
        ?: error("QuizTab requires an exclusive persistent pitch source")
    val baseBpm = section.getBpm().toFloat().coerceIn(40f, 240f)
    val isTessituraAdjusted = octaveOffset != 0

    // AudioEngine applies the manual transpose itself, so only the singing
    // octave shift is added to preview MIDI. Song playback is never shifted.
    fun tessituraPreviewMidi(audioNote: Int): Int =
        audioNote + singingOctaveSemitones(octaveOffset)

    // A root-motion preview is two notes heard as one interval, so both take
    // the same singing-octave shift.
    fun tessituraIntervalShiftSemitones(previousAudioNote: Int, currentAudioNote: Int): Int =
        singingOctaveSemitones(octaveOffset)
    val arpeggiateCycles = QUIZ_ARPEGGIO_OPTIONS[arpeggioOptionIndex].cyclesPerBeat
    val bpm = (baseBpm * tempoPercent / 100f).toDouble()

    val notesJson = when (val rawNotes = section.notes) {
        is JsonArray -> rawNotes
        is JsonObject -> (rawNotes["melody1"] as? JsonArray) ?: emptyList()
        else -> emptyList()
    }
    
    val melody = remember(notesJson) {
        notesJson.mapNotNull { el ->
            try {
                val obj = el as? JsonObject ?: return@mapNotNull null
                val rawBeat = (obj["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                MelodyNote(
                    sd = (obj["sd"] as? JsonPrimitive)?.contentOrNull ?: "1",
                    beat = normalizePlaybackBeat(rawBeat),
                    duration = (obj["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0,
                    octave = (obj["octave"] as? JsonPrimitive)?.intOrNull ?: 0,
                    isRest = (obj["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                        (obj["rest"] as? JsonPrimitive)?.booleanOrNull == true
                )
            } catch (_: Exception) { null }
        }
    }
    val sectionKeys = remember(section) { section.getKeys() }
    val activeEventIndex = remember(section, melody) {
        QuizActiveEventIndex(section, melody)
    }

    var melodyChordBalance by remember { mutableStateOf(0.5f) }
    val melodyVolume = melodyChordBalance
    val chordVolume = 1f - melodyChordBalance
    var inertiaJob by remember { mutableStateOf<Job?>(null) }
    var inertiaGeneration by remember { mutableStateOf(0L) }
    var isScrubbing by remember { mutableStateOf(false) }
    var wasPlayingBeforeScrub by remember { mutableStateOf(false) }
    var scrubBeat by remember(section) { mutableStateOf(1.0) }
    var intervalPreviewJob by remember { mutableStateOf<Job?>(null) }
    val scope = rememberCoroutineScope()

    val endBeat = remember(section, melody) {
        val metadataEndBeat = (section.metadata?.get("endBeat") as? JsonPrimitive)?.doubleOrNull
        val audibleEventEndBeats = buildList {
            melody.forEach { note ->
                playbackEventEndBeat(note.beat, note.duration, note.isRest)?.let(::add)
            }
            section.chords.forEach { chord ->
                val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                    (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                val beat = (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                playbackEventEndBeat(beat, duration, isRest)?.let(::add)
            }
        }
        resolvePlaybackEndBeat(metadataEndBeat, audibleEventEndBeats)
    }
    val timeline = remember(section, melody, endBeat) {
        buildQuizTimeline(section, melody, endBeat)
    }
    val playbackConfig = QuizPlaybackConfig(
        bpm = bpm,
        transpose = globalTranspose,
        waveform = currentWaveform,
        chordMode = if (isSimpleMode) QuizChordMode.ROOT_ONLY else QuizChordMode.FULL,
        melodyGain = melodyVolume,
        chordGain = chordVolume,
        arpeggiateCycles = arpeggiateCycles
    )
    // Configuring here keeps the engine built before the timeline effect loads it.
    LaunchedEffect(playbackConfig) {
        QuizPlaybackController.configure(playbackConfig)
    }
    val playbackState by QuizPlaybackController.state.collectAsState()
    val isPlaying = playbackState.phase == QuizPlaybackPhase.BUFFERING ||
        playbackState.phase == QuizPlaybackPhase.PLAYING
    val currentBeat = if (isScrubbing) {
        scrubBeat
    } else {
        playbackState.beat.coerceIn(1.0, endBeat)
    }
    // Timeline gesture detectors live inside pointerInput(endBeat), so they are not
    // recreated for every played-frame state update. Keep the rapidly changing
    // transport values behind stable State objects instead of capturing the values
    // from the composition that created the gesture coroutine.
    val latestCurrentBeat by rememberUpdatedState(currentBeat)
    val latestIsPlaying by rememberUpdatedState(isPlaying)
    val latestBpm by rememberUpdatedState(bpm)

    val pixelsPerBeat = 60f
    val chordLaneHeight = 40.dp
    val melodyLaneHeight = 88.dp

    fun playbackBeat(): Double = latestCurrentBeat.coerceIn(1.0, endBeat)

    fun cancelInertia() {
        inertiaGeneration++
        inertiaJob?.cancel()
        inertiaJob = null
    }

    fun updatePlaybackBeat(beat: Double) {
        val boundedBeat = beat.coerceIn(1.0, endBeat)
        if (isScrubbing) {
            scrubBeat = boundedBeat
        } else {
            QuizPlaybackController.seek(boundedBeat, resume = latestIsPlaying)
        }
    }

    fun beginScrubbing() {
        cancelInertia()
        if (isScrubbing) return
        wasPlayingBeforeScrub = QuizPlaybackController.pauseForScrub()
        scrubBeat = playbackBeat()
        isScrubbing = true
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
    }

    fun scrubTo(beat: Double) {
        beginScrubbing()
        scrubBeat = beat.coerceIn(1.0, endBeat)
    }

    fun finishScrubbing() {
        if (!isScrubbing) return
        val targetBeat = scrubBeat
        val shouldResume = wasPlayingBeforeScrub && latestBpm > 0.0
        isScrubbing = false
        wasPlayingBeforeScrub = false
        QuizPlaybackController.seek(targetBeat, resume = shouldResume)
    }

    val quizPlaybackOwner = remember { Any() }
    val quizLifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    val latestPauseVisibleQuiz by rememberUpdatedState {
        cancelInertia()
        intervalPreviewJob?.cancel()
        intervalPreviewJob = null
        AudioEngine.stopPreviewPlayback()
        val retainedScrubBeat = if (isScrubbing) {
            scrubBeat.also {
                isScrubbing = false
                wasPlayingBeforeScrub = false
            }
        } else {
            null
        }
        QuizPlaybackController.detachQuiz(quizPlaybackOwner, retainedScrubBeat)
    }

    DisposableEffect(quizLifecycleOwner, quizPlaybackOwner) {
        if (quizLifecycleOwner.lifecycle.currentState.isAtLeast(
                androidx.lifecycle.Lifecycle.State.RESUMED
            )
        ) {
            QuizPlaybackController.attachQuiz(quizPlaybackOwner)
        }
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            when (event) {
                androidx.lifecycle.Lifecycle.Event.ON_RESUME ->
                    QuizPlaybackController.attachQuiz(quizPlaybackOwner)
                androidx.lifecycle.Lifecycle.Event.ON_PAUSE,
                androidx.lifecycle.Lifecycle.Event.ON_STOP -> latestPauseVisibleQuiz()
                else -> Unit
            }
        }
        quizLifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            quizLifecycleOwner.lifecycle.removeObserver(observer)
            latestPauseVisibleQuiz()
        }
    }

    fun skipBack(seconds: Double) {
        cancelInertia()
        if (isScrubbing || bpm <= 0.0) return
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
        val beatsToSkip = seconds * (bpm / 60.0)
        QuizPlaybackController.seek(playbackBeat() - beatsToSkip, resume = isPlaying)
    }

    fun stepBeat(deltaBeats: Double) {
        cancelInertia()
        if (isScrubbing) return
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
        QuizPlaybackController.seek(
            steppedQuizBeat(playbackBeat(), deltaBeats, timeline.startBeat, timeline.endBeat),
            resume = isPlaying
        )
    }

    LaunchedEffect(timeline, sessionKey) {
        cancelInertia()
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
        // Switching sections carries the transport across: a section that was sounding
        // keeps sounding from the top of the new one, and a paused section arrives
        // paused. The engine's requested state is the one to copy — the published phase
        // trails the command queue, so a section swap right after a play/pause tap would
        // otherwise carry the state the user just left behind. A scrub that is holding
        // playback counts as playing; it is a pause the user never asked for.
        val continuePlaying = QuizPlaybackController.isPlaybackRequested || wasPlayingBeforeScrub
        isScrubbing = false
        wasPlayingBeforeScrub = false
        scrubBeat = timeline.startBeat
        QuizPlaybackController.load(
            identity = sessionKey,
            newTimeline = timeline,
            continuePlaying = continuePlaying
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            // Card previews are tied to the cards on screen.
            intervalPreviewJob?.cancel()
            AudioEngine.stopPreviewPlayback()
        }
    }

    val ionianSourceKey = remember(sectionKeys) { sectionKeys.keyAtBeat(1.0) }
    val ionianContextKey = remember(ionianSourceKey) { relativeIonianKey(ionianSourceKey) }
    val timelineMelodyVisuals = remember(
        melody,
        sectionKeys,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        melody.mapNotNull { note ->
            if (note.isRest) {
                null
            } else {
                val rawStaffDegree = MusicTheory.getRawDegree(note.sd) + note.octave * 7
                val sourceKey = sectionKeys.keyAtBeat(note.beat)
                val resolvedPitch = MusicTheory.resolveScaleDegreePitch(
                    sd = note.sd,
                    relativeOctave = note.octave,
                    key = sourceKey
                )
                MelodyTimelinePitchVisual(
                    beat = note.beat,
                    duration = note.duration,
                    staffDegree = if (useRelativeIonianContext) {
                        ionianContextStaffDegree(
                            note.sd,
                            note.octave,
                            sourceKey,
                            ionianContextKey
                        ) ?: rawStaffDegree
                    } else {
                        rawStaffDegree
                    },
                    sourceMidi = resolvedPitch?.let { pitch ->
                        if (useRelativeIonianContext) {
                            ionianContextPreviewAudioNote(pitch, ionianContextKey)
                                ?: pitch.toAudioNoteNumber()
                        } else {
                            pitch.toAudioNoteNumber()
                        }
                    }
                )
            }
        }
    }
    val timelineMelodyPitchRuns = remember(timelineMelodyVisuals) {
        buildMelodyTimelinePitchRuns(timelineMelodyVisuals)
    }
    val timelineMelodyPitchRunsById = remember(timelineMelodyPitchRuns) {
        timelineMelodyPitchRuns.associateBy(MelodyTimelinePitchRun::id)
    }
    val timelineChordVisuals = remember(
        section.chords,
        sectionKeys,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        section.chords.map { chord ->
            val beat = normalizePlaybackBeat(
                (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            )
            val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
            val display = if (isRest) {
                null
            } else {
                val chordKey = sectionKeys.keyAtBeat(beat)
                val symbol = if (useRelativeIonianContext) {
                    ChordInterpreter.getRelativeIonianRomanSymbol(
                        chord,
                        chordKey,
                        ionianContextKey
                    )
                } else {
                    ChordInterpreter.getRomanSymbol(chord, chordKey)
                }
                RomanNumeralDisplay.fromChord(symbol, chord["borrowed"])
            }
            QuizTimelineChordVisual(beat, duration, display)
        }
    }
    val activeKey = remember(sectionKeys, currentBeat) {
        sectionKeys.keyAtBeat(currentBeat)
    }
    val currentChord = remember(activeEventIndex, currentBeat) {
        activeEventIndex.chordAtBeat(currentBeat)
    }
    val chordRootIntervalState = remember(section, currentChord, isSimpleMode) {
        if (!isSimpleMode || currentChord == null) null
        else resolveChordRootIntervalState(
            section,
            normalizePlaybackBeat((currentChord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0)
        )
    }
    val currentRootDegreeLabel = remember(
        chordRootIntervalState,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        chordRootIntervalState?.let { state ->
            if (useRelativeIonianContext) {
                ionianContextDegreeLabel(state.current.pitch, ionianContextKey)
            } else {
                state.currentDegreeLabel
            }
        }.orEmpty()
    }
    val currentRootPreviewAudioNote = remember(
        chordRootIntervalState,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        chordRootIntervalState?.currentIntervalPitch?.let { pitch ->
            if (useRelativeIonianContext) {
                ionianContextPreviewAudioNote(pitch, ionianContextKey)
                    ?: pitch.toAudioNoteNumber()
            } else {
                pitch.toAudioNoteNumber()
            }
        } ?: 0
    }
    val currentChordToneTargets = remember(
        currentChord,
        activeKey,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        val chord = currentChord ?: return@remember emptyList()
        val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
            (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
        if (isRest) return@remember emptyList()

        val interpretation = ChordInterpreter.interpret(chord, activeKey)
        val notes = interpretation.midi
        if (interpretation.rootMidi == null) return@remember emptyList()
        val spelledRoot = ChordInterpreter.resolveChordRoot(chord, activeKey)?.pitch
        notes.mapIndexed { index, note ->
            val previewNote = if (useRelativeIonianContext) {
                (spelledRoot?.let { ionianContextPreviewAudioNote(note, it, ionianContextKey) }
                    ?: ionianContextPreviewAudioNote(note, ionianContextKey)) ?: note
            } else {
                note
            }
            QuizPitchCardTarget(
                sourceMidi = previewNote,
                label = interpretation.toneLabels[index]
            )
        }
    }
    val currentMelodyNote = remember(activeEventIndex, currentBeat, isSimpleMode) {
        if (isSimpleMode) null else activeEventIndex.melodyNoteAtBeat(currentBeat)
    }
    val melodyIntervalState = remember(section, melody, currentMelodyNote, isSimpleMode) {
        if (isSimpleMode || currentMelodyNote == null) null
        else resolveMelodyIntervalState(melody, currentMelodyNote.beat, section::getKeyAtBeat)
    }
    val currentMelodyPitch = remember(section, currentMelodyNote, isSimpleMode) {
        currentMelodyNote
            ?.takeIf { note -> !isSimpleMode && !note.isRest && note.duration > 0.0 }
            ?.let { note ->
                MusicTheory.resolveScaleDegreePitch(
                    sd = note.sd,
                    relativeOctave = note.octave,
                    key = section.getKeyAtBeat(normalizePlaybackBeat(note.beat))
                )
            }
    }
    val melodyPreviousTargetLabel = remember(
        melodyIntervalState,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        melodyIntervalState?.let { state ->
            if (useRelativeIonianContext) {
                ionianContextDegreeLabel(state.previous, ionianContextKey)
            } else {
                state.previousDegreeLabel
            }
        }.orEmpty()
    }
    val melodyCurrentTargetLabel = remember(
        melodyIntervalState,
        currentMelodyPitch,
        currentMelodyNote,
        section,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        currentMelodyPitch?.let { pitch ->
            if (useRelativeIonianContext) {
                ionianContextDegreeLabel(pitch, ionianContextKey)
            } else {
                melodyIntervalState?.currentDegreeLabel
                    ?: currentMelodyNote?.let { note ->
                        MusicTheory.getDegreeLabelFromSpelling(
                            pitch,
                            section.getKeyAtBeat(normalizePlaybackBeat(note.beat))
                        )
                    }.orEmpty()
            }
        }.orEmpty()
    }
    val melodyPitchCards = remember(
        melodyIntervalState,
        melodyPreviousTargetLabel,
        melodyCurrentTargetLabel
    ) {
        melodyIntervalState?.let { state ->
            buildMelodyPitchCards(
                state = state,
                previousLabel = melodyPreviousTargetLabel,
                currentLabel = melodyCurrentTargetLabel
            )
        }.orEmpty()
    }
    val melodyCardDisplayMode = remember(currentMelodyPitch, melodyIntervalState) {
        melodyPitchCardDisplayMode(currentMelodyPitch, melodyIntervalState)
    }
    val singleMelodyPitchCard = remember(
        melodyCardDisplayMode,
        currentMelodyPitch,
        melodyCurrentTargetLabel
    ) {
        if (melodyCardDisplayMode == MelodyPitchCardDisplayMode.SINGLE) {
            currentMelodyPitch?.let { pitch ->
                MelodyPitchCard(
                    role = MelodyPitchCardRole.CURRENT,
                    pitch = pitch,
                    scaleDegreeLabel = melodyCurrentTargetLabel,
                    verticalPosition = MelodyPitchCardVerticalPosition.TOP
                )
            }
        } else {
            null
        }
    }

    val density = androidx.compose.ui.platform.LocalDensity.current

    fun intervalPreviewNote(pitch: SpelledPitch): Int {
        return if (useRelativeIonianContext) {
            ionianContextPreviewAudioNote(pitch, ionianContextKey) ?: pitch.toAudioNoteNumber()
        } else {
            pitch.toAudioNoteNumber()
        }
    }

    fun playIntervalPreview(previous: SpelledPitch, current: SpelledPitch) {
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
        intervalPreviewJob = scope.launch(Dispatchers.Default) {
            rootIntervalPreviewSteps(
                previousAudioNote = previous.toAudioNoteNumber(),
                currentAudioNote = current.toAudioNoteNumber(),
                octaveShiftSemitones = tessituraIntervalShiftSemitones(
                    previous.toAudioNoteNumber(),
                    current.toAudioNoteNumber()
                ),
                durationMs = ROOT_INTERVAL_PREVIEW_DURATION_MS
            ).forEach { step ->
                AudioEngine.playChord(
                    step.audioNotes,
                    durationMs = step.durationMs,
                    channel = AudioEngine.PlaybackChannel.PREVIEW
                )
                if (step.delayAfterMs > 0L) delay(step.delayAfterMs)
            }
        }
    }

    /**
     * Sounds one card. Cards are exclusive: a tap retires whatever the previous one
     * left ringing — faded, not cut — so previews replace each other instead of
     * stacking into a thicker and thicker chord. Every card tap goes through here.
     */
    fun playCardPreview(
        audioNotes: List<Int>,
        durationMs: Int = ROOT_INTERVAL_PREVIEW_DURATION_MS
    ) {
        intervalPreviewJob?.cancel()
        AudioEngine.stopPreviewPlayback()
        val notes = audioNotes.filter { it > 0 }
        if (notes.isEmpty()) return
        // Off the main thread deliberately: see playIntervalPreview. Synthesis, the
        // AudioTrack, and its start all run here, so a tap sounds when it is tapped
        // rather than when the next recomposition finishes.
        intervalPreviewJob = scope.launch(Dispatchers.Default) {
            AudioEngine.playChord(
                notes,
                durationMs = durationMs,
                channel = AudioEngine.PlaybackChannel.PREVIEW
            )
        }
    }

    fun playSingleNotePreview(pitch: SpelledPitch) {
        playCardPreview(listOf(tessituraPreviewMidi(pitch.toAudioNoteNumber())))
    }

    val simpleRootPitchTarget = remember(currentRootPreviewAudioNote, currentRootDegreeLabel) {
        currentRootPreviewAudioNote.takeIf { it > 0 }?.let {
            QuizPitchCardTarget(it, currentRootDegreeLabel)
        }
    }
    val melodyPersistentPitchTarget = remember(
        currentMelodyPitch,
        melodyCurrentTargetLabel,
        useRelativeIonianContext,
        ionianContextKey
    ) {
        currentMelodyPitch?.let { pitch ->
            QuizPitchCardTarget(
                sourceMidi = if (useRelativeIonianContext) {
                    ionianContextPreviewAudioNote(pitch, ionianContextKey)
                        ?: pitch.toAudioNoteNumber()
                } else {
                    pitch.toAudioNoteNumber()
                },
                label = melodyCurrentTargetLabel
            )
        }
    }

    val persistentPitchController = remember(sessionKey, exclusivePersistentPitchSource) {
        PersistentQuizPitchController(exclusivePersistentPitchSource)
    }
    // Declared out here rather than beside the timeline because the Reset control at the
    // bottom of the tab has to clear them too.
    val melodyRunScoreAccumulator = remember(sessionKey) {
        MelodyTimelinePitchScoreAccumulator()
    }
    var fixedMelodyPitchScores by remember(sessionKey) {
        mutableStateOf<Map<Int, MelodyRunScoreOutcome>>(emptyMap())
    }
    val persistentPitchResult by exclusivePersistentPitchSource.pitchFlow.collectAsState()
    val ownsPersistentMicrophone by exclusivePersistentPitchSource.ownsMicrophone.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val persistentPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { granted ->
        persistentPitchController.onPermissionResult(granted)
    }
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    val latestPersistentPhase by rememberUpdatedState(persistentPitchController.phase)

    DisposableEffect(lifecycleOwner, persistentPitchController) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            when (event) {
                androidx.lifecycle.Lifecycle.Event.ON_PAUSE -> {
                    if (latestPersistentPhase == PersistentPitchPhase.LISTENING) {
                        persistentPitchController.cancel()
                    }
                }

                androidx.lifecycle.Lifecycle.Event.ON_STOP -> {
                    if (latestPersistentPhase != PersistentPitchPhase.IDLE) {
                        persistentPitchController.cancel()
                    }
                }

                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            persistentPitchController.cancel()
        }
    }

    LaunchedEffect(ownsPersistentMicrophone) {
        persistentPitchController.onOwnershipChanged(ownsPersistentMicrophone)
    }

    LaunchedEffect(persistentPitchResult) {
        val error = persistentPitchResult as? MicrophonePitchTracker.PitchResult.Error
        if (
            error != null &&
            persistentPitchController.phase == PersistentPitchPhase.LISTENING
        ) {
            persistentPitchController.fail(error.message)
        }
    }

    LaunchedEffect(persistentPitchController.errorMessage) {
        if (persistentPitchController.errorMessage != null) {
            delay(4000)
            persistentPitchController.clearError()
        }
    }

    val resolvedPersistentPitchTarget = resolvePersistentPitchTarget(
        selection = persistentPitchController.selection,
        simpleRoot = simpleRootPitchTarget,
        chordTones = currentChordToneTargets,
        melody = melodyPersistentPitchTarget
    )
    val persistentPitchGaugeResult = resolvedPersistentPitchTarget
        ?.takeIf {
            persistentPitchController.phase == PersistentPitchPhase.LISTENING &&
                ownsPersistentMicrophone
        }
        ?.let { target ->
            retargetPitchResult(
                persistentPitchResult,
                target.effectiveTargetMidi(
                    globalTranspose,
                    octaveOffset
                )
            )
        }

    fun togglePersistentPitch(
        selection: PersistentPitchSelection,
        isDisplayedTargetActive: Boolean,
        target: QuizPitchCardTarget?
    ) {
        if (isDisplayedTargetActive) {
            persistentPitchController.cancel()
            return
        }
        val initialTarget = target ?: return
        val effectiveTargetMidi =
            initialTarget.sourceMidi + globalTranspose + singingOctaveSemitones(octaveOffset)
        val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.RECORD_AUDIO
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val needsPermission = persistentPitchController.activate(
            newSelection = selection,
            targetMidi = effectiveTargetMidi,
            hasRecordPermission = hasPermission
        )
        if (needsPermission) {
            persistentPermissionLauncher.launch(android.Manifest.permission.RECORD_AUDIO)
        }
    }

    LaunchedEffect(
        resolvedPersistentPitchTarget,
        globalTranspose,
        octaveOffset
    ) {
        val target = resolvedPersistentPitchTarget ?: return@LaunchedEffect
        persistentPitchController.updateTarget(
            target.effectiveTargetMidi(
                globalTranspose,
                octaveOffset
            )
        )
    }

    val latestMelodyTarget by rememberUpdatedState(melodyPersistentPitchTarget)
    val latestSimpleRootTarget by rememberUpdatedState(simpleRootPitchTarget)
    val latestChordToneTargets by rememberUpdatedState(currentChordToneTargets)
    val latestTogglePersistentPitch = rememberUpdatedState(
        newValue = { selection: PersistentPitchSelection,
                     isDisplayedTargetActive: Boolean,
                     target: QuizPitchCardTarget? ->
            togglePersistentPitch(selection, isDisplayedTargetActive, target)
        }
    )
    val handleMelodyLongClick: () -> Unit = remember(persistentPitchController) {
        {
            latestTogglePersistentPitch.value(
                PersistentPitchSelection.Melody,
                    persistentPitchController.selection == PersistentPitchSelection.Melody,
                latestMelodyTarget
            )
        }
    }
    val handleSimpleRootLongClick: () -> Unit = remember(persistentPitchController) {
        {
            latestTogglePersistentPitch.value(
                PersistentPitchSelection.SimpleRoot,
                    persistentPitchController.selection == PersistentPitchSelection.SimpleRoot,
                latestSimpleRootTarget
            )
        }
    }
    val handleChordToneLongClick: (Int) -> Unit = remember(persistentPitchController) {
        { index ->
            latestTogglePersistentPitch.value(
                PersistentPitchSelection.ChordTone(index),
                    persistentPitchController.selection == PersistentPitchSelection.ChordTone(index),
                latestChordToneTargets.getOrNull(index)
            )
        }
    }

    fun requestSingingTargets(request: SingingTargetRequest) {
        persistentPitchController.cancel()
        // The singing tool needs a quiet room. Opening it from a note card holds the
        // transport where it is so the microphone hears the user rather than the
        // backing parts; the play button is right there when they want it again.
        if (QuizPlaybackController.isPlaybackRequested) QuizPlaybackController.pause()
        onSingingTargetsRequested(request)
    }

    fun openSingleMelodySingingTarget(pitch: SpelledPitch, label: String) {
        requestSingingTargets(
            SingingTargetRequest(
                first = SingingTargetNote(intervalPreviewNote(pitch), label),
                second = null,
                requestId = 0
            )
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    // Minimal side insets: the row labels on the left and the volume
                    // fader on the right should sit as close to the edges as they can.
                    .padding(horizontal = 4.dp, vertical = 8.dp)
            ) {
                val displayScale = if (useRelativeIonianContext) {
                    "Major"
                } else {
                    activeKey.scale.replace(Regex("([a-z])([A-Z])"), "$1 $2").replaceFirstChar { it.titlecase() }
                }
                val activeModeColor = ringModeColor(activeKey.scale)
                // The key/scale readout itself is drawn by the song header above the
                // quiz, so publish it from here instead of rendering it inline.
                val keyDisplay = QuizKeyDisplay(
                    label = if (isSimpleMode) displayScale
                        else if (useRelativeIonianContext) "${ionianContextKey.tonic} $displayScale"
                        else "${activeKey.tonic} $displayScale",
                    color = activeModeColor,
                    isLockedToMajor = useRelativeIonianContext
                )
                val latestOnKeyDisplayChange by rememberUpdatedState(onKeyDisplayChange)
                LaunchedEffect(keyDisplay) { latestOnKeyDisplayChange(keyDisplay) }
                DisposableEffect(Unit) {
                    onDispose { latestOnKeyDisplayChange(null) }
                }
                val primaryColor = MaterialTheme.colorScheme.primary; val secondaryColor = MaterialTheme.colorScheme.secondary
                val romanNumeralPainter = remember { RomanNumeralPainter() }; val pixelsPerBeatPx = with(density) { pixelsPerBeat.dp.toPx() }
                val timelineContentDescription = remember(
                    currentChord,
                    sectionKeys,
                    useRelativeIonianContext,
                    ionianContextKey
                ) {
                    if (currentChord == null) "Chord timeline" else {
                        val beat = normalizePlaybackBeat(
                            (currentChord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                        )
                        val isRest = (currentChord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                            (currentChord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                        val chordKey = sectionKeys.keyAtBeat(beat)
                        val label = if (isRest) {
                            "rest"
                        } else if (useRelativeIonianContext) {
                            ChordInterpreter.getRelativeIonianRomanSymbol(
                                currentChord,
                                chordKey,
                                ionianContextKey
                            )
                        } else {
                            ChordInterpreter.getRomanSymbol(currentChord, chordKey)
                        }
                        "Chord timeline, current chord $label"
                    }
                }
                val melodyTimelinePitchEstimate = melodyTimelinePitchEstimate(
                    selection = persistentPitchController.selection,
                    resolvedTarget = resolvedPersistentPitchTarget,
                    pitchResult = persistentPitchGaugeResult
                )
                val activeMelodyPitchRun = remember(timelineMelodyPitchRuns, currentBeat) {
                    melodyTimelinePitchRunAtBeat(timelineMelodyPitchRuns, currentBeat)
                }
                val melodyRunScoringEnabled =
                    persistentPitchController.selection == PersistentPitchSelection.Melody &&
                        persistentPitchController.phase == PersistentPitchPhase.LISTENING &&
                        ownsPersistentMicrophone
                val latestMelodyTimelinePitchEstimate by rememberUpdatedState(
                    melodyTimelinePitchEstimate
                )
                val activeMelodyRunTargetMidi = resolvedPersistentPitchTarget
                    ?.effectiveTargetMidi(
                        globalTranspose,
                        octaveOffset
                    )

                DisposableEffect(
                    melodyRunScoringEnabled,
                    activeMelodyPitchRun?.id,
                    melodyRunScoreAccumulator
                ) {
                    val scoringRun = activeMelodyPitchRun.takeIf { melodyRunScoringEnabled }
                    if (!melodyRunScoringEnabled) {
                        melodyRunScoreAccumulator.clear()
                        fixedMelodyPitchScores = emptyMap()
                    } else if (scoringRun != null) {
                        melodyRunScoreAccumulator.begin(scoringRun.id)
                        fixedMelodyPitchScores = fixedMelodyPitchScores - scoringRun.id
                    }
                    // The register this run is sung in, captured with the run that
                    // chose it rather than read again at dispose time.
                    val runSourceMidi = resolvedPersistentPitchTarget
                        ?.sourceMidi
                        ?.plus(globalTranspose)
                    val runTargetMidi = activeMelodyRunTargetMidi

                    onDispose {
                        if (scoringRun != null) {
                            melodyRunScoreAccumulator.finish(scoringRun.id)?.let { outcome ->
                                fixedMelodyPitchScores = fixedMelodyPitchScores +
                                    (outcome.runId to outcome)
                            }
                            // Where the melody just went is what the next note has to
                            // continue from, whether or not the attempt scored: the
                            // contour belongs to the exercise, not to the singer.
                            // Octave offset is per song; melody contour no longer
                            // drives a tessitura resolver.
                        }
                    }
                }

                LaunchedEffect(
                    melodyRunScoringEnabled,
                    activeMelodyPitchRun?.id,
                    activeMelodyRunTargetMidi,
                    melodyRunScoreAccumulator
                ) {
                    val scoringRun = activeMelodyPitchRun.takeIf { melodyRunScoringEnabled }
                        ?: return@LaunchedEffect
                    // This effect restarts as the playhead enters each run, so the sampler's
                    // default settle detector is built fresh per run and its elapsed clock
                    // starts at the moment the note starts sounding.
                    //
                    // It also restarts when the effective target moves under a sounding note
                    // - transpose or tessitura - because everything banked so far was scored
                    // against a different pitch. Re-beginning drops those samples, and the
                    // rebuilt detector makes the singer serve the onset delay again, exactly
                    // as they would at a note boundary. The DisposableEffect below stays
                    // keyed on the run alone, so a re-aim never banks a partial score.
                    melodyRunScoreAccumulator.begin(scoringRun.id)
                    accumulateMelodyRunPitchSamples(
                        runId = scoringRun.id,
                        accumulator = melodyRunScoreAccumulator,
                        latestCentsError = {
                            liveMeasuredCentsError(latestMelodyTimelinePitchEstimate)
                        }
                    )
                }
                val animatedMelodyTimelineCents by animateFloatAsState(
                    targetValue = melodyTimelinePitchEstimate?.centsError?.toFloat() ?: 0f,
                    animationSpec = tween(durationMillis = 32),
                    label = "melody timeline pitch"
                )
                val sampledMelodyTimelineCents = rememberSampledPitchErrorCents(
                    melodyTimelinePitchEstimate?.centsError
                ).takeIf { melodyTimelinePitchEstimate != null }
                val melodyTimelinePitchVisual = currentMelodyNote?.let { activeNote ->
                    timelineMelodyVisuals.firstOrNull { visual ->
                        visual.beat == activeNote.beat && visual.duration == activeNote.duration
                    }
                }
                val pitchAwareTimelineContentDescription = sampledMelodyTimelineCents?.let { centsError ->
                    val direction = when {
                        centsError > 0.0 -> "high"
                        centsError < 0.0 -> "low"
                        else -> "on target"
                    }
                    "$timelineContentDescription. Melody pitch error " +
                        "${pitchErrorPercentage(centsError)} percent, $direction"
                } ?: timelineContentDescription
                val melodyPitchLabelPaint = remember {
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        textAlign = Paint.Align.RIGHT
                        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    }
                }
                val melodyScorePaint = remember {
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        textAlign = Paint.Align.CENTER
                        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    }
                }

                // Timeline
                if (!isSimpleMode) {
                    Box(modifier = Modifier.fillMaxWidth().height(chordLaneHeight + melodyLaneHeight)) {
                        Canvas(
                            modifier = Modifier
                                .fillMaxSize()
                                .semantics { contentDescription = pitchAwareTimelineContentDescription }
                                .pointerInput(endBeat) {
                                    detectTapGestures { offset ->
                                        if (inertiaJob?.isActive == true) {
                                            // Timeline is still coasting from a prior swipe; a tap should
                                            // just halt it in place rather than also jump to the tap position.
                                            cancelInertia()
                                            finishScrubbing()
                                        } else {
                                            cancelInertia()
                                            val centerX = size.width / 2f
                                            val deltaX = offset.x - centerX
                                            scrubTo(latestCurrentBeat + deltaX / pixelsPerBeatPx)
                                            finishScrubbing()
                                        }
                                    }
                                }
                                .pointerInput(endBeat) {
                                    var dragBeat = latestCurrentBeat
                                    val velocityTracker = VelocityTracker()
                                    detectDragGestures(
                                        onDragStart = {
                                            velocityTracker.resetTracking()
                                            beginScrubbing()
                                            dragBeat = latestCurrentBeat
                                        },
                                        onDrag = { change, dragAmount ->
                                            velocityTracker.addPointerInputChange(change)
                                            change.consume()
                                            val deltaBeat = dragAmount.x / pixelsPerBeatPx
                                            dragBeat = (dragBeat - deltaBeat).coerceIn(1.0, endBeat)
                                            scrubTo(dragBeat)
                                        },
                                        onDragEnd = {
                                            val velocityPx = velocityTracker.calculateVelocity().x
                                            // Convert px/s to beats/s. 
                                            // Negative because dragging right (positive px) decreases the beat (moves timeline left).
                                            val velocityBeats = -velocityPx / pixelsPerBeatPx
                                            
                                            if (kotlin.math.abs(velocityBeats) > 0.5) {
                                                val inertiaStartBeat = dragBeat
                                                val generation = inertiaGeneration + 1
                                                inertiaGeneration = generation
                                                inertiaJob = scope.launch {
                                                    val animatable = Animatable(inertiaStartBeat.toFloat())
                                                    // Noticeable inertia that settles down reasonably quickly
                                                    val decay = exponentialDecay<Float>(frictionMultiplier = 1.4f)
                                                    var completed = false
                                                    try {
                                                        animatable.animateDecay(velocityBeats, decay) {
                                                            updatePlaybackBeat(value.toDouble().coerceIn(1.0, endBeat))
                                                            // Stop the animation as soon as it reaches either end of
                                                            // the timeline instead of letting it run its full decay
                                                            // curve past the clamped bounds.
                                                            if (value <= 1.0 || value >= endBeat) {
                                                                throw InertiaBoundaryReachedException()
                                                            }
                                                        }
                                                        completed = true
                                                    } catch (_: InertiaBoundaryReachedException) {
                                                        // Reached the start/end of the timeline early; fall through
                                                        // to finishScrubbing() below same as a natural decay finish.
                                                        completed = true
                                                    }
                                                    if (completed && inertiaGeneration == generation) {
                                                        inertiaJob = null
                                                        finishScrubbing()
                                                    }
                                                }
                                            } else {
                                                finishScrubbing()
                                            }
                                        },
                                        onDragCancel = { finishScrubbing() }
                                    )
                                }
                        ) {
                            val totalHeight = size.height; val mLaneHeightPx = melodyLaneHeight.toPx(); val cLaneHeightPx = chordLaneHeight.toPx(); val noteHeight = (mLaneHeightPx / 28f).coerceIn(5f, 10f); val melodyBaseY = mLaneHeightPx / 2; val centerX = size.width / 2f; val translationX = centerX - (currentBeat - 1).toFloat() * pixelsPerBeatPx
                            drawContext.canvas.save(); drawContext.canvas.translate(translationX, 0f)
                            timelineMelodyVisuals.forEach { note ->
                                val x = (note.beat - 1).toFloat() * pixelsPerBeatPx
                                val w = note.duration.toFloat() * pixelsPerBeatPx
                                val screenX = x + translationX
                                if (screenX + w < 0f || screenX > size.width) return@forEach
                                val y = melodyBaseY - (note.staffDegree * noteHeight)
                                val isActive = currentBeat >= note.beat &&
                                    currentBeat < note.beat + note.duration
                                drawRect(
                                    color = if (isActive) primaryColor else secondaryColor.copy(alpha = 0.6f),
                                    topLeft = Offset(x, y),
                                    size = Size(w, noteHeight)
                                )
                            }
                            fixedMelodyPitchScores.forEach { (runId, outcome) ->
                                val run = timelineMelodyPitchRunsById[runId]
                                    ?: return@forEach
                                val scoreCenterX = (run.centerBeat - 1.0).toFloat() * pixelsPerBeatPx
                                val scoreScreenX = scoreCenterX + translationX
                                // A run we listened through but could not score shows a muted
                                // dot, so the timeline separates "no verdict" from "never heard".
                                val scoreLabel = when (outcome) {
                                    is MelodyRunScoreOutcome.Scored ->
                                        formatMelodyTimelinePitchScore(outcome.score)

                                    is MelodyRunScoreOutcome.Unscored -> "·"
                                }
                                val scoreColor = when (outcome) {
                                    is MelodyRunScoreOutcome.Scored ->
                                        pitchFeedbackColor(outcome.score.centsErrorMagnitude)

                                    is MelodyRunScoreOutcome.Unscored ->
                                        Color.White.copy(alpha = 0.45f)
                                }
                                melodyScorePaint.apply {
                                    color = scoreColor.toArgb()
                                    textSize = 11.sp.toPx()
                                }
                                val fontMetrics = melodyScorePaint.fontMetrics
                                val horizontalPadding = 5.dp.toPx()
                                val verticalPadding = 2.dp.toPx()
                                val scoreWidth = melodyScorePaint.measureText(scoreLabel) +
                                    horizontalPadding * 2f
                                if (
                                    scoreScreenX + scoreWidth / 2f < 0f ||
                                    scoreScreenX - scoreWidth / 2f > size.width
                                ) {
                                    return@forEach
                                }

                                val scoreHeight = fontMetrics.descent - fontMetrics.ascent +
                                    verticalPadding * 2f
                                val noteTopY = melodyBaseY - (run.staffDegree * noteHeight)
                                val desiredBaseline = noteTopY - 4.dp.toPx() - fontMetrics.descent
                                val scoreBaseline = desiredBaseline.coerceAtLeast(
                                    -fontMetrics.ascent + verticalPadding
                                )
                                val scoreTop = scoreBaseline + fontMetrics.ascent - verticalPadding

                                drawRoundRect(
                                    color = Color.Black.copy(alpha = 0.76f),
                                    topLeft = Offset(scoreCenterX - scoreWidth / 2f, scoreTop),
                                    size = Size(scoreWidth, scoreHeight),
                                    cornerRadius = CornerRadius(scoreHeight / 2f, scoreHeight / 2f)
                                )
                                drawContext.canvas.nativeCanvas.drawText(
                                    scoreLabel,
                                    scoreCenterX,
                                    scoreBaseline,
                                    melodyScorePaint
                                )
                            }
                            timelineChordVisuals.forEach { chord ->
                                val x = (chord.beat - 1).toFloat() * pixelsPerBeatPx
                                val w = chord.duration.toFloat() * pixelsPerBeatPx
                                val screenX = x + translationX
                                if (screenX + w < 0f || screenX > size.width) return@forEach
                                val isActive = currentBeat >= chord.beat &&
                                    currentBeat < chord.beat + chord.duration
                                drawRect(color = secondaryColor.copy(alpha = 0.2f), topLeft = Offset(x, mLaneHeightPx), size = Size(w, cLaneHeightPx))
                                if (isActive) drawRect(color = primaryColor.copy(alpha = 0.4f), topLeft = Offset(x, mLaneHeightPx), size = Size(w, cLaneHeightPx))
                                drawRect(color = if (isActive) primaryColor else Color.LightGray, topLeft = Offset(x, mLaneHeightPx), size = Size(w, cLaneHeightPx), style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
                                chord.display?.let { display ->
                                    val innerWidth = w - 14.dp.toPx()
                                    val innerHeight = cLaneHeightPx - 8.dp.toPx()
                                    if (innerWidth > 12.dp.toPx() && innerHeight > 12.dp.toPx()) {
                                        val minFontSize = 8.sp.toPx()
                                        val maxFontSize = kotlin.math.min(innerHeight * 0.9f, innerWidth * 0.58f)
                                        val measured = romanNumeralPainter.fitDisplay(display, minFontSize, maxFontSize, innerWidth, innerHeight, 4.dp.toPx())
                                        if (measured != null) romanNumeralPainter.draw(canvas = drawContext.canvas.nativeCanvas, layout = measured, centerX = x + w / 2f, centerY = mLaneHeightPx + cLaneHeightPx / 2f + measured.baseFontSizePx * 0.035f, color = (if (isActive) primaryColor else Color.White).toArgb())
                                    }
                                }
                            }
                            drawContext.canvas.restore()
                            drawLine(
                                color = Color.White,
                                start = Offset(centerX, 0f),
                                end = Offset(centerX, totalHeight),
                                strokeWidth = 3f
                            )

                            val pitchEstimate = melodyTimelinePitchEstimate
                            val activeMelodyVisual = melodyTimelinePitchVisual
                            if (pitchEstimate != null && activeMelodyVisual != null) {
                                val feedbackColor = pitchFeedbackColor(pitchEstimate.centsError)
                                val haloRadius = 6.dp.toPx()
                                val markerRadius = 2.5f.dp.toPx()
                                val targetMarkerY = melodyBaseY -
                                    (activeMelodyVisual.staffDegree * noteHeight) + noteHeight / 2f
                                val measuredPitchStaffOffset = pitchErrorToTimelineStaffSteps(
                                    animatedMelodyTimelineCents.toDouble()
                                ).toFloat() * noteHeight
                                val rawMarkerY = targetMarkerY - measuredPitchStaffOffset
                                val markerY = rawMarkerY.coerceIn(
                                    haloRadius,
                                    (mLaneHeightPx - haloRadius).coerceAtLeast(haloRadius)
                                )

                                drawCircle(
                                    color = feedbackColor.copy(alpha = 0.28f),
                                    radius = haloRadius,
                                    center = Offset(centerX, markerY)
                                )
                                drawCircle(
                                    color = feedbackColor,
                                    radius = markerRadius,
                                    center = Offset(centerX, markerY)
                                )

                                sampledMelodyTimelineCents
                                    ?.takeIf(::showsLivePitchErrorPercentage)
                                    ?.let { sampledCentsError ->
                                    val percentageLabel = formatPitchErrorPercentage(sampledCentsError)
                                    val percentageColor = pitchFeedbackColor(sampledCentsError)
                                    melodyPitchLabelPaint.apply {
                                        color = percentageColor.toArgb()
                                        textSize = 11.sp.toPx()
                                    }
                                    val fontMetrics = melodyPitchLabelPaint.fontMetrics
                                    val horizontalPadding = 5.dp.toPx()
                                    val verticalPadding = 2.dp.toPx()
                                    val labelWidth = melodyPitchLabelPaint.measureText(percentageLabel) +
                                        horizontalPadding * 2f
                                    val labelHeight = fontMetrics.descent - fontMetrics.ascent +
                                        verticalPadding * 2f
                                    val labelRight = centerX - 8.dp.toPx()
                                    val labelLeft = labelRight - labelWidth
                                    val labelTop = markerY - labelHeight / 2f

                                    drawRoundRect(
                                        color = Color.Black.copy(alpha = 0.76f),
                                        topLeft = Offset(labelLeft, labelTop),
                                        size = Size(labelWidth, labelHeight),
                                        cornerRadius = CornerRadius(labelHeight / 2f, labelHeight / 2f)
                                    )
                                    drawContext.canvas.nativeCanvas.drawText(
                                        percentageLabel,
                                        labelRight - horizontalPadding,
                                        markerY - (fontMetrics.ascent + fontMetrics.descent) / 2f,
                                        melodyPitchLabelPaint
                                    )
                                }
                            }
                        }
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(bottom = 96.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .wrapContentHeight(),
                        contentAlignment = if (isSimpleMode) Alignment.Center else Alignment.TopCenter
                    ) {
                        if (isSimpleMode) {
                            val activeSimpleChord = currentChord?.takeUnless { chord -> (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true || (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true }
                            val currentIntervalPitch = chordRootIntervalState?.currentIntervalPitch
                            val previousIntervalPitch = chordRootIntervalState?.previousIntervalPitch
                            val rootAudioNote = currentRootPreviewAudioNote
                            val rootDegreeLabel = currentRootDegreeLabel
                            val rootInterval = chordRootIntervalState?.interval

                            Row(
                                modifier = Modifier.fillMaxWidth().heightIn(max = 250.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                val rootIntervalEnabled = previousIntervalPitch != null && currentIntervalPitch != null && rootInterval != null
                                Surface(
                                    modifier = Modifier.weight(1f).fillMaxHeight()
                                        .semantics {
                                            contentDescription = rootInterval?.let {
                                                "Play root interval ${it.spokenName}. Double tap to sing it back. Long press to toggle persistent pitch practice."
                                            } ?: "Root interval unavailable"
                                        }
                                        .combinedClickable(
                                            enabled = rootIntervalEnabled,
                                            onClick = {
                                                if (previousIntervalPitch != null && currentIntervalPitch != null) {
                                                    playIntervalPreview(previousIntervalPitch, currentIntervalPitch)
                                                }
                                            },
                                            onDoubleClick = {
                                                val state = chordRootIntervalState
                                                if (state != null && previousIntervalPitch != null && currentIntervalPitch != null) {
                                                    val previousLabel = if (useRelativeIonianContext) {
                                                        ionianContextDegreeLabel(previousIntervalPitch, ionianContextKey)
                                                    } else {
                                                        state.previousDegreeLabel.orEmpty()
                                                    }
                                                    val currentLabel = if (useRelativeIonianContext) {
                                                        ionianContextDegreeLabel(currentIntervalPitch, ionianContextKey)
                                                    } else {
                                                        state.currentDegreeLabel
                                                    }
                                                    requestSingingTargets(
                                                        SingingTargetRequest(
                                                            first = SingingTargetNote(intervalPreviewNote(previousIntervalPitch), previousLabel),
                                                            second = SingingTargetNote(intervalPreviewNote(currentIntervalPitch), currentLabel),
                                                            requestId = 0
                                                        )
                                                    )
                                                }
                                            },
                                            onLongClick = handleSimpleRootLongClick
                                        ),
                                    shape = RoundedCornerShape(32.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                ) {
                                    Box(modifier = Modifier.fillMaxSize().padding(8.dp), contentAlignment = Alignment.Center) {
                                        Text(
                                            text = rootInterval?.shorthand ?: "—",
                                            textAlign = TextAlign.Center,
                                            fontSize = 54.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1
                                        )
                                        if (rootIntervalEnabled) {
                                            DoubleTapHint(
                                                modifier = Modifier.padding(4.dp),
                                                isTessituraAdjusted = isTessituraAdjusted
                                            )
                                        }
                                    }
                                }
                                Surface(
                                    modifier = Modifier.weight(1f).fillMaxHeight()
                                        .semantics { contentDescription = "Play current root scale degree. Double tap to sing it back. Long press to toggle persistent pitch practice." }
                                        .combinedClickable(
                                            enabled = rootAudioNote > 0,
                                            onClick = {
                                                playCardPreview(listOf(tessituraPreviewMidi(rootAudioNote)))
                                            },
                                            onDoubleClick = {
                                                if (rootAudioNote > 0) {
                                                    requestSingingTargets(
                                                        SingingTargetRequest(
                                                            first = SingingTargetNote(rootAudioNote, rootDegreeLabel),
                                                            second = null,
                                                            requestId = 0
                                                        )
                                                    )
                                                }
                                            },
                                            onLongClick = handleSimpleRootLongClick
                                        ),
                                    shape = RoundedCornerShape(32.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                ) {
                                    Box(modifier = Modifier.fillMaxSize().padding(8.dp), contentAlignment = Alignment.Center) {
                                        if (
                                            resolvedPersistentPitchTarget?.position == PersistentPitchCardPosition.SimpleRoot &&
                                            persistentPitchGaugeResult != null
                                        ) {
                                            PitchGauge(
                                                pitchResult = persistentPitchGaugeResult,
                                                targetLabel = resolvedPersistentPitchTarget.label,
                                                modifier = Modifier.matchParentSize()
                                            )
                                        }
                                        // After the gauge, so the moving bar passes behind the degree
                                        // rather than across it.
                                        if (activeSimpleChord != null) {
                                            if (rootDegreeLabel.isNotEmpty()) {
                                                ScaleDegreeText(label = rootDegreeLabel, fontSize = 100.sp, modifier = Modifier.fillMaxWidth(), minFontSize = 36.sp)
                                            } else {
                                                val symbol = if (useRelativeIonianContext) ChordInterpreter.getRelativeIonianRomanSymbol(activeSimpleChord, activeKey, ionianContextKey) else ChordInterpreter.getRomanSymbol(activeSimpleChord, activeKey)
                                                val romanDisplay = RomanNumeralDisplay.fromChord(symbol, activeSimpleChord["borrowed"])
                                                RomanNumeralText(display = romanDisplay, fontSize = 64.sp, modifier = Modifier.fillMaxWidth())
                                            }
                                        }
                                        if (rootAudioNote > 0) {
                                            DoubleTapHint(
                                                modifier = Modifier.padding(4.dp),
                                                isTessituraAdjusted = isTessituraAdjusted
                                            )
                                        }
                                    }
                                }
                            }
                        } else {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = QUIZ_CARD_STACK_TOP_INSET),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Top
                            ) {
                                val hasMelodyCards =
                                    melodyCardDisplayMode != MelodyPitchCardDisplayMode.HIDDEN
                                Row(
                                    modifier = Modifier.fillMaxWidth().height(QUIZ_MELODY_ROW_HEIGHT),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                // Each row names itself whether or not it currently holds
                                // cards, so the reader can tell an empty row from a missing one.
                                QuizRowLabel("Melody")
                                Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                                if (hasMelodyCards) {
                                    if (singleMelodyPitchCard != null) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth().height(64.dp),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Spacer(modifier = Modifier.weight(0.5f))
                                            Spacer(modifier = Modifier.weight(0.5f))
                                            Surface(
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .fillMaxHeight()
                                                    .semantics {
                                                        contentDescription = "Play current melody note ${singleMelodyPitchCard.scaleDegreeLabel}. Double tap to sing it back. Long press to toggle persistent pitch practice."
                                                    }
                                                    .combinedClickable(
                                                        onClick = {
                                                            playSingleNotePreview(singleMelodyPitchCard.pitch)
                                                        },
                                                        onDoubleClick = {
                                                            openSingleMelodySingingTarget(
                                                                singleMelodyPitchCard.pitch,
                                                                singleMelodyPitchCard.scaleDegreeLabel
                                                            )
                                                        },
                                                        onLongClick = handleMelodyLongClick
                                                    ),
                                                shape = RoundedCornerShape(16.dp),
                                                color = MaterialTheme.colorScheme.primary,
                                                contentColor = MaterialTheme.colorScheme.onPrimary
                                            ) {
                                                Box(
                                                    modifier = Modifier.fillMaxSize().padding(horizontal = 4.dp),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    if (
                                                        resolvedPersistentPitchTarget?.position == PersistentPitchCardPosition.MelodyCurrent &&
                                                        persistentPitchGaugeResult != null
                                                    ) {
                                                        PitchGauge(
                                                            pitchResult = persistentPitchGaugeResult,
                                                            targetLabel = resolvedPersistentPitchTarget.label,
                                                            modifier = Modifier.matchParentSize()
                                                        )
                                                    }
                                                    // After the gauge, so the moving bar passes behind
                                                    // the degree rather than across it.
                                                    ScaleDegreeText(
                                                        label = singleMelodyPitchCard.scaleDegreeLabel,
                                                        fontSize = 28.sp,
                                                        minFontSize = 12.sp,
                                                        modifier = Modifier.fillMaxSize(),
                                                        color = MaterialTheme.colorScheme.onPrimary
                                                    )
                                                    DoubleTapHint(
                                                        modifier = Modifier.padding(4.dp),
                                                        isTessituraAdjusted = isTessituraAdjusted
                                                    )
                                                }
                                            }
                                        }
                                    } else {
                                Row(
                                    modifier = Modifier.fillMaxWidth().height(64.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    repeat(2) { index ->
                                        val pitchCard = melodyPitchCards.getOrNull(index)
                                        val verticalPosition = pitchCard?.verticalPosition
                                            ?: if (index == 0) {
                                                MelodyPitchCardVerticalPosition.TOP
                                            } else {
                                                MelodyPitchCardVerticalPosition.BOTTOM
                                            }
                                        val contentAlignment = if (verticalPosition == MelodyPitchCardVerticalPosition.TOP) {
                                            Alignment.TopCenter
                                        } else {
                                            Alignment.BottomCenter
                                        }
                                        Box(
                                            modifier = Modifier.weight(0.5f).fillMaxHeight(),
                                            contentAlignment = contentAlignment
                                        ) {
                                            Surface(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .height(30.dp)
                                                    .semantics {
                                                        contentDescription = when (pitchCard?.role) {
                                                            MelodyPitchCardRole.PREVIOUS -> "Play prior melody note ${pitchCard.scaleDegreeLabel}. Double tap to sing it back. Long press to toggle persistent pitch practice."
                                                            MelodyPitchCardRole.CURRENT -> "Play current melody note ${pitchCard.scaleDegreeLabel}. Double tap to sing it back. Long press to toggle persistent pitch practice."
                                                            null -> "Melody note unavailable"
                                                        }
                                                    }
                                                    .combinedClickable(
                                                        enabled = pitchCard != null,
                                                        onClick = {
                                                            pitchCard?.let { playSingleNotePreview(it.pitch) }
                                                        },
                                                        onDoubleClick = {
                                                            pitchCard?.let {
                                                                openSingleMelodySingingTarget(
                                                                    it.pitch,
                                                                    it.scaleDegreeLabel
                                                                )
                                                            }
                                                        },
                                                        onLongClick = handleMelodyLongClick
                                                    ),
                                                shape = RoundedCornerShape(16.dp),
                                                color = MaterialTheme.colorScheme.primary,
                                                contentColor = MaterialTheme.colorScheme.onPrimary
                                            ) {
                                                Box(
                                                    modifier = Modifier.fillMaxSize().padding(horizontal = 4.dp),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    if (pitchCard != null) {
                                                        ScaleDegreeText(
                                                            label = pitchCard.scaleDegreeLabel,
                                                            fontSize = 22.sp,
                                                            minFontSize = 10.sp,
                                                            modifier = Modifier.fillMaxSize(),
                                                            color = MaterialTheme.colorScheme.onPrimary
                                                        )
                                                    } else {
                                                        Text("—", fontSize = 18.sp)
                                                    }
                                                    if (pitchCard != null) {
                                                        DoubleTapHint(
                                                            modifier = Modifier.padding(2.dp),
                                                            isTessituraAdjusted = isTessituraAdjusted
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    Surface(
                                    modifier = Modifier.weight(1f).fillMaxHeight()
                                        .semantics {
                                            contentDescription = melodyIntervalState?.contentDescription?.let { "$it Double tap to sing it back. Long press to toggle persistent pitch practice." }
                                                ?: "Melody interval unavailable"
                                        }
                                        .combinedClickable(
                                            enabled = melodyIntervalState != null,
                                            onClick = {
                                                melodyIntervalState?.let { state ->
                                                    playIntervalPreview(state.previous, state.current)
                                                }
                                            },
                                            onDoubleClick = {
                                                melodyIntervalState?.let { state ->
                                                    requestSingingTargets(
                                                        SingingTargetRequest(
                                                            first = SingingTargetNote(intervalPreviewNote(state.previous), melodyPreviousTargetLabel),
                                                            second = SingingTargetNote(intervalPreviewNote(state.current), melodyCurrentTargetLabel),
                                                            requestId = 0
                                                        )
                                                    )
                                                }
                                            },
                                            onLongClick = handleMelodyLongClick
                                        ),
                                    shape = RoundedCornerShape(16.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                ) {
                                    Box(modifier = Modifier.fillMaxSize()) {
                                        // Once there is a prior note this card occupies the slot the
                                        // lone scale-degree card sits in, so hosting the gauge here
                                        // keeps the singer's feedback in one place on screen as the
                                        // melody moves in and out of having a predecessor. What is
                                        // being measured is unchanged: still the current note.
                                        if (
                                            resolvedPersistentPitchTarget?.position == PersistentPitchCardPosition.MelodyCurrent &&
                                            persistentPitchGaugeResult != null
                                        ) {
                                            PitchGauge(
                                                pitchResult = persistentPitchGaugeResult,
                                                targetLabel = resolvedPersistentPitchTarget.label,
                                                modifier = Modifier.matchParentSize()
                                            )
                                        }
                                        // After the gauge, so the moving bar passes behind the
                                        // interval rather than across it.
                                        Text(
                                            text = melodyIntervalState?.interval?.shorthand ?: "—",
                                            modifier = Modifier.align(Alignment.Center),
                                            fontSize = 32.sp,
                                            fontWeight = FontWeight.Bold,
                                            textAlign = TextAlign.Center,
                                            maxLines = 1
                                        )
                                        if (melodyIntervalState != null) {
                                            DoubleTapHint(
                                                modifier = Modifier.padding(4.dp),
                                                isTessituraAdjusted = isTessituraAdjusted
                                            )
                                        }
                                    }
                                }
                                }
                                    }
                                }
                                }
                                }
                                // A rest, or a chord whose root will not resolve, empties these
                                // rows but does not remove them: the captions and the row heights
                                // stay put so the stack never shifts and the fader beside it
                                // always ends level with the chord-tone cards.
                                val soundingChord = currentChord?.takeUnless { chord ->
                                    (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                                        (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
                                }
                                val romanDisplay = soundingChord?.let { chord ->
                                    val symbol = if (useRelativeIonianContext) ChordInterpreter.getRelativeIonianRomanSymbol(chord, activeKey, ionianContextKey) else ChordInterpreter.getRomanSymbol(chord, activeKey)
                                    RomanNumeralDisplay.fromChord(symbol, chord["borrowed"])
                                }
                                val interpretation = soundingChord?.let { ChordInterpreter.interpret(it, activeKey) }
                                val notes = interpretation?.midi.orEmpty()
                                val rootMidi = interpretation?.rootMidi ?: 0
                                val spelledRoot = soundingChord?.let { ChordInterpreter.resolveChordRoot(it, activeKey)?.pitch }
                                // The card plays the chord as written, at the song's own
                                // tempo. The tempo and arpeggio knobs steer the transport,
                                // not the cards, so neither is read here.
                                val chordDurationMs = soundingChord?.let { chord ->
                                    val chordDurationBeats = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                                    remainingPlaybackDurationMs(chordDurationBeats, 0.0, baseBpm.toDouble())
                                }
                                val previewNotes = notes
                                val degreeSpacing = when { notes.size >= 7 -> 2.dp; notes.size >= 5 -> 4.dp; else -> 6.dp }
                                val degreeFontSize = when { notes.size >= 7 -> 24.sp; notes.size >= 5 -> 26.sp; else -> 28.sp }

                                Spacer(Modifier.height(QUIZ_CARD_ROW_SPACING))
                                Row(modifier = Modifier.fillMaxWidth().height(QUIZ_CHORD_ROW_HEIGHT), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    QuizRowLabel("Chord")
                                    if (romanDisplay != null) {
                                        Button(onClick = { chordDurationMs?.let { playCardPreview(previewNotes, durationMs = it) } }, enabled = chordDurationMs != null, modifier = Modifier.weight(1f).fillMaxHeight(), shape = RoundedCornerShape(16.dp), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)) {
                                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { RomanNumeralText(display = romanDisplay, fontSize = 32.sp, modifier = Modifier.fillMaxWidth(), minFontSize = 12.sp) }
                                        }
                                    } else {
                                        Spacer(modifier = Modifier.weight(1f))
                                    }
                                }
                                Spacer(Modifier.height(QUIZ_CARD_ROW_SPACING))
                                Row(modifier = Modifier.fillMaxWidth().height(QUIZ_CHORD_TONE_ROW_HEIGHT), horizontalArrangement = Arrangement.spacedBy(degreeSpacing), verticalAlignment = Alignment.CenterVertically) {
                                            QuizRowLabel("Chord Tones")
                                            // Degrees are measured from the chord root, so without one
                                            // there is nothing to label: hold the row empty instead.
                                            val toneCards = if (rootMidi > 0) notes else emptyList()
                                            if (toneCards.isEmpty()) {
                                                Spacer(modifier = Modifier.weight(1f))
                                            }
                                            toneCards.forEachIndexed { index, note ->
                                                // Chord-tone cards describe the chord's internal structure, so
                                                // their degrees always stay relative to the effective chord root.
                                                val cardTarget = currentChordToneTargets.getOrNull(index)
                                                val internalLabel = cardTarget?.label
                                                    ?: interpretation?.toneLabels?.getOrNull(index).orEmpty()
                                                val previewNote = cardTarget?.sourceMidi
                                                    ?: if (useRelativeIonianContext) (spelledRoot?.let { ionianContextPreviewAudioNote(note, it, ionianContextKey) } ?: ionianContextPreviewAudioNote(note, ionianContextKey)) ?: note else note
                                                val activeChordToneIndex =
                                                    (resolvedPersistentPitchTarget?.position as? PersistentPitchCardPosition.ChordTone)
                                                        ?.displayedIndex
                                                Surface(
                                                    modifier = Modifier.weight(1f).fillMaxHeight()
                                                        .semantics { contentDescription = "Play scale degree $internalLabel. Double tap to sing it back. Long press to toggle persistent pitch practice." }
                                                        .combinedClickable(
                                                            onClick = {
                                                                playCardPreview(listOf(tessituraPreviewMidi(previewNote)))
                                                            },
                                                            onDoubleClick = {
                                                                requestSingingTargets(
                                                                    SingingTargetRequest(
                                                                        first = SingingTargetNote(previewNote, internalLabel),
                                                                        second = null,
                                                                        requestId = 0
                                                                    )
                                                                )
                                                            },
                                                            onLongClick = { handleChordToneLongClick(index) }
                                                        ),
                                                    shape = RoundedCornerShape(14.dp),
                                                    color = MaterialTheme.colorScheme.primary,
                                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                                ) {
                                                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                                        if (
                                                            activeChordToneIndex == index &&
                                                            persistentPitchGaugeResult != null
                                                        ) {
                                                            PitchGauge(
                                                                pitchResult = persistentPitchGaugeResult,
                                                                targetLabel = resolvedPersistentPitchTarget?.label.orEmpty(),
                                                                modifier = Modifier.matchParentSize()
                                                            )
                                                        }
                                                        // After the gauge, so the moving bar passes
                                                        // behind the degree rather than across it.
                                                        ScaleDegreeText(label = internalLabel, fontSize = degreeFontSize, modifier = Modifier.fillMaxWidth(), minFontSize = 12.sp)
                                                        DoubleTapHint(
                                                            modifier = Modifier.padding(2.dp),
                                                            isTessituraAdjusted = isTessituraAdjusted
                                                        ) }
                                                } }
                                        }
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.Top
                    ) {
                            QuizDial(
                                label = "Tempo",
                                valueLabel = "${tempoPercent.roundToInt()}%",
                                value = tempoPercent,
                                onValueChange = onTempoPercentChange,
                                valueRange = 0f..200f,
                                steps = 200,
                                onTap = { onTempoPercentChange(100f) },
                                modifier = Modifier.weight(1f).testTag(QUIZ_TEMPO_DIAL_TEST_TAG)
                            )
                            QuizDial(
                                label = "Arpeggiate",
                                valueLabel = "cycles per beat",
                                value = arpeggioOptionIndex.toFloat(),
                                onValueChange = {
                                    onArpeggioOptionIndexChange(
                                        it.roundToInt().coerceIn(QUIZ_ARPEGGIO_OPTIONS.indices)
                                    )
                                },
                                valueRange = 0f..QUIZ_ARPEGGIO_OPTIONS.lastIndex.toFloat(),
                                steps = QUIZ_ARPEGGIO_OPTIONS.lastIndex,
                                ringLabels = QUIZ_ARPEGGIO_OPTIONS.map { it.label },
                                onTap = {
                                    onArpeggioOptionIndexChange(DEFAULT_QUIZ_ARPEGGIO_OPTION_INDEX)
                                },
                                modifier = Modifier.weight(1f)
                            )
                            val melodyPercent = (melodyChordBalance * 100f).roundToInt()
                            val chordPercent = 100 - melodyPercent
                            QuizDial(
                                label = "Melody / Chord Mix",
                                valueLabel = "$melodyPercent% / $chordPercent%",
                                value = melodyChordBalance,
                                onValueChange = { melodyChordBalance = it },
                                valueRange = 0f..1f,
                                steps = 100,
                                ringLabels = listOf("Chord", "Equal", "Melody"),
                                onTap = { melodyChordBalance = 0.5f },
                                modifier = Modifier.weight(1f)
                            )
                        }

                    Spacer(modifier = Modifier.weight(1f))

                    // Unified playback scrub bar. Simple mode only: the full quiz
                    // scrubs by dragging its own timeline instead.
                    if (isSimpleMode) {
                        Slider(
                            value = currentBeat.toFloat().coerceIn(1f, endBeat.toFloat()),
                            onValueChange = { beat -> scrubTo(beat.toDouble()) },
                            onValueChangeFinished = { finishScrubbing() },
                            valueRange = 1f..endBeat.toFloat(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(32.dp)
                        )
                    }

                    persistentPitchController.errorMessage?.let { message ->
                        Text(
                            text = message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                    playbackState.error?.let { message ->
                        Text(
                            text = message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                if (!isScrubbing && bpm > 0.0) {
                                    intervalPreviewJob?.cancel()
                                    AudioEngine.stopPreviewPlayback()
                                    if (isPlaying) QuizPlaybackController.pause() else QuizPlaybackController.play()
                                }
                            },
                            enabled = !isScrubbing && bpm > 0.0,
                            modifier = Modifier.semantics {
                                contentDescription = if (isPlaying) "Pause" else "Play"
                            }
                        ) {
                            if (isPlaying) {
                                Text("Ⅱ")
                            } else {
                                Icon(Icons.Default.PlayArrow, contentDescription = null)
                            }
                            Spacer(Modifier.width(4.dp))
                            Text(if (isPlaying) "Pause" else "Play")
                        }
                        FilledTonalButton(
                            onClick = { stepBeat(-1.0) },
                            modifier = Modifier.semantics { contentDescription = "Previous beat" }
                        ) { Text("−1") }
                        FilledTonalButton(
                            onClick = { stepBeat(1.0) },
                            modifier = Modifier.semantics { contentDescription = "Next beat" }
                        ) { Text("+1") }
                        FilledTonalButton(
                            onClick = {
                                cancelInertia()
                                intervalPreviewJob?.cancel()
                                AudioEngine.stopAllPlayback()
                                isScrubbing = false
                                wasPlayingBeforeScrub = false
                                scrubBeat = 1.0
                                QuizPlaybackController.reset()
                                melodyRunScoreAccumulator.clear()
                                fixedMelodyPitchScores = emptyMap()
                            }
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = "Reset")
                        }
                        sectionPicker()
                        QuizInstrumentMenu(
                            selectedInstrument = currentWaveform,
                            onInstrumentSelected = onWaveformChange
                        )
                        transposePicker()
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "Root Only",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Switch(
                                checked = isSimpleMode,
                                onCheckedChange = {
                                    persistentPitchController.cancel()
                                    onSimpleModeChange(it)
                                },
                                modifier = Modifier.testTag(QUIZ_MODE_SWITCH_TEST_TAG)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(56.dp))
                }
            }
    }
}
