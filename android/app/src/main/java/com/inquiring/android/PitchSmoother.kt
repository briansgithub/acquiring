package com.inquiring.android

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
class PitchSmoother private constructor(
    private val targetMidi: Int,
    private val settings: PitchSmoothingSettings
) {

    constructor(targetMidi: Int) : this(
        targetMidi = targetMidi,
        settings = PitchTrackingMode.STANDARD.smoothing
    )

    internal constructor(targetMidi: Int, trackingMode: PitchTrackingMode) : this(
        targetMidi = targetMidi,
        settings = trackingMode.smoothing
    )

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
        if (validFrames > 0 && abs(midi - smoothedMidi) > settings.octaveRejectSemitones) {
            rejectedFrames++
            // A jump that persists is the singer actually moving to a new note, not a
            // detector glitch — re-seed rather than rejecting forever.
            if (rejectedFrames >= settings.octaveRejectMaxFrames) reset()
            return null
        }
        rejectedFrames = 0

        recent.addLast(midi)
        if (recent.size > settings.medianWindow) recent.removeFirst()
        if (recent.size < settings.medianWindow) return null

        val median = recent.sorted()[settings.medianWindow / 2]
        smoothedMidi = if (validFrames == 0) {
            median
        } else {
            smoothedMidi * (1.0 - settings.emaAdmit) + median * settings.emaAdmit
        }
        validFrames++

        if (validFrames < settings.minFramesBeforePublish) return null

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

internal data class PitchSmoothingSettings(
    val medianWindow: Int,
    val minFramesBeforePublish: Int,
    val emaAdmit: Double,
    val octaveRejectSemitones: Double,
    val octaveRejectMaxFrames: Int
) {
    init {
        require(medianWindow > 0 && medianWindow % 2 == 1)
        require(minFramesBeforePublish > 0)
        require(emaAdmit in 0.0..1.0)
        require(octaveRejectSemitones > 0.0)
        require(octaveRejectMaxFrames > 0)
    }
}

internal enum class PitchTrackingMode(
    val windowSizeOverride: Int?,
    val hopSizeOverride: Int?,
    val smoothing: PitchSmoothingSettings
) {
    STANDARD(
        windowSizeOverride = null,
        hopSizeOverride = null,
        smoothing = PitchSmoothingSettings(
            medianWindow = PitchSmoother.MEDIAN_WINDOW,
            minFramesBeforePublish = PitchSmoother.MIN_FRAMES_BEFORE_PUBLISH,
            emaAdmit = PitchSmoother.EMA_ADMIT,
            octaveRejectSemitones = PitchSmoother.OCTAVE_REJECT_SEMITONES,
            octaveRejectMaxFrames = PitchSmoother.OCTAVE_REJECT_MAX_FRAMES
        )
    ),
    MELODY_FAST(
        windowSizeOverride = 1024,
        hopSizeOverride = 256,
        smoothing = PitchSmoothingSettings(
            medianWindow = 1,
            minFramesBeforePublish = 1,
            emaAdmit = 1.0,
            octaveRejectSemitones = PitchSmoother.OCTAVE_REJECT_SEMITONES,
            octaveRejectMaxFrames = 1
        )
    )
}
