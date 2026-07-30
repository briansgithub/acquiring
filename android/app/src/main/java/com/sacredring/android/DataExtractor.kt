package com.sacredring.android

import kotlinx.serialization.json.*

object DataExtractor {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun extractSection(apiResult: HooktheoryApiResult, sectionName: String): ExtractedSection {
        val rawJson = apiResult.jsonData ?: throw IllegalArgumentException("No jsonData in API result")
        val data = json.decodeFromString<JsonObject>(rawJson)
        
        val chords = (data["chords"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
        val notes = data["notes"]
        
        // Construct metadata object similar to JS
        val metadata = buildJsonObject {
            data["version"]?.let { put("version", it) }
            data["keys"]?.let { put("keys", it) }
            data["tempos"]?.let { put("tempos", it) }
            data["meters"]?.let { put("meters", it) }
            data["sections"]?.let { put("sections", it) }
            data["endBeat"]?.let { put("endBeat", it) }
            data["youtube"]?.let { put("youtube", it) }
            data["lyrics"]?.let { put("lyrics", it) }
            data["bands"]?.let { put("bands", it) }
            data["breaks"]?.let { put("breaks", it) }
            data["pickup"]?.let { put("pickup", it) }
            
            // From settings
            val settings = data["settings"] as? JsonObject
            settings?.get("externalMP3URL")?.let { put("externalMp3Url", it) }
            settings?.get("externalMP3StartBeat")?.let { put("externalMp3StartBeat", it) }
            settings?.get("externalMP3Duration")?.let { put("externalMp3Duration", it) }
        }

        return ExtractedSection(
            songId = JsonPrimitive(apiResult.idString),
            numericId = JsonPrimitive(apiResult.idString),
            sectionName = sectionName,
            songInfo = apiResult.song,
            chords = chords,
            notes = notes,
            metadata = metadata
        )
    }
}
