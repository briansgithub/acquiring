package com.sacredring.android

import android.content.Context
import android.content.SharedPreferences

object HistoryManager {
    private const val PREF_NAME = "search_history"
    private const val KEY_RECENT_SLUGS = "recent_slugs"
    private const val MAX_HISTORY = 10

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }

    fun getRecentSlugs(context: Context): List<String> {
        val raw = getPrefs(context).getString(KEY_RECENT_SLUGS, "") ?: ""
        if (raw.isEmpty()) return emptyList()
        return raw.split(",")
    }

    fun addSong(context: Context, slug: String) {
        val current = getRecentSlugs(context).toMutableList()
        current.remove(slug) // Remove if exists to move to top
        current.add(0, slug)
        
        val limited = current.take(MAX_HISTORY)
        getPrefs(context).edit()
            .putString(KEY_RECENT_SLUGS, limited.joinToString(","))
            .apply()
    }
}
