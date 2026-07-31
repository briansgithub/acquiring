package com.sacredring.android

/**
 * A semantic piece of a Hooktheory-style Roman-numeral display.
 *
 * Slash characters are always emitted as [BASE] separators for applied chords.
 * Figured bass is represented only by adjacent digit runs that match one of the
 * conventional inversion pairs in [FIGURED_BASS].
 */
internal data class RomanNumeralPart(
    val kind: RomanNumeralPartKind,
    val text: String
)

internal enum class RomanNumeralPartKind {
    BASE,
    SUPER,
    SUB,
    SUFFIX
}

internal object RomanNumeralTokenizer {
    private val figuredBass = mapOf(
        "64" to ("6" to "4"),
        "46" to ("6" to "4"),
        "65" to ("6" to "5"),
        "43" to ("4" to "3"),
        "42" to ("4" to "2")
    )

    private val superscriptDigits = mapOf(
        '⁰' to '0', '¹' to '1', '²' to '2', '³' to '3', '⁴' to '4',
        '⁵' to '5', '⁶' to '6', '⁷' to '7', '⁸' to '8', '⁹' to '9'
    )
    private val subscriptDigits = mapOf(
        '₀' to '0', '₁' to '1', '₂' to '2', '₃' to '3', '₄' to '4',
        '₅' to '5', '₆' to '6', '₇' to '7', '₈' to '8', '₉' to '9'
    )

    fun normalizeDigits(symbol: String): String = buildString(symbol.length) {
        symbol.forEach { character ->
            append(superscriptDigits[character] ?: subscriptDigits[character] ?: character)
        }
    }

    fun tokenize(symbol: String): List<RomanNumeralPart> {
        val normalized = normalizeDigits(symbol)
        if (normalized.isEmpty()) return emptyList()

        val parts = mutableListOf<RomanNumeralPart>()
        var index = 0

        val firstBase = readBase(normalized, index)
        if (firstBase.text.isNotEmpty()) {
            parts += RomanNumeralPart(RomanNumeralPartKind.BASE, firstBase.text)
            index = firstBase.next
        }

        while (index < normalized.length) {
            val character = normalized[index]

            val susCluster = trySusCluster(normalized, index)
            if (susCluster != null) {
                parts += susCluster.parts
                index = susCluster.next
                continue
            }

            if (character == '°' || character == 'ø') {
                val glyph = character.toString()
                val digits = readDigits(normalized, index + 1)
                pushQualityParts(parts, glyph, digits.text)
                index = digits.next
                continue
            }

            if (character == '△') {
                val digits = readDigits(normalized, index + 1)
                val pair = figuredBass[digits.text]
                when {
                    pair != null -> {
                        parts += RomanNumeralPart(RomanNumeralPartKind.SUPER, "△")
                        pushFiguredBass(parts, pair)
                    }
                    digits.text.isNotEmpty() ->
                        parts += RomanNumeralPart(RomanNumeralPartKind.SUPER, "△${digits.text}")
                    else -> parts += RomanNumeralPart(RomanNumeralPartKind.SUPER, "△")
                }
                index = digits.next
                continue
            }

            if (character.isDigit()) {
                val digits = readDigits(normalized, index)
                val pair = figuredBass[digits.text]
                if (pair != null) {
                    pushFiguredBass(parts, pair)
                } else {
                    parts += RomanNumeralPart(RomanNumeralPartKind.SUPER, digits.text)
                }
                index = digits.next
                continue
            }

            if (character == '/') {
                // Hooktheory uses a slash for applied/secondary chords. It is
                // horizontal notation, never a figured-bass instruction.
                parts += RomanNumeralPart(RomanNumeralPartKind.BASE, "/")
                index += 1

                val denominator = readBase(normalized, index)
                if (denominator.text.isNotEmpty()) {
                    parts += RomanNumeralPart(RomanNumeralPartKind.BASE, denominator.text)
                    index = denominator.next
                }
                continue
            }

            if (character == '(') {
                val suffix = readParenthetical(normalized, index)
                parts += RomanNumeralPart(RomanNumeralPartKind.SUFFIX, suffix.text)
                index = suffix.next
                continue
            }

            val suspension = readSusModifier(normalized, index)
            if (suspension != null) {
                parts += RomanNumeralPart(RomanNumeralPartKind.SUB, suspension.text)
                index = suspension.next
                continue
            }

            val plain = readPlainRun(normalized, index)
            if (plain.text.isNotEmpty()) {
                parts += RomanNumeralPart(RomanNumeralPartKind.BASE, plain.text)
                index = plain.next
                continue
            }

            parts += RomanNumeralPart(RomanNumeralPartKind.BASE, character.toString())
            index += 1
        }

        return parts
    }

