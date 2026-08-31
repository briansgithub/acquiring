package com.acquiring.android

internal data class RootIntervalPreviewStep(
    val audioNotes: List<Int>,
    val durationMs: Int,
    val delayAfterMs: Long
)

/** Builds the audio-boundary sequence; interval naming never consumes these values. */
internal fun rootIntervalPreviewSteps(
    previousAudioNote: Int,
    currentAudioNote: Int,
    octaveShiftSemitones: Int,
    durationMs: Int
): List<RootIntervalPreviewStep> {
    val previous = previousAudioNote + octaveShiftSemitones
    val current = currentAudioNote + octaveShiftSemitones
    return listOf(
        RootIntervalPreviewStep(listOf(previous), durationMs, durationMs.toLong()),
        RootIntervalPreviewStep(listOf(current), durationMs, durationMs.toLong()),
        RootIntervalPreviewStep(listOf(previous, current).distinct(), durationMs, 0L)
    )
}
