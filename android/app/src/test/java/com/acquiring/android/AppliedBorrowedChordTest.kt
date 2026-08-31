package com.acquiring.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Regression coverage for applied+borrowed chords (modal-mixture secondary dominants /
 * functions), ported from web/lib/chordBuild.js's resolveAppliedBorrowedChord.
 *
 * Per the ported parity decision, the Roman numeral / letter name LABEL for these chords
 * intentionally does NOT reflect the borrow (matches web/lib/jsonToSymbol.js's
 * getChordSymbol, whose applied branch never reads chord.borrowed), while the actual SOUND
 * (getChordNotes / resolveChordRoot) IS tonicized against the borrowed-resolved target.
 */
@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class AppliedBorrowedChordTest {

    private val json = Json { ignoreUnknownKeys = true }
    private val cMajor = KeyInfo("C", "major")

    private fun chord(src: String): JsonObject = json.decodeFromString(src)

    @Test
    fun v7OfFlatSixBorrowedFromMinor_soundsTonicizedAgainstTheBorrowedTarget() {
        // {root: 6, applied: 5, borrowed: "minor", type: 7} in C major = V7/bVI ("V7/vi(maj)"
        // as a label, since bVI's minor-key origin makes the denominator read as major-ized).
        // Sound: bVI is Ab (degree 6 of C minor); V7 of Ab major is Eb7.
        val chordJson = chord("""{"root": 6, "applied": 5, "borrowed": "minor", "type": 7}""")

        val root = ChordInterpreter.resolveChordRoot(chordJson, cMajor)
        assertEquals("Eb", root?.pitch?.noteName)
        assertEquals(ChordRootContext.BORROWED_APPLIED, root?.context)
        assertEquals("major", root?.chordQuality)

        val notes = ChordInterpreter.getChordNotes(chordJson, cMajor)
        assertEquals(setOf(3, 7, 10, 1), notes.map { it % 12 }.toSet())

        assertEquals("V7/vi(maj)", ChordInterpreter.getRomanSymbol(chordJson, cMajor))
        assertEquals("E7", ChordInterpreter.getLetterName(chordJson, cMajor))
    }

    @Test
    fun v7OfFlatSevenBorrowedFromMinor_soundsTonicizedAgainstTheBorrowedTarget() {
        // {root: 7, applied: 5, borrowed: "minor", type: 7} in C major = V7/bVII.
        // Sound: bVII is Bb (degree 7 of C minor); V7 of Bb major is F7.
        val chordJson = chord("""{"root": 7, "applied": 5, "borrowed": "minor", "type": 7}""")

        val root = ChordInterpreter.resolveChordRoot(chordJson, cMajor)
        assertEquals("F", root?.pitch?.noteName)
        assertEquals(ChordRootContext.BORROWED_APPLIED, root?.context)

        val notes = ChordInterpreter.getChordNotes(chordJson, cMajor)
        assertEquals(setOf(5, 9, 0, 3), notes.map { it % 12 }.toSet())

        assertEquals("V7/vii°", ChordInterpreter.getRomanSymbol(chordJson, cMajor))
        assertEquals("F#7", ChordInterpreter.getLetterName(chordJson, cMajor))
    }

    @Test
    fun borrowedLocrianTonicAppliedToItself_isVoicedAsAMinorTriad() {
        // Special case 1: borrowed === "locrian" && root === 1 && applied === 1 && type < 7.
        val chordJson = chord("""{"root": 1, "applied": 1, "borrowed": "locrian"}""")

        val root = ChordInterpreter.resolveChordRoot(chordJson, cMajor)
        assertEquals("C", root?.pitch?.noteName)
        assertEquals(ChordRootContext.BORROWED_APPLIED, root?.context)
        assertEquals("minor", root?.chordQuality)

        val notes = ChordInterpreter.getChordNotes(chordJson, cMajor)
        assertEquals(setOf(0, 3, 7), notes.map { it % 12 }.toSet())
    }

    @Test
    fun tritoneSubOfVOfFlatSixBorrowedFromMinor_usesTheBorrowedTargetForTheSubRoot() {
        // Special case 2: substitutions:["tri"] with applied === 5.
        // {root: 6, applied: 5, borrowed: "minor", substitutions: ["tri"]}: bVI is Ab (C
        // minor degree 6); the tritone-sub dominant root is a tritone above Ab's V (Eb), i.e.
        // "b2" of Ab major. Diatonic letter-based spelling (matching the existing non-borrowed
        // triSub root spelling in resolveChordRoot) gives Bbb, enharmonic to A (pc 9) - the
        // simpler PC_SPELL-flat spelling "A" is what getChordNotes/getLetterName use instead;
        // this same single-flat-vs-diatonic-letter divergence already exists for the
        // non-borrowed triSub case (see resolveChordRoot vs getChordNotes/getLetterName).
        val chordJson = chord(
            """{"root": 6, "applied": 5, "borrowed": "minor", "substitutions": ["tri"]}"""
        )

        val root = ChordInterpreter.resolveChordRoot(chordJson, cMajor)
        assertEquals("Bbb", root?.pitch?.noteName)
        assertEquals(ChordRootContext.TRITONE_SUBSTITUTION, root?.context)
        assertEquals("major", root?.chordQuality)

        val notes = ChordInterpreter.getChordNotes(chordJson, cMajor)
        assertEquals(setOf(9, 1, 4), notes.map { it % 12 }.toSet())
    }

    @Test
    fun sharp5AppliedLeadingToneBorrowedFromMinor_isVoicedAsAMinorTriad() {
        // Special case 3: applied === 7, alterations includes "#5" (the diminished leading-
        // tone triad is reinterpreted as minor-with-raised-5th instead).
        // {root: 4, applied: 7, borrowed: "minor", alterations: ["#5"]}: target (bIV's own
        // degree 4) is F in both C major and C minor, so vii of F major is E.
        val chordJson = chord(
            """{"root": 4, "applied": 7, "borrowed": "minor", "alterations": ["#5"]}"""
        )

        val root = ChordInterpreter.resolveChordRoot(chordJson, cMajor)
        assertEquals("E", root?.pitch?.noteName)
        assertEquals(ChordRootContext.BORROWED_APPLIED, root?.context)
        assertEquals("minor", root?.chordQuality)

        val notes = ChordInterpreter.getChordNotes(chordJson, cMajor)
        assertEquals(setOf(0, 4, 7), notes.map { it % 12 }.toSet())
    }

    @Test
    fun customArrayBorrowedAppliedInFirstInversion_ignoresTheTonicizationEntirely() {
        // Special case 4: Array.isArray(borrowed) && (inversion === 1 || inversion === 2).
        // Natural-minor-shaped custom array [0,2,3,5,7,8,10]; degree 5 is G.
        val chordJson = chord(
            """{"root": 5, "applied": 5, "borrowed": [0, 2, 3, 5, 7, 8, 10], "inversion": 1}"""
        )

        val root = ChordInterpreter.resolveChordRoot(chordJson, cMajor)
        assertEquals("G", root?.pitch?.noteName)
        assertEquals(ChordRootContext.BORROWED_APPLIED, root?.context)
        assertEquals("major", root?.chordQuality)

        val notes = ChordInterpreter.getChordNotes(chordJson, cMajor)
        assertEquals(setOf(7, 11, 2), notes.map { it % 12 }.toSet())
    }
}
