package com.sacredring.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class EnharmonicLetterNameTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun buildChordJson(root: Int, type: Int = 5, inversion: Int = 0, applied: Int = 0): JsonObject {
        return json.decodeFromString("""
            {
                "root": $root,
                "type": $type,
                "inversion": $inversion,
                "applied": $applied
            }
        """.trimIndent())
    }

    @Test
    fun testAbMinorScaleEnharmonics() {
        val key = KeyInfo("A♭", "minor")
        // Ab minor scale degrees: 1=Ab, 2=Bb, 3=Cb, 4=Db, 5=Eb, 6=Fb, 7=Gb
        assertEquals("A♭", MusicTheory.getNoteLabel(1, key.tonic, key.scale))
        assertEquals("B♭", MusicTheory.getNoteLabel(2, key.tonic, key.scale))
        assertEquals("C♭", MusicTheory.getNoteLabel(3, key.tonic, key.scale))
        assertEquals("D♭", MusicTheory.getNoteLabel(4, key.tonic, key.scale))
        assertEquals("E♭", MusicTheory.getNoteLabel(5, key.tonic, key.scale))
        assertEquals("F♭", MusicTheory.getNoteLabel(6, key.tonic, key.scale))
        assertEquals("G♭", MusicTheory.getNoteLabel(7, key.tonic, key.scale))

        // Check chord letter names in Ab minor
        val chordI = buildChordJson(1)  // i = Abm
        val chordIII = buildChordJson(3) // III = Cb
        val chordVI = buildChordJson(6)  // VI = Fb

        assertEquals("A♭m", ChordInterpreter.getLetterName(chordI, key))
        assertEquals("C♭", ChordInterpreter.getLetterName(chordIII, key))
        assertEquals("F♭", ChordInterpreter.getLetterName(chordVI, key))

        println("✅ Ab minor enharmonics verified: i=A♭m, III=C♭, VI=F♭")
    }

    @Test
    fun testCSharpMajorScaleEnharmonics() {
        val key = KeyInfo("C♯", "major")
        // C# major scale degrees: 1=C#, 2=D#, 3=E#, 4=F#, 5=G#, 6=A#, 7=B#
        assertEquals("C♯", MusicTheory.getNoteLabel(1, key.tonic, key.scale))
        assertEquals("E♯", MusicTheory.getNoteLabel(3, key.tonic, key.scale))
        assertEquals("B♯", MusicTheory.getNoteLabel(7, key.tonic, key.scale))

        val chordIII = buildChordJson(3) // iii = E#m
        val chordVII = buildChordJson(7) // vii° = B#°

        assertEquals("E♯m", ChordInterpreter.getLetterName(chordIII, key))
        assertEquals("B♯°", ChordInterpreter.getLetterName(chordVII, key))

        println("✅ C# major enharmonics verified: iii=E♯m, vii°=B♯°")
    }

    @Test
    fun testGbMajorScaleEnharmonics() {
        val key = KeyInfo("G♭", "major")
        // Gb major scale: 1=Gb, 2=Ab, 3=Bb, 4=Cb, 5=Db, 6=Eb, 7=F
        assertEquals("C♭", MusicTheory.getNoteLabel(4, key.tonic, key.scale))

        val chordIV = buildChordJson(4) // IV = Cb
        assertEquals("C♭", ChordInterpreter.getLetterName(chordIV, key))

        println("✅ Gb major enharmonics verified: IV=C♭")
    }

    @Test
    fun testSlashBassEnharmonics() {
        val key = KeyInfo("A♭", "minor")
        // i chord (root 1 = Abm) in 1st inversion (inv 1 -> bass degree 3 = Cb) -> Abm/Cb
        val chordInv1 = buildChordJson(1, type = 5, inversion = 1)
        assertEquals("A♭m/C♭", ChordInterpreter.getLetterName(chordInv1, key))

        println("✅ Slash bass enharmonic verified: A♭m/C♭")
    }
}
