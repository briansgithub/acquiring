package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QuizTransposeRangeTest {
    @Test
    fun transposePopoverSpansAnOctaveEitherSideAndResetsAtZero() {
        assertEquals(-12, QUIZ_TRANSPOSE_RANGE.first)
        assertEquals(12, QUIZ_TRANSPOSE_RANGE.last)
        assertTrue(0 in QUIZ_TRANSPOSE_RANGE)
        assertEquals(25, QUIZ_TRANSPOSE_RANGE.count())
    }
}
