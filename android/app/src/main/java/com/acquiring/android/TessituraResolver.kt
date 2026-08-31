package com.acquiring.android

import kotlin.math.roundToInt
import kotlin.math.sign

/**
 * Places a singing target in the register nearest the pitch the user hummed,
 * without flattening the melodic contour the exercise is teaching.
 *
 * Every decision here is a whole-octave choice, so a target keeps its pitch
 * class and its scale degree label no matter which register it lands in.
 */
internal object TessituraResolver {

    /**
     * Semitones below the anchor a target may sit before it is recentered.
     *
     * The window is asymmetric because a relaxed hum sits low in the voice:
     * there is roughly an octave of comfortable room above it but only a minor
     * sixth below. Both bounds exceed the six semitones that separate any note
     * from its nearest octave, which is what stops a recentered note from
     * immediately needing to be recentered again.
     */
    const val WINDOW_BELOW_ANCHOR = 8

    /** Semitones above the anchor a target may sit before it is recentered. */
    const val WINDOW_ABOVE_ANCHOR = 12

    /**
     * The octave of [sourceMidi] nearest [anchorMidi], always within six
     * semitones of it. An exact tritone tie resolves upward.
     */
    fun findClosestOctave(sourceMidi: Int, anchorMidi: Double): Int {
        val octaves = ((anchorMidi - sourceMidi) / 12.0).roundToInt()
        return sourceMidi + octaves * 12
    }

    /** Whether [midi] is still inside the comfortable band around [anchorMidi]. */
    fun isInsideWindow(midi: Int, anchorMidi: Double): Boolean {
        val offset = midi - anchorMidi
        return offset >= -WINDOW_BELOW_ANCHOR && offset <= WINDOW_ABOVE_ANCHOR
    }

    /**
     * Chooses the register for one target.
     *
     * With no continuity ([lastSource]/[lastTarget] null) this is simply the
     * octave nearest the anchor. Given the previous note of the same sequence
     * it instead picks the anchor-nearest octave that still moves in the
     * direction the source melody moves, and falls back to recentering once
     * holding that direction would leave the comfortable window.
     *
     * Direction is read from the source notes, never from the shifted ones, so
     * an earlier recentering cannot invert the contour of what follows.
     */
    fun resolveTarget(
        sourceMidi: Int,
        anchorMidi: Double,
        lastSource: Int? = null,
        lastTarget: Int? = null
    ): Int {
        val recentered = findClosestOctave(sourceMidi, anchorMidi)
        if (lastSource == null || lastTarget == null) return recentered

        // A repeated source pitch has no direction to preserve, and rechoosing
        // its register would make a held note jump octaves mid-phrase.
        if (sourceMidi == lastSource) return lastTarget

        val direction = sign((sourceMidi - lastSource).toDouble()).toInt()
        // Start from the anchor-nearest register and give up only as much
        // proximity as the direction actually costs.
        var candidate = recentered
        while ((candidate - lastTarget) * direction <= 0) {
            candidate += direction * 12
        }

        return if (isInsideWindow(candidate, anchorMidi)) candidate else recentered
    }

    /**
     * Chooses the register for a two-note interval, which moves as one unit.
     *
     * Both notes take the same whole-octave shift, the one placing their
     * midpoint nearest the anchor, so the written size and direction survive
     * exactly. A wide interval can therefore leave one endpoint outside the
     * comfortable window; that is preferred to teaching the wrong interval.
     */
    fun resolveInterval(
        firstSource: Int,
        secondSource: Int,
        anchorMidi: Double
    ): Pair<Int, Int> {
        val midpoint = (firstSource + secondSource) / 2.0
        val shift = ((anchorMidi - midpoint) / 12.0).roundToInt() * 12
        return Pair(firstSource + shift, secondSource + shift)
    }
}
