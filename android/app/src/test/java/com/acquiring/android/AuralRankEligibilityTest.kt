package com.acquiring.android

import java.util.BitSet
import kotlin.random.Random
import org.junit.Assert.*
import org.junit.Test

class AuralRankEligibilityTest {
    @Test fun wordBoundariesAndEmptyTailsAgreeWithExhaustiveLookup() {
        for(points in listOf(emptyList(),listOf(0),listOf(63,64,127,128,8191),listOf(8191))) {
            val bits=BitSet().also { set -> points.forEach { set.set(it) } }
            val eligibility=AuralRankEligibility(bits)
            assertEquals(points.isEmpty(),eligibility.isEmpty)
            val random=Random(42)
            val boundaries=listOf(0,1,62,63,64,65,126,127,128,129,8190,8191,8192,10_000)
            val spans=boundaries.flatMap { start -> boundaries.filter { it>=start }.map { start to it } } +
                List(2000) { val a=random.nextInt(10_001);val b=random.nextInt(10_001);minOf(a,b) to maxOf(a,b) }
            for((start,end) in spans) assertEquals("$points in [$start,$end]",points.any { it in start..end },eligibility.hasAny(start,end))
        }
    }
}
