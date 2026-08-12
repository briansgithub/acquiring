package com.sacredring.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

internal data class ChordRootIntervalState(
    val previous: ResolvedChordRoot?,
    val current: ResolvedChordRoot,
    val previousIntervalPitch: SpelledPitch?,
    val currentIntervalPitch: SpelledPitch,
    val interval: NamedInterval?,
    val previousDegreeLabel: String?,
    val currentDegreeLabel: String
)

internal data class MelodyIntervalState(
    val previous: SpelledPitch,
    val current: SpelledPitch,
    val interval: NamedInterval,
    val previousDegreeLabel: String,
    val currentDegreeLabel: String
) {
    val contentDescription: String
        get() = "Play melody interval ${previous.displayName} to ${current.displayName}, ${interval.spokenName}"
}

internal enum class MelodyPitchCardRole {
    PREVIOUS,
    CURRENT
}

internal enum class MelodyPitchCardVerticalPosition {
    TOP,
    BOTTOM
}

internal enum class MelodyPitchCardDisplayMode {
    HIDDEN,
    SINGLE,
    INTERVAL
}

/** A melody-pitch control and its fixed left-to-right plus vertical placement. */
internal data class MelodyPitchCard(
    val role: MelodyPitchCardRole,
    val pitch: SpelledPitch,
    val scaleDegreeLabel: String,
    val verticalPosition: MelodyPitchCardVerticalPosition
)

internal fun buildMelodyPitchCards(
    state: MelodyIntervalState,
    previousLabel: String = state.previousDegreeLabel,
    currentLabel: String = state.currentDegreeLabel
): List<MelodyPitchCard> {
    val ascending = state.interval.direction == IntervalDirection.ASCENDING
    return listOf(
        MelodyPitchCard(
            role = MelodyPitchCardRole.PREVIOUS,
            pitch = state.previous,
            scaleDegreeLabel = previousLabel,
            verticalPosition = if (ascending) MelodyPitchCardVerticalPosition.BOTTOM else MelodyPitchCardVerticalPosition.TOP
        ),
        MelodyPitchCard(
            role = MelodyPitchCardRole.CURRENT,
            pitch = state.current,
            scaleDegreeLabel = currentLabel,
            verticalPosition = if (ascending) MelodyPitchCardVerticalPosition.TOP else MelodyPitchCardVerticalPosition.BOTTOM
        )
    )
}

internal fun melodyPitchCardDisplayMode(
    currentPitch: SpelledPitch?,
    intervalState: MelodyIntervalState?
): MelodyPitchCardDisplayMode = when {
    currentPitch == null -> MelodyPitchCardDisplayMode.HIDDEN
    intervalState == null || intervalState.previous == intervalState.current -> MelodyPitchCardDisplayMode.SINGLE
    else -> MelodyPitchCardDisplayMode.INTERVAL
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
        previousIntervalPitch = previousRoot?.simpleModePitch,
        currentIntervalPitch = currentRoot.simpleModePitch,
        interval = previousRoot?.let {
            calculateNamedInterval(it.simpleModePitch, currentRoot.simpleModePitch)
        },
        previousDegreeLabel = previousRoot?.let {
            MusicTheory.getDegreeLabelFromSpelling(it.pitch, it.sourceKey)
        },
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

    // Only the immediately preceding note counts as "previous" — if it's a rest,
    // this note is treated as if it had no previous note at all (no reaching
    // further back to the last sung note before the rest).
    val immediatePrevious = events.getOrNull(activeIndex - 1)
    val previousPitch = if (immediatePrevious != null && !immediatePrevious.note.isRest && immediatePrevious.note.duration > 0.0) {
        MusicTheory.resolveScaleDegreePitch(
            sd = immediatePrevious.note.sd,
            relativeOctave = immediatePrevious.note.octave,
            key = keyAtBeat(immediatePrevious.onset)
        )
    } else null
    previousPitch ?: return null

    return MelodyIntervalState(
        previous = previousPitch,
        current = currentPitch,
        interval = calculateNamedInterval(previousPitch, currentPitch),
        previousDegreeLabel = MusicTheory.getDegreeLabelFromSpelling(
            previousPitch,
            keyAtBeat(immediatePrevious!!.onset)
        ),
        currentDegreeLabel = MusicTheory.getDegreeLabelFromSpelling(
            currentPitch,
            keyAtBeat(active.onset)
        )
    )
}

private fun JsonObject.isRestEvent(): Boolean =
    (this["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
        (this["rest"] as? JsonPrimitive)?.booleanOrNull == true
