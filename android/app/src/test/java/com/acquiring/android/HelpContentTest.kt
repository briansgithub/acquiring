package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HelpContentTest {
    @Test
    fun helpListsOfflineArticlesIncludingIntroductionAndOctave() {
        val titles = HelpCatalog.topics.map { it.title }
        assertEquals(
            listOf("Instructions", "Scale degrees", "Intervals", "Roman numerals", "Tessitura"),
            titles
        )
        assertTrue(INTRODUCTION_BULLETS.any { it.contains("octave") })
        assertEquals(14, HelpCatalog.intervalRows.size)
        assertEquals(0, HelpCatalog.intervalRows.first().semitones)
        assertEquals(12, HelpCatalog.intervalRows.last().semitones)
        assertEquals("P5", HelpCatalog.intervalRows.first { it.semitones == 7 }.abbreviation)
    }
}
