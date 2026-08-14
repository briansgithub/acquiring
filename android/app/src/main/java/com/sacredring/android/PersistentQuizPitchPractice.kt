package com.sacredring.android

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.roundToInt

internal const val MELODY_PITCH_PERCENTAGE_UPDATE_MS = 250L
internal const val MELODY_PITCH_SCORE_SAMPLE_MS = 16L
private const val MELODY_RUN_CONTIGUITY_EPSILON = 1e-6

internal sealed interface PersistentPitchSelection {
    data object SimpleRoot : PersistentPitchSelection
    data class ChordTone(val requestedIndex: Int) : PersistentPitchSelection
    data object Melody : PersistentPitchSelection
}

internal data class QuizPitchCardTarget(
    val sourceMidi: Int,
    val label: String
)

internal data class MelodyTimelinePitchVisual(
    val beat: Double,
    val duration: Double,
    val staffDegree: Int,
    val sourceMidi: Int?
)

internal data class MelodyTimelinePitchRun(
    val id: Int,
    val beat: Double,
    val duration: Double,
    val staffDegree: Int,
    val sourceMidi: Int?
) {
    val endBeat: Double get() = beat + duration
    val centerBeat: Double get() = beat + duration / 2.0
}

internal fun buildMelodyTimelinePitchRuns(
    visuals: List<MelodyTimelinePitchVisual>
): List<MelodyTimelinePitchRun> {
    val sorted = visuals
        .filter { it.duration > 0.0 }
        .sortedBy(MelodyTimelinePitchVisual::beat)
    if (sorted.isEmpty()) return emptyList()

    val runs = mutableListOf<MelodyTimelinePitchRun>()
    var first = sorted.first()
    var endBeat = first.beat + first.duration

    fun finishRun() {
        runs += MelodyTimelinePitchRun(
            id = runs.size,
            beat = first.beat,
            duration = endBeat - first.beat,
            staffDegree = first.staffDegree,
            sourceMidi = first.sourceMidi
        )
    }

    sorted.drop(1).forEach { visual ->
        val touchesCurrentRun = visual.beat <= endBeat + MELODY_RUN_CONTIGUITY_EPSILON
        val isSamePitch = visual.staffDegree == first.staffDegree &&
            visual.sourceMidi == first.sourceMidi
        if (touchesCurrentRun && isSamePitch) {
            endBeat = maxOf(endBeat, visual.beat + visual.duration)
        } else {
            finishRun()
            first = visual
            endBeat = visual.beat + visual.duration
        }
    }
    finishRun()
    return runs
}

internal fun melodyTimelinePitchRunAtBeat(
    runs: List<MelodyTimelinePitchRun>,
    beat: Double
): MelodyTimelinePitchRun? = runs.lastOrNull { run ->
    beat >= run.beat && beat < run.endBeat
}

internal data class MelodyTimelinePitchScore(
    val runId: Int,
    val errorPercentage: Int,
    val averageCentsError: Double,
    val averageAbsoluteCentsError: Double,
    val sampleCount: Int
)

internal fun formatMelodyTimelinePitchScore(score: MelodyTimelinePitchScore): String {
    val directionPrefix = if (score.averageCentsError < 0.0) "-" else "+"
    return "$directionPrefix${score.errorPercentage}%"
}

internal class MelodyTimelinePitchScoreAccumulator {
    private var activeRunId: Int? = null
    private var errorPercentageSum = 0.0
    private var centsSum = 0.0
    private var absoluteCentsSum = 0.0
    private var sampleCount = 0

    fun begin(runId: Int) {
        clear()
        activeRunId = runId
    }

    fun add(runId: Int, centsError: Double) {
        if (runId != activeRunId || !centsError.isFinite()) return
        errorPercentageSum += abs(centsError).coerceIn(0.0, 100.0)
        centsSum += centsError
        absoluteCentsSum += abs(centsError)
        sampleCount++
    }

