package com.acquiring.android

import kotlin.math.roundToInt

private const val MIN_PLAYBACK_DURATION_MS = 40
private const val FIRST_PLAYBACK_BEAT = 1.0
private const val FALLBACK_PLAYBACK_END_BEAT = 32.0

internal data class LoopingPlaybackPosition(
    val beat: Double,
    val looped: Boolean
)

internal fun normalizePlaybackBeat(
    beat: Double,
    startBeat: Double = FIRST_PLAYBACK_BEAT
): Double = if (beat == 0.0) startBeat else beat

internal fun playbackEventEndBeat(
    beat: Double,
    duration: Double,
    isRest: Boolean = false,
    startBeat: Double = FIRST_PLAYBACK_BEAT
): Double? {
    if (isRest) return null
    val normalizedBeat = normalizePlaybackBeat(beat, startBeat)
    if (!normalizedBeat.isFinite() || !duration.isFinite() || duration <= 0.0) return null
    return (normalizedBeat + duration).takeIf { it.isFinite() && it > startBeat }
}

/**
 * Resolves the exclusive end of the audible playback timeline.
 *
 * Hooktheory's metadata end beat can include empty measures after the last
 * rendered note or chord. When sounding events are available, their exact
 * release beat is therefore the authoritative loop boundary. Metadata is only
 * a fallback for sections whose playable event data is missing.
 */
internal fun resolvePlaybackEndBeat(
    metadataEndBeat: Double?,
    audibleEventEndBeats: Iterable<Double>,
    startBeat: Double = FIRST_PLAYBACK_BEAT
): Double {
    val contentEndBeat = audibleEventEndBeats
        .filter { it.isFinite() && it > startBeat }
        .maxOrNull()
    if (contentEndBeat != null) return contentEndBeat

    return metadataEndBeat
        ?.takeIf { it.isFinite() && it > startBeat }
        ?: FALLBACK_PLAYBACK_END_BEAT.coerceAtLeast(Math.nextUp(startBeat))
}

/**
 * Maps a monotonically advancing beat onto the current loop while preserving
 * any small scheduler overshoot. An exact end-boundary hit maps directly to
 * the first beat, so the next onset can be triggered without an extra tick.
 */
internal fun loopingPlaybackPosition(
    tickEndBeat: Double,
    endBeat: Double,
    startBeat: Double = FIRST_PLAYBACK_BEAT
): LoopingPlaybackPosition {
    if (!tickEndBeat.isFinite() || !endBeat.isFinite() || endBeat <= startBeat) {
        return LoopingPlaybackPosition(startBeat, looped = false)
    }
    if (tickEndBeat < endBeat) {
        return LoopingPlaybackPosition(tickEndBeat.coerceAtLeast(startBeat), looped = false)
    }

    val loopLength = endBeat - startBeat
    val wrappedBeat = startBeat + ((tickEndBeat - startBeat) % loopLength)
    return LoopingPlaybackPosition(wrappedBeat, looped = true)
}

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
