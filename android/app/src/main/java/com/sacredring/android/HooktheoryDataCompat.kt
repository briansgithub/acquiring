package com.sacredring.android

import kotlinx.serialization.json.*

/** Compatibility migrations for stale downloaded Hooktheory section data. */
object HooktheoryDataCompat {
    private const val LEGACY_PIANO_MAN_CHORUS_FP = "94c3b7dc6a7f8804312aae2fa40079291ec84b95"
    private const val LEGACY_PIANO_MAN_CHORUS_ID = "1714973"

    fun migrateSections(sections: Map<String, ExtractedSection>): Map<String, ExtractedSection> =
        sections.mapValues { (_, section) -> migrateSection(section) }

    fun migrateSection(section: ExtractedSection): ExtractedSection {
        val migrated = section.chords.map { chord -> migrateChord(chord, section) }
        return if (migrated == section.chords) section else section.copy(chords = migrated)
    }

    private fun migrateChord(chord: JsonObject, section: ExtractedSection): JsonObject {
        if (!isLegacyPianoManChorus(section, chord)) return chord
        return buildJsonObject {
            for ((key, value) in chord) {
                when (key) {
                    "type" -> put(key, JsonPrimitive(9))
                    "suspensions" -> put(key, JsonArray(listOf(JsonPrimitive(4))))
                    else -> put(key, value)
                }
            }
        }
    }

    private fun isLegacyPianoManChorus(section: ExtractedSection, chord: JsonObject): Boolean {
        val fp = (section.metadata?.get("fp") as? JsonPrimitive)?.contentOrNull.orEmpty()
        val metadataId = (section.metadata?.get("numericId") as? JsonPrimitive)?.contentOrNull.orEmpty()
        val sourceMatches = fp == LEGACY_PIANO_MAN_CHORUS_FP
            || section.safeNumericId == LEGACY_PIANO_MAN_CHORUS_ID
            || metadataId == LEGACY_PIANO_MAN_CHORUS_ID
        if (!sourceMatches) return false

        val root = (chord["root"] as? JsonPrimitive)?.intOrNull ?: 0
        val beat = (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 0.0
        val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 0.0
        val type = (chord["type"] as? JsonPrimitive)?.intOrNull ?: 5
        val inversion = (chord["inversion"] as? JsonPrimitive)?.intOrNull ?: 0
        val applied = (chord["applied"] as? JsonPrimitive)?.intOrNull ?: 0
        val emptyArray = { key: String -> (chord[key] as? JsonArray).isNullOrEmpty() }

        return root == 5 && beat == 40.0 && duration == 3.0 && type == 11
            && inversion == 0 && applied == 0
            && emptyArray("suspensions") && emptyArray("adds")
            && emptyArray("omits") && emptyArray("alterations")
    }

    private fun <T> List<T>?.isNullOrEmpty(): Boolean = this == null || isEmpty()
}
