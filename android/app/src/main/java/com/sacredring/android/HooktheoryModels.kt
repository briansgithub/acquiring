package com.sacredring.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

import kotlinx.serialization.json.JsonPrimitive

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
    val songId: String,
    val numericId: String,
    val sectionName: String,
    val songInfo: String,
    val chords: List<JsonObject>,
    val notes: JsonElement?,
    val metadata: JsonObject
)
