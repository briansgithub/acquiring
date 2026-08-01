package com.sacredring.android

import kotlin.math.roundToInt

private const val MIN_PLAYBACK_DURATION_MS = 40

/**
 * Converts the portion of a musical event that remains on the beat timeline
 * into wall-clock time at the current tempo.
 *
 * Keeping the source duration in beats is what lets a tempo change resize an
 * already-sounding note without changing its pitch.
 */
internal fun remainingPlaybackDurationMs(
    eventEndBeat: Double,
    currentBeat: Double,
    bpm: Double
): Int? {
    if (!eventEndBeat.isFinite() || !currentBeat.isFinite() || !bpm.isFinite() || bpm <= 0.0) {
        return null
    }
    val remainingBeats = eventEndBeat - currentBeat
    if (remainingBeats <= 0.0) return null
    return (remainingBeats * 60_000.0 / bpm).roundToInt().coerceAtLeast(MIN_PLAYBACK_DURATION_MS)
}
