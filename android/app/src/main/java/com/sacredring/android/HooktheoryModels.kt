package com.sacredring.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

@Serializable
data class HooktheoryApiResult(
    val ID: JsonElement,
    val song: String,
    val artist: String? = null,
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

@Serializable
data class ExtractedSection(
    val songId: JsonElement? = null,
    val numericId: JsonElement? = null,
    val sectionName: String? = null,
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

    fun getParsedKey(): KeyInfo {
        val keys = metadata?.get("keys")?.jsonArray
        if (keys != null && keys.isNotEmpty()) {
            val firstKey = keys[0].jsonObject
            val tonic = firstKey["tonic"]?.jsonPrimitive?.content ?: "C"
            val scale = firstKey["scale"]?.jsonPrimitive?.content ?: "major"
            return KeyInfo(tonic, scale)
        }
        return KeyInfo("C", "major")
    }
}

