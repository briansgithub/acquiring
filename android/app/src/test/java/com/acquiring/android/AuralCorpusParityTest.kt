package com.acquiring.android

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

/** Shared JSON is also consumed by JS, and can be consumed unchanged by Swift. */
class AuralCorpusParityTest {
    @Test fun matchesPortableSelectionFixturesAndRandomVectors() {
        val input = requireNotNull(javaClass.getResourceAsStream("/selection-fixtures.json")) { "Missing shared selector fixture" }
        val root = input.bufferedReader().use { Json.parseToJsonElement(it.readText()).jsonObject }
        root.getValue("prngVectors").jsonArray.forEach { item ->
            val v = item.jsonObject
            val rng = AuralSelectionRandom(v.getValue("seed").jsonPrimitive.long)
            v.getValue("uint32").jsonArray.forEach { assertEquals(it.jsonPrimitive.long, (rng.nextDouble() * 4294967296.0).toLong()) }
        }
        root.getValue("scenarios").jsonArray.forEach { item ->
            val scenario = item.jsonObject
            val args = scenario.getValue("input").jsonObject
            val songs = mutableMapOf<String, AuralPopularity>()
            val sections = mutableMapOf<String, AuralPopularity>()
            val refs = mutableListOf<AuralOccurrenceRef>()
            fun popularity(value: JsonElement?): AuralPopularity {
                val obj = value?.jsonObject ?: return AuralPopularity(null)
                return AuralPopularity(obj["score"]?.jsonPrimitive?.doubleOrNull, obj["confidence"]?.jsonPrimitive?.doubleOrNull ?: 0.0)
            }
            args.getValue("songs").jsonArray.forEach { songItem ->
                val song = songItem.jsonObject
                val songId = song.getValue("id").jsonPrimitive.content
                songs[songId] = popularity(song["popularity"])
                song.getValue("sections").jsonArray.forEach { sectionItem ->
                    val section = sectionItem.jsonObject
                    val sectionId = section.getValue("id").jsonPrimitive.content
                    sections[sectionId] = if (section["popularity"]?.jsonObject?.get("trustworthy")?.jsonPrimitive?.booleanOrNull == true) popularity(section["popularity"]) else AuralPopularity(null)
                    section.getValue("occurrences").jsonArray.forEach { occurrenceItem ->
                        val occurrence = occurrenceItem.jsonObject
                        val id = occurrence.getValue("id").jsonPrimitive.content
                        refs += AuralOccurrenceRef(id, songId, sectionId, occurrence["sourceId"]?.jsonPrimitive?.content ?: id)
                    }
                }
            }
            val settings = args["settings"]?.let { Json.decodeFromJsonElement<AuralExampleSettings>(it) } ?: AuralExampleSettings()
            val c = args["context"]?.jsonObject ?: JsonObject(emptyMap())
            fun stringList(value: JsonElement?) = value?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty()
            val context = AuralSelectionContext(stringList(c["recentSongIds"]), stringList(c["heardSourceIds"]).toSet(),
                stringList(args["favoriteSongIds"]).toSet(), c["assessment"]?.jsonPrimitive?.booleanOrNull == true,
                c["supportedOccurrenceId"]?.jsonPrimitive?.contentOrNull)
            val actual = AuralCorpusSelector.select(refs, songs, sections, settings, context, args.getValue("seed").jsonPrimitive.long)
            val expected = scenario.getValue("expected").jsonObject["selection"]
            if (expected == null || expected is JsonNull) assertNull(actual)
            else {
                assertEquals(scenario.getValue("name").jsonPrimitive.content, expected.jsonObject.getValue("occurrenceId").jsonPrimitive.content, actual!!.id)
                assertEquals(expected.jsonObject.getValue("songId").jsonPrimitive.content, actual.songId)
                assertEquals(expected.jsonObject.getValue("sectionId").jsonPrimitive.content, actual.sectionId)
                assertEquals(expected.jsonObject.getValue("familiar").jsonPrimitive.boolean, AuralExposureIndex(context.heardSourceIds).contains(actual.sourceId))
            }
        }
    }
}
