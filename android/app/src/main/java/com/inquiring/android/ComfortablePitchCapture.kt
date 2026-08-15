package com.inquiring.android

internal data class ComfortablePitchCaptureProgress(
    val remainingMs: Int,
    val hasSignal: Boolean,
    val isComplete: Boolean
)

/**
 * Accumulates a comfortable-pitch calibration without letting silence consume
 * the countdown. A short dropout pauses the capture; a longer one restarts it.
 */
internal class ComfortablePitchCapture(
    private val captureMs: Int = 3000,
    private val sampleWindowMs: Int = 2000,
    private val dropoutGraceMs: Int = 1000
) {
    private var remainingMs = captureMs
    private var remainingDropoutGraceMs = 0
    private var hasStarted = false
    private val samples = mutableListOf<Double>()

    fun observe(elapsedMs: Int, midi: Double?): ComfortablePitchCaptureProgress {
        val elapsed = elapsedMs.coerceAtLeast(0)
        if (midi != null) {
            hasStarted = true
            remainingDropoutGraceMs = dropoutGraceMs
            remainingMs = (remainingMs - elapsed).coerceAtLeast(0)
            if (remainingMs <= sampleWindowMs) samples.add(midi)
        } else if (hasStarted) {
            if (elapsed < remainingDropoutGraceMs) {
                remainingDropoutGraceMs = (remainingDropoutGraceMs - elapsed).coerceAtLeast(0)
            } else {
                restart()
            }
        }

        return progress()
    }

    fun progress(): ComfortablePitchCaptureProgress = ComfortablePitchCaptureProgress(
        remainingMs = remainingMs,
        hasSignal = hasStarted,
        isComplete = remainingMs == 0 && samples.isNotEmpty()
    )

    fun averageMidiOrNull(): Double? = samples.takeIf { progress().isComplete }?.average()

    private fun restart() {
        remainingMs = captureMs
        remainingDropoutGraceMs = 0
        hasStarted = false
        samples.clear()
    }
}
