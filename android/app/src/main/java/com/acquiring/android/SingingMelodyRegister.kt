package com.acquiring.android

/** C2 through B4, a singable span for the played melody. */
internal const val SINGING_MELODY_LOW_MIDI = 36
internal const val SINGING_MELODY_HIGH_MIDI = 71

internal fun singingMelodyPitches(
    melody: List<MelodyNote>,
    keyAt: (MelodyNote) -> KeyInfo
): List<SpelledPitch?> {
    val written = melody.map { note ->
        if (note.isRest || note.duration <= 0.0) null
        else MusicTheory.resolveScaleDegreePitch(note.sd, note.octave, keyAt(note))
    }
    return written.zip(foldMelodyIntoSingingRange(written.map { it?.toAudioNoteNumber() })) { pitch, midi ->
        if (pitch == null || midi == null) null else pitch.shiftedToSingingMidi(midi)
    }
}

internal fun foldMelodyIntoSingingRange(writtenMidis: List<Int?>): List<Int?> {
    val sung = arrayOfNulls<Int>(writtenMidis.size)
    var previousWritten: Int? = null
    var previousSung: Int? = null
    writtenMidis.forEachIndexed { index, written ->
        if (written == null || written <= 0) return@forEachIndexed
        val placed = placeSingingMelodyMidi(written, previousWritten, previousSung)
        sung[index] = placed
        previousWritten = written
        previousSung = placed
    }
    return sung.toList()
}

internal fun placeSingingMelodyMidi(written: Int, previousWritten: Int?, previousSung: Int?): Int {
    val candidates = (SINGING_MELODY_LOW_MIDI..SINGING_MELODY_HIGH_MIDI).filter { midi ->
        Math.floorMod(midi, 12) == Math.floorMod(written, 12)
    }
    if (candidates.isEmpty()) return written.coerceIn(SINGING_MELODY_LOW_MIDI, SINGING_MELODY_HIGH_MIDI)
    if (previousWritten == null || previousSung == null) {
        return candidates.minBy { kotlin.math.abs(it - written) }
    }
    val direction = written.compareTo(previousWritten)
    val ideal = (previousSung + (written - previousWritten))
        .coerceIn(SINGING_MELODY_LOW_MIDI, SINGING_MELODY_HIGH_MIDI)
    val directed = when {
        direction > 0 -> candidates.filter { it > previousSung }
        direction < 0 -> candidates.filter { it < previousSung }
        else -> candidates.filter { it == previousSung }
    }
    return (directed.ifEmpty { candidates }).minBy { kotlin.math.abs(it - ideal) }
}

/** C3 through B3, where the Heart clips already sit. C5 is the last-resort spoken pitch. */
internal const val SPOKEN_MELODY_PREFERRED_LOW = 48
internal const val SPOKEN_MELODY_PREFERRED_HIGH = 59
internal const val SPOKEN_MELODY_C5 = 72

internal fun spokenMelodyRegister(soundingMidis: List<Int?>): List<Int?> {
    val spoken = arrayOfNulls<Int>(soundingMidis.size)
    var previousSounding: Int? = null
    var previousSpoken: Int? = null
    soundingMidis.forEachIndexed { index, sounding ->
        if (sounding == null || sounding <= 0) return@forEachIndexed
        val placed = placeSpokenMelodyMidi(sounding, previousSounding, previousSpoken)
        spoken[index] = placed
        previousSounding = sounding
        previousSpoken = placed
    }
    return spoken.toList()
}

internal fun placeSpokenMelodyMidi(sounding: Int, previousSounding: Int?, previousSpoken: Int?): Int {
    val candidates = pitchClassCandidates(sounding)
    if (previousSounding == null || previousSpoken == null) {
        val anchor = if (sounding >= 60) sounding - 12 else sounding
        val preferred = candidates.filter { it in SPOKEN_MELODY_PREFERRED_LOW..SPOKEN_MELODY_PREFERRED_HIGH }
        return (preferred.ifEmpty { candidates }).minBy { kotlin.math.abs(it - anchor) }
    }
    if (sounding == previousSounding) return previousSpoken
    val direction = sounding.compareTo(previousSounding)
    val ideal = previousSpoken + (sounding - previousSounding)
    val preferred = candidates.filter { it in SPOKEN_MELODY_PREFERRED_LOW..SPOKEN_MELODY_PREFERRED_HIGH }
    val underC5 = candidates.filter { it < SPOKEN_MELODY_C5 }
    val directed = when {
        direction > 0 -> preferred.filter { it > previousSpoken }.ifEmpty {
            underC5.filter { it > previousSpoken }
        }.ifEmpty {
            listOf(SPOKEN_MELODY_C5).filter { it > previousSpoken && Math.floorMod(sounding, 12) == 0 }
        }
        else -> preferred.filter { it < previousSpoken }.ifEmpty {
            underC5.filter { it < previousSpoken }
        }
    }
    return (directed.ifEmpty { underC5.ifEmpty { candidates } }).minBy { kotlin.math.abs(it - ideal) }
}

private fun pitchClassCandidates(midi: Int): List<Int> {
    val pitchClass = Math.floorMod(midi, 12)
    return (SINGING_MELODY_LOW_MIDI..SINGING_MELODY_HIGH_MIDI).filter { Math.floorMod(it, 12) == pitchClass }
}

internal fun SpelledPitch.shiftedToSingingMidi(midi: Int): SpelledPitch =
    copy(octave = octave + (midi - toAudioNoteNumber()) / 12)

internal fun melodyFunctionCardText(description: MelodyFunctionDescription): String =
    spokenMelodyFunction(description)?.replaceFirstChar { it.titlecase() } ?: "Rest"
