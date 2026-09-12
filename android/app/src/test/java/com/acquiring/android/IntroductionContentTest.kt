package com.acquiring.android

import org.junit.Assert.assertTrue
import org.junit.Test

class IntroductionContentTest {
    @Test
    fun introductionExplainsObjectiveGesturesAndOctaveShift() {
        val text = listOf(
            IntroductionCopy.OBJECTIVE,
            "${IntroductionCopy.TAP_ACTION} — ${IntroductionCopy.TAP_DETAIL}",
            "${IntroductionCopy.DOUBLE_TAP_ACTION} — ${IntroductionCopy.DOUBLE_TAP_DETAIL}",
            "${IntroductionCopy.MIC_ACTION} — ${IntroductionCopy.MIC_DETAIL}",
            IntroductionCopy.OCTAVE
        ).joinToString(" ")
        assertTrue(text.contains("intervals"))
        assertTrue(text.contains("Play the card"))
        assertTrue(text.contains("Singing Tool"))
        assertTrue(text.contains("octave"))
        assertTrue(IntroductionCopy.OCTAVE_HEADING == "Octave offset")
        assertTrue(INTRODUCTION_OCTAVE_TEST_TAG == "introduction.octaveOffset")
        assertTrue(IntroductionCopy.MIC_ACTION == "Microphone button")
    }
}
