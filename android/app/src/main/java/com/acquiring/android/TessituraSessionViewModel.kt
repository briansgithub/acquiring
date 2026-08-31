package com.acquiring.android

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

/**
 * Owns the tessitura anchor for the current song section, plus the melodic
 * continuity the resolver needs to keep a sequence moving in one direction.
 *
 * A ViewModel keeps the anchor through Activity recreation, while a new
 * Activity after the app is quit receives a fresh instance. Song and section
 * navigation explicitly enter or clear sessions below.
 */
internal class TessituraSessionViewModel : ViewModel() {
    var sessionKey: String? = null
        private set

    /** The pitch the user hummed, or null when no tessitura is set. */
    var comfortablePitchMidi by mutableStateOf<Double?>(null)
        private set

    /** Source register of the previous target in the current sequence. */
    var lastSourceMidi by mutableStateOf<Int?>(null)
        private set

    /** Register that previous target was actually placed in. */
    var lastTargetMidi by mutableStateOf<Int?>(null)
        private set

    fun enterSession(key: String) {
        if (sessionKey == key) return
        sessionKey = key
        // A different section is a different melody, so the contour so far says
        // nothing about what comes next. The anchor is a property of the singer
        // rather than the song, so it survives.
        resetContinuity()
    }

    fun updateComfortablePitch(midi: Double) {
        // Applied unconditionally: song and section navigation already manage
        // the session, so gating on a session key here would only risk silently
        // discarding a calibration the user just made.
        comfortablePitchMidi = midi
        // Registers chosen against the old anchor are not a valid starting
        // point for the new one.
        resetContinuity()
    }

    fun updateContinuity(source: Int, target: Int) {
        lastSourceMidi = source
        lastTargetMidi = target
    }

    fun resetContinuity() {
        lastSourceMidi = null
        lastTargetMidi = null
    }

    /** The Clear button: drops the anchor without disturbing quiz progress. */
    fun clearAdjustment() {
        comfortablePitchMidi = null
        resetContinuity()
    }

    fun clearSession() {
        sessionKey = null
        comfortablePitchMidi = null
        resetContinuity()
    }
}
