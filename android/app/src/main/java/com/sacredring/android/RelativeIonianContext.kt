package com.sacredring.android

internal data class RelativeIonianDegree(
    val degree: Int,
    val alteration: Int
) {
    val accidentalPrefix: String
        get() = when {
            alteration > 0 -> "♯".repeat(alteration)
            alteration < 0 -> "♭".repeat(-alteration)
            else -> ""
        }

    val label: String
        get() = "$accidentalPrefix$degree\u0302"
}

/** The scale degree whose pitch is the tonic of the mode's relative Ionian key. */
internal fun relativeIonianTonicDegree(scale: String): Int = when (scale) {
    "major", "ionian" -> 1
    "dorian" -> 7
    "phrygian", "phrygianDominant" -> 6
    "lydian" -> 5
    "mixolydian" -> 4
    "minor", "aeolian", "harmonicMinor" -> 3
    "locrian" -> 2
    else -> 1
}

internal fun canonicalScaleName(scale: String): String = when (scale) {
    "ionian" -> "major"
    "aeolian" -> "minor"
    else -> scale
}

internal fun relativeIonianKey(key: KeyInfo): KeyInfo {
    val sourceScale = canonicalScaleName(key.scale)
    val tonic = MusicTheory.getNoteLabel(
        relativeIonianTonicDegree(key.scale),
        key.tonic,
        sourceScale
    )
    return KeyInfo(tonic, "major")
}

internal fun degreeInKey(pitch: SpelledPitch, key: KeyInfo): RelativeIonianDegree? {
    val tonic = SpelledPitch.parse(key.tonic, octave = pitch.octave) ?: return null
    val degree = Math.floorMod(pitch.letter.index - tonic.letter.index, 7) + 1
    val expected = MusicTheory.resolveScaleDegreePitch(
        sd = degree.toString(),
        relativeOctave = 0,
        key = KeyInfo(key.tonic, canonicalScaleName(key.scale)),
        baseOctave = pitch.octave
    ) ?: return null
    return RelativeIonianDegree(
        degree = degree,
        alteration = pitch.accidental - expected.accidental
    )
}

internal fun relativeIonianDegree(
    pitch: SpelledPitch,
    sourceKey: KeyInfo
): RelativeIonianDegree? = degreeInKey(pitch, relativeIonianKey(sourceKey))

internal fun relativeIonianDegreeLabel(pitch: SpelledPitch, sourceKey: KeyInfo): String =
    relativeIonianDegree(pitch, sourceKey)?.label.orEmpty()

internal fun relativeIonianDegreeLabel(midiNote: Int, sourceKey: KeyInfo): String {
    val displayKey = relativeIonianKey(sourceKey)
    val displayTonicMidi = MusicTheory.getMidiNote("1", octave = 0, key = displayKey)
    return MusicTheory.getRelativeDegreeLabel(midiNote, displayTonicMidi)
}

/**
 * Returns the one-based staff step used by the quiz melody lane after rotating
 * the written source degree into the relative-major context.
 */
internal fun relativeIonianStaffDegree(
    sd: String,
    relativeOctave: Int,
    sourceKey: KeyInfo
): Int? {
    val sourceTheoryKey = KeyInfo(sourceKey.tonic, canonicalScaleName(sourceKey.scale))
    val pitch = MusicTheory.resolveScaleDegreePitch(sd, relativeOctave, sourceTheoryKey) ?: return null
    val displayTonic = SpelledPitch.parse(relativeIonianKey(sourceKey).tonic, octave = 4) ?: return null
    return pitch.staffPosition - displayTonic.staffPosition + 1
}
