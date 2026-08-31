package com.acquiring.android

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

/** Final MIDI used by the microphone scorer. */
internal fun SingingTargetNote.effectiveTargetMidi(
    globalTranspose: Int,
    comfortablePitchMidi: Double?,
    lastSourceMidi: Int? = null,
    lastTargetMidi: Int? = null
): Int {
    val source = sourceMidi + globalTranspose
    if (comfortablePitchMidi == null) return source
    return TessituraResolver.resolveTarget(
        source,
        comfortablePitchMidi,
        lastSourceMidi,
        lastTargetMidi
    )
}

/**
 * MIDI supplied to AudioEngine for target preview.
 *
 * The register has to be chosen against the pitch that will actually sound,
 * transpose included, or a preview could land an octave away from the note the
 * microphone is scoring. AudioEngine adds the manual transpose itself, so it is
 * taken back off the result rather than left out of the decision.
 */
internal fun SingingTargetNote.targetPlaybackMidiInput(
    globalTranspose: Int,
    comfortablePitchMidi: Double?,
    lastSourceMidi: Int? = null,
    lastTargetMidi: Int? = null
): Int = effectiveTargetMidi(
    globalTranspose,
    comfortablePitchMidi,
    lastSourceMidi,
    lastTargetMidi
) - globalTranspose

/**
 * Resolves the registers for one singing request.
 *
 * A filled pair is an interval and moves as a unit so its size and direction
 * stay exact; a lone note is placed on its own. With no tessitura set the
 * source registers pass through untouched.
 */
internal fun resolveSingingTargetRequest(
    request: SingingTargetRequest,
    globalTranspose: Int,
    comfortablePitchMidi: Double?
): Pair<Int?, Int?> {
    val firstSource = request.first?.let { it.sourceMidi + globalTranspose }
    val secondSource = request.second?.let { it.sourceMidi + globalTranspose }
    if (comfortablePitchMidi == null) return Pair(firstSource, secondSource)

    return when {
        firstSource != null && secondSource != null ->
            TessituraResolver.resolveInterval(firstSource, secondSource, comfortablePitchMidi)
        firstSource != null ->
            Pair(TessituraResolver.resolveTarget(firstSource, comfortablePitchMidi), null)
        secondSource != null ->
            Pair(null, TessituraResolver.resolveTarget(secondSource, comfortablePitchMidi))
        else -> Pair(null, null)
    }
}
