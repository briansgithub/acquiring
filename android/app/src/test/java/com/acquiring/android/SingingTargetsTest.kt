package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SingingTargetsTest {

    @Test
    fun microphoneAndPlaybackApplyManualTransposeExactlyOnce() {
        val target = SingingTargetNote(sourceMidi = 60, scaleDegreeLabel = "1̂")

        // Source C4 + 1 semitone sounds as C#4 (61); anchored at C#5 (73) it
        // moves up an octave. AudioEngine re-adds the transpose to the playback
        // input, so the two agree on the register that sounds.
        assertEquals(73, target.effectiveTargetMidi(globalTranspose = 1, comfortablePitchMidi = 73.0))
        assertEquals(72, target.targetPlaybackMidiInput(globalTranspose = 1, comfortablePitchMidi = 73.0))
    }

    @Test
    fun noTessituraLeavesTheSourceRegisterUntouched() {
        val target = SingingTargetNote(sourceMidi = 84, scaleDegreeLabel = "1̂")

        assertEquals(86, target.effectiveTargetMidi(globalTranspose = 2, comfortablePitchMidi = null))
        assertEquals(84, target.targetPlaybackMidiInput(globalTranspose = 2, comfortablePitchMidi = null))
    }

    @Test
    fun continuityCarriesIntoTheSingleNoteTarget() {
        val target = SingingTargetNote(sourceMidi = 72, scaleDegreeLabel = "1̂")

        // Ascending from B4, so C5 is taken over the anchor-nearest C4.
        assertEquals(
            72,
            target.effectiveTargetMidi(
                globalTranspose = 0,
                comfortablePitchMidi = 60.0,
                lastSourceMidi = 71,
                lastTargetMidi = 71
            )
        )
    }

    @Test
    fun requestWithBothSlotsMovesAsOneInterval() {
        val request = SingingTargetRequest(
            first = SingingTargetNote(67, "5̂"),
            second = SingingTargetNote(72, "1̂"),
            requestId = 1
        )

        val (first, second) = resolveSingingTargetRequest(
            request,
            globalTranspose = 0,
            comfortablePitchMidi = 60.0
        )

        assertEquals(55, first)
        assertEquals(60, second)
    }

    @Test
    fun requestWithOneSlotIsPlacedNearestTheAnchor() {
        val request = SingingTargetRequest(
            first = SingingTargetNote(84, "1̂"),
            second = null,
            requestId = 1
        )

        val (first, second) = resolveSingingTargetRequest(
            request,
            globalTranspose = 0,
            comfortablePitchMidi = 60.0
        )

        assertEquals(60, first)
        assertNull(second)
    }

    @Test
    fun requestWithoutATessituraOnlyAppliesManualTranspose() {
        val request = SingingTargetRequest(
            first = SingingTargetNote(60, "1̂"),
            second = SingingTargetNote(67, "5̂"),
            requestId = 1
        )

        val (first, second) = resolveSingingTargetRequest(
            request,
            globalTranspose = 3,
            comfortablePitchMidi = null
        )

        assertEquals(63, first)
        assertEquals(70, second)
    }

    @Test
    fun structuredRequestSupportsSingleAndIntervalTargets() {
        val first = SingingTargetNote(60, "1̂")
        val second = SingingTargetNote(67, "5̂")

        assertEquals(
            SingingTargetRequest(first, null, requestId = 1),
            SingingTargetRequest(first = first, second = null, requestId = 1)
        )
        assertEquals(second, SingingTargetRequest(first, second, requestId = 2).second)
    }
}