    fun finish(runId: Int): MelodyTimelinePitchScore? {
        if (runId != activeRunId) return null
        val score = if (sampleCount == 0) {
            null
        } else {
            MelodyTimelinePitchScore(
                runId = runId,
                errorPercentage = (errorPercentageSum / sampleCount)
                    .roundToInt()
                    .coerceIn(0, 100),
                averageCentsError = centsSum / sampleCount,
                averageAbsoluteCentsError = absoluteCentsSum / sampleCount,
                sampleCount = sampleCount
            )
        }
        clear()
        return score
    }

    fun clear() {
        activeRunId = null
        errorPercentageSum = 0.0
        centsSum = 0.0
        absoluteCentsSum = 0.0
        sampleCount = 0
    }
}

internal sealed interface PersistentPitchCardPosition {
    data object SimpleRoot : PersistentPitchCardPosition
    data class ChordTone(val displayedIndex: Int) : PersistentPitchCardPosition
    data object MelodyCurrent : PersistentPitchCardPosition
}

internal data class ResolvedPersistentPitchTarget(
    val sourceMidi: Int,
    val label: String,
    val position: PersistentPitchCardPosition
) {
    fun effectiveTargetMidi(globalTranspose: Int, tessituraShiftOctaves: Int): Int =
        sourceMidi + globalTranspose + tessituraShiftOctaves * 12
}

internal fun resolvePersistentPitchTarget(
    selection: PersistentPitchSelection?,
    simpleRoot: QuizPitchCardTarget?,
    chordTones: List<QuizPitchCardTarget>,
    melody: QuizPitchCardTarget?
): ResolvedPersistentPitchTarget? = when (selection) {
    PersistentPitchSelection.SimpleRoot -> simpleRoot?.let {
        ResolvedPersistentPitchTarget(it.sourceMidi, it.label, PersistentPitchCardPosition.SimpleRoot)
    }

    is PersistentPitchSelection.ChordTone -> {
        val displayedIndex = clampedChordToneIndex(selection.requestedIndex, chordTones.size)
            ?: return null
        chordTones[displayedIndex].let {
            ResolvedPersistentPitchTarget(
                sourceMidi = it.sourceMidi,
                label = it.label,
                position = PersistentPitchCardPosition.ChordTone(displayedIndex)
            )
        }
    }

    PersistentPitchSelection.Melody -> melody?.let {
        ResolvedPersistentPitchTarget(it.sourceMidi, it.label, PersistentPitchCardPosition.MelodyCurrent)
    }

    null -> null
}

internal fun clampedChordToneIndex(requestedIndex: Int, toneCount: Int): Int? {
    if (toneCount <= 0) return null
    return requestedIndex.coerceAtLeast(0).coerceAtMost(toneCount - 1)
}

internal fun retargetPitchResult(
    result: MicrophonePitchTracker.PitchResult,
    targetMidi: Int
): MicrophonePitchTracker.PitchResult = when (result) {
    is MicrophonePitchTracker.PitchResult.Estimate -> result.copy(
        centsError = (result.midi - targetMidi) * 100.0
    )

    else -> result
}

internal fun melodyTimelinePitchEstimate(
    selection: PersistentPitchSelection?,
    resolvedTarget: ResolvedPersistentPitchTarget?,
    pitchResult: MicrophonePitchTracker.PitchResult?
): MicrophonePitchTracker.PitchResult.Estimate? {
    if (selection != PersistentPitchSelection.Melody) return null
    if (resolvedTarget?.position != PersistentPitchCardPosition.MelodyCurrent) return null
    return pitchResult as? MicrophonePitchTracker.PitchResult.Estimate
}

internal fun pitchErrorToTimelineStaffSteps(centsError: Double): Double =
    centsError * 7.0 / 1200.0

internal fun pitchErrorPercentage(centsError: Double): Int =
    abs(centsError).roundToInt().coerceIn(0, 100)

