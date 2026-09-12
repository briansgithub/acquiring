package com.acquiring.android

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import android.view.Window
import android.view.WindowManager
import kotlin.math.max
import kotlin.math.min

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
        val displayMaximum = displayRefreshHz(context)
        apply(read(context), displayMaximum)
        applyToWindow(context)
    }

    fun select(context: Context, next: TimelineFrameRatePreference) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(TimelineFrameRatePreference.DEFAULTS_KEY, next.storageValue)
            .apply()
        apply(next, displayRefreshHz(context))
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
        windowOf(context)?.let(::applyToWindow)
    }

    fun applyToWindow(window: Window) {
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

    private fun displayRefreshHz(context: Context): Int {
        val refresh = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.display?.refreshRate
        } else {
            @Suppress("DEPRECATION")
            (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)
                ?.defaultDisplay
                ?.refreshRate
        } ?: 60f
        return refresh.toInt().coerceAtLeast(1)
    }
}
