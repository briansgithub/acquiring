package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class IntervalShorthandTest {
    @Test
    fun intervalCardsPrintDirectionShorthandOnly() {
        val risingFifth = NamedInterval(5, "P", IntervalDirection.ASCENDING, 7)
        assertEquals("P5 ↑", risingFifth.shorthand)
        assertFalse(risingFifth.shorthand.contains("perfect", ignoreCase = true))
    }
}