internal fun formatPitchErrorPercentage(centsError: Double): String {
    val directionPrefix = when {
        centsError > 0.0 -> "+"
        centsError < 0.0 -> "-"
        else -> ""
    }
    return "$directionPrefix${pitchErrorPercentage(centsError)}%"
}

internal suspend fun samplePitchErrorCents(
    latestCentsError: () -> Double?,
    updateIntervalMs: Long,
    onSample: (Double?) -> Unit
) {
    require(updateIntervalMs > 0L)
    onSample(latestCentsError())
    while (true) {
        delay(updateIntervalMs)
        onSample(latestCentsError())
    }
}

@Composable
internal fun rememberSampledPitchErrorCents(
    centsError: Double?,
    updateIntervalMs: Long = MELODY_PITCH_PERCENTAGE_UPDATE_MS
): Double? {
    val latestCentsError by rememberUpdatedState(centsError)
    var displayedCentsError by remember { mutableStateOf<Double?>(null) }
    val hasPitchEstimate = centsError != null

    LaunchedEffect(hasPitchEstimate, updateIntervalMs) {
        if (!hasPitchEstimate) {
            displayedCentsError = null
            return@LaunchedEffect
        }

        samplePitchErrorCents(
            latestCentsError = { latestCentsError },
            updateIntervalMs = updateIntervalMs
        ) { sampledCentsError ->
            displayedCentsError = sampledCentsError
        }
    }

    return displayedCentsError
}

internal fun trackingModeForPersistentPitchSelection(
    selection: PersistentPitchSelection
): PitchTrackingMode = if (selection == PersistentPitchSelection.Melody) {
    PitchTrackingMode.MELODY_FAST
} else {
    PitchTrackingMode.STANDARD
}

internal enum class PersistentPitchPhase {
    IDLE,
    AWAITING_PERMISSION,
    LISTENING
}

internal class PersistentQuizPitchController(
    private val pitchSource: ExclusivePitchSource
) {
    var selection by mutableStateOf<PersistentPitchSelection?>(null)
        private set
    var phase by mutableStateOf(PersistentPitchPhase.IDLE)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set

    private var initialTargetMidi: Int? = null

    fun activate(
        newSelection: PersistentPitchSelection,
        targetMidi: Int,
        hasRecordPermission: Boolean
    ): Boolean {
        cancel()
        errorMessage = null
        selection = newSelection
        initialTargetMidi = targetMidi
        pitchSource.claim(trackingModeForPersistentPitchSelection(newSelection))

        return if (hasRecordPermission) {
            pitchSource.start(targetMidi)
            phase = PersistentPitchPhase.LISTENING
            false
        } else {
            phase = PersistentPitchPhase.AWAITING_PERMISSION
            true
        }
    }

    fun onPermissionResult(granted: Boolean) {
        if (phase != PersistentPitchPhase.AWAITING_PERMISSION) return
        val targetMidi = initialTargetMidi
        if (granted && targetMidi != null && pitchSource.ownsMicrophone.value) {
            pitchSource.start(targetMidi)
            phase = PersistentPitchPhase.LISTENING
        } else {
            if (pitchSource.ownsMicrophone.value) pitchSource.stop()
            selection = null
            initialTargetMidi = null
            phase = PersistentPitchPhase.IDLE
            if (!granted) errorMessage = "Microphone permission denied"
        }
    }

    fun onOwnershipChanged(ownsMicrophone: Boolean) {
        if (ownsMicrophone || phase == PersistentPitchPhase.IDLE) return
        selection = null
        initialTargetMidi = null
        phase = PersistentPitchPhase.IDLE
    }

    fun cancel() {
        pitchSource.stop()
        selection = null
        initialTargetMidi = null
        phase = PersistentPitchPhase.IDLE
    }

    fun fail(message: String) {
        cancel()
        errorMessage = message
    }

    fun clearError() {
        errorMessage = null
    }
}
