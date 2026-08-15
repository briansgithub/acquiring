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

// Onset gating. The detector analyses a 64ms window every 16ms, so a settle window has to
// be longer than 64ms or consecutive frames share most of their audio and agree trivially.
internal const val MELODY_PITCH_SETTLE_WINDOW_MS = 96L
// Wider than raw YIN jitter on a sustained vowel and light vibrato, narrower than a
// semitone so a scoop can never pass as a hold, and under the 50-cent yellow/red boundary
// so sitting inside the band still claims nothing about accuracy.
internal const val MELODY_PITCH_SETTLE_TOLERANCE_CENTS = 40.0
// Capture and analysis lag is ~80-130ms; anything read before this is the previous note.
internal const val MELODY_PITCH_SETTLE_FLOOR_MS = 150L
internal const val MELODY_PITCH_SETTLE_CAP_MS = 500L

// Below this a median is a coin flip: 8 samples is ~128ms, two independent analysis windows.
internal const val MELODY_MIN_SCORE_SAMPLES = 8
// ~8.2s of audio, longer than any melody note here, at a fixed 4KB per accumulator.
internal const val MELODY_MAX_SCORE_SAMPLES = 512

private const val MELODY_SCORE_DIRECTION_DEADBAND_CENTS = 5.0
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
    /** Displayed number: [centsErrorMagnitude] clamped and rounded. */
    val errorPercentage: Int,
    /** Median of the signed samples. Chooses the +/- prefix, nothing else. */
    val signedCentsError: Double,
    /** Median of the absolute samples. Drives both the number and the colour. */
    val centsErrorMagnitude: Double,
    val sampleCount: Int
)

internal sealed interface MelodyRunScoreOutcome {
    val runId: Int

    /** The run held still long enough to say something about it. */
    data class Scored(
        override val runId: Int,
        val score: MelodyTimelinePitchScore
    ) : MelodyRunScoreOutcome

    /** Listened through the run and could not score it: silent, or never settled. */
    data class Unscored(override val runId: Int) : MelodyRunScoreOutcome
}

internal fun formatMelodyTimelinePitchScore(score: MelodyTimelinePitchScore): String {
    // Signed and absolute medians are different statistics, so a singer wobbling evenly
    // either side of the target has a real magnitude but no meaningful direction. Say
    // nothing rather than let a sign flip on noise.
    val directionPrefix = when {
        score.signedCentsError <= -MELODY_SCORE_DIRECTION_DEADBAND_CENTS -> "-"
        score.signedCentsError >= MELODY_SCORE_DIRECTION_DEADBAND_CENTS -> "+"
        else -> ""
    }
    return "$directionPrefix${score.errorPercentage}%"
}

/**
 * Collects the cents error measured across one melody run and reduces it to a badge.
 *
 * Melody practice runs on [PitchTrackingMode.MELODY_FAST], which disables the median and
 * EMA in [PitchSmoother] to keep the live gauge responsive, so every sample here is a raw
 * detector frame and a single harmonic glitch can be hundreds of cents out. Number, sign
 * and colour are therefore all taken from medians of the same sample set: one bad frame
 * cannot move the badge, and the three cannot disagree with each other.
 */
internal class MelodyTimelinePitchScoreAccumulator {
    private var activeRunId: Int? = null
    private val samples = DoubleArray(MELODY_MAX_SCORE_SAMPLES)
    private var storedCount = 0

    fun begin(runId: Int) {
        clear()
        activeRunId = runId
    }

    fun add(runId: Int, centsError: Double) {
        if (runId != activeRunId || !centsError.isFinite()) return
        // A run this long is beyond any melody note here; keeping the earliest samples is
        // as representative as any other choice and keeps the allocation fixed.
        if (storedCount >= samples.size) return
        samples[storedCount++] = centsError
    }

    /**
     * @return null when [runId] is not the run in progress (the call does not apply), an
     *   [MelodyRunScoreOutcome.Unscored] when too little of the run was measurable, and a
     *   [MelodyRunScoreOutcome.Scored] otherwise.
     */
    fun finish(runId: Int): MelodyRunScoreOutcome? {
        if (runId != activeRunId) return null
        val outcome = if (storedCount < MELODY_MIN_SCORE_SAMPLES) {
            MelodyRunScoreOutcome.Unscored(runId)
        } else {
            val signed = samples.copyOf(storedCount).apply { sort() }
            val magnitudes = DoubleArray(storedCount) { abs(samples[it]) }.apply { sort() }
            val medianMagnitude = magnitudes[storedCount / 2]
            MelodyRunScoreOutcome.Scored(
                runId = runId,
                score = MelodyTimelinePitchScore(
                    errorPercentage = medianMagnitude.roundToInt().coerceIn(0, 100),
                    signedCentsError = signed[storedCount / 2],
                    centsErrorMagnitude = medianMagnitude,
                    sampleCount = storedCount
                )
            )
        }
        clear()
        return outcome
    }

