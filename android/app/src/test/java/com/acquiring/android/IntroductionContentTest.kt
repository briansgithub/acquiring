package com.acquiring.android

import org.junit.Assert.assertTrue
import org.junit.Test

class IntroductionContentTest {
    @Test
    fun introductionExplainsGesturesAndOctaveDots() {
        val text = INTRODUCTION_BULLETS.joinToString(" ")
        assertTrue(text.contains("timeline"))
        assertTrue(text.contains("octave"))
        assertTrue(text.contains("Play"))
    }
}
