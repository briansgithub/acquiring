package com.acquiring.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.abs

internal data class MelodyFunctionChordTone(
    val pitchClass: Int,
    val label: String
)

internal data class MelodyFunctionInput(
    val currentPitch: SpelledPitch?,
    val scaleDegreeLabel: String,
    val key: KeyInfo,
    val chordTones: List<MelodyFunctionChordTone>?,
    val previousPitch: SpelledPitch? = null,
    val nextPitch: SpelledPitch? = null,
    val previousIsCurrentChordTone: Boolean = false,
    val nextIsCurrentChordTone: Boolean = false,
    val currentWasPreviousChordTone: Boolean = false,
    val currentWillBeNextChordTone: Boolean = false,
    val arrivedBeforeNextChord: Boolean = false,
    val heldAcrossChordChange: Boolean = false,
    val chordChangesDuringNote: Int = 0
)

internal data class MelodyFunctionDescription(
    val title: String,
    val detail: String
)

internal fun describeMelodyFunction(input: MelodyFunctionInput): MelodyFunctionDescription {
    val current = input.currentPitch
        ?: return MelodyFunctionDescription("Rest", "No melody note right now.")
    val currentPc = current.pitchClass()
    val chordTones = input.chordTones
        ?: return MelodyFunctionDescription(
            title = scaleDegreeTitle(input.scaleDegreeLabel),
            detail = "No chord under this note. It is ${spokenScaleDegree(input.scaleDegreeLabel)} in the key."
        )
    val chordTone = chordTones.firstOrNull { it.pitchClass == currentPc }
    if (chordTone != null) {
        return describeChordMember(chordTone.label, input, currentPc)
    }

    val chromaticPrefix = if (isPitchInKey(currentPc, input.key)) "" else "Chromatic "
    val previous = input.previousPitch
    val next = input.nextPitch
    val previousMovement = previous?.let { melodicMovement(it, current) }
    val nextMovement = next?.let { melodicMovement(current, it) }

    if (input.currentWillBeNextChordTone && input.arrivedBeforeNextChord) {
        return MelodyFunctionDescription(
            roleTitle(chromaticPrefix, "Anticipation"),
            "You are early. This note belongs to the next chord."
        )
    }

    if (input.currentWasPreviousChordTone && input.heldAcrossChordChange) {
        if (nextMovement?.isStep == true) {
            return if (nextMovement.direction < 0) {
                MelodyFunctionDescription(
                    roleTitle(chromaticPrefix, "Suspension"),
                    "This note was in the previous chord. Let it fall by step."
                )
            } else {
                MelodyFunctionDescription(
                    roleTitle(chromaticPrefix, "Retardation"),
                    "This note was in the previous chord. Let it rise by step."
                )
            }
        }
        return MelodyFunctionDescription(
            roleTitle(chromaticPrefix, "Held over"),
            "The chord changed under a note you are still holding."
        )
    }

    if (
        previous != null &&
        next != null &&
        previous.pitchClass() == next.pitchClass() &&
        previousMovement?.isStep == true &&
        nextMovement?.isStep == true
    ) {
        val direction = if (previousMovement.direction > 0) "Upper" else "Lower"
        return MelodyFunctionDescription(
            roleTitle(chromaticPrefix, "$direction neighbor"),
            "Step away and come back. Do not settle here."
        )
    }

    if (
        previousMovement?.isStep == true &&
        nextMovement?.isStep == true &&
        previousMovement.direction == nextMovement.direction &&
        input.previousIsCurrentChordTone &&
        input.nextIsCurrentChordTone
    ) {
        val direction = if (nextMovement.direction > 0) "upward" else "downward"
        return MelodyFunctionDescription(
            roleTitle(chromaticPrefix, "Passing tone"),
            "Keep moving $direction. This note connects the chord tones on either side."
        )
    }

    if (
        previousMovement?.isLeap == true &&
        nextMovement?.isStep == true &&
        previousMovement.direction != nextMovement.direction &&
        input.nextIsCurrentChordTone
    ) {
        return MelodyFunctionDescription(
            roleTitle(chromaticPrefix, "Appoggiatura"),
            "You leapt onto a tension. Step off it onto the chord tone."
        )
    }

    if (
        previousMovement?.isStep == true &&
        nextMovement?.isLeap == true &&
        previousMovement.direction != nextMovement.direction &&
        input.previousIsCurrentChordTone
    ) {
        return MelodyFunctionDescription(
            roleTitle(chromaticPrefix, "Escape tone"),
            "A short step off the chord, then a leap onward."
        )
    }

    if (
        next != null &&
        next.chromaticPosition - current.chromaticPosition == 1 &&
        input.nextIsCurrentChordTone
    ) {
        return MelodyFunctionDescription(
            roleTitle(chromaticPrefix, "Leading tone"),
            "A half step under the next note. Let it rise."
        )
    }

    if (input.chordChangesDuringNote > 1) {
        return MelodyFunctionDescription(
            roleTitle(chromaticPrefix, "Pedal tone"),
            "The melody holds still while the chords move."
        )
    }

    return MelodyFunctionDescription(
        roleTitle(chromaticPrefix, "Color tone"),
        "This note is outside the chord. Hear it against the root, then follow the melody."
    )
}

