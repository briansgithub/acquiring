package com.sacredring.android

import kotlin.math.abs

internal enum class DiatonicLetter(
    val index: Int,
    val naturalSemitone: Int
) {
    C(0, 0),
    D(1, 2),
    E(2, 4),
    F(3, 5),
    G(4, 7),
    A(5, 9),
    B(6, 11);

    companion object {
        fun parse(character: Char): DiatonicLetter? = entries.firstOrNull {
            it.name.single() == character.uppercaseChar()
        }
    }
}

/**
 * A written musical pitch.  This is intentionally not a MIDI value: the
 * letter and accidental remain independent so enharmonic spellings survive.
 */
internal data class SpelledPitch(
    val letter: DiatonicLetter,
    val accidental: Int,
    val octave: Int
) {
    val staffPosition: Int get() = octave * 7 + letter.index
    val chromaticPosition: Int get() = octave * 12 + letter.naturalSemitone + accidental

    val noteName: String
        get() = letter.name + accidentalText(accidental)

    val displayName: String
        get() = noteName.replace("bb", "♭♭").replace("b", "♭")
            .replace("##", "♯♯").replace("#", "♯") + octave

    companion object {
        fun parse(noteName: String, octave: Int): SpelledPitch? {
            val normalized = noteName.trim()
                .replace("𝄪", "x")
                .replace("𝄫", "bb")
                .replace("♯", "#")
                .replace("♭", "b")
                .replace("♮", "")
            if (normalized.isEmpty()) return null
            val letter = DiatonicLetter.parse(normalized.first()) ?: return null
            val accidental = accidentalValue(normalized.drop(1)) ?: return null
            return SpelledPitch(letter, accidental, octave)
        }

        private fun accidentalValue(source: String): Int? {
            var value = 0
            source.forEach { character ->
                when (character) {
                    '#', '♯' -> value += 1
                    'b', '♭' -> value -= 1
                    'x' -> value += 2
                    else -> return null
                }
            }
            return value
        }

        private fun accidentalText(value: Int): String = when {
            value > 0 -> "#".repeat(value)
            value < 0 -> "b".repeat(-value)
            else -> ""
        }
    }
}

internal enum class IntervalDirection(val arrow: String) {
    ASCENDING("↑"),
    DESCENDING("↓")
}

internal data class NamedInterval(
    val number: Int,
    val quality: String,
    val direction: IntervalDirection,
    val directedSemitones: Int
) {
    val compoundOctaves: Int get() = (number - 1) / 7
    val directionGlyph: String
        get() = if (quality == "P" && number == 1) "·" else direction.arrow
    val shorthand: String get() = "$quality$number $directionGlyph"

    val spokenName: String
        get() = "${qualitySpokenName(quality)} ${ordinalName(number)}, ${direction.name.lowercase()}"

    private fun qualitySpokenName(symbol: String): String = when {
        symbol == "P" -> "perfect"
        symbol == "M" -> "major"
        symbol == "m" -> "minor"
        symbol.all { it == 'A' } -> List(symbol.length) { "augmented" }.joinToString(" ")
        symbol.all { it == 'd' } -> List(symbol.length) { "diminished" }.joinToString(" ")
        else -> symbol
    }

    private fun ordinalName(value: Int): String = when (value) {
        1 -> "unison"
        2 -> "second"
        3 -> "third"
        4 -> "fourth"
        5 -> "fifth"
        6 -> "sixth"
        7 -> "seventh"
        8 -> "octave"
        else -> when {
            value % 100 in 11..13 -> "${value}th"
            value % 10 == 1 -> "${value}st"
            value % 10 == 2 -> "${value}nd"
            value % 10 == 3 -> "${value}rd"
            else -> "${value}th"
        }
    }
}

/** Calculates a directed, spelling-preserving interval without MIDI. */
internal fun calculateNamedInterval(from: SpelledPitch, to: SpelledPitch): NamedInterval {
    val diatonicDelta = to.staffPosition - from.staffPosition
    val chromaticDelta = to.chromaticPosition - from.chromaticPosition
    val direction = when {
        diatonicDelta > 0 -> IntervalDirection.ASCENDING
        diatonicDelta < 0 -> IntervalDirection.DESCENDING
        chromaticDelta < 0 -> IntervalDirection.DESCENDING
        else -> IntervalDirection.ASCENDING // Stable convention for a true unison.
    }

    val number = abs(diatonicDelta) + 1
    val directedSemitones = when (direction) {
        IntervalDirection.ASCENDING -> chromaticDelta
        IntervalDirection.DESCENDING -> -chromaticDelta
    }
    val simpleNumber = ((number - 1) % 7) + 1
    val compoundOctaves = (number - 1) / 7
    val simpleBaseline = when (simpleNumber) {
        1 -> 0
        2 -> 2
        3 -> 4
        4 -> 5
        5 -> 7
        6 -> 9
        7 -> 11
        else -> error("Unsupported generic interval $number")
    }
    val baseline = simpleBaseline + compoundOctaves * 12
    val deviation = directedSemitones - baseline
    val perfectFamily = simpleNumber == 1 || simpleNumber == 4 || simpleNumber == 5
    val quality = if (perfectFamily) {
        when {
            deviation == 0 -> "P"
            deviation > 0 -> "A".repeat(deviation)
            else -> "d".repeat(-deviation)
        }
    } else {
        when {
            deviation == 0 -> "M"
            deviation == -1 -> "m"
            deviation > 0 -> "A".repeat(deviation)
            else -> "d".repeat(-deviation - 1)
        }
    }

    return NamedInterval(
        number = number,
        quality = quality,
        direction = direction,
        directedSemitones = directedSemitones
    )
}
