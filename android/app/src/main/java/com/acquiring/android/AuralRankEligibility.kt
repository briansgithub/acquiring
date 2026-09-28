package com.acquiring.android

import java.util.BitSet

/** Constant-time inclusive range checks, including long stretches of ineligible suffixes. */
internal class AuralRankEligibility(bits: BitSet) {
    private val words = bits.toLongArray()
    private val counts = IntArray(words.size + 1).also { prefix ->
        words.indices.forEach { prefix[it+1] = prefix[it] + java.lang.Long.bitCount(words[it]) }
    }
    val isEmpty get() = words.isEmpty()

    fun hasAny(start: Int, end: Int): Boolean {
        val first = start ushr 6
        if (start > end || first >= words.size) return false
        val actualLast = end ushr 6
        val last = minOf(actualLast,words.lastIndex)
        val firstMask = -1L shl (start and 63)
        val lastMask = if(last < actualLast) -1L else -1L ushr (63 - (end and 63))
        if(first == last) return (words[first] and firstMask and lastMask) != 0L
        return (words[first] and firstMask) != 0L || (words[last] and lastMask) != 0L || counts[last] > counts[first+1]
    }
}