private fun roleTitle(prefix: String, role: String): String =
    if (prefix.isEmpty()) role else prefix + role.replaceFirstChar(Char::lowercase)

private fun describeChordMember(
    chordLabel: String,
    input: MelodyFunctionInput,
    currentPc: Int
): MelodyFunctionDescription {
    val degree = chordLabel.filter(Char::isDigit).toIntOrNull()
    val memberName = when (degree) {
        1 -> "root"
        2 -> "second"
        3 -> "third"
        4 -> "fourth"
        5 -> "fifth"
        6 -> "sixth"
        7 -> "seventh"
        8 -> "octave"
        9 -> "ninth"
        10 -> "tenth"
        11 -> "eleventh"
        13 -> "thirteenth"
        else -> "tone"
    }
    val title = "Chord ${if (memberName == "tone") "tone" else memberName}"
    val keyDegree = input.scaleDegreeLabel.filter(Char::isDigit).toIntOrNull()
    val tonicPc = SpelledPitch.parse(input.key.tonic, 4)?.pitchClass()
    val nextPc = input.nextPitch?.pitchClass()
    val keyAdvice = when {
        tonicPc != null && Math.floorMod(tonicPc - currentPc, 12) == 1 -> {
            val resolution = if (nextPc == tonicPc) " The next note does." else ""
            " This is also the leading tone of the key. Let it rise a half step to 1.$resolution"
        }
        keyDegree == 4 && isPitchInKey(currentPc, input.key) -> {
            val thirdPc = scalePitchClass(input.key, 3)
            val resolution = if (nextPc == thirdPc) " The next note does." else ""
            " This is 4 in the key. It wants to fall to 3.$resolution"
        }
        keyDegree in setOf(1, 3, 5) && isPitchInKey(currentPc, input.key) ->
            " It is home in the chord and in the key."
        else -> ""
    }
    val action = when (degree) {
        1, 3, 5 -> "Sit on this."
        4 -> "Lean on this. It belongs to the chord and wants to fall to the third."
        7, 9, 11, 13 -> "Lean on this. It belongs to the chord and wants to move."
        else -> "This note belongs to the chord."
    }
    return MelodyFunctionDescription(title, action + keyAdvice)
}

private data class MelodicMovement(
    val direction: Int,
    val isStep: Boolean,
    val isLeap: Boolean
)

private fun melodicMovement(from: SpelledPitch, to: SpelledPitch): MelodicMovement {
    val staffDistance = abs(to.staffPosition - from.staffPosition)
    val direction = (to.chromaticPosition - from.chromaticPosition).compareTo(0)
    return MelodicMovement(
        direction = direction,
        isStep = staffDistance == 1,
        isLeap = staffDistance >= 2
    )
}

private fun scaleDegreeTitle(label: String): String =
    "Scale degree ${label.filter(Char::isDigit).ifEmpty { label }}"

private fun spokenScaleDegree(label: String): String =
    "scale degree ${label.filter(Char::isDigit).ifEmpty { label }}"

private fun scalePitchClass(key: KeyInfo, degree: Int): Int? =
    MusicTheory.resolveScaleDegreePitch(degree.toString(), 0, key)?.pitchClass()

private fun isPitchInKey(pitchClass: Int, key: KeyInfo): Boolean =
    (1..7).any { scalePitchClass(key, it) == pitchClass }

private fun SpelledPitch.pitchClass(): Int = Math.floorMod(chromaticPosition, 12)

