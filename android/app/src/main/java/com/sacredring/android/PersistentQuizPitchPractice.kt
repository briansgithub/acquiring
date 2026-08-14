package com.sacredring.android

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

internal sealed interface PersistentPitchSelection {
    data object SimpleRoot : PersistentPitchSelection
    data class ChordTone(val requestedIndex: Int) : PersistentPitchSelection
    data object Melody : PersistentPitchSelection
}

internal data class QuizPitchCardTarget(
    val sourceMidi: Int,
    val label: String
)

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
        pitchSource.claim()

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
