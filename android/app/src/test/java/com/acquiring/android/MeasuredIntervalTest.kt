package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MeasuredIntervalTest {
    private fun pitch(name: String, octave: Int): SpelledPitch =
        requireNotNull(SpelledPitch.parse(name, octave))

    @Test
    fun relativeSpellingConvertsMidiIntoThePitchCoordinateSystem() {
        assertEquals(pitch("E", 4), SpelledPitch.spellRelative(pitch("C", 4), 64))
        assertEquals(pitch("B", 3), SpelledPitch.spellRelative(pitch("C", 4), 59))
    }

    @Test
    fun measuredIntervalsFollowTheOrderOfTheTwoRawPitches() {
        val ascending = calculateMeasuredInterval(fromMidi = 60.1, toMidi = 64.1)
        val descending = calculateMeasuredInterval(fromMidi = 67.2, toMidi = 60.2)

        assertEquals("M", ascending.namedInterval.quality)
        assertEquals(3, ascending.namedInterval.number)
        assertEquals(IntervalDirection.ASCENDING, ascending.direction)
        assertEquals("P", descending.namedInterval.quality)
        assertEquals(5, descending.namedInterval.number)
        assertEquals(IntervalDirection.DESCENDING, descending.direction)
    }

    @Test
    fun measuredDirectionStillWorksWithinOneRoundedSemitone() {
        val ascending = calculateMeasuredInterval(fromMidi = 60.1, toMidi = 60.4)
        val descending = calculateMeasuredInterval(fromMidi = 60.4, toMidi = 60.1)
        val repeated = calculateMeasuredInterval(fromMidi = 60.25, toMidi = 60.25)

        assertEquals(1, ascending.namedInterval.number)
        assertEquals(IntervalDirection.ASCENDING, ascending.direction)
        assertEquals(IntervalDirection.DESCENDING, descending.direction)
        assertNull(repeated.direction)
    }
}
