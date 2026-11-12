package com.acquiring.android

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.Display
import android.view.Window
import android.view.WindowManager

internal data class RefreshMode(
    val width: Int,
    val height: Int,
    val refreshRate: Float
)

/** Highest refresh rate at the current resolution. A faster mode at another size is ignored. */
internal fun maximumRefreshRate(
    modes: List<RefreshMode>,
    currentWidth: Int,
    currentHeight: Int,
    currentRefreshRate: Float
): Float {
    val sameSize = modes.filter { it.width == currentWidth && it.height == currentHeight }
    val pool = if (sameSize.isNotEmpty()) sameSize else modes
    val peak = pool.maxOfOrNull { it.refreshRate } ?: currentRefreshRate
    return if (peak >= 1f) peak else currentRefreshRate.coerceAtLeast(0f)
}

internal object PlaybackFrameRate {
    private const val PREFS = "display_preferences"
    private const val RETIRED_KEY = "timelineFrameRate"

    fun initialize(context: Context) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(RETIRED_KEY)
            .apply()
        apply(context)
    }

    fun apply(context: Context) {
        windowOf(context)?.let(::apply)
    }

    fun apply(window: Window) {
        val display = window.decorView.display ?: displayOf(window.context)
        val fps = maximumRefreshRate(display)
        val params = window.attributes
        // The Pixel 9 Pro is already in a 120 Hz physical mode. Rendering stays at
        // 60 until this vote changes. Do not pin preferredDisplayModeId: that can
        // switch resolution, and the render cap is this rate, not the mode id.
        params.preferredRefreshRate = fps
        params.preferredDisplayModeId = 0
        window.attributes = params
    }

    fun maximumRefreshRate(display: Display?): Float {
        if (display == null) return 60f
        val current = display.mode
        return maximumRefreshRate(
            display.supportedModes.map {
                RefreshMode(it.physicalWidth, it.physicalHeight, it.refreshRate)
            },
            current.physicalWidth,
            current.physicalHeight,
            current.refreshRate
        )
    }

    private fun windowOf(context: Context): Window? {
        var current: Context? = context
        while (current is ContextWrapper) {
            if (current is Activity) return current.window
            current = current.baseContext
        }
        return null
    }

    @Suppress("DEPRECATION")
    private fun displayOf(context: Context): Display? =
        (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.defaultDisplay
}
