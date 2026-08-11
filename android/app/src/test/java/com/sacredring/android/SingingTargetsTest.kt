package com.sacredring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SingingTargetsTest {
    @Test
    fun sectionShiftUsesAverageRootRegisterAndCurrentManualTranspose() {
        assertEquals(
            -1,
            calculateSectionTessituraShift(
                comfortableMidi = 52.0,
                sectionRootMidis = listOf(60, 64, 68),
                globalTranspose = 2
            )
        )
    }

    @Test
    fun sectionShiftRequiresAtLeastOneChordRoot() {
        assertNull(
            calculateSectionTessituraShift(
                comfortableMidi = 60.0,
                sectionRootMidis = emptyList(),
                globalTranspose = 0
            )
        )
    }

    @Test
    fun microphoneAndPlaybackApplyManualTransposeExactlyOnce() {
        val target = SingingTargetNote(sourceMidi = 60, scaleDegreeLabel = "1\u0302")

        assertEquals(73, target.effectiveTargetMidi(globalTranspose = 1, tessituraShiftOctaves = 1))
        assertEquals(72, target.targetPlaybackMidiInput(tessituraShiftOctaves = 1))
    }

    @Test
    fun structuredRequestSupportsSingleAndIntervalTargets() {
        val first = SingingTargetNote(60, "1\u0302")
        val second = SingingTargetNote(67, "5\u0302")

        assertEquals(
            SingingTargetRequest(first, null, requestId = 1),
            SingingTargetRequest(first = first, second = null, requestId = 1)
        )
        assertEquals(second, SingingTargetRequest(first, second, requestId = 2).second)
    }
}
