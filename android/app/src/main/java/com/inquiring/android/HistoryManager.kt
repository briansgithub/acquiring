package com.inquiring.android

import android.content.Context
import android.content.SharedPreferences
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

internal fun canonicalArtistName(artistName: String): String =
    artistName.replace('-', ' ').trim()

object HistoryManager {
    private const val PREF_NAME = "search_history"
    private const val KEY_RECENT_SLUGS = "recent_slugs"
    private const val KEY_RECENT_ARTISTS = "recent_artists"
    private const val MAX_HISTORY = 10
    private val json = Json

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

    fun getRecentArtists(context: Context): List<String> {
        val raw = getPrefs(context).getString(KEY_RECENT_ARTISTS, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<String>>(raw) }
            .getOrDefault(emptyList())
    }

    fun addArtist(context: Context, artistName: String?) {
        val canonicalName = artistName
            ?.takeIf { it.isNotBlank() }
            ?.let(::canonicalArtistName)
            ?.takeIf { it.isNotEmpty() }
            ?: return
        val current = getRecentArtists(context)
            .filterNot { it.equals(canonicalName, ignoreCase = true) }
            .toMutableList()
        current.add(0, canonicalName)

        getPrefs(context).edit()
            .putString(KEY_RECENT_ARTISTS, json.encodeToString(current.take(MAX_HISTORY)))
            .apply()
    }
}
