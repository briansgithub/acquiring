package com.acquiring.android

import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TessituraResolverTest {

    private val anchor = 60.0 // C4

    // --- nearest-register selection -----------------------------------------

    @Test
    fun closestOctavePicksTheNearestRegisterInEitherDirection() {
        assertEquals(60, TessituraResolver.findClosestOctave(60, anchor))
        // C2 (36) and C6 (84) both belong to a pitch class four octaves away.
        assertEquals(60, TessituraResolver.findClosestOctave(36, anchor))
        assertEquals(60, TessituraResolver.findClosestOctave(84, anchor))
        // B3 (59) is already nearest; its other registers are 12 further out.
        assertEquals(59, TessituraResolver.findClosestOctave(71, anchor))
    }

    @Test
    fun closestOctaveBreaksTheTritoneTieUpward() {
        // F#3 (54) sits exactly between C3 (48) and C4 (60) for a C source.
        assertEquals(60, TessituraResolver.findClosestOctave(48, 54.0))
        assertEquals(72, TessituraResolver.findClosestOctave(72, 66.0))
    }

    @Test
    fun closestOctaveIsAlwaysWithinSixSemitonesOfTheAnchor() {
        for (source in 0..127) {
            val resolved = TessituraResolver.findClosestOctave(source, anchor)
            assertTrue(
                "source $source resolved to $resolved",
                abs(resolved - anchor) <= 6.0
            )
        }
    }

    // --- the comfortable window ---------------------------------------------

    @Test
    fun windowIsAsymmetricAroundTheAnchor() {
        assertTrue(TessituraResolver.isInsideWindow(72, anchor)) // an octave up
        assertFalse(TessituraResolver.isInsideWindow(73, anchor))
        assertTrue(TessituraResolver.isInsideWindow(52, anchor)) // a minor 6th down
        assertFalse(TessituraResolver.isInsideWindow(51, anchor))
    }

    @Test
    fun windowIsMeasuredAgainstTheHummedPitchNotARoundedOne() {
        // A hum of 60.4 buys four tenths of a semitone of extra headroom above
        // and gives up the same amount below.
        assertTrue(TessituraResolver.isInsideWindow(72, 60.4))
        assertFalse(TessituraResolver.isInsideWindow(52, 60.4))
    }

    // --- direction preservation ---------------------------------------------

    @Test
    fun firstNoteOfASequenceSimplyLandsNearestTheAnchor() {
        assertEquals(60, TessituraResolver.resolveTarget(84, anchor))
    }

    @Test
    fun ascendingSourceProducesAnAscendingTarget() {
        var lastSource = 60
        var lastTarget = TessituraResolver.resolveTarget(60, anchor)
        assertEquals(60, lastTarget)

        for (source in listOf(64, 67, 71)) {
            val target = TessituraResolver.resolveTarget(source, anchor, lastSource, lastTarget)
            assertTrue("$lastTarget -> $target should ascend", target > lastTarget)
            lastSource = source
            lastTarget = target
        }
        assertEquals(71, lastTarget)
    }

    @Test
    fun descendingSourceProducesADescendingTarget() {
        var lastSource = 60
        var lastTarget = TessituraResolver.resolveTarget(60, anchor)

        for (source in listOf(57, 55, 53)) {
            val target = TessituraResolver.resolveTarget(source, anchor, lastSource, lastTarget)
            assertTrue("$lastTarget -> $target should descend", target < lastTarget)
            lastSource = source
            lastTarget = target
        }
        assertEquals(53, lastTarget)
    }

    @Test
    fun directionIsHeldEvenWhenItCostsProximityToTheAnchor() {
        // Ascending from B4 (71) to a C source. The nearest C to the anchor is
        // C4 (60), which would descend, so C5 (72) is taken instead.
        assertEquals(72, TessituraResolver.resolveTarget(72, anchor, lastSource = 71, lastTarget = 71))
    }

    @Test
    fun directionComesFromTheSourceNotesNotTheShiftedOnes() {
        // Sources descend (72 -> 71) while the previous target was recentered
        // down to 60, so the shifted notes would suggest ascending. The source
        // contour wins and the target descends to B3 (59).
        assertEquals(59, TessituraResolver.resolveTarget(71, anchor, lastSource = 72, lastTarget = 60))
    }

    @Test
    fun repeatedSourcePitchKeepsTheRegisterItIsAlreadyIn() {
        // Sitting on C5 and playing C again stays on C5, even though C4 is the
        // register nearest the anchor.
        assertEquals(72, TessituraResolver.resolveTarget(60, anchor, lastSource = 60, lastTarget = 72))
    }

    // --- recentering ---------------------------------------------------------

    @Test
    fun holdingDirectionPastTheWindowRecentersToTheNearestOctave() {
        // At C5 (72), the top of the window, ascending to a D source. D5 (74)
        // is 14 above the anchor, so the run recenters to D4 (62) instead.
        assertEquals(62, TessituraResolver.resolveTarget(74, anchor, lastSource = 72, lastTarget = 72))
    }

    @Test
    fun descendingPastTheWindowRecentersSooner() {
        // The window only reaches a minor 6th below, so a descending run gives
        // out earlier than an ascending one. From E3 (52), G#2 (44) is 16 below
        // the anchor and recenters to G#3 (56).
        assertEquals(56, TessituraResolver.resolveTarget(44, anchor, lastSource = 52, lastTarget = 52))
    }

    @Test
    fun aRunContinuesFromTheRegisterItRecenteredInto() {
        // Walk up until the window gives out, then confirm the next step keeps
        // ascending from the new register rather than from the old one.
        var lastSource = 72
        var lastTarget = TessituraResolver.resolveTarget(72, anchor, 71, 71)
        assertEquals(72, lastTarget)

        lastTarget = TessituraResolver.resolveTarget(74, anchor, lastSource, lastTarget)
        assertEquals(62, lastTarget)
        lastSource = 74

        val next = TessituraResolver.resolveTarget(76, anchor, lastSource, lastTarget)
        assertEquals(64, next)
    }

    @Test
    fun recenteringNeverImmediatelyNeedsRecenteringAgain() {
        // The invariant that stops the resolver thrashing: every register it can
        // fall back to is inside the window it just left.
        for (source in 0..127) {
            val recentered = TessituraResolver.findClosestOctave(source, anchor)
            assertTrue(
                "source $source recentered to $recentered",
                TessituraResolver.isInsideWindow(recentered, anchor)
            )
        }
    }

    // --- intervals -----------------------------------------------------------

    @Test
    fun intervalKeepsItsSizeAndDirectionWhileMovingTowardTheAnchor() {
        // G4 -> C5 (67 -> 72), a rising fourth. Midpoint 69.5 shifts down an
        // octave to land nearest C4.
        val (first, second) = TessituraResolver.resolveInterval(67, 72, anchor)
        assertEquals(55, first)
        assertEquals(60, second)
        assertEquals(5, second - first)
    }

    @Test
    fun descendingIntervalStaysDescending() {
        val (first, second) = TessituraResolver.resolveInterval(84, 77, anchor)
        assertEquals(-7, second - first)
        assertTrue(second < first)
    }

    @Test
    fun wideIntervalKeepsItsSizeEvenWhenAnEndpointLeavesTheWindow() {
        // Two octaves and a fifth, C3 (48) up to G5 (79). No single shift can
        // put both endpoints in the window, and the interval is what matters.
        val (first, second) = TessituraResolver.resolveInterval(48, 79, anchor)
        assertEquals(31, second - first)
        assertTrue(
            "one endpoint is expected to fall outside the window",
            !TessituraResolver.isInsideWindow(first, anchor) ||
                !TessituraResolver.isInsideWindow(second, anchor)
        )
    }

    @Test
    fun unisonIntervalIsPlacedNearestTheAnchorWithoutSplitting() {
        val (first, second) = TessituraResolver.resolveInterval(84, 84, anchor)
        assertEquals(first, second)
        assertEquals(84 - 24, first)
    }
}
