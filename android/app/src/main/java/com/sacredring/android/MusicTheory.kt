package com.sacredring.android

import kotlinx.serialization.Serializable

object MusicTheory {
    val NOTE_TO_PC = mapOf(
        "C" to 0, "C♯" to 1, "D♭" to 1, "D" to 2, "D♯" to 3, "E♭" to 3,
        "E" to 4, "F♭" to 4, "E♯" to 5, "F" to 5, "F♯" to 6, "G♭" to 6,
        "G" to 7, "G♯" to 8, "A♭" to 8, "A" to 9, "A♯" to 10, "B♭" to 10,
        "B" to 11, "C♭" to 11, "B♯" to 0,
        "C#" to 1, "Db" to 1, "D#" to 3, "Eb" to 3, "E#" to 5, "Fb" to 4,
        "F#" to 6, "Gb" to 6, "G#" to 8, "Ab" to 8, "A#" to 10, "Bb" to 10,
        "B#" to 0, "Cb" to 11,
        "C##" to 2, "Cx" to 2, "D##" to 4, "Dx" to 4, "E##" to 6, "Ex" to 6,
        "F##" to 7, "Fx" to 7, "G##" to 9, "Gx" to 9, "A##" to 11, "Ax" to 11,
        "B##" to 1, "Bx" to 1, "Dbb" to 0, "Ebb" to 2, "Fbb" to 3, "Gbb" to 5,
        "Abb" to 7, "Bbb" to 9, "Cbb" to 10,
    )


    val SCALE_INTERVALS = mapOf(
        "major" to listOf(0, 2, 4, 5, 7, 9, 11),
        "minor" to listOf(0, 2, 3, 5, 7, 8, 10),
        "dorian" to listOf(0, 2, 3, 5, 7, 9, 10),
        "phrygian" to listOf(0, 1, 3, 5, 7, 8, 10),
        "lydian" to listOf(0, 2, 4, 6, 7, 9, 11),
        "mixolydian" to listOf(0, 2, 4, 5, 7, 9, 10),
        "locrian" to listOf(0, 1, 3, 5, 6, 8, 10),
        "harmonicMinor" to listOf(0, 2, 3, 5, 7, 8, 11),
        "phrygianDominant" to listOf(0, 1, 4, 5, 7, 8, 10)
    )


    val CHORD_QUALITIES = mapOf(
        "major" to listOf("major", "minor", "minor", "major", "major", "minor", "diminished"),
        "minor" to listOf("minor", "diminished", "major", "minor", "minor", "major", "major"),
        "dorian" to listOf("minor", "minor", "major", "major", "minor", "diminished", "major"),
        "phrygian" to listOf("minor", "major", "major", "minor", "diminished", "major", "minor"),
        "lydian" to listOf("major", "major", "minor", "diminished", "major", "minor", "minor"),
        "mixolydian" to listOf("major", "minor", "diminished", "major", "minor", "minor", "major"),
        "locrian" to listOf("diminished", "major", "minor", "minor", "major", "major", "minor"),
        "harmonicMinor" to listOf("minor", "diminished", "augmented", "minor", "major", "major", "diminished"),
        "phrygianDominant" to listOf("major", "major", "diminished", "minor", "diminished", "augmented", "minor")
    )

    val ROMAN_NUMERALS = mapOf(
        "major" to listOf("I", "ii", "iii", "IV", "V", "vi", "vii°"),
        "minor" to listOf("i", "ii°", "III", "iv", "v", "VI", "VII"),
        "dorian" to listOf("i", "ii", "III", "IV", "v", "vi°", "VII"),
        "phrygian" to listOf("i", "II", "III", "iv", "v°", "VI", "vii"),
        "lydian" to listOf("I", "II", "iii", "iv°", "V", "vi", "vii"),
        "mixolydian" to listOf("I", "ii", "iii°", "IV", "v", "vi", "VII"),
        "locrian" to listOf("i°", "II", "iii", "iv", "V", "VI", "vii"),
        "harmonicMinor" to listOf("i", "ii°", "III+", "iv", "V", "VI", "vii°"),
        "phrygianDominant" to listOf("I", "II", "iii°", "iv", "v°", "VI+", "vii")
    )


