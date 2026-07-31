package com.sacredring.android

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

class RomanNumeralTokenizerTest {
    @Test
    fun secondaryDominantSlashIsNotFiguredBass() {
        assertParts(
            "V7/vi",
            base("V"), superPart("7"), base("/"), base("vi")
        )
        assertParts(
            "vii°7/V",
            base("vii"), superPart("°7"), base("/"), base("V")
        )
        assertParts(
            "V7/vi(maj)",
            base("V"), superPart("7"), base("/"), base("vi"), suffix("(maj)")
        )
    }

    @Test
    fun adjacentInversionPairsBecomeFiguredBassStacks() {
        assertParts("I64", base("I"), superPart("6"), sub("4"))
        assertParts("I46", base("I"), superPart("6"), sub("4"))
        assertParts("ii65", base("ii"), superPart("6"), sub("5"))
        assertParts("V43", base("V"), superPart("4"), sub("3"))
        assertParts("V42", base("V"), superPart("4"), sub("2"))
    }

    @Test
    fun inversionAndAppliedChordRemainIndependent() {
        assertParts(
            "V43/ii",
            base("V"), superPart("4"), sub("3"), base("/"), base("ii")
        )
        assertParts(
            "I6/IV",
            base("I"), superPart("6"), base("/"), base("IV")
        )
    }

    @Test
    fun qualityGlyphsAndFiguredBassKeepTheirOwnRows() {
        assertParts("viiø65", base("vii"), superPart("ø6"), sub("5"))
        assertParts("i°65", base("i"), superPart("°6"), sub("5"))
        assertParts("I△42", base("I"), superPart("△"), superPart("4"), sub("2"))
    }

    @Test
    fun suffixesAndSuspensionsPreserveWebDisplaySemantics() {
        assertParts("Isus4", base("I"), sub("sus4"))
        assertParts("V7(b9)", base("V"), superPart("7"), suffix("(b9)"))
        assertParts(
            "I△9(no3)(no5)",
            base("I"), superPart("△9"), suffix("(no3)"), suffix("(no5)")
        )
    }

    @Test
    fun legacyUnicodeDigitsAreNormalizedBeforeLayout() {
        assertEquals("I64", RomanNumeralTokenizer.normalizeDigits("I⁶₄"))
        assertParts("I⁶₄", base("I"), superPart("6"), sub("4"))
    }

    @Test
    fun borrowedModeLabelsAreSeparatedButAppliedChordTagsAreNot() {
        assertEquals(
            RomanNumeralDisplay("♭VII", "(mix)"),
            RomanNumeralDisplay.fromChord("♭VII(mix)", JsonPrimitive("mixolydian"))
        )
        assertEquals(
            RomanNumeralDisplay("♭ii7/V(∆-sub)"),
            RomanNumeralDisplay.fromChord("♭ii7/V(∆-sub)", null)
        )
        assertEquals(
            RomanNumeralDisplay("♭VI", "(bor)"),
            RomanNumeralDisplay.fromChord("♭VI(bor)", JsonArray(emptyList()))
        )
    }

    private fun assertParts(symbol: String, vararg expected: RomanNumeralPart) {
        assertEquals(expected.toList(), RomanNumeralTokenizer.tokenize(symbol))
    }

    private fun base(text: String) = RomanNumeralPart(RomanNumeralPartKind.BASE, text)
    private fun superPart(text: String) = RomanNumeralPart(RomanNumeralPartKind.SUPER, text)
    private fun sub(text: String) = RomanNumeralPart(RomanNumeralPartKind.SUB, text)
    private fun suffix(text: String) = RomanNumeralPart(RomanNumeralPartKind.SUFFIX, text)
}
