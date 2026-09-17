package com.acquiring.android

import android.app.Activity
import android.view.Display
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowDisplayManager
import org.robolectric.util.ReflectionHelpers
import org.robolectric.util.ReflectionHelpers.ClassParameter

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28, 35])
class TimelineFrameRateWindowTest {
    @After
    fun resetStore() {
        TimelineFrameRateStore.apply(TimelineFrameRatePreference.STANDARD, 60)
    }

    @Test
    fun windowAndPlaybackRecoverSavedRateAcrossReapplicationAndRecreation() {
        val controller = Robolectric.buildActivity(Activity::class.java).setup()
        try {
            val activity = controller.get()
            @Suppress("DEPRECATION")
            val display = activity.windowManager.defaultDisplay
            val current = display.mode
            val modes = arrayOf(
                mode(current.modeId, current.physicalWidth, current.physicalHeight, 60f),
                mode(current.modeId + 1, current.physicalWidth, current.physicalHeight, 120f),
                // A faster mode at another resolution must not change the target.
                mode(current.modeId + 2, current.physicalWidth * 2, current.physicalHeight * 2, 144f)
            )
            ShadowDisplayManager.setSupportedModes(display.displayId, *modes)
            shadowOf(display).setRefreshRate(60f)

            for ((preference, fps) in listOf(
                TimelineFrameRatePreference.STANDARD to 60,
                TimelineFrameRatePreference.MAXIMUM to 120,
                TimelineFrameRatePreference.STANDARD to 60
            )) {
                TimelineFrameRateStore.select(activity, preference)
                assertRequests(activity, preference, fps)
                repeat(4) {
                    // Model a stale request left behind by a recreated playback surface.
                    activity.window.attributes = activity.window.attributes.apply {
                        preferredRefreshRate = if (fps == 60) 120f else 60f
                    }
                    TimelineFrameRateStore.apply(TimelineFrameRatePreference.MAXIMUM, 144)
                    TimelineFrameRateStore.applyToWindow(activity)
                    assertRequests(activity, preference, fps)
                }
                controller.pause().stop().restart().start().resume()
                TimelineFrameRateStore.applyToWindow(activity.window)
                assertRequests(activity, preference, fps)
            }

            TimelineFrameRateStore.select(activity, TimelineFrameRatePreference.MAXIMUM)
            controller.recreate()
            TimelineFrameRateStore.initialize(controller.get())
            assertRequests(controller.get(), TimelineFrameRatePreference.MAXIMUM, 120)
        } finally {
            controller.pause().stop().destroy()
        }
    }

    private fun assertRequests(activity: Activity, preference: TimelineFrameRatePreference, fps: Int) {
        assertEquals(preference, TimelineFrameRateStore.preference)
        assertEquals(120, TimelineFrameRateStore.displayMaximumHz)
        assertEquals(1_000_000_000L / fps, TimelineFrameRateStore.minStateUpdateNanos)
        assertEquals(fps.toFloat(), activity.window.attributes.preferredRefreshRate, 0f)
    }

    private fun mode(id: Int, width: Int, height: Int, refreshRate: Float): Display.Mode =
        ReflectionHelpers.callConstructor(
            Display.Mode::class.java,
            ClassParameter.from(Int::class.javaPrimitiveType!!, id),
            ClassParameter.from(Int::class.javaPrimitiveType!!, width),
            ClassParameter.from(Int::class.javaPrimitiveType!!, height),
            ClassParameter.from(Float::class.javaPrimitiveType!!, refreshRate)
        )
}
