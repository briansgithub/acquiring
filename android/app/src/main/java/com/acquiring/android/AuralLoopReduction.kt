package com.acquiring.android

internal const val AURAL_LOOP_REDUCTION_VERSION = "unique-transitions-1"
internal data class AuralLoopReduction(val redundant: Boolean, val start: Int, val length: Int)

internal fun auralReduceLoop(tokens: List<String>): AuralLoopReduction {
    val n = tokens.size
    if (n < 3) return AuralLoopReduction(false, 0, n)
    val prefix = IntArray(n)
    for (i in 1 until n) {
        var j = prefix[i - 1]
        while (j > 0 && tokens[i] != tokens[j]) j = prefix[j - 1]
        if (tokens[i] == tokens[j]) j++
        prefix[i] = j
    }
    val period = n - prefix[n - 1]
    if (n < 2 * period || n <= period + 1) return AuralLoopReduction(false, 0, n)
    val last = mutableMapOf<Pair<String, String>, Int>()
    var left = 0; var bestStart = 0; var bestLength = 1
    for (edge in 0 until n - 1) {
        val key = tokens[edge] to tokens[edge + 1]
        left = maxOf(left, (last[key] ?: -1) + 1)
        last[key] = edge
        val length = edge - left + 2
        if (length > bestLength) { bestStart = left; bestLength = length }
    }
    return AuralLoopReduction(true, bestStart, bestLength)
}

internal fun auralRetainedChildren(tokens: List<String>): List<List<String>> {
    if (tokens.size <= 2) return emptyList()
    val queue = mutableListOf(0 to tokens.size - 1, 1 to tokens.size)
    val visited = mutableSetOf<Pair<Int, Int>>()
    val result = linkedSetOf<List<String>>()
    var cursor = 0
    while (cursor < queue.size) {
        val span = queue[cursor++]
        val (start, end) = span
        if (end - start < 2 || !visited.add(span)) continue
        val child = tokens.subList(start, end)
        if (!auralReduceLoop(child).redundant) result.add(child.toList())
        else { queue.add(start to end - 1); queue.add(start + 1 to end) }
    }
    return result.toList()
}
