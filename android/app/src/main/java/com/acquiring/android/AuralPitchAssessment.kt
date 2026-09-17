package com.acquiring.android

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlin.math.abs

internal data class AuralPitchFrame(
    val timeMs: Long,
    val midi: Double?,
    val confidence: Double = 0.0,
    val isHeld: Boolean = false,
    val error: String? = null
)

internal enum class AuralPitchStatus { CORRECT, INCORRECT, UNCERTAIN }
internal data class AuralPitchAssessment(
    val status: AuralPitchStatus,
    val reason: String,
    val cents: List<Double> = emptyList()
)

/** Permission is requested by the screen first; cancellation always retires the lease. */
internal suspend fun captureAuralPitch(
    source: PitchSource, targetMidi: Int, durationMs: Long = 3000L,
    clockMs: () -> Long = { System.nanoTime() / 1_000_000L }
): List<AuralPitchFrame> {
    require(durationMs in 300L..30_000L)
    require(targetMidi in 1..127)
    val frames = mutableListOf<AuralPitchFrame>()
    try {
        // Clear an earlier estimate before a fresh attempt can consume it.
        source.stop()
        (source as? ExclusivePitchSource)?.claim()
        source.start(targetMidi)
        val start = clockMs()
        while (clockMs() - start < durationMs) {
            currentCoroutineContext().ensureActive()
            val time = clockMs() - start
            if (source is ExclusivePitchSource && !source.ownsMicrophone.value) {
                frames += AuralPitchFrame(time, null, error = "The microphone was taken by another practice tool. Try again.")
                break
            }
            val frame = when (val pitch = source.pitchFlow.value) {
                is MicrophonePitchTracker.PitchResult.Estimate -> AuralPitchFrame(time, pitch.midi, pitch.confidence, pitch.isHeld)
                is MicrophonePitchTracker.PitchResult.Error -> AuralPitchFrame(time, null, error = pitch.message)
                MicrophonePitchTracker.PitchResult.NoSignal -> AuralPitchFrame(time, null)
            }
            frames += frame
            if (frame.error != null) break
            delay(minOf(40L, (durationMs - (clockMs() - start)).coerceAtLeast(1L)))
        }
    } finally {
        source.stop()
    }
    return frames
}

private fun pitchMedian(values: List<Double>): Double {
    val sorted = values.sorted()
    val center = sorted.size / 2
    return if (sorted.size % 2 == 1) sorted[center] else (sorted[center - 1] + sorted[center]) / 2.0
}
private fun octaveDifference(midi: Double, target: Double): Double =
    ((100.0 * (midi - target) + 600.0) % 1200.0 + 1200.0) % 1200.0 - 600.0

/**
 * No signal, held estimates, uncertain pitch, and missing note boundaries never
 * count as musical mistakes. A wrong answer requires stable, confident evidence.
 * Repeated sequence pitches require a breath; per-note capture avoids this burden.
 */
internal fun assessAuralPitch(
    frames: List<AuralPitchFrame>, targetMidis: List<Int>, toleranceCents: Double = 45.0,
    minConfidence: Double = 0.85, minStableMs: Long = 250L, minCoverage: Double = 0.25,
    octaveEquivalent: Boolean = true
): AuralPitchAssessment {
    fun uncertain(reason: String) = AuralPitchAssessment(AuralPitchStatus.UNCERTAIN, reason)
    if (targetMidis.isEmpty() || targetMidis.any { it !in 1..127 }) return uncertain("The exercise pitch target is unavailable.")
    frames.firstOrNull { it.error != null }?.let { return uncertain(it.error!!) }
    val ordered = frames.filter { it.timeMs >= 0 }.sortedBy { it.timeMs }
    if (ordered.size < 4) return uncertain("Too little microphone data was captured. Try again.")
    val intervals = ordered.zipWithNext { a, b -> (b.timeMs - a.timeMs).toDouble() }.filter { it in 1.0..100.0 }
    val frameMs = if (intervals.isEmpty()) 40.0 else pitchMedian(intervals)
    fun valid(frame: AuralPitchFrame) = frame.midi?.let { it.isFinite() && it in 35.0..96.0 } == true &&
        frame.confidence.isFinite() && frame.confidence >= minConfidence && !frame.isHeld
    val voiced = ordered.filter(::valid)
    if (voiced.size.toDouble() / ordered.size < minCoverage) return uncertain("The voice signal was too faint or unclear. Try a quieter space.")
    fun distance(midi: Double, target: Double) = if (octaveEquivalent) octaveDifference(midi, target) else (midi - target) * 100.0
    data class Group(val start: Long, var end: Long, val anchor: Double, val notes: MutableList<Double> = mutableListOf())
    val groups = mutableListOf<Group>()
    for (frame in voiced) {
        val midi = frame.midi!!
        val last = groups.lastOrNull()
        val group = if (last == null || frame.timeMs - last.end > maxOf(100.0, 2.1 * frameMs) || abs(distance(midi, last.anchor)) > 85.0) {
            Group(frame.timeMs, frame.timeMs, midi).also(groups::add)
        } else last
        group.end = frame.timeMs
        group.notes += if (octaveEquivalent) group.anchor + octaveDifference(midi, group.anchor) / 100.0 else midi
    }
    val stable = groups.filter { group ->
        val center = pitchMedian(group.notes)
        val inliers = group.notes.count { abs((it - center) * 100.0) <= 45.0 }
        group.end - group.start + frameMs >= minStableMs && group.notes.size >= 4 && inliers.toDouble() / group.notes.size >= 0.8
    }
    if (stable.size != targetMidis.size) return uncertain(if (targetMidis.size > 1)
        "Could not separate every sustained note. Leave a breath between repeated notes or capture one at a time."
        else "Hold one steady note for a little longer, then try again.")
    if (stable.sumOf { it.notes.size }.toDouble() / voiced.size.coerceAtLeast(1) < 0.75) return uncertain("Pitch was not steady enough to grade reliably.")
    val cents = stable.mapIndexed { index, group -> abs(distance(pitchMedian(group.notes), targetMidis[index].toDouble())) }
    val correct = cents.all { it <= toleranceCents }
    return AuralPitchAssessment(if (correct) AuralPitchStatus.CORRECT else AuralPitchStatus.INCORRECT,
        if (correct) "Stable pitches matched the target." else "A clear sustained pitch differed from the target.", cents)
}
