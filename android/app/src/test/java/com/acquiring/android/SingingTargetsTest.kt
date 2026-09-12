package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SingingTargetsTest {

    @Test
    fun octaveOffsetLabelIsSigned() {
        assertEquals("-1", singingOctaveOffsetLabel(-1))
        assertEquals("0", singingOctaveOffsetLabel(0))
        assertEquals("+1", singingOctaveOffsetLabel(1))
        assertEquals("+3", singingOctaveOffsetLabel(9))
        assertEquals("-2", singingOctaveOffsetLabel(-8))
    }

    @Test
    fun microphoneAndPlaybackApplyManualTransposeExactlyOnce() {
        val target = SingingTargetNote(sourceMidi = 60, scaleDegreeLabel = "1̂")

        // Written C4 plus +1 octave is C5 for the mic after transpose, while
        // AudioEngine re-adds transpose on the de-transposed preview input.
        assertEquals(73, target.effectiveTargetMidi(globalTranspose = 1, octaveOffset = 1))
        assertEquals(72, target.targetPlaybackMidiInput(globalTranspose = 1, octaveOffset = 1))
    }

    @Test
    fun writtenOctaveLeavesTheSourceRegisterUntouched() {
        val target = SingingTargetNote(sourceMidi = 84, scaleDegreeLabel = "1̂")

        assertEquals(86, target.effectiveTargetMidi(globalTranspose = 2, octaveOffset = 0))
        assertEquals(84, target.targetPlaybackMidiInput(globalTranspose = 2, octaveOffset = 0))
    }

    @Test
    fun requestShiftsBothSlotsByTheSameOctave() {
        val request = SingingTargetRequest(
            first = SingingTargetNote(67, "5̂"),
            second = SingingTargetNote(72, "1̂"),
            requestId = 1
        )

        val (first, second) = resolveSingingTargetRequest(
            request,
            globalTranspose = 0,
            octaveOffset = -1
        )

        assertEquals(55, first)
        assertEquals(60, second)
    }

    @Test
    fun requestWithoutAnOffsetOnlyAppliesManualTranspose() {
        val request = SingingTargetRequest(
            first = SingingTargetNote(60, "1̂"),
            second = SingingTargetNote(67, "5̂"),
            requestId = 1
        )

        val (first, second) = resolveSingingTargetRequest(
            request,
            globalTranspose = 3,
            octaveOffset = 0
        )

        assertEquals(63, first)
        assertEquals(70, second)
        assertNull(
            resolveSingingTargetRequest(
                request.copy(second = null),
                globalTranspose = 0,
                octaveOffset = 1
            ).second
        )
    }
}
