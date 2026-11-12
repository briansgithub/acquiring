package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackFrameRateTest {
    @Test
    fun maximumRateStaysAtTheCurrentResolution() {
        val modes = listOf(
            RefreshMode(1280, 2856, 120f),
            RefreshMode(960, 2142, 120.00001f),
            RefreshMode(960, 2142, 60f),
            RefreshMode(2560, 5712, 144f)
        )
        assertEquals(120.00001f, maximumRefreshRate(modes, 960, 2142, 60f), 0f)
    }

    @Test
    fun sixtyHertzPanelReportsItsOnlyRate() {
        val modes = listOf(RefreshMode(1080, 2400, 60f))
        assertEquals(60f, maximumRefreshRate(modes, 1080, 2400, 60f), 0f)
    }

    @Test
    fun missingModesKeepTheCurrentRate() {
        assertEquals(90f, maximumRefreshRate(emptyList(), 0, 0, 90f), 0f)
    }
}
