package com.sacredring.android

import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
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
}
