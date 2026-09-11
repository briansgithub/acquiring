package com.acquiring.android

import android.content.Context

object CatalogAutoInstall {
    private const val PREFS = "catalog_install"
    private const val KEY_LAST_REFRESH_MS = "last_refresh_ms"

    fun shouldStart(songCount: Int, alreadyStarted: Boolean): Boolean =
        songCount == 0 && !alreadyStarted

    fun freshnessLabel(storedMs: Long, nowMs: Long = System.currentTimeMillis()): String {
        if (storedMs <= 0L) return "Catalog freshness unknown"
        val ageHours = ((nowMs - storedMs) / 3_600_000L).coerceAtLeast(0L)
        return if (ageHours < 24) {
            "Catalog updated ${ageHours}h ago"
        } else {
            "Catalog updated ${ageHours / 24}d ago"
        }
    }

    fun lastRefreshLabel(context: Context, nowMs: Long = System.currentTimeMillis()): String {
        val stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getLong(KEY_LAST_REFRESH_MS, 0L)
        return freshnessLabel(stored, nowMs)
    }

    fun markRefreshed(context: Context, atMs: Long = System.currentTimeMillis()) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_REFRESH_MS, atMs)
            .apply()
    }
}
