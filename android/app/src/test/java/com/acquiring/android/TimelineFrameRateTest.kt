package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class TimelineFrameRateTest {
    @Test
    fun standardCapsAtSixtyWhileMaximumUsesTheDisplay() {
        assertEquals(60, TimelineFrameRatePreference.STANDARD.framesPerSecond(120))
        assertEquals(60, TimelineFrameRatePreference.STANDARD.framesPerSecond(60))
        assertEquals(48, TimelineFrameRatePreference.STANDARD.framesPerSecond(48))
        assertEquals(120, TimelineFrameRatePreference.MAXIMUM.framesPerSecond(120))
        assertEquals(16_666_666L, TimelineFrameRatePreference.STANDARD.stateUpdateNanos(60))
        assertEquals(8_333_333L, TimelineFrameRatePreference.MAXIMUM.stateUpdateNanos(120))
    }

    @Test
    fun applyKeepsTheRequestedRateAcrossReapplication() {
        TimelineFrameRateStore.apply(TimelineFrameRatePreference.STANDARD, 120)
        assertEquals(16_666_666L, TimelineFrameRateStore.minStateUpdateNanos)
        assertEquals(120, TimelineFrameRateStore.displayMaximumHz)
        TimelineFrameRateStore.apply(TimelineFrameRatePreference.STANDARD, 120)
        assertEquals(16_666_666L, TimelineFrameRateStore.minStateUpdateNanos)
        TimelineFrameRateStore.apply(TimelineFrameRatePreference.MAXIMUM, 120)
        assertEquals(8_333_333L, TimelineFrameRateStore.minStateUpdateNanos)
        TimelineFrameRateStore.apply(TimelineFrameRatePreference.STANDARD, 120)
    }

    @Test
    fun unknownStorageFallsBackToSixty() {
        assertEquals(TimelineFrameRatePreference.STANDARD, TimelineFrameRatePreference.fromStorage(null))
        assertEquals(TimelineFrameRatePreference.MAXIMUM, TimelineFrameRatePreference.fromStorage("maximum"))
    }
}
