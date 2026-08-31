package com.acquiring.android

import androidx.compose.ui.geometry.Offset
import org.junit.Assert.assertEquals
import org.junit.Test

class QuizDialTest {
    private val center = Offset(50f, 50f)

    @Test
    fun dialFractionTracksTheFullHardwareArc() {
        assertEquals(0f, dialFractionForPosition(Offset(0f, 100f), center), 0.02f)
        assertEquals(0.5f, dialFractionForPosition(Offset(50f, 0f), center), 0.02f)
        assertEquals(1f, dialFractionForPosition(Offset(100f, 100f), center), 0.02f)
    }

    @Test
    fun dialFractionStillUsesAngleFarOutsideTheControl() {
        assertEquals(0.5f, dialFractionForPosition(Offset(50f, -500f), center), 0.02f)
    }
}
