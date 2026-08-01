package com.sacredring.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

internal data class ChordRootIntervalState(
    val previous: ResolvedChordRoot?,
    val current: ResolvedChordRoot,
    val interval: NamedInterval?,
    val currentDegreeLabel: String
)

internal data class MelodyIntervalState(
    val previous: SpelledPitch,
    val current: SpelledPitch,
    val interval: NamedInterval
) {
    val contentDescription: String
        get() = "Play melody interval ${previous.displayName} to ${current.displayName}, ${interval.spokenName}"
}

private data class TimedChord(
    val sourceIndex: Int,
    val onset: Double,
    val duration: Double,
    val chord: JsonObject
)

private data class TimedMelodyNote(
    val sourceIndex: Int,
    val onset: Double,
    val note: MelodyNote
)

private fun ExtractedSection.timedChords(): List<TimedChord> =
    chords.mapIndexed { index, chord ->
        TimedChord(
            sourceIndex = index,
            onset = normalizePlaybackBeat((chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0),
            duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0,
            chord = chord
        )
    }.sortedWith(compareBy<TimedChord> { it.onset }.thenBy { it.sourceIndex })

private fun List<MelodyNote>.timedNotes(): List<TimedMelodyNote> =
    mapIndexed { index, note ->
        TimedMelodyNote(
            sourceIndex = index,
            onset = normalizePlaybackBeat(note.beat),
            note = note
        )
    }.sortedWith(compareBy<TimedMelodyNote> { it.onset }.thenBy { it.sourceIndex })

internal fun activeChordAtBeat(section: ExtractedSection, currentBeat: Double): JsonObject? =
    section.timedChords().lastOrNull { event ->
        currentBeat >= event.onset && currentBeat < event.onset + event.duration
    }?.chord

internal fun activeMelodyNoteAtBeat(melody: List<MelodyNote>, currentBeat: Double): MelodyNote? =
    melody.timedNotes().lastOrNull { event ->
        currentBeat >= event.onset && currentBeat < event.onset + event.note.duration
    }?.note

internal fun resolveChordRootIntervalState(
    section: ExtractedSection,
    currentBeat: Double
): ChordRootIntervalState? {
    val events = section.timedChords()

    val activeIndex = events.indexOfLast { event ->
        currentBeat >= event.onset && currentBeat < event.onset + event.duration
    }
    if (activeIndex < 0) return null
    val active = events[activeIndex]
    if (active.duration <= 0.0 || active.chord.isRestEvent()) return null
    val currentRoot = ChordInterpreter.resolveChordRoot(
        active.chord,
        section.getKeyAtBeat(active.onset)
    ) ?: return null

    val previousRoot = events.subList(0, activeIndex).asReversed().firstNotNullOfOrNull { event ->
        if (event.onset >= active.onset || event.duration <= 0.0 || event.chord.isRestEvent()) null
        else ChordInterpreter.resolveChordRoot(event.chord, section.getKeyAtBeat(event.onset))
    }
    return ChordRootIntervalState(
        previous = previousRoot,
        current = currentRoot,
        interval = previousRoot?.let { calculateNamedInterval(it.pitch, currentRoot.pitch) },
        currentDegreeLabel = MusicTheory.getDegreeLabelFromSpelling(currentRoot.pitch, currentRoot.sourceKey)
    )
}

internal fun resolveMelodyIntervalState(
    melody: List<MelodyNote>,
    currentBeat: Double,
    keyAtBeat: (Double) -> KeyInfo
): MelodyIntervalState? {
    val events = melody.timedNotes()

    val activeIndex = events.indexOfLast { event ->
        currentBeat >= event.onset && currentBeat < event.onset + event.note.duration
    }
    if (activeIndex < 0) return null
    val active = events[activeIndex]
    if (active.note.isRest || active.note.duration <= 0.0) return null
    val currentPitch = MusicTheory.resolveScaleDegreePitch(
        sd = active.note.sd,
        relativeOctave = active.note.octave,
        key = keyAtBeat(active.onset)
    ) ?: return null

    val previousPitch = events.subList(0, activeIndex).asReversed().firstNotNullOfOrNull { event ->
        if (event.onset >= active.onset || event.note.isRest || event.note.duration <= 0.0) null
        else MusicTheory.resolveScaleDegreePitch(
            sd = event.note.sd,
            relativeOctave = event.note.octave,
            key = keyAtBeat(event.onset)
        )
    } ?: return null

    return MelodyIntervalState(
        previous = previousPitch,
        current = currentPitch,
        interval = calculateNamedInterval(previousPitch, currentPitch)
    )
}

private fun JsonObject.isRestEvent(): Boolean =
    (this["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
        (this["rest"] as? JsonPrimitive)?.booleanOrNull == true
