package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackTransposeRangeTest {
    @Test
    fun transposePopoverSpansAnOctaveEitherSideAndResetsAtZero() {
        assertEquals(-12, PLAYBACK_TRANSPOSE_RANGE.first)
        assertEquals(12, PLAYBACK_TRANSPOSE_RANGE.last)
        assertTrue(0 in PLAYBACK_TRANSPOSE_RANGE)
        assertEquals(25, PLAYBACK_TRANSPOSE_RANGE.count())
    }
}
