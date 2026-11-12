package com.acquiring.android

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

internal data class SectionPlaybackFacts(
    val melody: List<MelodyNote>,
    val endBeat: Double,
    val timeline: PlaybackTimeline,
    val baseBpm: Float
)

internal fun sectionPlaybackFacts(section: ExtractedSection): SectionPlaybackFacts {
    val baseBpm = section.getBpm().toFloat().coerceIn(40f, 240f)
    val notesJson = when (val rawNotes = section.notes) {
        is JsonArray -> rawNotes
        is JsonObject -> (rawNotes["melody1"] as? JsonArray) ?: emptyList()
        else -> emptyList()
    }
    val melody = notesJson.mapNotNull { element ->
        val obj = element as? JsonObject ?: return@mapNotNull null
        val rawBeat = (obj["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
        MelodyNote(
            sd = (obj["sd"] as? JsonPrimitive)?.contentOrNull ?: "1",
            beat = normalizePlaybackBeat(rawBeat),
            duration = (obj["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0,
            octave = (obj["octave"] as? JsonPrimitive)?.intOrNull ?: 0,
            isRest = (obj["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                (obj["rest"] as? JsonPrimitive)?.booleanOrNull == true
        )
    }
    val audibleEnds = buildList {
        melody.forEach { note ->
            playbackEventEndBeat(note.beat, note.duration, note.isRest)?.let(::add)
        }
        section.chords.forEach { chord ->
            val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
            val beat = (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            playbackEventEndBeat(beat, duration, isRest)?.let(::add)
        }
    }
    val metadataEndBeat = (section.metadata?.get("endBeat") as? JsonPrimitive)?.doubleOrNull
    val endBeat = resolvePlaybackEndBeat(metadataEndBeat, audibleEnds)
    return SectionPlaybackFacts(
        melody = melody,
        endBeat = endBeat,
        timeline = buildPlaybackTimeline(section, melody, endBeat),
        baseBpm = baseBpm
    )
}

/** Sections that follow [selectedSectionId], wrapping through the song once. */
internal fun songSectionContinuation(
    facts: List<Pair<String, SectionPlaybackFacts>>,
    selectedSectionId: String,
    songSlug: String,
    tempoPercent: Float
): List<QueuedSection> {
    if (facts.isEmpty()) return emptyList()
    val start = facts.indexOfFirst { it.first == selectedSectionId }.coerceAtLeast(0)
    return List(facts.size) { step ->
        val (id, sectionFacts) = facts[(start + 1 + step) % facts.size]
        QueuedSection(
            timeline = sectionFacts.timeline.copy(completionKey = SECTION_PLAY_THROUGH_KEY),
            bpm = sectionFacts.baseBpm * tempoPercent / 100.0,
            performanceId = "$songSlug:$id"
        )
    }
}
