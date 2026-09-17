package com.acquiring.android

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.Display
import android.view.Window
import android.view.WindowManager
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal enum class TimelineFrameRatePreference(val storageValue: String, val title: String) {
    STANDARD("60", "60 fps"),
    MAXIMUM("maximum", "Maximum");

    fun framesPerSecond(displayMaximum: Int): Int {
        val supportedMaximum = max(displayMaximum, 1)
        return when (this) {
            STANDARD -> min(60, supportedMaximum)
            MAXIMUM -> supportedMaximum
        }
    }

    fun stateUpdateNanos(displayMaximum: Int): Long =
        1_000_000_000L / framesPerSecond(displayMaximum).toLong()

    companion object {
        const val DEFAULTS_KEY = "timelineFrameRate"

        fun fromStorage(value: String?): TimelineFrameRatePreference =
            entries.firstOrNull { it.storageValue == value } ?: STANDARD
    }
}

internal object TimelineFrameRateStore {
    private const val PREFS = "display_preferences"

    @Volatile
    var minStateUpdateNanos: Long = TimelineFrameRatePreference.STANDARD.stateUpdateNanos(60)
        private set

    @Volatile
    var preference: TimelineFrameRatePreference = TimelineFrameRatePreference.STANDARD
        private set

    @Volatile
    var displayMaximumHz: Int = 60
        private set

    fun initialize(context: Context) {
        applyToWindow(context)
    }

    fun select(context: Context, next: TimelineFrameRatePreference) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(TimelineFrameRatePreference.DEFAULTS_KEY, next.storageValue)
            .apply()
        applyToWindow(context)
    }

    fun read(context: Context): TimelineFrameRatePreference {
        val value = context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(TimelineFrameRatePreference.DEFAULTS_KEY, null)
        return TimelineFrameRatePreference.fromStorage(value)
    }

    internal fun apply(next: TimelineFrameRatePreference, displayMaximum: Int) {
        preference = next
        displayMaximumHz = max(displayMaximum, 1)
        minStateUpdateNanos = next.stateUpdateNanos(displayMaximumHz)
    }

    fun applyToWindow(context: Context) {
        val window = windowOf(context)
        if (window != null) {
            applyToWindow(window)
        } else {
            apply(read(context), displayMaximumHz(displayOf(context)))
        }
    }

    fun applyToWindow(window: Window) {
        // Refresh both requests together on entry, lock/section changes and resume.
        // The active display rate may already be capped by our previous request.
        val display = window.decorView.display ?: displayOf(window.context)
        apply(read(window.context), displayMaximumHz(display))
        val fps = preference.framesPerSecond(displayMaximumHz).toFloat()
        val params = window.attributes
        params.preferredRefreshRate = fps
        window.attributes = params
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

    private fun displayMaximumHz(display: Display?): Int {
        if (display == null) return 60
        val currentMode = display.mode
        val refresh = display.supportedModes
            .filter {
                it.physicalWidth == currentMode.physicalWidth &&
                    it.physicalHeight == currentMode.physicalHeight
            }
            .maxOfOrNull { it.refreshRate }
            ?: display.refreshRate
        return refresh.roundToInt().coerceAtLeast(1)
    }
}
