package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SingingMelodyRegisterTest {
    @Test
    fun keepsAnInRangeMelodyAndItsDirection() {
        val sung = foldMelodyIntoSingingRange(listOf(60, 64, 62, 62, 67))

        assertEquals(listOf(60, 64, 62, 62, 67), sung)
        assertTrue(sung.zipWithNext().all { (previous, next) ->
            previous != null && next != null && next in 36..71
        })
    }

    @Test
    fun foldsAHighLineDownWithoutReversingTheNextStep() {
        val sung = foldMelodyIntoSingingRange(listOf(72, 74, 71))

        assertEquals(listOf(60, 62, 59), sung)
    }

    @Test
    fun foldsALowLineUpWithoutReversingTheNextStep() {
        val sung = foldMelodyIntoSingingRange(listOf(28, 26, 31))

        assertEquals(listOf(40, 38, 43), sung)
    }

    @Test
    fun skipsRestsWhenChoosingTheNextDirection() {
        val sung = foldMelodyIntoSingingRange(listOf(72, null, 74))

        assertEquals(listOf<Int?>(60, null, 62), sung)
    }

    @Test
    fun speaksAWrittenC4LineAnOctaveLower() {
        assertEquals(listOf<Int?>(48, 52, 50), spokenMelodyRegister(listOf(60, 64, 62)))
    }

    @Test
    fun spokenRegisterKeepsDirectionAcrossRestsAndRepeatedPitches() {
        assertEquals(listOf<Int?>(48, null, 52), spokenMelodyRegister(listOf(60, null, 64)))
        assertEquals(listOf<Int?>(48, 48), spokenMelodyRegister(listOf(60, 60)))
        assertEquals(listOf<Int?>(48, 55), spokenMelodyRegister(listOf(60, 67)))
    }

    @Test
    fun speaksC5OnlyWhenThePreviousSpokenNoteIsB4AndTheMelodyRises() {
        assertEquals(72, placeSpokenMelodyMidi(sounding = 72, previousSounding = 71, previousSpoken = 71))
        assertEquals(60, placeSpokenMelodyMidi(sounding = 72, previousSounding = 71, previousSpoken = 59))
        assertEquals(listOf<Int?>(59, 60, 71, 72), spokenMelodyRegister(listOf(71, 72, 83, 84)))
    }

    @Test
    fun cardTextUsesTheShortFunctionWords() {
        val passing = describeMelodyFunction(
            MelodyFunctionInput(
                currentPitch = SpelledPitch.parse("D", 4),
                scaleDegreeLabel = "2\u0302",
                key = KeyInfo("C", "major"),
                chordTones = listOf(
                    MelodyFunctionChordTone(0, "1\u0302"),
                    MelodyFunctionChordTone(4, "3\u0302"),
                    MelodyFunctionChordTone(7, "5\u0302")
                ),
                previousPitch = SpelledPitch.parse("C", 4),
                nextPitch = SpelledPitch.parse("E", 4),
                previousIsCurrentChordTone = true,
                nextIsCurrentChordTone = true
            )
        )

        assertEquals("Passing", melodyFunctionCardText(passing))
        assertEquals(
            "Rest",
            melodyFunctionCardText(describeMelodyFunction(MelodyFunctionInput(
                currentPitch = null,
                scaleDegreeLabel = "",
                key = KeyInfo("C", "major"),
                chordTones = emptyList()
            )))
        )
    }
}
