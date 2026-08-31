package com.acquiring.android

import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class PersistentQuizPitchPracticeTest {

    @Test
    fun chordToneSelectionKeepsRequestedIndexWhileDisplayClampsPerChord() {
        val selection = PersistentPitchSelection.ChordTone(requestedIndex = 2)
        val twoTones = listOf(target(60), target(64))
        val fourTones = listOf(target(60), target(64), target(67), target(71))

        val clamped = resolvePersistentPitchTarget(selection, null, twoTones, null)
        val restored = resolvePersistentPitchTarget(selection, null, fourTones, null)

        assertEquals(PersistentPitchCardPosition.ChordTone(1), clamped?.position)
        assertEquals(64, clamped?.sourceMidi)
        assertEquals(PersistentPitchCardPosition.ChordTone(2), restored?.position)
        assertEquals(67, restored?.sourceMidi)
        assertNull(resolvePersistentPitchTarget(selection, null, emptyList(), null))
    }

    @Test
    fun rootAndMelodyResolveOnlyWhenTheirCurrentEventIsPitched() {
        val root = target(48)
        val melody = target(72)

        assertEquals(
            PersistentPitchCardPosition.SimpleRoot,
            resolvePersistentPitchTarget(
                PersistentPitchSelection.SimpleRoot,
                root,
                emptyList(),
                null
            )?.position
        )
        assertEquals(
            PersistentPitchCardPosition.MelodyCurrent,
            resolvePersistentPitchTarget(
                PersistentPitchSelection.Melody,
                null,
                emptyList(),
                melody
            )?.position
        )
        assertNull(
            resolvePersistentPitchTarget(
                PersistentPitchSelection.Melody,
                null,
                emptyList(),
                null
            )
        )
    }

    @Test
    fun measuredMidiIsRetargetedWithoutChangingTheCapturedPitch() {
        val original = MicrophonePitchTracker.PitchResult.Estimate(
            midi = 69.25,
            centsError = -975.0,
            confidence = 0.91
        )

        val retargeted = retargetPitchResult(original, targetMidi = 69)
            as MicrophonePitchTracker.PitchResult.Estimate

        assertEquals(69.25, retargeted.midi, 0.0)
        assertEquals(25.0, retargeted.centsError, 1e-9)
        assertEquals(0.91, retargeted.confidence, 0.0)
    }

    @Test
    fun melodyTimelineFeedbackRequiresAnActiveMelodyTargetAndEstimate() {
        val target = ResolvedPersistentPitchTarget(
            sourceMidi = 72,
            label = "1\u0302",
            position = PersistentPitchCardPosition.MelodyCurrent
        )
        val estimate = MicrophonePitchTracker.PitchResult.Estimate(
            midi = 72.2,
            centsError = 20.0,
            confidence = 0.9
        )

        assertEquals(
            estimate,
            melodyTimelinePitchEstimate(PersistentPitchSelection.Melody, target, estimate)
        )
        assertNull(melodyTimelinePitchEstimate(PersistentPitchSelection.Melody, null, estimate))
        assertNull(
            melodyTimelinePitchEstimate(PersistentPitchSelection.SimpleRoot, target, estimate)
        )
        assertNull(
            melodyTimelinePitchEstimate(
                PersistentPitchSelection.Melody,
                target,
                MicrophonePitchTracker.PitchResult.NoSignal
            )
        )
    }

    @Test
    fun timelineFeedbackUsesHistoricalGaugeColorsAndSignedCentsFormatting() {
        assertEquals(Color(0xFF4CAF50), pitchFeedbackColor(14.99))
        assertEquals(Color(0xFFFFEB3B), pitchFeedbackColor(-15.0))
        assertEquals(Color(0xFFFFEB3B), pitchFeedbackColor(49.99))
        assertEquals(Color(0xFFF44336), pitchFeedbackColor(-50.0))
        assertEquals("0¢", formatPitchCentsError(0.1))
        assertEquals("+13¢", formatPitchCentsError(12.6))
        assertEquals("-13¢", formatPitchCentsError(-12.6))
    }

    @Test
    fun melodyPitchMotionUsesTimelineOctaveSpacing() {
        assertEquals(0.0, pitchErrorToTimelineStaffSteps(0.0), 0.0)
        assertEquals(7.0, pitchErrorToTimelineStaffSteps(1200.0), 1e-9)
        assertEquals(-3.5, pitchErrorToTimelineStaffSteps(-600.0), 1e-9)
    }

    @Test
    fun contiguousMatchingMelodyNotesBecomeOneScoringRun() {
        val runs = buildMelodyTimelinePitchRuns(
            listOf(
                melodyVisual(beat = 1.0, duration = 0.5, staffDegree = 0, midi = 60),
                melodyVisual(beat = 1.5, duration = 0.5, staffDegree = 0, midi = 60),
                melodyVisual(beat = 2.0, duration = 0.5, staffDegree = 1, midi = 62),
                melodyVisual(beat = 2.5, duration = 0.5, staffDegree = 1, midi = 63),
                melodyVisual(beat = 3.25, duration = 0.5, staffDegree = 1, midi = 63)
            )
        )

        assertEquals(4, runs.size)
        assertEquals(1.0, runs[0].beat, 0.0)
        assertEquals(1.0, runs[0].duration, 0.0)
        assertEquals(1.5, runs[0].centerBeat, 0.0)
        assertEquals(runs[0], melodyTimelinePitchRunAtBeat(runs, 1.75))
        assertNull(melodyTimelinePitchRunAtBeat(runs, 3.1))
    }

    @Test
    fun finishedMelodyRunScoreReportsMagnitudeWithoutCancellingDirection() {
        val sharp = scoreOf(runId = 4, samples = List(12) { 20.0 })
        assertEquals(20, sharp?.errorPercentage)
        assertEquals(20.0, sharp?.signedCentsError ?: Double.NaN, 0.0)
        assertEquals(20.0, sharp?.centsErrorMagnitude ?: Double.NaN, 0.0)
        assertEquals(12, sharp?.sampleCount)
        assertEquals("+20%", sharp?.let(::formatMelodyTimelinePitchScore))

        val flat = scoreOf(runId = 5, samples = List(12) { -30.0 })
        assertEquals(30, flat?.errorPercentage)
        assertEquals("-30%", flat?.let(::formatMelodyTimelinePitchScore))
    }

    @Test
    fun oneWildFrameDoesNotFlipTheBadgeSignOrColour() {
        // A single subharmonic lock inside the tritone that PitchSmoother would not reject.
        // The running mean this replaced rendered "-15%" in yellow for this exact input.
        val score = scoreOf(runId = 9, samples = List(30) { 12.0 } + (-600.0))

        assertEquals(12, score?.errorPercentage)
        assertEquals("+12%", score?.let(::formatMelodyTimelinePitchScore))
        assertEquals(Color(0xFF4CAF50), pitchFeedbackColor(score!!.centsErrorMagnitude))
        assertEquals(31, score.sampleCount)
    }

    @Test
    fun scoreIsWithheldUntilEnoughSamplesSurvive() {
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId = 1)
        repeat(MELODY_MIN_SCORE_SAMPLES - 1) { accumulator.add(runId = 1, centsError = 8.0) }
        assertEquals(MelodyRunScoreOutcome.Unscored(1), accumulator.finish(runId = 1))

        accumulator.begin(runId = 2)
        repeat(MELODY_MIN_SCORE_SAMPLES) { accumulator.add(runId = 2, centsError = 8.0) }
        val outcome = accumulator.finish(runId = 2)
        assertTrue(outcome is MelodyRunScoreOutcome.Scored)
        assertEquals(MELODY_MIN_SCORE_SAMPLES, (outcome as MelodyRunScoreOutcome.Scored).score.sampleCount)
    }

    @Test
    fun magnitudeIsClampedOnceAtTheDisplayBoundary() {
        val outlier = scoreOf(runId = 6, samples = List(10) { -20.0 } + (-3000.0))
        assertEquals("-20%", outlier?.let(::formatMelodyTimelinePitchScore))

        val genuinelyFar = scoreOf(runId = 7, samples = List(10) { -300.0 })
        assertEquals(100, genuinelyFar?.errorPercentage)
        assertEquals("-100%", genuinelyFar?.let(::formatMelodyTimelinePitchScore))
        assertEquals(Color(0xFFF44336), pitchFeedbackColor(genuinelyFar!!.centsErrorMagnitude))
    }

    @Test
    fun aCentredWobbleDropsTheDirectionPrefix() {
        // Evenly either side of the target: real magnitude, no meaningful direction.
        val score = scoreOf(
            runId = 8,
            samples = listOf(20.0, -20.0, 21.0, -19.0, 20.0, -21.0, 19.0, -20.0, 1.5, -1.0)
        )

        assertEquals("", formatMelodyTimelinePitchScore(score!!).takeWhile { !it.isDigit() })
        assertTrue(abs(score.signedCentsError) < 5.0)
        assertTrue(score.centsErrorMagnitude > 15.0)
    }

    @Test
    fun aRunThatIsNotTheActiveOneIsNotFinished() {
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId = 3)
        repeat(MELODY_MIN_SCORE_SAMPLES) { accumulator.add(runId = 3, centsError = 5.0) }

        assertNull(accumulator.finish(runId = 4))
        assertTrue(accumulator.finish(runId = 3) is MelodyRunScoreOutcome.Scored)
    }

    @Test
    fun aCleanAttackOpensScoringBetweenTheLatencyFloorAndTheHardCap() {
        val openedAt = firstSettleMs(MelodyRunSettleDetector()) { 10.0 + (it % 5L) * 0.5 }

        assertTrue("never settled", openedAt != null)
        assertTrue("settled inside the detector's own latency, at $openedAt",
            openedAt!! >= MELODY_PITCH_SETTLE_FLOOR_MS)
        assertTrue("a clean attack should not wait for the cap, settled at $openedAt",
            openedAt < MELODY_PITCH_SETTLE_FLOOR_MS + 64L)
    }

    @Test
    fun scoopIntoTheNoteDelaysScoringUntilThePitchStopsMoving() {
        // A semitone-and-a-bit slide up to the note over 300ms, then held.
        val openedAt = firstSettleMs(MelodyRunSettleDetector()) { elapsed ->
            if (elapsed < 300L) -250.0 + elapsed * 250.0 / 300.0 else 3.0 + (elapsed % 3L)
        }

        assertTrue("settled mid-scoop at $openedAt", (openedAt ?: 0L) >= 300L)
        assertTrue("scoop should settle on its own, not via the cap, at $openedAt",
            openedAt!! < MELODY_PITCH_SETTLE_CAP_MS)
    }

    @Test
    fun hardCapOpensScoringEvenWhileThePitchIsStillMoving() {
        // Pins the invariant that the adaptive gate is never worse than the flat 500ms grace.
        val openedAt = firstSettleMs(MelodyRunSettleDetector()) { elapsed -> -600.0 + elapsed }

        assertTrue("never opened", openedAt != null)
        assertTrue("opened before the cap at $openedAt", openedAt!! >= MELODY_PITCH_SETTLE_CAP_MS)
        assertTrue("opened well after the cap at $openedAt",
            openedAt < MELODY_PITCH_SETTLE_CAP_MS + MELODY_PITCH_SCORE_SAMPLE_MS * 2L)
    }

    @Test
    fun aFrozenPitchReadingIsNotTreatedAsSettled() {
        // MicrophonePitchTracker republishes its last estimate for 200ms after signal loss,
        // so a bit-identical reading is the previous note being replayed into this one.
        val openedAt = firstSettleMs(MelodyRunSettleDetector()) { -180.0 }

        assertTrue("a stale frozen reading settled at $openedAt",
            openedAt!! >= MELODY_PITCH_SETTLE_CAP_MS)
    }

    @Test
    fun aDropoutClearsThePartialSettleWindow() {
        val withDropout = firstSettleMs(MelodyRunSettleDetector()) { elapsed ->
            if (elapsed == 160L) null else 9.0 + (elapsed % 3L)
        }
        val uninterrupted = firstSettleMs(MelodyRunSettleDetector()) { 9.0 + (it % 3L) }

        assertTrue("a dropout must restart the window", withDropout!! > uninterrupted!!)
    }

    @Test
    fun liveMeasuredCentsErrorIgnoresAHeldReading() {
        val live = MicrophonePitchTracker.PitchResult.Estimate(
            midi = 60.0,
            centsError = -35.0,
            confidence = 0.9
        )

        assertEquals(-35.0, liveMeasuredCentsError(live)!!, 1e-9)
        assertNull(liveMeasuredCentsError(live.copy(isHeld = true)))
        assertNull(liveMeasuredCentsError(null))
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun heldReadingsDoNotEnterTheRunScore() = runTest {
        // The singer holds 40 cents sharp, then goes quiet halfway through the note. The
        // tracker keeps republishing that last live frame for up to 200ms; none of those
        // repeats may be banked as though the note were still being sung.
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId = 3)
        var elapsedMs = 0L
        val samplingJob = launch {
            accumulateMelodyRunPitchSamples(
                runId = 3,
                accumulator = accumulator,
                latestCentsError = {
                    val estimate = MicrophonePitchTracker.PitchResult.Estimate(
                        midi = 60.4,
                        centsError = if (elapsedMs >= 500L) 40.0 else 4.0 + (elapsedMs % 3L),
                        confidence = 0.9,
                        isHeld = elapsedMs >= 500L
                    )
                    liveMeasuredCentsError(estimate)
                }
            )
        }

        repeat(60) {
            advanceTimeBy(MELODY_PITCH_SCORE_SAMPLE_MS)
            elapsedMs += MELODY_PITCH_SCORE_SAMPLE_MS
        }
        samplingJob.cancel()

        val score = (accumulator.finish(3) as? MelodyRunScoreOutcome.Scored)?.score
        assertNotNull(score)
        assertTrue(
            "held repeats leaked into the score: ${score!!.centsErrorMagnitude}",
            score.centsErrorMagnitude < 10.0
        )
    }

    @Test
    fun aHeldReadingClearsThePartialSettleWindow() {
        // Mirrors aDropoutClearsThePartialSettleWindow: a held frame is a gap in live audio
        // and must restart the onset window rather than count toward holding still.
        fun estimateAt(elapsed: Long, isHeld: Boolean) =
            MicrophonePitchTracker.PitchResult.Estimate(
                midi = 60.0,
                centsError = 9.0 + (elapsed % 3L),
                confidence = 0.9,
                isHeld = isHeld
            )

        val withHold = firstSettleMs(MelodyRunSettleDetector()) { elapsed ->
            liveMeasuredCentsError(estimateAt(elapsed, isHeld = elapsed == 160L))
        }
        val uninterrupted = firstSettleMs(MelodyRunSettleDetector()) { elapsed ->
            liveMeasuredCentsError(estimateAt(elapsed, isHeld = false))
        }

        assertTrue("a held reading must restart the window", withHold!! > uninterrupted!!)
    }

    @Test
    fun beginningARunAgainDropsSamplesMeasuredAgainstTheOldTarget() {
        // Transpose or tessitura moving mid-note re-begins the run, because everything
        // banked so far was scored against a different note.
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId = 11)
        repeat(12) { accumulator.add(11, 90.0) }

        accumulator.begin(runId = 11)
        repeat(12) { accumulator.add(11, 6.0) }

        val score = (accumulator.finish(11) as? MelodyRunScoreOutcome.Scored)?.score
        assertNotNull(score)
        assertEquals(12, score!!.sampleCount)
        assertEquals(6.0, score.centsErrorMagnitude, 1e-9)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun melodyRunScoreIgnoresPitchesFromTheScoopOntoTheNote() = runTest {
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId = 7)
        var elapsedMs = 0L
        val samplingJob = launch {
            accumulateMelodyRunPitchSamples(
                runId = 7,
                accumulator = accumulator,
                latestCentsError = {
                    if (elapsedMs < 300L) -250.0 + elapsedMs * 250.0 / 300.0
                    else 4.0 + (elapsedMs % 3L)
                }
            )
        }

        repeat(50) {
            advanceTimeBy(MELODY_PITCH_SCORE_SAMPLE_MS)
            elapsedMs += MELODY_PITCH_SCORE_SAMPLE_MS
            runCurrent()
        }
        samplingJob.cancel()

        val outcome = accumulator.finish(runId = 7)
        assertTrue(outcome is MelodyRunScoreOutcome.Scored)
        // Every banked sample came from the held portion, none from the slide.
        assertTrue((outcome as MelodyRunScoreOutcome.Scored).score.centsErrorMagnitude < 10.0)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun shortRunWithACleanAttackStillBanksAScore() = runTest {
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId = 3)
        var elapsedMs = 0L
        val samplingJob = launch {
            accumulateMelodyRunPitchSamples(
                runId = 3,
                accumulator = accumulator,
                latestCentsError = { 25.0 + (elapsedMs % 3L) }
            )
        }

        // ~300ms - a quarter note at 200bpm - which the flat 500ms grace scored as nothing.
        repeat(19) {
            advanceTimeBy(MELODY_PITCH_SCORE_SAMPLE_MS)
            elapsedMs += MELODY_PITCH_SCORE_SAMPLE_MS
            runCurrent()
        }
        samplingJob.cancel()

        val outcome = accumulator.finish(runId = 3)
        assertTrue("a short clean note should score", outcome is MelodyRunScoreOutcome.Scored)
        assertTrue(
            (outcome as MelodyRunScoreOutcome.Scored).score.sampleCount >= MELODY_MIN_SCORE_SAMPLES
        )
    }

    @Test
    fun melodyRunWithoutValidPitchIsReportedAsUnscoredRatherThanOmitted() {
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId = 2)

        // Distinct from finish() returning null, which means "this run is not the active one".
        assertEquals(MelodyRunScoreOutcome.Unscored(2), accumulator.finish(runId = 2))
    }

    @Test
    fun percentageErrorIsPinnedAndSignedByDirection() {
        assertEquals(0, pitchErrorPercentage(0.1))
        assertEquals(13, pitchErrorPercentage(-12.6))
        assertEquals(100, pitchErrorPercentage(100.0))
        assertEquals(100, pitchErrorPercentage(-245.0))
        assertEquals("0%", formatPitchErrorPercentage(0.0))
        assertEquals("+48%", formatPitchErrorPercentage(47.6))
        assertEquals("-48%", formatPitchErrorPercentage(-47.6))
    }

    @Test
    fun liveReadoutHidesThePercentageOnceItPinsInEitherDirection() {
        assertTrue(showsLivePitchErrorPercentage(0.0))
        assertTrue(showsLivePitchErrorPercentage(99.4))
        assertTrue(showsLivePitchErrorPercentage(-99.4))
        // 99.5 rounds to 100, which is where the number stops meaning anything.
        assertFalse(showsLivePitchErrorPercentage(99.5))
        assertFalse(showsLivePitchErrorPercentage(-99.5))
        assertFalse(showsLivePitchErrorPercentage(-1200.0))

        // Banked run scores are a separate path and still report a pinned value.
        val pinned = scoreOf(runId = 11, samples = List(10) { -300.0 })
        assertEquals("-100%", pinned?.let(::formatMelodyTimelinePitchScore))
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun percentageTextSamplesImmediatelyThenEveryTwoHundredFiftyMilliseconds() = runTest {
        var latestCentsError: Double? = 12.0
        val samples = mutableListOf<Double?>()
        val samplingJob = launch {
            samplePitchErrorCents(
                latestCentsError = { latestCentsError },
                updateIntervalMs = MELODY_PITCH_PERCENTAGE_UPDATE_MS,
                onSample = samples::add
            )
        }

        runCurrent()
        assertEquals(listOf(12.0), samples)

        latestCentsError = 48.0
        advanceTimeBy(MELODY_PITCH_PERCENTAGE_UPDATE_MS - 1L)
        runCurrent()
        assertEquals(listOf(12.0), samples)

        advanceTimeBy(1L)
        runCurrent()
        assertEquals(listOf(12.0, 48.0), samples)
        samplingJob.cancel()
    }

    @Test
    fun onlyPersistentMelodyUsesMaximumSpeedTracking() {
        assertEquals(
            PitchTrackingMode.MELODY_FAST,
            trackingModeForPersistentPitchSelection(PersistentPitchSelection.Melody)
        )
        assertEquals(
            PitchTrackingMode.STANDARD,
            trackingModeForPersistentPitchSelection(PersistentPitchSelection.SimpleRoot)
        )
        assertEquals(
            PitchTrackingMode.STANDARD,
            trackingModeForPersistentPitchSelection(PersistentPitchSelection.ChordTone(2))
        )

        val fast = PitchTrackingMode.MELODY_FAST
        assertEquals(1024, fast.windowSizeOverride)
        assertEquals(256, fast.hopSizeOverride)
        assertEquals(1, fast.smoothing.medianWindow)
        assertEquals(1, fast.smoothing.minFramesBeforePublish)
        assertEquals(1.0, fast.smoothing.emaAdmit, 0.0)
        assertEquals(1, fast.smoothing.octaveRejectMaxFrames)
    }

    @Test
    fun permissionDelayedMelodyActivationRetainsFastTrackingMode() {
        val source = FakeExclusivePitchSource()
        val controller = PersistentQuizPitchController(source)

        assertTrue(
            controller.activate(
                newSelection = PersistentPitchSelection.Melody,
                targetMidi = 72,
                hasRecordPermission = false
            )
        )
        assertEquals(listOf(PitchTrackingMode.MELODY_FAST), source.claimedModes)

        controller.onPermissionResult(granted = true)
        assertEquals(listOf(72), source.startedTargets)
        assertEquals(PersistentPitchPhase.LISTENING, controller.phase)
    }

    @Test
    fun activePracticeRetargetsWithoutReclaimingOrRestartingTheSource() {
        val source = FakeExclusivePitchSource()
        val controller = PersistentQuizPitchController(source)
        controller.activate(PersistentPitchSelection.Melody, 72, hasRecordPermission = true)

        controller.updateTarget(74)

        assertEquals(listOf(72), source.startedTargets)
        assertEquals(listOf(74), source.retargetedTargets)
        assertEquals(1, source.claimedModes.size)
        assertEquals(PersistentPitchPhase.LISTENING, controller.phase)
    }

    @Test
    fun effectiveTargetIncludesManualTransposeAndTessituraAnchor() {
        val resolved = ResolvedPersistentPitchTarget(
            sourceMidi = 60,
            label = "1\u0302",
            position = PersistentPitchCardPosition.SimpleRoot
        )

        // Source C4 plus a transpose of 5 sounds as F4 (65); anchored at C5 the
        // nearest F is F5 (77).
        assertEquals(
            77,
            resolved.effectiveTargetMidi(globalTranspose = 5, comfortablePitchMidi = 72.0)
        )
    }

    @Test
    fun effectiveTargetIsUnchangedWithoutATessitura() {
        val resolved = ResolvedPersistentPitchTarget(
            sourceMidi = 60,
            label = "1\u0302",
            position = PersistentPitchCardPosition.SimpleRoot
        )

        assertEquals(
            65,
            resolved.effectiveTargetMidi(globalTranspose = 5, comfortablePitchMidi = null)
        )
    }

    @Test
    fun effectiveTargetFollowsTheSequenceDirectionWhenContinuityIsKnown() {
        val resolved = ResolvedPersistentPitchTarget(
            sourceMidi = 72,
            label = "1\u0302",
            position = PersistentPitchCardPosition.MelodyCurrent
        )

        // Ascending from B4, so the run stays on C5 rather than dropping to the
        // C4 nearest the anchor.
        assertEquals(
            72,
            resolved.effectiveTargetMidi(
                globalTranspose = 0,
                comfortablePitchMidi = 60.0,
                lastSourceMidi = 71,
                lastTargetMidi = 71
            )
        )
    }

    @Test
    fun permissionAndOwnershipTransitionsDoNotLetStaleOwnerReclaimMicrophone() {
        val delegate = FakePitchSource()
        val coordinator = MicrophonePitchCoordinator(delegate)
        val persistentSource = coordinator.sourceFor(MicrophonePitchOwner.QUIZ_PERSISTENT)
        val singingSource = coordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL)
        val controller = PersistentQuizPitchController(persistentSource)

        assertTrue(
            controller.activate(
                newSelection = PersistentPitchSelection.SimpleRoot,
                targetMidi = 72,
                hasRecordPermission = false
            )
        )
        assertTrue(persistentSource.ownsMicrophone.value)
        assertEquals(PersistentPitchPhase.AWAITING_PERMISSION, controller.phase)

        controller.onPermissionResult(granted = true)
        assertEquals(listOf(72), delegate.startedTargets)
        assertEquals(PersistentPitchPhase.LISTENING, controller.phase)

        singingSource.claim()
        singingSource.start(67)
        controller.onOwnershipChanged(persistentSource.ownsMicrophone.value)
        persistentSource.start(80)
        persistentSource.stop()

        assertFalse(persistentSource.ownsMicrophone.value)
        assertTrue(singingSource.ownsMicrophone.value)
        assertEquals(listOf(72, 67), delegate.startedTargets)
        assertEquals(PersistentPitchPhase.IDLE, controller.phase)
        assertNull(controller.selection)
    }

    @Test
    fun tapCountsMapToExactlyOneDeferredAction() {
        assertEquals(TapSequenceAction.SINGLE, tapSequenceAction(1))
        assertEquals(TapSequenceAction.DOUBLE, tapSequenceAction(2))
        assertEquals(TapSequenceAction.TRIPLE, tapSequenceAction(3))
    }

    /** Runs a whole run's worth of samples through the accumulator and returns its score. */
    private fun scoreOf(runId: Int, samples: List<Double>): MelodyTimelinePitchScore? {
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId)
        samples.forEach { accumulator.add(runId, it) }
        return (accumulator.finish(runId) as? MelodyRunScoreOutcome.Scored)?.score
    }

    /** Steps [detector] at the real frame interval and reports when scoring opened. */
    private fun firstSettleMs(
        detector: MelodyRunSettleDetector,
        untilMs: Long = 900L,
        centsAt: (Long) -> Double?
    ): Long? {
        var elapsedMs = 0L
        while (elapsedMs <= untilMs) {
            if (detector.observe(elapsedMs, centsAt(elapsedMs))) return elapsedMs
            elapsedMs += MELODY_PITCH_SCORE_SAMPLE_MS
        }
        return null
    }

    private fun target(midi: Int) = QuizPitchCardTarget(midi, midi.toString())

    private fun melodyVisual(
        beat: Double,
        duration: Double,
        staffDegree: Int,
        midi: Int
    ) = MelodyTimelinePitchVisual(beat, duration, staffDegree, midi)

    private class FakePitchSource : PitchSource {
        private val flow = MutableStateFlow<MicrophonePitchTracker.PitchResult>(
            MicrophonePitchTracker.PitchResult.NoSignal
        )
        override val pitchFlow: StateFlow<MicrophonePitchTracker.PitchResult> = flow
        val startedTargets = mutableListOf<Int>()
        val retargetedTargets = mutableListOf<Int>()
        var stopCount = 0
        var releaseCount = 0

        override fun start(targetMidi: Int) {
            startedTargets += targetMidi
        }

        override fun retarget(targetMidi: Int) {
            retargetedTargets += targetMidi
        }

        override fun stop() {
            stopCount++
        }

        override fun release() {
            releaseCount++
        }
    }

    private class FakeExclusivePitchSource : ExclusivePitchSource {
        private val flow = MutableStateFlow<MicrophonePitchTracker.PitchResult>(
            MicrophonePitchTracker.PitchResult.NoSignal
        )
        private val ownership = MutableStateFlow(false)
        override val pitchFlow: StateFlow<MicrophonePitchTracker.PitchResult> = flow
        override val ownsMicrophone: StateFlow<Boolean> = ownership
        val claimedModes = mutableListOf<PitchTrackingMode>()
        val startedTargets = mutableListOf<Int>()
        val retargetedTargets = mutableListOf<Int>()

        override fun claim(trackingMode: PitchTrackingMode) {
            claimedModes += trackingMode
            ownership.value = true
        }

        override fun start(targetMidi: Int) {
            startedTargets += targetMidi
        }

        override fun retarget(targetMidi: Int) {
            retargetedTargets += targetMidi
        }

        override fun stop() {
            ownership.value = false
        }

        override fun release() = stop()
    }
}
