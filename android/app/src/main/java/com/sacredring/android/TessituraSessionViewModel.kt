package com.sacredring.android

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

/**
 * Owns the tessitura adjustment for the current song section.
 *
 * A ViewModel keeps the adjustment through Activity recreation, while a new
 * Activity after the app is quit receives a fresh instance. Song and section
 * navigation explicitly enter or clear sessions below.
 */
internal class TessituraSessionViewModel : ViewModel() {
    var sessionKey: String? = null
        private set

    var shiftOctaves by mutableStateOf(0)
        private set

    fun enterSession(key: String) {
        if (sessionKey == key) return
        sessionKey = key
        shiftOctaves = 0
    }

    fun updateShift(octaves: Int) {
        if (sessionKey != null) shiftOctaves = octaves
    }

    fun clearAdjustment() {
        shiftOctaves = 0
    }

    fun clearSession() {
        sessionKey = null
        shiftOctaves = 0
    }
}
