package com.acquiring.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

internal data class ChordTransition(
    val id: String,
    val from: JsonObject,
    val to: JsonObject,
    val count: Int,
    val firstBeat: Double
)

internal object ChordTransitionRanking {
    fun transitions(section: ExtractedSection, rootOnly: Boolean): List<ChordTransition> {
        val key = section.getParsedKey()
        val sequence = section.chords.filter { chord ->
            val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
            val roman = ChordInterpreter.getRomanSymbol(chord, key)
            !isRest && roman.isNotEmpty() && roman != "—" && roman != "Rest"
        }
        if (sequence.size < 2) return emptyList()

        val counts = linkedMapOf<String, Int>()
        val firstSeen = linkedMapOf<String, Triple<JsonObject, JsonObject, Double>>()
        for (index in 0 until sequence.lastIndex) {
            val previous = sequence[index]
            val current = sequence[index + 1]
            val fromLabel = identity(previous, key, rootOnly)
            val toLabel = identity(current, key, rootOnly)
            if (fromLabel == toLabel) continue
            val id = "$fromLabel → $toLabel"
            counts[id] = (counts[id] ?: 0) + 1
            if (id !in firstSeen) {
                val beat = (current["beat"] as? JsonPrimitive)?.doubleOrNull?.let {
                    if (it == 0.0) 1.0 else it
                } ?: 1.0
                firstSeen[id] = Triple(previous, current, beat)
            }
        }
        return firstSeen.mapNotNull { (id, seen) ->
            val count = counts[id] ?: return@mapNotNull null
            ChordTransition(
                id = id,
                from = seen.first,
                to = seen.second,
                count = count,
                firstBeat = seen.third
            )
        }.sortedWith(
            compareByDescending<ChordTransition> { it.count }
                .thenBy { it.firstBeat }
                .thenBy { it.id }
        )
    }

    fun identity(chord: JsonObject, key: KeyInfo, rootOnly: Boolean): String {
        if (rootOnly) {
            return ((chord["root"] as? JsonPrimitive)?.intOrNull ?: 0).toString()
        }
        return ChordInterpreter.getRomanSymbol(chord, key)
    }
}
