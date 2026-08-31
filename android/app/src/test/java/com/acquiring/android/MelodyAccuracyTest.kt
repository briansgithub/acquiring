package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class MelodyAccuracyTest {

    @Test
    fun testMidiNote_CMajor() {
        val key = KeyInfo("C", "major")
        // sd="1", oct=0 -> C4 (60)
        assertEquals(60, MusicTheory.getMidiNote("1", 0, key))
        // sd="3", oct=0 -> E4 (64)
        assertEquals(64, MusicTheory.getMidiNote("3", 0, key))
        // sd="8", oct=0 -> C5 (72)
        assertEquals(72, MusicTheory.getMidiNote("8", 0, key))
        // sd="1", oct=1 -> C5 (72)
        assertEquals(72, MusicTheory.getMidiNote("1", 1, key))
    }

    @Test
    fun testMidiNote_GMajor() {
        val key = KeyInfo("G", "major")
        // sd="1", oct=0 -> G4 (67)
        assertEquals(67, MusicTheory.getMidiNote("1", 0, key))
        // sd="4", oct=0 -> C5 (72)
        assertEquals(72, MusicTheory.getMidiNote("4", 0, key))
    }

    @Test
    fun testMidiNote_BMajor_Overflow() {
        val key = KeyInfo("B", "major")
        // sd="1", oct=0 -> B4 (71)
        assertEquals(71, MusicTheory.getMidiNote("1", 0, key))
        // sd="2", oct=0 -> C#5 (73) - Overflow!
        assertEquals(73, MusicTheory.getMidiNote("2", 0, key))
    }

    @Test
    fun testMidiNote_Modifiers() {
        val key = KeyInfo("C", "major")
        // sd="#1" -> C#4 (61)
        assertEquals(61, MusicTheory.getMidiNote("#1", 0, key))
        // sd="b3" -> Eb4 (63)
        assertEquals(63, MusicTheory.getMidiNote("b3", 0, key))
    }
}
