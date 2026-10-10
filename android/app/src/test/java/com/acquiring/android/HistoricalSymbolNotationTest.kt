package com.acquiring.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** Expectations retained from independently captured historical Hooktheory symbols. */
class HistoricalSymbolNotationTest {
    private fun chord(value: String): JsonObject = Json.parseToJsonElement(value) as JsonObject

    @Test
    fun alteredFifthPreservesTheSourceSlashBass() {
        // Aram Khachaturian, Masquerade Waltz, Verse/61: II43(b5)(lyd), B7(b5)/F#.
        val input = chord("""{"root":2,"type":7,"inversion":2,"alterations":["b5"],"borrowed":"lydian"}""")
        assertEquals("B7(b5)/F#", ChordInterpreter.getLetterName(input, KeyInfo("A", "minor")))
    }

    @Test
    fun alteredExtensionsUseTheCapturedScaleAndKeepTheLowerExtension() {
        // Ed Helms, How Bad Can I Be, Outro/5: I13(#9)(mix), E13(#9).
        val sharpNinth = chord("""{"root":1,"type":13,"alterations":["#9"],"borrowed":"mixolydian"}""")
        assertEquals("E13(#9)", ChordInterpreter.getLetterName(sharpNinth, KeyInfo("E", "phrygianDominant")))
        // Hololive, Journey Like a Thousand Years, Intro/14.5: v13, g#m11(b9b13).
        val minorThirteenth = chord("""{"root":5,"type":13}""")
        assertEquals("G#m11(b9b13)", ChordInterpreter.getLetterName(minorThirteenth, KeyInfo("C#", "minor")))
        // Holst, Mars, Pre-Chorus/18: I△11(#9)(lyd), Cmaj7(#9#11).
        val alteredEleventh = chord("""{"root":1,"type":11,"alterations":["#9"],"borrowed":"lydian"}""")
        assertEquals("Cmaj7(#9#11)", ChordInterpreter.getLetterName(alteredEleventh, KeyInfo("C", "phrygianDominant")))
    }

    @Test
    fun dualSuspensionsKeepTheirOwnWrittenFourth() {
        // Ed Helms, How Bad Can I Be, Outro/21: VII7(#11)sus2sus4(dor).
        val input = chord("""{"root":7,"type":7,"alterations":["#11"],"suspensions":[2,4],"borrowed":"dorian"}""")
        assertEquals("D7(#11)sus2sus4", ChordInterpreter.getLetterName(input, KeyInfo("E", "phrygianDominant")))
    }

    @Test
    fun extendedInversionIndicesDoNotInventASourceSlash() {
        // Glitched Hookpad Projects, Inverted 11ths and 13ths, Instrumental/10,12.25,14.5.
        for (inversion in 4..6) {
            val input = chord("""{"root":1,"type":13,"inversion":$inversion}""")
            assertEquals("Cmaj13", ChordInterpreter.getLetterName(input, KeyInfo("C", "major")))
        }
    }

    @Test
    fun appliedSymbolsKeepTargetQualityAndSuspensionQuality() {
        // Barbra Streisand, Woman in Love, Chorus/19: V/III+.
        val augmentedTarget = chord("""{"root":3,"type":5,"applied":5}""")
        assertEquals("V/III+", ChordInterpreter.getRomanSymbol(augmentedTarget, KeyInfo("D#", "harmonicMinor")))
        // Joni Mitchell, My Old Man, Chorus/12.5: V6(#5)sus4/V.
        val sharpSuspension = chord("""{"root":5,"type":5,"inversion":1,"applied":5,"alterations":["#5"],"suspensions":[4]}""")
        assertEquals("V6(#5)sus4/V", ChordInterpreter.getRomanSymbol(sharpSuspension, KeyInfo("A", "major")))
        assertEquals("B(#5)sus4/E", ChordInterpreter.getLetterName(sharpSuspension, KeyInfo("A", "major")))
    }

    @Test
    fun modalAppliedNumeratorsKeepTheSourceMajorTagExceptForSubstitutions() {
        // Aligned historical source observations put this tag on modal numerators,
        // with no numerator tag on tritone substitutions or harmonic-minor inputs.
        val input = chord("""{"root":5,"type":5,"applied":5}""")
        assertEquals("V(maj)/v", ChordInterpreter.getRomanSymbol(input, KeyInfo("C", "dorian")))
        assertEquals("V(maj)/V", ChordInterpreter.getRomanSymbol(input, KeyInfo("C", "lydian")))
        assertEquals("V/V", ChordInterpreter.getRomanSymbol(input, KeyInfo("C", "harmonicMinor")))
        val substitution = chord("""{"root":5,"type":5,"applied":5,"substitutions":["tri"]}""")
        assertEquals("♭II(∆-sub)/v", ChordInterpreter.getRomanSymbol(substitution, KeyInfo("C", "dorian")))
    }

