package com.acquiring.android

internal const val OCTAVE_OFFSET_MIN = -2
internal const val OCTAVE_OFFSET_MAX = 3

internal fun clampSingingOctaveOffset(offset: Int): Int =
    offset.coerceIn(OCTAVE_OFFSET_MIN, OCTAVE_OFFSET_MAX)

internal fun singingOctaveSemitones(octaveOffset: Int): Int =
    clampSingingOctaveOffset(octaveOffset) * 12

/** A pitch that can be assigned to one slot in the Interval Singing Tool. */
data class SingingTargetNote(
    /** Source register only; manual transpose and octave shift are applied later. */
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

/** Final MIDI used by the microphone scorer. */
internal fun SingingTargetNote.effectiveTargetMidi(
    globalTranspose: Int,
    octaveOffset: Int
): Int = sourceMidi + globalTranspose + singingOctaveSemitones(octaveOffset)

/**
 * MIDI supplied to AudioEngine for target preview.
 *
 * AudioEngine adds the manual transpose itself, so only the singing octave
 * shift is applied here. Song playback is never shifted.
 */
internal fun SingingTargetNote.targetPlaybackMidiInput(
    globalTranspose: Int,
    octaveOffset: Int
): Int = sourceMidi + singingOctaveSemitones(octaveOffset)

/**
 * Resolves the registers for one singing request.
 *
 * Both notes of an interval take the same octave shift so size and direction
 * stay exact. Song playback is not part of this path.
 */
internal fun resolveSingingTargetRequest(
    request: SingingTargetRequest,
    globalTranspose: Int,
    octaveOffset: Int
): Pair<Int?, Int?> {
    val shift = singingOctaveSemitones(octaveOffset)
    return Pair(
        request.first?.let { it.sourceMidi + globalTranspose + shift },
        request.second?.let { it.sourceMidi + globalTranspose + shift }
    )
}
