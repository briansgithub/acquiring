package com.sacredring.android

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QuizIntervalStateTest {
    private fun chord(root: Int, beat: Double, duration: Double = 1.0, rest: Boolean = false) =
        buildJsonObject {
            put("root", root)
            put("beat", beat)
            put("duration", duration)
            if (rest) put("isRest", true)
        }

    @Test
    fun chordTransitionUsesSpelledRootsAndSkipsRests() {
        val section = ExtractedSection(
            chords = listOf(
                chord(root = 1, beat = 1.0),
                chord(root = 0, beat = 2.0, rest = true),
                chord(root = 5, beat = 3.0)
            )
        )

        val state = resolveChordRootIntervalState(section, currentBeat = 3.25)

        assertEquals("C", state?.previous?.pitch?.noteName)
        assertEquals("G", state?.current?.pitch?.noteName)
        assertEquals("P5 ↑", state?.interval?.shorthand)
        assertEquals("1\u0302", state?.previousDegreeLabel)
        assertEquals("5\u0302", state?.currentDegreeLabel)
    }

    @Test
    fun rootIntervalsFollowTheSimplePlaybackRegisterWhenTheRootFalls() {
        val section = ExtractedSection(
            metadata = buildJsonObject {
                put("keys", buildJsonArray {
                    add(buildJsonObject {
                        put("tonic", "Ab")
                        put("scale", "major")
                        put("beat", 1.0)
                    })
                })
            },
            chords = listOf(
                chord(root = 2, beat = 1.0),
                chord(root = 4, beat = 2.0)
            )
        )

        val state = resolveChordRootIntervalState(section, currentBeat = 2.25)

        // Both simple-mode roots use the same written register: Bb3 -> Db3.
        // Treating Db as the next scale octave would incorrectly label this
        // as an ascending m3 instead of the sounding descending M6.
        assertEquals("Bb", state?.previousIntervalPitch?.noteName)
        assertEquals("Db", state?.currentIntervalPitch?.noteName)
        assertEquals(3, state?.previousIntervalPitch?.octave)
        assertEquals(3, state?.currentIntervalPitch?.octave)
        assertEquals("M6 ↓", state?.interval?.shorthand)
    }

    @Test
    fun firstChordHasCurrentRootButNoInterval() {
        val section = ExtractedSection(chords = listOf(chord(root = 1, beat = 1.0)))

        val state = resolveChordRootIntervalState(section, currentBeat = 1.25)

        assertEquals("C", state?.current?.pitch?.noteName)
        assertNull(state?.previous)
        assertNull(state?.interval)
    }

    @Test
    fun melodyTransitionPreservesEnharmonicQuantity() {
        val melody = listOf(
            MelodyNote(sd = "#1", beat = 1.0, duration = 1.0, octave = 0),
            MelodyNote(sd = "5", beat = 2.0, duration = 1.0, octave = 0)
        )

        val state = resolveMelodyIntervalState(melody, currentBeat = 2.25) { KeyInfo("C", "major") }

        assertEquals("C#", state?.previous?.noteName)
        assertEquals("G", state?.current?.noteName)
        assertEquals("d5 ↑", state?.interval?.shorthand)
        assertEquals("♯1\u0302", state?.previousDegreeLabel)
        assertEquals("5\u0302", state?.currentDegreeLabel)
    }

    @Test
    fun melodyRestIsSkippedButCurrentGapHasNoInterval() {
        val melody = listOf(
            MelodyNote(sd = "1", beat = 1.0, duration = 1.0),
            MelodyNote(sd = "1", beat = 2.0, duration = 1.0, isRest = true),
            MelodyNote(sd = "3", beat = 3.0, duration = 1.0)
        )

        assertNull(resolveMelodyIntervalState(melody, currentBeat = 2.25) { KeyInfo("C", "major") })
        assertNull(resolveMelodyIntervalState(melody, currentBeat = 3.25) { KeyInfo("C", "major") })
    }

    @Test
    fun melodyCompoundIntervalUsesSourceOctave() {
        val melody = listOf(
            MelodyNote(sd = "1", beat = 1.0, duration = 1.0, octave = 0),
            MelodyNote(sd = "b2", beat = 2.0, duration = 1.0, octave = 1)
        )

        val state = resolveMelodyIntervalState(melody, currentBeat = 2.25) { KeyInfo("C", "major") }

        assertEquals("m9 ↑", state?.interval?.shorthand)
    }

    @Test
    fun newestOverlappingMelodyEventWinsAndAnOverlappingRestSuppressesOutput() {
        val melody = listOf(
            MelodyNote(sd = "1", beat = 1.0, duration = 3.0),
            MelodyNote(sd = "3", beat = 2.0, duration = 1.0),
            MelodyNote(sd = "1", beat = 2.5, duration = 0.5, isRest = true)
        )

        assertEquals(
            "M3 ↑",
            resolveMelodyIntervalState(melody, currentBeat = 2.25) { KeyInfo("C", "major") }
                ?.interval?.shorthand
        )
        assertNull(resolveMelodyIntervalState(melody, currentBeat = 2.75) { KeyInfo("C", "major") })
        assertEquals(true, activeMelodyNoteAtBeat(melody, 2.75)?.isRest)
    }

    @Test
    fun anActualGapHasNoCurrentIntervalAndExactBoundarySelectsTheNewNote() {
        val melody = listOf(
            MelodyNote(sd = "1", beat = 1.0, duration = 1.0),
            MelodyNote(sd = "2", beat = 3.0, duration = 1.0)
        )

        assertNull(resolveMelodyIntervalState(melody, currentBeat = 2.5) { KeyInfo("C", "major") })
        assertEquals(
            "M2 ↑",
            resolveMelodyIntervalState(melody, currentBeat = 3.0) { KeyInfo("C", "major") }
                ?.interval?.shorthand
        )
    }

    @Test
    fun eachMelodyNoteKeepsTheKeyFromItsOwnOnset() {
        val melody = listOf(
            MelodyNote(sd = "1", beat = 1.0, duration = 1.0),
            MelodyNote(sd = "1", beat = 2.0, duration = 2.0)
        )
        val keyAtBeat: (Double) -> KeyInfo = { beat ->
            if (beat < 2.0) KeyInfo("C", "major") else KeyInfo("D", "major")
        }

        assertEquals(
            "M2 ↑",
            resolveMelodyIntervalState(melody, currentBeat = 3.0, keyAtBeat = keyAtBeat)
                ?.interval?.shorthand
        )
        val state = resolveMelodyIntervalState(melody, currentBeat = 3.0, keyAtBeat = keyAtBeat)
        assertEquals("1\u0302", state?.previousDegreeLabel)
        assertEquals("1\u0302", state?.currentDegreeLabel)
    }

    @Test
    fun melodyDegreeMetadataKeepsFlatAccidentals() {
        val melody = listOf(
            MelodyNote(sd = "b2", beat = 1.0, duration = 1.0),
            MelodyNote(sd = "3", beat = 2.0, duration = 1.0)
        )

        val state = resolveMelodyIntervalState(melody, currentBeat = 2.25) { KeyInfo("C", "major") }

        assertEquals("♭2\u0302", state?.previousDegreeLabel)
        assertEquals("3\u0302", state?.currentDegreeLabel)
    }

    @Test
    fun newestOverlappingChordEventWins() {
        val section = ExtractedSection(
            chords = listOf(
                chord(root = 1, beat = 1.0, duration = 3.0),
                chord(root = 5, beat = 2.0, duration = 1.0)
            )
        )

        val state = resolveChordRootIntervalState(section, currentBeat = 2.25)

        assertEquals("G", state?.current?.pitch?.noteName)
        assertEquals("P5 ↑", state?.interval?.shorthand)
        assertEquals(
            5,
            (activeChordAtBeat(section, 2.25)?.get("root") as? kotlinx.serialization.json.JsonPrimitive)
                ?.content?.toInt()
        )
    }
}
