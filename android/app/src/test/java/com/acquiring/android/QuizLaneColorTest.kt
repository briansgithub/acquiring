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

    @Test
    fun melodyLaneTintWashesReadoutTowardWhite() {
        val majorLane = quizLaneTint("major")
        assertEquals(1f, majorLane.red, CHANNEL_DELTA)
        assertEquals(0.3f, majorLane.green, CHANNEL_DELTA)
        assertEquals(0.3f, majorLane.blue, CHANNEL_DELTA)
        assertNotEquals(ringModeColor("minor"), quizLaneTint("minor"))
        val inactive = majorLane.copy(alpha = 0.6f)
        assertEquals(1f, inactive.red, CHANNEL_DELTA)
        assertEquals(0.3f, inactive.green, CHANNEL_DELTA)
        assertEquals(0.3f, inactive.blue, CHANNEL_DELTA)
        assertEquals(0.6f, inactive.alpha, CHANNEL_DELTA)
    }

    companion object {
        private const val CHANNEL_DELTA = 1f / 255f
    }
}