    fun clear() {
        activeRunId = null
        storedCount = 0
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

/**
 * Whether the live readout should print a percentage at all.
 *
 * [pitchErrorPercentage] saturates at 100, which it reaches a semitone out. Past that the
 * number no longer separates "slightly flat" from "singing a different note entirely", so
 * printing it claims a precision the reading does not have. The marker keeps tracking the
 * pitch either way, and banked run scores are unaffected - those are medians over a whole
 * run rather than one instant, so a pinned value there is a real finding.
 */
internal fun showsLivePitchErrorPercentage(centsError: Double): Boolean =
    pitchErrorPercentage(centsError) < 100

internal fun formatPitchErrorPercentage(centsError: Double): String {
    val directionPrefix = when {
        centsError > 0.0 -> "+"
        centsError < 0.0 -> "-"
        else -> ""
    }
    return "$directionPrefix${pitchErrorPercentage(centsError)}%"
}

/**
 * Decides when a sung note has stopped moving and may be scored.
 *
 * At a note change the singer is still hearing the new pitch and sliding onto it, and the
 * detector is still reporting the tail of the previous note. Those frames measure the
 * transition, not the note. How long that takes is not fixed - a clean attack lands in a
 * fraction of the time a leap with a scoop does - so rather than discard a fixed window
 * this watches the measurement itself and opens as soon as it holds still.
 *
 * Bounded by [floorMs] and [capMs], so it can only ever open earlier than a flat [capMs]
 * grace, never later. Once open it latches: re-closing when the singer drifts away would
 * score only the parts they sang well, which is the accuracy bias this feature exists to
 * report on.
 */
internal class MelodyRunSettleDetector(
    private val settleWindowMs: Long = MELODY_PITCH_SETTLE_WINDOW_MS,
    private val toleranceCents: Double = MELODY_PITCH_SETTLE_TOLERANCE_CENTS,
    private val floorMs: Long = MELODY_PITCH_SETTLE_FLOOR_MS,
    private val capMs: Long = MELODY_PITCH_SETTLE_CAP_MS
) {
    private val windowCents = ArrayDeque<Double>()
    private val windowAtMs = ArrayDeque<Long>()
    private var settled = false

    init {
        require(settleWindowMs > 0L)
        require(toleranceCents > 0.0)
        require(floorMs >= 0L)
        require(capMs >= floorMs)
    }

    /**
     * Observes one frame.
     *
     * Deliberately keyed on self-consistency rather than nearness to the target: a singer
     * confidently holding the wrong note has settled, and that reading is exactly what the
     * badge should report. Gating on target proximity would bias every score toward
     * flattering the user.
     *
     * @return true once samples from this instant onward may be scored. Latches.
     */
    fun observe(elapsedMs: Long, centsError: Double?): Boolean {
        if (settled) return true
        if (elapsedMs >= capMs) {
            settled = true
            return true
        }
        if (centsError == null || !centsError.isFinite()) {
            // A dropout says nothing about whether the singer landed, and the frames on
            // either side of it are not contiguous.
            windowCents.clear()
            windowAtMs.clear()
            return false
        }

        windowCents.addLast(centsError)
        windowAtMs.addLast(elapsedMs)
        while (windowAtMs.size > 1 && elapsedMs - windowAtMs.first() > settleWindowMs) {
            windowCents.removeFirst()
            windowAtMs.removeFirst()
        }

        if (elapsedMs < floorMs) return false
        if (elapsedMs - windowAtMs.first() < settleWindowMs) return false
        // MicrophonePitchTracker republishes its last estimate for 200ms after signal loss,
        // so a bit-identical reading is a stale value being replayed into the new note - not
        // a singer holding still. A real held pitch always jitters.
        if (windowCents.all { it == windowCents.first() }) return false
        if (windowCents.max() - windowCents.min() > toleranceCents) return false

        settled = true
        return true
    }
}

/**
 * Feeds measured cents error into [accumulator] for the run that is currently sounding,
 * starting once [settleDetector] reports the sung pitch has landed.
 *
 * Elapsed time is counted nominally, in [sampleIntervalMs] steps, rather than read from a
 * clock: it keeps the loop deterministic under `runTest`, and when the dispatcher runs long
 * the count lags real time, so the detector's hard cap fires late rather than early.
 */
internal suspend fun accumulateMelodyRunPitchSamples(
    runId: Int,
    accumulator: MelodyTimelinePitchScoreAccumulator,
    latestCentsError: () -> Double?,
    settleDetector: MelodyRunSettleDetector = MelodyRunSettleDetector(),
    sampleIntervalMs: Long = MELODY_PITCH_SCORE_SAMPLE_MS
) {
    require(sampleIntervalMs > 0L)
    var elapsedMs = 0L
    while (true) {
        val centsError = latestCentsError()
        if (settleDetector.observe(elapsedMs, centsError) && centsError != null) {
            accumulator.add(runId, centsError)
        }
        delay(sampleIntervalMs)
        elapsedMs += sampleIntervalMs
    }
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
