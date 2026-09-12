package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RootOnlyCardLayoutTest {
    @Test
    fun previousKeepsIosFortySixtyShareAgainstEachFeaturedColumn() {
        val available = ROOT_ONLY_PREVIOUS_WEIGHT + ROOT_ONLY_FEATURED_WEIGHT * 2f
        assertEquals(0.4f / 1.6f, ROOT_ONLY_PREVIOUS_WEIGHT / available, 0.0001f)
        assertEquals(0.6f / 1.6f, ROOT_ONLY_FEATURED_WEIGHT / available, 0.0001f)
        assertEquals(128f, ROOT_ONLY_PREVIOUS_HEIGHT.value)
        assertEquals(162f, ROOT_ONLY_FEATURED_HEIGHT.value)
        assertTrue(ROOT_ONLY_PREVIOUS_HEIGHT < ROOT_ONLY_FEATURED_HEIGHT)
    }

    @Test
    fun firstChordHidesPreviousAndIntervalCards() {
        val current = SpelledPitch.parse("C", 4)!!
        assertFalse(showsRootOnlyPrevious(null))
        assertFalse(showsRootOnlyInterval(null, current, interval = null))
    }

    @Test
    fun intervalAppearsOnlyWhenTheRootMoves() {
        val c4 = SpelledPitch.parse("C", 4)!!
        val d4 = SpelledPitch.parse("D", 4)!!
        val interval = calculateNamedInterval(c4, d4)
        assertTrue(showsRootOnlyPrevious(c4))
        assertTrue(showsRootOnlyInterval(c4, d4, interval))
        assertFalse(showsRootOnlyInterval(c4, c4, calculateNamedInterval(c4, c4)))
    }
}