    val MAJOR_LABELS = mapOf(
        "C" to listOf("C", "D", "E", "F", "G", "A", "B"),
        "D" to listOf("D", "E", "F#", "G", "A", "B", "C#"),
        "E" to listOf("E", "F#", "G#", "A", "B", "C#", "D#"),
        "F" to listOf("F", "G", "A", "Bb", "C", "D", "E"),
        "G" to listOf("G", "A", "B", "C", "D", "E", "F#"),
        "A" to listOf("A", "B", "C#", "D", "E", "F#", "G#"),
        "B" to listOf("B", "C#", "D#", "E", "F#", "G#", "A#"),
        "C#" to listOf("C#", "D#", "E#", "F#", "G#", "A#", "B#"),
        "D#" to listOf("D#", "E#", "Fx", "G#", "A#", "B#", "Cx"),
        "E#" to listOf("E#", "Fx", "Gx", "A#", "B#", "Cx", "Dx"),
        "F#" to listOf("F#", "G#", "A#", "B", "C#", "D#", "E#"),
        "G#" to listOf("G#", "A#", "B#", "C#", "D#", "E#", "Fx"),
        "A#" to listOf("A#" , "B#", "Cx", "D#", "E#", "Fx", "Gx"),
        "B#" to listOf("B#", "Cx", "Dx", "E#", "Fx", "Gx", "Ax"),
        "Cb" to listOf("Cb", "Db", "Eb", "Fb", "Gb", "Ab", "Bb"),
        "Db" to listOf("Db", "Eb", "F", "Gb", "Ab", "Bb", "C"),
        "Eb" to listOf("Eb", "F", "G", "Ab", "Bb", "C", "D"),
        "Fb" to listOf("Fb", "Gb", "Ab", "Bbb", "Cb", "Db", "Eb"),
        "Gb" to listOf("Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"),
        "Ab" to listOf("Ab", "Bb", "C", "Db", "Eb", "F", "G"),
        "Bb" to listOf("Bb", "C", "D", "Eb", "F", "G", "A")
    )

    val MINOR_LABELS = mapOf(
        "C" to listOf("C", "D", "Eb", "F", "G", "Ab", "Bb"),
        "D" to listOf("D", "E", "F", "G", "A", "Bb", "C"),
        "E" to listOf("E", "F#", "G", "A", "B", "C", "D"),
        "F" to listOf("F", "G", "Ab", "Bb", "C", "Db", "Eb"),
        "G" to listOf("G", "A", "Bb", "C", "D", "Eb", "F"),
        "A" to listOf("A", "B", "C", "D", "E", "F", "G"),
        "B" to listOf("B", "C#", "D", "E", "F#", "G", "A"),
        "C#" to listOf("C#", "D#", "E", "F#", "G#", "A", "B"),
        "D#" to listOf("D#", "E#", "F#", "G#", "A#", "B", "C#"),
        "E#" to listOf("E#", "Fx", "G#", "A#", "B#", "C#", "D#"),
        "F#" to listOf("F#", "G#", "A", "B", "C#", "D", "E"),
        "G#" to listOf("G#", "A#", "B", "C#", "D#", "E", "F#"),
        "A#" to listOf("A#", "B#", "C#", "D#", "E#", "F#", "G#"),
        "B#" to listOf("B#", "Cx", "D#", "E#", "Fx", "G#", "A#"),
        "Cb" to listOf("Cb", "Db", "Ebb", "Fb", "Gb", "Abb", "Bbb"),
        "Db" to listOf("Db", "Eb", "Fb", "Gb", "Ab", "Bbb", "Cb"),
        "Eb" to listOf("Eb", "F", "Gb", "Ab", "Bb", "Cb", "Db"),
        "Fb" to listOf("Fb", "Gb", "Abb", "Bbb", "Cb", "Dbb", "Ebb"),
        "Gb" to listOf("Gb", "Ab", "Bbb", "Cb", "Db", "Ebb", "Fb"),
        "Ab" to listOf("Ab", "Bb", "Cb", "Db", "Eb", "Fb", "Gb"),
        "Bb" to listOf("Bb", "C", "Db", "Eb", "F", "Gb", "Ab")
    )

    fun generateScaleLabels(tonic: String, intervals: List<Int>): List<String> {
        val noteOrder = listOf("C", "D", "E", "F", "G", "A", "B")
        val normalizedTonic = normalizeTonic(tonic)
        val tonicBase = normalizedTonic.take(1).uppercase()
        val tonicIndex = noteOrder.indexOf(tonicBase)
        if (tonicIndex == -1) return listOf("C", "D", "E", "F", "G", "A", "B")
        
        val basePc = NOTE_TO_PC[tonicBase] ?: 0
        val tonicModifier = getModifierValue(normalizedTonic.substring(1))
        val tonicPc = ((basePc + tonicModifier) % 12 + 12) % 12
        
        return (0..6).map { i ->
            val targetPc = (tonicPc + intervals[i]) % 12
            val targetLetter = noteOrder[(tonicIndex + i) % 7]
            
            val options = listOf("", "b", "#", "bb", "##", "x")
            options.asSequence()
                .map { acc -> targetLetter + acc }
                .firstOrNull { (NOTE_TO_PC[it] ?: -1) == targetPc }
                ?: targetLetter
        }
    }

    fun normalizeTonic(tonic: String): String {
        return tonic.trim()
    }