    private fun pushFiguredBass(
        parts: MutableList<RomanNumeralPart>,
        pair: Pair<String, String>
    ) {
        parts += RomanNumeralPart(RomanNumeralPartKind.SUPER, pair.first)
        parts += RomanNumeralPart(RomanNumeralPartKind.SUB, pair.second)
    }

    private fun pushQualityParts(
        parts: MutableList<RomanNumeralPart>,
        glyph: String,
        digits: String
    ) {
        val pair = figuredBass[digits]
        if (pair != null) {
            parts += RomanNumeralPart(RomanNumeralPartKind.SUPER, glyph + pair.first)
            parts += RomanNumeralPart(RomanNumeralPartKind.SUB, pair.second)
        } else {
            parts += RomanNumeralPart(RomanNumeralPartKind.SUPER, glyph + digits)
        }
    }

    private data class ReadResult(val text: String, val next: Int)
    private data class ClusterResult(val parts: List<RomanNumeralPart>, val next: Int)

    private fun readBase(symbol: String, start: Int): ReadResult {
        var index = start
        val text = StringBuilder()
        while (index < symbol.length && isAccidental(symbol[index])) {
            text.append(symbol[index++])
        }
        while (index < symbol.length && isRomanLetter(symbol[index])) {
            text.append(symbol[index++])
        }
        while (index < symbol.length && symbol[index] == '+') {
            text.append(symbol[index++])
        }
        return ReadResult(text.toString(), index)
    }

    private fun readDigits(symbol: String, start: Int): ReadResult {
        var index = start
        while (index < symbol.length && symbol[index].isDigit()) index += 1
        return ReadResult(symbol.substring(start, index), index)
    }

    private fun readParenthetical(symbol: String, start: Int): ReadResult {
        var index = start
        var depth = 0
        while (index < symbol.length) {
            when (symbol[index++]) {
                '(' -> depth += 1
                ')' -> {
                    depth -= 1
                    if (depth == 0) break
                }
            }
        }
        return ReadResult(symbol.substring(start, index), index)
    }

    private fun readPlainRun(symbol: String, start: Int): ReadResult {
        var index = start
        while (index < symbol.length) {
            val character = symbol[index]
            if (
                character == '(' || character == '/' || character == '△' ||
                character == '°' || character == 'ø' || character.isDigit()
            ) {
                break
            }
            index += 1
        }
        return ReadResult(symbol.substring(start, index), index)
    }

    private fun readSusModifier(symbol: String, start: Int): ReadResult? {
        val match = Regex("^sus\\d+").find(symbol.substring(start)) ?: return null
        return ReadResult(match.value, start + match.value.length)
    }

    private fun trySusCluster(symbol: String, start: Int): ClusterResult? {
        val rest = symbol.substring(start)
        val leadingExtension = Regex("^([79]|1[13])").find(rest)
        if (leadingExtension != null) {
            var position = leadingExtension.value.length
            val parts = mutableListOf(
                RomanNumeralPart(RomanNumeralPartKind.SUPER, leadingExtension.value)
            )

            val omission = Regex("^\\(no\\d+\\)").find(rest.substring(position))
            if (omission != null) {
                parts += RomanNumeralPart(RomanNumeralPartKind.SUFFIX, omission.value)
                position += omission.value.length
            }

            val suspension = Regex("^sus\\d+sus\\d").find(rest.substring(position))
                ?: Regex("^sus\\d+").find(rest.substring(position))
            if (suspension != null) {
                parts += RomanNumeralPart(RomanNumeralPartKind.SUB, suspension.value)
                return ClusterResult(parts, start + position + suspension.value.length)
            }
        }

        val trailing = Regex("^sus(\\d)sus(\\d)([79]|1[13])(?![0-9])").find(rest)
            ?: return null
        return ClusterResult(
            listOf(
                RomanNumeralPart(RomanNumeralPartKind.SUPER, trailing.groupValues[3]),
                RomanNumeralPart(
                    RomanNumeralPartKind.SUB,
                    "sus${trailing.groupValues[1]}sus${trailing.groupValues[2]}"
                )
            ),
            start + trailing.value.length
        )
    }

    private fun isRomanLetter(character: Char): Boolean =
        character == 'i' || character == 'v' || character == 'x' ||
            character == 'I' || character == 'V' || character == 'X'

    private fun isAccidental(character: Char): Boolean =
        character == '♭' || character == '♯' || character == '#' || character == 'b'
}

internal fun List<RomanNumeralPart>.stackSpanAt(index: Int): Int {
    if (getOrNull(index)?.kind != RomanNumeralPartKind.SUPER) return 0
    if (getOrNull(index + 1)?.kind == RomanNumeralPartKind.SUB) return 2
    if (
        getOrNull(index + 1)?.kind == RomanNumeralPartKind.SUFFIX &&
        getOrNull(index + 2)?.kind == RomanNumeralPartKind.SUB
    ) {
        return 3
    }
    return 0
}
