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

internal fun ionianContextDegreeLabel(pitch: SpelledPitch, ionianKey: KeyInfo): String =
    degreeInKey(pitch, KeyInfo(ionianKey.tonic, "major"))?.label.orEmpty()

internal fun ionianContextPreviewAudioNote(
    pitch: SpelledPitch,
    ionianKey: KeyInfo,
    referenceOctave: Int = 3
): Int? {
    val displayKey = KeyInfo(ionianKey.tonic, "major")
    val degree = degreeInKey(pitch, displayKey) ?: return null
    val scaleDegree = degree.accidentalPrefix + degree.degree
    return MusicTheory.resolveScaleDegreePitch(
        sd = scaleDegree,
        relativeOctave = 0,
        key = displayKey,
        baseOctave = referenceOctave
    )?.toAudioNoteNumber()
}

internal fun relativeIonianDegreeLabel(pitch: SpelledPitch, sourceKey: KeyInfo): String =
    ionianContextDegreeLabel(pitch, relativeIonianKey(sourceKey))

internal fun ionianContextDegreeLabel(midiNote: Int, ionianKey: KeyInfo): String {
    val displayKey = KeyInfo(ionianKey.tonic, "major")
    val displayTonicMidi = MusicTheory.getMidiNote("1", octave = 0, key = displayKey)
    return MusicTheory.getRelativeDegreeLabel(midiNote, displayTonicMidi)
}

internal fun ionianContextPreviewAudioNote(
    midiNote: Int,
    ionianKey: KeyInfo,
    referenceOctave: Int = 3
): Int? {
    val displayKey = KeyInfo(ionianKey.tonic, "major")
    return MusicTheory.resolveScaleDegreePitch(
        sd = ionianContextDegreeLabel(midiNote, displayKey).replace("\u0302", ""),
        relativeOctave = 0,
        key = displayKey,
        baseOctave = referenceOctave
    )?.toAudioNoteNumber()
}

internal fun relativeIonianDegreeLabel(midiNote: Int, sourceKey: KeyInfo): String {
    return ionianContextDegreeLabel(midiNote, relativeIonianKey(sourceKey))
}

/**
 * Returns the one-based staff step used by the quiz melody lane after rotating
 * the written source degree into the relative-major context.
 */
internal fun relativeIonianStaffDegree(
    sd: String,
    relativeOctave: Int,
    sourceKey: KeyInfo
): Int? = ionianContextStaffDegree(
    sd = sd,
    relativeOctave = relativeOctave,
    sourceKey = sourceKey,
    ionianKey = relativeIonianKey(sourceKey)
)

internal fun ionianContextStaffDegree(
    sd: String,
    relativeOctave: Int,
    sourceKey: KeyInfo,
    ionianKey: KeyInfo
): Int? {
    val sourceTheoryKey = KeyInfo(sourceKey.tonic, canonicalScaleName(sourceKey.scale))
    val pitch = MusicTheory.resolveScaleDegreePitch(sd, relativeOctave, sourceTheoryKey) ?: return null
    val displayTonic = SpelledPitch.parse(ionianKey.tonic, octave = 4) ?: return null
    return pitch.staffPosition - displayTonic.staffPosition + 1
}
