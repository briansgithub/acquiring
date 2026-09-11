package com.acquiring.android

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class QuizLaneColorTest {
    @Test
    fun timelineLanesFollowSourceModeColor() {
        assertEquals(Color(0xFFFF0000), ringModeColor("major"))
        assertEquals(Color(0xFFB800E5), ringModeColor("minor"))
        assertNotEquals(ringModeColor("dorian"), ringModeColor("lydian"))
    }
}
