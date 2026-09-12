package com.acquiring.android

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

/**
 * Song-scoped singing octave offset. Section changes keep the offset; a new
 * song resets in-memory state to 0 (Room may still restore that song's saved value).
 */
internal class SongOctaveOffsetViewModel : ViewModel() {
    var sessionKey: String? = null
        private set

    var songSlug: String? = null
        private set

    var octaveOffset by mutableStateOf(0)
        private set

    private var dao: SongOctaveOffsetDao? = null

    fun attachDao(dao: SongOctaveOffsetDao) {
        this.dao = dao
    }

    fun enterSession(songSlug: String, key: String) {
        val sameSession = sessionKey == key && this.songSlug == songSlug
        val previousSlug = this.songSlug
        this.songSlug = songSlug
        sessionKey = key
        if (sameSession) return
        val store = dao
        if (store == null) {
            if (previousSlug != songSlug) octaveOffset = 0
            return
        }
        viewModelScope.launch {
            octaveOffset = clampSingingOctaveOffset(store.getOffset(songSlug) ?: 0)
        }
    }

    fun updateOctaveOffset(offset: Int) {
        val clamped = clampSingingOctaveOffset(offset)
        octaveOffset = clamped
        val slug = songSlug ?: return
        val store = dao ?: return
        viewModelScope.launch {
            store.upsert(SongOctaveOffset(slug = slug, offset = clamped))
        }
    }

    fun clearSession() {
        sessionKey = null
        songSlug = null
        octaveOffset = 0
    }
}
