package com.sacredring.android

import kotlin.math.abs

/**
 * Median-then-exponential smoothing over MIDI note numbers, with octave-error rejection.
 *
 * Smoothing deliberately happens in the MIDI (log-frequency) domain rather than on cents, so
 * that the `midi` and `centsError` of a published [MicrophonePitchTracker.PitchResult.Estimate]
 * are always derived from the same number and cannot disagree. Consumers that recompute cents
 * from `midi` therefore see exactly what the gauge sees.
 *
 * Split out of [MicrophonePitchTracker] so the filtering can be exercised without a microphone.
 */
class PitchSmoother(private val targetMidi: Int) {

    private val recent = ArrayDeque<Double>()
    private var smoothedMidi = 0.0
    private var validFrames = 0
    private var rejectedFrames = 0

    /**
     * Feeds one raw per-frame estimate.
     *
     * @return the estimate to publish, or null while the filter is still warming up or is
     *   discarding what looks like an octave error.
     */
    fun accept(midi: Double, confidence: Double): MicrophonePitchTracker.PitchResult.Estimate? {
        // YIN occasionally locks onto a harmonic or subharmonic, landing a full octave away.
        // Letting those into the median drags the estimate and can flip the tessitura octave.
        if (validFrames > 0 && abs(midi - smoothedMidi) > OCTAVE_REJECT_SEMITONES) {
            rejectedFrames++
            // A jump that persists is the singer actually moving to a new note, not a
            // detector glitch — re-seed rather than rejecting forever.
            if (rejectedFrames >= OCTAVE_REJECT_MAX_FRAMES) reset()
            return null
        }
        rejectedFrames = 0

        recent.addLast(midi)
        if (recent.size > MEDIAN_WINDOW) recent.removeFirst()
        if (recent.size < MEDIAN_WINDOW) return null

        val median = recent.sorted()[MEDIAN_WINDOW / 2]
        smoothedMidi = if (validFrames == 0) median else smoothedMidi * EMA_RETAIN + median * EMA_ADMIT
        validFrames++

        if (validFrames < MIN_FRAMES_BEFORE_PUBLISH) return null

        return MicrophonePitchTracker.PitchResult.Estimate(
            midi = smoothedMidi,
            centsError = 100.0 * (smoothedMidi - targetMidi),
            confidence = confidence
        )
    }

    fun reset() {
        recent.clear()
        smoothedMidi = 0.0
        validFrames = 0
        rejectedFrames = 0
    }

    companion object {
        /** Semitones away from the running estimate before a frame is treated as an octave error. */
        const val OCTAVE_REJECT_SEMITONES = 6.0

        /** Consecutive rejected frames after which the jump is accepted as a real note change. */
        const val OCTAVE_REJECT_MAX_FRAMES = 3

        const val MEDIAN_WINDOW = 3
        const val MIN_FRAMES_BEFORE_PUBLISH = 2
        const val EMA_RETAIN = 0.7
        const val EMA_ADMIT = 0.3
    }
}
