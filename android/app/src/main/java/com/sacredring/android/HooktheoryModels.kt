package com.sacredring.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

@Serializable
data class HooktheoryApiResult(
    val ID: JsonElement,
    val song: String,
    val artist: String? = null,
    val section: String? = null,
    val jsonData: String? = null,
    val xmlData: String? = null
) {
    val idString: String
        get() = if (ID is JsonPrimitive) ID.content else ID.toString()
}


@Serializable
data class HooktheorySongData(
    val version: Int? = null,
    val chords: List<JsonObject> = emptyList(),
    val notes: JsonElement? = null,
    val metadata: JsonObject? = null, // In JS we map this from root keys
    val keys: List<JsonObject>? = null,
    val tempos: List<JsonObject>? = null,
    val meters: List<JsonObject>? = null,
    val sections: List<JsonObject>? = null,
    val youtube: JsonObject? = null,
    val endBeat: Int? = null
)

data class KeyInfoWithBeat(
    val key: KeyInfo,
    val beat: Double
)

@Serializable
data class MelodyNote(
    val sd: String,
    val beat: Double,
    val duration: Double,
    val octave: Int = 0,
    val isRest: Boolean = false
)

@Serializable
data class ExtractedSection(
    val songId: JsonElement? = null,
    val numericId: JsonElement? = null,
    val sectionName: String? = null,
    val sectionIndex: Int? = null,
    val songInfo: String? = null,
    val chords: List<JsonObject> = emptyList(),
    val notes: JsonElement? = null,
    val metadata: JsonObject? = null
) {
    val safeSongId: String
        get() = when (val el = songId) {
            is JsonPrimitive -> el.content
            null -> ""
            else -> el.toString()
        }

    val safeNumericId: String
        get() = when (val el = numericId) {
            is JsonPrimitive -> el.content
            null -> ""
            else -> el.toString()
        }

    val safeSectionName: String
        get() = sectionName ?: "Section"

    val safeSongInfo: String
        get() = songInfo ?: ""

    fun getKeys(): List<KeyInfoWithBeat> {
        val keysArray = metadata?.get("keys") as? JsonArray
        if (keysArray != null && keysArray.isNotEmpty()) {
            val list = mutableListOf<KeyInfoWithBeat>()
            for (element in keysArray) {
                val obj = element as? JsonObject ?: continue
                val tonic = (obj["tonic"] as? JsonPrimitive)?.content ?: "C"
                val scale = (obj["scale"] as? JsonPrimitive)?.content ?: "major"
                val beat = (obj["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                list.add(KeyInfoWithBeat(KeyInfo(tonic, scale), beat))
            }
            if (list.isNotEmpty()) {
                return list.sortedBy { it.beat }
            }
        }
        return listOf(KeyInfoWithBeat(KeyInfo("C", "major"), 1.0))
    }

    fun getKeyAtBeat(beat: Double): KeyInfo {
        val allKeys = getKeys()
        var activeKey = allKeys.first().key
        for (k in allKeys) {
            if (k.beat <= beat) {
                activeKey = k.key
            } else {
                break
            }
        }
        return activeKey
    }

    fun getParsedKey(): KeyInfo = getKeyAtBeat(1.0)

    fun getBpm(): Double {
        val tempos = metadata?.get("tempos") as? JsonArray
        if (tempos != null && tempos.isNotEmpty()) {
            val firstTempo = tempos[0] as? JsonObject
            return (firstTempo?.get("bpm") as? JsonPrimitive)?.doubleOrNull ?: 120.0
        }
        return 120.0
    }
}

