package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class QuizBeatStepTest {
    @Test
    fun beatStepMovesOneBeatAndStaysInsideTheSection() {
        assertEquals(7.0, steppedQuizBeat(8.0, -1.0, 1.0, 16.0), 0.0)
        assertEquals(9.0, steppedQuizBeat(8.0, 1.0, 1.0, 16.0), 0.0)
        assertEquals(1.0, steppedQuizBeat(1.0, -1.0, 1.0, 16.0), 0.0)
        assertEquals(16.0, steppedQuizBeat(16.0, 1.0, 1.0, 16.0), 0.0)
    }
}
