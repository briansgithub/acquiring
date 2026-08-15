package com.inquiring.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.intOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class HooktheoryDataCompatTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun migratesOnlyTheKnownLegacyPianoManChord() {
        val oldChord = json.decodeFromString<JsonObject>(
            """{"root":5,"beat":40,"duration":3,"type":11,"inversion":0,"applied":0,"adds":[],"omits":[],"alterations":[],"suspensions":[]}"""
        )
        val section = ExtractedSection(
            numericId = kotlinx.serialization.json.JsonPrimitive("1714973"),
            chords = listOf(oldChord),
            metadata = json.decodeFromString("""{"fp":"94c3b7dc6a7f8804312aae2fa40079291ec84eb95"}"""),
        )

        val migrated = HooktheoryDataCompat.migrateSection(section)
        assertEquals(9, (migrated.chords.single()["type"] as JsonPrimitive).intOrNull)
        assertEquals(
            listOf(4),
            (migrated.chords.single()["suspensions"] as JsonArray)
                .map { (it as JsonPrimitive).intOrNull },
        )
        assertEquals(11, (section.chords.single()["type"] as JsonPrimitive).intOrNull)
    }

    @Test
    fun leavesGenuineEleventhsAlone() {
        val chord = json.decodeFromString<JsonObject>(
            """{"root":1,"beat":56.5,"duration":1,"type":11,"suspensions":[]}"""
        )
        val section = ExtractedSection(
            numericId = kotlinx.serialization.json.JsonPrimitive("other"),
            chords = listOf(chord),
            metadata = json.decodeFromString("""{"fp":"other"}"""),
        )
        val migrated = HooktheoryDataCompat.migrateSection(section)
        assertSame(section, migrated)
    }
}