    fun getNoteLabel(degree: Int, tonic: String, scale: String, customIntervals: List<Int>? = null): String {
        val normalizedTonic = normalizeTonic(tonic)
        val intervals = if ((scale == "custom") && (customIntervals != null)) {
            customIntervals
        } else {
            SCALE_INTERVALS[scale] ?: SCALE_INTERVALS["major"]!!
        }
        
        val labels = when (scale) {
            "major" -> MAJOR_LABELS[normalizedTonic] ?: generateScaleLabels(normalizedTonic, intervals)
            "minor" -> MINOR_LABELS[normalizedTonic] ?: generateScaleLabels(normalizedTonic, intervals)
            else -> generateScaleLabels(normalizedTonic, intervals)
        }
        
        val idx = ((degree - 1) % 7 + 7) % 7
        return labels.getOrElse(idx) { "C" }
    }

    fun getModifierValue(text: String): Int {
        var v = 0
        for (ch in text) {
            when (ch) {
                '#', '♯' -> v += 1
                'b', '♭' -> v -= 1
                'x' -> v += 2
            }
        }
        return v
    }


    fun getRawDegree(sd: String): Int {
        return sd.replace(Regex("[^0-9]"), "").toIntOrNull() ?: 1
    }

    fun getMidiNote(sd: String, octave: Int, key: KeyInfo): Int {
        val rawDegree = getRawDegree(sd)
        val modifier = getModifierValue(sd)
        
        val tonicPc = NOTE_TO_PC[normalizeTonic(key.tonic)] ?: 0
        val intervals = SCALE_INTERVALS[key.scale] ?: SCALE_INTERVALS["major"]!!
        
        // Handle scale degrees > 7 (e.g. 8 is 1 octave up)
        val degreeBase0 = rawDegree - 1
        val degreeOctaveShift = degreeBase0 / 7
        val degreeIdx = (degreeBase0 % 7 + 7) % 7
        
        val scalePc = intervals[degreeIdx]
        
        // Absolute pitch class relative to C0
        val absoluteHalfSteps = tonicPc + scalePc + modifier
        val finalPitchClass = ((absoluteHalfSteps % 12) + 12) % 12
        val overflowOctaveShift = if (absoluteHalfSteps >= 0) absoluteHalfSteps / 12 else (absoluteHalfSteps - 11) / 12

        // Base octave 5 (MIDI 60 for C4)
        val baseOctave = 5
        return (baseOctave + octave + degreeOctaveShift + overflowOctaveShift) * 12 + finalPitchClass
    }

    fun getDegreeLabelFromMidi(midiNote: Int, key: KeyInfo): String {
        val tonicPc = NOTE_TO_PC[normalizeTonic(key.tonic)] ?: 0
        val notePc = midiNote % 12
        val relativePc = (notePc - tonicPc + 12) % 12
        
        val intervals = SCALE_INTERVALS[key.scale] ?: SCALE_INTERVALS["major"]!!
        
        // Find closest scale degree
        var bestDegree = 1
        var bestDiff = 99
        
        for (i in 0..6) {
            val scalePc = intervals[i]
            val diff = relativePc - scalePc
            // We prefer small differences (-1, 0, 1)
            val absDiff = if (diff > 6) Math.abs(diff - 12) else if (diff < -6) Math.abs(diff + 12) else Math.abs(diff)
            
            if (absDiff < bestDiff) {
                bestDiff = absDiff
                bestDegree = i + 1
            }
        }
        
        val diff = relativePc - intervals[bestDegree - 1]
        val normalizedDiff = if (diff > 6) diff - 12 else if (diff < -6) diff + 12 else diff
        
        val prefix = when (normalizedDiff) {
            -1 -> "♭"
            -2 -> "♭♭"
            1 -> "♯"
            2 -> "♯♯"
            else -> ""
        }
        
        return "$prefix$bestDegree\u0302"
    }

    fun getRelativeDegreeLabel(midiNote: Int, rootMidi: Int): String {
        val rootPc = rootMidi % 12
        val notePc = midiNote % 12
        val relativePc = (notePc - rootPc + 12) % 12
        
        // Always relative to MAJOR scale for chord tones
        val intervals = SCALE_INTERVALS["major"]!!
        
        var bestDegree = 1
        var bestDiff = 99
        
        for (i in 0..6) {
            val scalePc = intervals[i]
            val diff = relativePc - scalePc
            val absDiff = if (diff > 6) Math.abs(diff - 12) else if (diff < -6) Math.abs(diff + 12) else Math.abs(diff)
            
            if (absDiff < bestDiff) {
                bestDiff = absDiff
                bestDegree = i + 1
            }
        }
        
        val diff = relativePc - intervals[bestDegree - 1]
        val normalizedDiff = if (diff > 6) diff - 12 else if (diff < -6) diff + 12 else diff
        
        val prefix = when (normalizedDiff) {
            -1 -> "♭"
            -2 -> "♭♭"
            1 -> "♯"
            2 -> "♯♯"
            else -> ""
        }
        
        return "$prefix$bestDegree\u0302"
    }
}

@Serializable
data class KeyInfo(val tonic: String, val scale: String)
