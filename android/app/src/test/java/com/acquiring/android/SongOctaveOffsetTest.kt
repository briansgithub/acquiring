package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class SongOctaveOffsetTest {
    @Test
    fun singingOctaveShiftIsTwelveSemitonesPerStep() {
        assertEquals(0, singingOctaveSemitones(0))
        assertEquals(-24, singingOctaveSemitones(-2))
        assertEquals(36, singingOctaveSemitones(3))
        assertEquals(-24, singingOctaveSemitones(-9))
        assertEquals(36, singingOctaveSemitones(8))
    }
}
