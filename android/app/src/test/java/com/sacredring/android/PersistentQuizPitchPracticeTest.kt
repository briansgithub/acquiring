package com.sacredring.android

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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

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
    fun finishedMelodyRunScoreAveragesErrorWithoutCancellingDirection() {
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId = 4)
        accumulator.add(runId = 4, centsError = 10.0)
        accumulator.add(runId = 4, centsError = 30.0)

        val score = accumulator.finish(runId = 4)

        assertEquals(20, score?.errorPercentage)
        assertEquals(20.0, score?.averageCentsError ?: Double.NaN, 0.0)
        assertEquals(20.0, score?.averageAbsoluteCentsError ?: Double.NaN, 0.0)
        assertEquals(2, score?.sampleCount)
        assertEquals("+20%", score?.let(::formatMelodyTimelinePitchScore))

        accumulator.begin(runId = 5)
        accumulator.add(runId = 5, centsError = -20.0)
        accumulator.add(runId = 5, centsError = -40.0)
        val lowScore = accumulator.finish(runId = 5)
        assertEquals(30, lowScore?.errorPercentage)
        assertEquals("-30%", lowScore?.let(::formatMelodyTimelinePitchScore))
    }

    @Test
    fun melodyRunWithoutValidPitchDoesNotProduceAScore() {
        val accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runId = 2)

        assertNull(accumulator.finish(runId = 2))
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
    fun effectiveTargetIncludesManualTransposeAndTessituraShift() {
        val resolved = ResolvedPersistentPitchTarget(
            sourceMidi = 60,
            label = "1\u0302",
            position = PersistentPitchCardPosition.SimpleRoot
        )

        assertEquals(77, resolved.effectiveTargetMidi(globalTranspose = 5, tessituraShiftOctaves = 1))
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
        var stopCount = 0
        var releaseCount = 0

        override fun start(targetMidi: Int) {
            startedTargets += targetMidi
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

        override fun claim(trackingMode: PitchTrackingMode) {
            claimedModes += trackingMode
            ownership.value = true
        }

        override fun start(targetMidi: Int) {
            startedTargets += targetMidi
        }

        override fun stop() {
            ownership.value = false
        }

        override fun release() = stop()
    }
}
