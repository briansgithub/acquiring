package com.sacredring.android

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.roundToInt

/** A pitch that can be assigned to one slot in the Interval Singing Tool. */
data class SingingTargetNote(
    /** Source register only; manual transpose and tessitura are applied later. */
    val sourceMidi: Int,
    /** Display-ready degree label, including any accidental and combining hat. */
    val scaleDegreeLabel: String
)

/** One- or two-note request emitted by a target-capable quiz object. */
data class SingingTargetRequest(
    val first: SingingTargetNote?,
    val second: SingingTargetNote?,
    val requestId: Int
)

/** Written chord roots in the stable source register used for calibration. */
internal fun ExtractedSection.tessituraReferenceRootMidis(): List<Int> =
    chords.mapNotNull { chord ->
        val beat = normalizePlaybackBeat(
            (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
        )
        ChordInterpreter.resolveChordRoot(chord, getKeyAtBeat(beat))
            ?.simpleModePitch
            ?.toAudioNoteNumber()
    }

/**
 * Chooses the section-wide whole-octave shift that places the section's root
 * register nearest the captured comfortable pitch.
 */
internal fun calculateSectionTessituraShift(
    comfortableMidi: Double,
    sectionRootMidis: List<Int>,
    globalTranspose: Int
): Int? {
    if (sectionRootMidis.isEmpty()) return null
    val transposedReferenceMidi = sectionRootMidis.average() + globalTranspose
    return ((comfortableMidi - transposedReferenceMidi) / 12.0).roundToInt()
}

/**
 * Chooses the whole-octave shift that places the notes the singer is actually
 * being asked to sing nearest their captured comfortable pitch.
 *
 * The loaded singing targets are the correct reference. The section's chord
 * roots sit an octave or more below the sung targets, so measuring against them
 * systematically under-shifts and usually rounds to zero, leaving the targets
 * unmoved. Only fall back to the section roots when no target is loaded.
 */
internal fun calculateSingingTessituraShift(
    comfortableMidi: Double,
    targetRequest: SingingTargetRequest?,
    sectionRootMidis: List<Int>,
    globalTranspose: Int
): Int? {
    val targetMidis = listOfNotNull(targetRequest?.first, targetRequest?.second)
        .map { it.sourceMidi }
    val referenceMidis = if (targetMidis.isNotEmpty()) targetMidis else sectionRootMidis
    if (referenceMidis.isEmpty()) return null
    val transposedReferenceMidi = referenceMidis.average() + globalTranspose
    return ((comfortableMidi - transposedReferenceMidi) / 12.0).roundToInt()
}

/** Final MIDI used by the microphone scorer. */
internal fun SingingTargetNote.effectiveTargetMidi(
    globalTranspose: Int,
    tessituraShiftOctaves: Int
): Int = sourceMidi + globalTranspose + tessituraShiftOctaves * 12

/**
 * MIDI supplied to AudioEngine for target preview. AudioEngine adds the
 * current manual transpose itself, so it is intentionally excluded here.
 */
internal fun SingingTargetNote.targetPlaybackMidiInput(
    tessituraShiftOctaves: Int
): Int = sourceMidi + tessituraShiftOctaves * 12
