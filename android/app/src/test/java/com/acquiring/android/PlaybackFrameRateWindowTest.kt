package com.acquiring.android

import android.app.Activity
import android.content.Context
import android.view.Display
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
class PlaybackFrameRateWindowTest {
    @Test
    fun windowVotesTheFastestRateAtTheCurrentSizeAndClearsAModeLock() {
        val controller = Robolectric.buildActivity(Activity::class.java).setup()
        try {
            val activity = controller.get()
            @Suppress("DEPRECATION")
            val display = activity.windowManager.defaultDisplay
            val current = display.mode
            ShadowDisplayManager.setSupportedModes(
                display.displayId,
                mode(current.modeId, current.physicalWidth, current.physicalHeight, 60f),
                mode(current.modeId + 1, current.physicalWidth, current.physicalHeight, 120f),
                mode(current.modeId + 2, current.physicalWidth * 2, current.physicalHeight * 2, 144f)
            )
            shadowOf(display).setRefreshRate(60f)
            activity.getSharedPreferences("display_preferences", Context.MODE_PRIVATE)
                .edit()
                .putString("timelineFrameRate", "60")
                .commit()

            PlaybackFrameRate.initialize(activity)
            assertVotesMaximum(activity)
            assertNull(
                activity.getSharedPreferences("display_preferences", Context.MODE_PRIVATE)
                    .getString("timelineFrameRate", null)
            )

            activity.window.attributes = activity.window.attributes.apply {
                preferredRefreshRate = 30f
                preferredDisplayModeId = current.modeId
            }
            PlaybackFrameRate.apply(activity.window)
            assertVotesMaximum(activity)

            controller.recreate()
            PlaybackFrameRate.initialize(controller.get())
            assertVotesMaximum(controller.get())
        } finally {
            controller.pause().stop().destroy()
        }
    }

    @Suppress("DEPRECATION")
    private fun assertVotesMaximum(activity: Activity) {
        val display = activity.window.decorView.display ?: activity.windowManager.defaultDisplay
        assertEquals(120f, PlaybackFrameRate.maximumRefreshRate(display), 0f)
        assertEquals(120f, activity.window.attributes.preferredRefreshRate, 0f)
        assertEquals(0, activity.window.attributes.preferredDisplayModeId)
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
