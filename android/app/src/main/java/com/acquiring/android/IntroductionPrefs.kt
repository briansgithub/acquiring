package com.acquiring.android

import android.content.Context

object IntroductionPrefs {
    private const val PREFS = "onboarding"
    private const val KEY_COMPLETED = "hasCompletedIntroduction"

    fun hasCompleted(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_COMPLETED, false)

    fun markCompleted(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_COMPLETED, true)
            .apply()
    }
}

internal const val INTRODUCTION_SCREEN_TEST_TAG = "IntroductionScreen"