    @Test
    fun alteredNinthRetainsItsRoleWhenItSharesTheThirdPitchClass() {
        val shell = chord("""{"root":5,"type":11,"alterations":["#9"]}""")
        assertEquals(listOf(55, 60, 65, 70), ChordInterpreter.getChordNotes(shell, KeyInfo("C", "minor")))
        assertEquals(listOf("1̂", "11̂", "♭7̂", "♯9̂"), ChordInterpreter.getChordToneLabels(shell, KeyInfo("C", "minor")))
        val explicitFifth = chord("""{"root":2,"type":11,"alterations":["#5","#9"]}""")
        assertEquals(listOf(50, 53, 55, 58, 60, 65), ChordInterpreter.getChordNotes(explicitFifth, KeyInfo("C", "major")))
        assertEquals(listOf("1̂", "♭3̂", "11̂", "♯5̂", "♭7̂", "♯9̂"), ChordInterpreter.getChordToneLabels(explicitFifth, KeyInfo("C", "major")))
    }

    @Test
    fun historicalNativeVoicingPreservesTriadRegisterAndWrittenAccidentalOctaves() {
        val addedSixth = chord("""{"root":3,"type":5,"applied":7,"adds":[6]}""")
        assertEquals(listOf(53, 56, 59, 62), ChordInterpreter.getChordNotes(addedSixth, KeyInfo("D", "major")))
        assertEquals(listOf("1̂", "♭3̂", "♭5̂", "6̂"), ChordInterpreter.getChordToneLabels(addedSixth, KeyInfo("D", "major")))
        val cFlat = chord("""{"root":2,"type":7,"inversion":2,"applied":5,"alterations":["b9"],"suspensions":[4]}""")
        assertEquals(listOf(53, 80, 71, 82, 75), ChordInterpreter.getChordNotes(cFlat, KeyInfo("Db", "major")))
        val bSharp = chord("""{"root":5,"type":7,"inversion":3,"applied":5,"alterations":["#11","#5"]}""")
        assertEquals(listOf(52, 84, 78, 82, 74), ChordInterpreter.getChordNotes(bSharp, KeyInfo("E", "minor")))
        val doubleSharpModifier = chord("""{"root":1,"type":7,"inversion":3,"alterations":["x6"],"borrowed":"harmonicMinor"}""")
        assertEquals("Cm(##6)/B", ChordInterpreter.getLetterName(doubleSharpModifier, KeyInfo("C", "minor")))
    }

    @Test
    fun liveOmissionAndLydianExamplesPreserveTheirActualToneRoles() {
        // Dvorak, Serenade for Strings, Bridge/33: C# D# F#.
        val dvorak = chord("""{"root":2,"type":7,"inversion":3,"omits":[5]}""")
        assertEquals(setOf(1, 3, 6), ChordInterpreter.getChordNotes(dvorak, KeyInfo("C#", "minor")).map { Math.floorMod(it, 12) }.toSet())
        assertEquals(listOf("♭7̂", "1̂", "♭3̂"), ChordInterpreter.getChordToneLabels(dvorak, KeyInfo("C#", "minor")))
        // Grieg root-position iiø7(no5) independently confirms C# E B.
        val grieg = chord("""{"root":2,"type":7,"omits":[5]}""")
        assertEquals(setOf(1, 4, 11), ChordInterpreter.getChordNotes(grieg, KeyInfo("B", "minor")).map { Math.floorMod(it, 12) }.toSet())
        // Junko Shiratsu, Speed of Sound, Pre-Chorus/30.5: F# G E.
        val junko = chord("""{"root":4,"type":7,"omits":[5],"suspensions":[2]}""")
        assertEquals(listOf(54, 55, 64), ChordInterpreter.getChordNotes(junko, KeyInfo("C", "lydian")))
        assertEquals(listOf("1̂", "♭2̂", "♭7̂"), ChordInterpreter.getChordToneLabels(junko, KeyInfo("C", "lydian")))
        // They Might Be Giants, It's Not My Birthday, Chorus/35.5: C# B D F#.
        val dualSuspension = chord("""{"root":7,"type":7,"omits":[5],"suspensions":[2,4]}""")
        assertEquals(setOf(1, 2, 6, 11), ChordInterpreter.getChordNotes(dualSuspension, KeyInfo("D", "major")).map { Math.floorMod(it, 12) }.toSet())
        // Gentle Giant, Peel the Paint, Pre-Chorus/8.5: A G Bb D.
        val gentleGiant = chord("""{"root":4,"type":11,"borrowed":"lydian"}""")
        assertEquals(setOf(2, 7, 9, 10), ChordInterpreter.getChordNotes(gentleGiant, KeyInfo("Eb", "major")).map { Math.floorMod(it, 12) }.toSet())
        assertEquals(listOf("1̂", "11̂", "♭7̂", "♭9̂"), ChordInterpreter.getChordToneLabels(gentleGiant, KeyInfo("Eb", "major")))
    }

    @Test
    fun explicitHalfDiminishedAndDiminishedOmissionFramesRemainDistinct() {
        val halfDiminished = chord("""{"root":2,"type":7,"omits":[5],"halfDim":true}""")
        assertEquals(setOf(2, 5, 8, 11), ChordInterpreter.getChordNotes(halfDiminished, KeyInfo("C", "minor")).map { Math.floorMod(it, 12) }.toSet())
        val diminished = chord("""{"root":2,"type":7,"inversion":3,"omits":[5],"dimTriad":true}""")
        assertEquals(setOf(1, 4, 7), ChordInterpreter.getChordNotes(diminished, KeyInfo("D", "minor")).map { Math.floorMod(it, 12) }.toSet())
    }
}