internal fun buildMelodyFunctionInput(
    section: ExtractedSection,
    melody: List<MelodyNote>,
    activeNote: MelodyNote?,
    activeChord: JsonObject?
): MelodyFunctionInput {
    val note = activeNote?.takeUnless { it.isRest || it.duration <= 0.0 }
    val notePitch = note?.let {
        MusicTheory.resolveScaleDegreePitch(
            it.sd,
            it.octave,
            section.getKeyAtBeat(normalizePlaybackBeat(it.beat))
        )
    }
    val key = note?.let { section.getKeyAtBeat(normalizePlaybackBeat(it.beat)) }
        ?: section.getKeyAtBeat(1.0)
    if (note == null || notePitch == null) {
        return MelodyFunctionInput(null, "", key, emptyList())
    }

    val orderedNotes = melody.withIndex()
        .sortedWith(compareBy<IndexedValue<MelodyNote>> { normalizePlaybackBeat(it.value.beat) }
            .thenBy { it.index })
    val activeIndex = orderedNotes.indexOfFirst { it.value === activeNote }
        .takeIf { it >= 0 }
        ?: orderedNotes.indexOfFirst { it.value == activeNote }
    fun connectedPitch(index: Int): SpelledPitch? {
        val adjacent = orderedNotes.getOrNull(index)?.value
            ?.takeUnless { it.isRest || it.duration <= 0.0 }
            ?: return null
        return MusicTheory.resolveScaleDegreePitch(
            adjacent.sd,
            adjacent.octave,
            section.getKeyAtBeat(normalizePlaybackBeat(adjacent.beat))
        )
    }
    val previousPitch = connectedPitch(activeIndex - 1)
    val nextPitch = connectedPitch(activeIndex + 1)

    data class TimedChordContext(
        val sourceIndex: Int,
        val onset: Double,
        val duration: Double,
        val chord: JsonObject
    )
    val orderedChords = section.chords.mapIndexed { index, chord ->
        TimedChordContext(
            sourceIndex = index,
            onset = normalizePlaybackBeat((chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0),
            duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0,
            chord = chord
        )
    }.sortedWith(compareBy<TimedChordContext> { it.onset }.thenBy { it.sourceIndex })
    val currentChordIndex = orderedChords.indexOfFirst { it.chord === activeChord }
        .takeIf { it >= 0 }
        ?: orderedChords.indexOfFirst { it.chord == activeChord }
    val currentEvent = orderedChords.getOrNull(currentChordIndex)
    val previousEvent = orderedChords.getOrNull(currentChordIndex - 1)
    val nextEvent = orderedChords.getOrNull(currentChordIndex + 1)

    fun JsonObject?.isRestChord(): Boolean = this == null ||
        (this["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
        (this["rest"] as? JsonPrimitive)?.booleanOrNull == true
    fun tones(event: TimedChordContext?): List<MelodyFunctionChordTone>? {
        val chord = event?.chord
        if (chord.isRestChord()) return null
        val interpretation = ChordInterpreter.interpret(chord!!, section.getKeyAtBeat(event.onset))
        return interpretation.midi.mapIndexed { index, midi ->
            MelodyFunctionChordTone(Math.floorMod(midi, 12), interpretation.toneLabels.getOrElse(index) { "" })
        }
    }
    val currentTones = tones(currentEvent)
    val previousTones = tones(previousEvent).orEmpty()
    val nextTones = tones(nextEvent).orEmpty()
    val notePc = notePitch.pitchClass()
    val noteOnset = normalizePlaybackBeat(note.beat)
    val noteEnd = noteOnset + note.duration
    val chordChangesDuringNote = orderedChords.count { event ->
        event.onset > noteOnset && event.onset < noteEnd
    }

    return MelodyFunctionInput(
        currentPitch = notePitch,
        scaleDegreeLabel = MusicTheory.getDegreeLabelFromSpelling(notePitch, key),
        key = key,
        chordTones = currentTones,
        previousPitch = previousPitch,
        nextPitch = nextPitch,
        previousIsCurrentChordTone = previousPitch?.pitchClass()?.let { pc ->
            currentTones.orEmpty().any { it.pitchClass == pc }
        } == true,
        nextIsCurrentChordTone = nextPitch?.pitchClass()?.let { pc ->
            currentTones.orEmpty().any { it.pitchClass == pc }
        } == true,
        currentWasPreviousChordTone = previousTones.any { it.pitchClass == notePc },
        currentWillBeNextChordTone = nextTones.any { it.pitchClass == notePc },
        arrivedBeforeNextChord = nextEvent?.let { noteOnset < it.onset } == true,
        heldAcrossChordChange = currentEvent?.let { noteOnset < it.onset } == true,
        chordChangesDuringNote = chordChangesDuringNote
    )
}
