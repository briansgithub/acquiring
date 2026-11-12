package com.acquiring.android

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MelodyFunctionTest {
    private val cMajor = KeyInfo("C", "major")

    private fun pitch(name: String, octave: Int = 4): SpelledPitch =
        SpelledPitch.parse(name, octave)!!

    private fun tone(name: String, label: String): MelodyFunctionChordTone =
        MelodyFunctionChordTone(
            pitchClass = Math.floorMod(pitch(name).chromaticPosition, 12),
            label = label
        )

    private fun input(
        current: String?,
        scaleDegree: String = "",
        tones: List<MelodyFunctionChordTone>? = listOf(
            tone("C", "1\u0302"),
            tone("E", "3\u0302"),
            tone("G", "5\u0302")
        ),
        previous: String? = null,
        next: String? = null,
        previousIsTone: Boolean = false,
        nextIsTone: Boolean = false,
        wasPreviousTone: Boolean = false,
        willBeNextTone: Boolean = false,
        arrivedBeforeNextChord: Boolean = false,
        heldAcrossChordChange: Boolean = false
    ) = MelodyFunctionInput(
        currentPitch = current?.let(::pitch),
        scaleDegreeLabel = scaleDegree,
        key = cMajor,
        chordTones = tones,
        previousPitch = previous?.let(::pitch),
        nextPitch = next?.let(::pitch),
        previousIsCurrentChordTone = previousIsTone,
        nextIsCurrentChordTone = nextIsTone,
        currentWasPreviousChordTone = wasPreviousTone,
        currentWillBeNextChordTone = willBeNextTone,
        arrivedBeforeNextChord = arrivedBeforeNextChord,
        heldAcrossChordChange = heldAcrossChordChange
    )

    @Test
    fun chordMembersUseTheirActualToneLabels() {
        val cases = listOf(
            tone("C", "1\u0302") to "Chord root",
            tone("Eb", "♭3\u0302") to "Chord third",
            tone("Bb", "♭7\u0302") to "Chord seventh",
            tone("D", "9\u0302") to "Chord ninth",
            tone("F", "4\u0302") to "Chord fourth"
        )

        cases.forEach { (chordTone, expected) ->
            val noteName = when (chordTone.pitchClass) {
                0 -> "C"
                2 -> "D"
                3 -> "Eb"
                5 -> "F"
                10 -> "Bb"
                else -> error("Unexpected pitch class")
            }
            assertEquals(
                expected,
                describeMelodyFunction(
                    input(noteName, tones = listOf(chordTone))
                ).title
            )
        }
        assertTrue(
            describeMelodyFunction(input("F", tones = listOf(tone("F", "4\u0302"))))
                .detail.contains("fall to the third")
        )
    }

    @Test
    fun dominantThirdAlsoExplainsTheKeysLeadingToneAndResolution() {
        val result = describeMelodyFunction(
            input(
                current = "B",
                scaleDegree = "7\u0302",
                tones = listOf(tone("G", "1\u0302"), tone("B", "3\u0302"), tone("D", "5\u0302")),
                next = "C"
            )
        )

        assertEquals("Chord third", result.title)
        assertTrue(result.detail.contains("leading tone of the key"))
        assertTrue(result.detail.contains("The next note does."))
    }

    @Test
    fun semitoneAboveChordRootIsNotCalledALeadingTone() {
        val result = describeMelodyFunction(input(current = "Db", scaleDegree = "♭2\u0302"))

        assertFalse(result.title.contains("Leading tone"))
        assertEquals("Chromatic color tone", result.title)
    }

    @Test
    fun namesPassingNeighborSuspensionAnticipationAndAppoggiatura() {
        assertEquals(
            "Passing tone",
            describeMelodyFunction(
                input(
                    current = "D",
                    previous = "C",
                    next = "E",
                    previousIsTone = true,
                    nextIsTone = true
                )
            ).title
        )
        assertEquals(
            "Upper neighbor",
            describeMelodyFunction(input(current = "D", previous = "C", next = "C")).title
        )
        assertEquals(
            "Suspension",
            describeMelodyFunction(
                input(
                    current = "F",
                    next = "E",
                    nextIsTone = true,
                    wasPreviousTone = true,
                    heldAcrossChordChange = true
                )
            ).title
        )
        assertEquals(
            "Anticipation",
            describeMelodyFunction(
                input(
                    current = "A",
                    willBeNextTone = true,
                    arrivedBeforeNextChord = true
                )
            ).title
        )
        assertEquals(
            "Appoggiatura",
            describeMelodyFunction(
                input(
                    current = "F",
                    previous = "C",
                    next = "E",
                    nextIsTone = true
                )
            ).title
        )
    }

    @Test
    fun prefixesChromaticPassingButNotAChordMinorThird() {
        assertEquals(
            "Chromatic passing tone",
            describeMelodyFunction(
                input(
                    current = "F#",
                    previous = "E",
                    next = "G",
                    previousIsTone = true,
                    nextIsTone = true
                )
            ).title
        )
        val minorThird = describeMelodyFunction(
            input(
                current = "Eb",
                scaleDegree = "♭3\u0302",
                tones = listOf(tone("C", "1\u0302"), tone("Eb", "♭3\u0302"))
            )
        )
        assertEquals("Chord third", minorThird.title)
        assertFalse(minorThird.detail.contains("in the key"))
    }

    @Test
    fun describesMelodyAndChordRests() {
        assertEquals(
            MelodyFunctionDescription(
                "Rest",
                "No melody note right now.",
                MelodyFunctionTone.NEUTRAL
            ),
            describeMelodyFunction(input(current = null))
        )
        val noChord = describeMelodyFunction(
            input(current = "G", scaleDegree = "5\u0302", tones = null)
        )
        assertEquals("Scale degree 5", noChord.title)
        assertEquals(MelodyFunctionTone.STABLE, noChord.tone)
        assertTrue(noChord.detail.contains("No chord under this note"))
    }

    @Test
    fun colorsStableChordTonesLeanExtensionsAndTonesThatShouldMove() {
        assertEquals(MelodyFunctionTone.STABLE, describeMelodyFunction(input("C")).tone)
        assertEquals(
            MelodyFunctionTone.LEANING,
            describeMelodyFunction(input("Bb", tones = listOf(tone("Bb", "♭7\u0302")))).tone
        )
        assertEquals(
            MelodyFunctionTone.MOVING,
            describeMelodyFunction(
                input(
                    current = "B",
                    scaleDegree = "7\u0302",
                    tones = listOf(tone("G", "1\u0302"), tone("B", "3\u0302")),
                    next = "C"
                )
            ).tone
        )
        assertEquals(
            MelodyFunctionTone.MOVING,
            describeMelodyFunction(
                input(
                    current = "D",
                    previous = "C",
                    next = "E",
                    previousIsTone = true,
                    nextIsTone = true
                )
            ).tone
        )
        assertEquals(
            MelodyFunctionTone.OUTSIDE,
            describeMelodyFunction(input(current = "Db", scaleDegree = "♭2\u0302")).tone
        )
    }

    @Test
    fun restBetweenNotesBreaksTheMelodicConnection() {
        val chord = buildJsonObject {
            put("root", 1)
            put("type", 5)
            put("beat", 1.0)
            put("duration", 4.0)
        }
        val melody = listOf(
            MelodyNote("1", 1.0, 1.0),
            MelodyNote("1", 2.0, 1.0, isRest = true),
            MelodyNote("2", 3.0, 1.0)
        )
        val section = ExtractedSection(chords = listOf(chord))

        val built = buildMelodyFunctionInput(section, melody, melody[2], chord)

        assertNull(built.previousPitch)
        assertFalse(built.previousIsCurrentChordTone)
    }

    @Test
    fun spokenCuesStayWithinTwoWords() {
        val descriptions = listOf(
            describeMelodyFunction(input(current = "C")),
            describeMelodyFunction(input(current = "D", previous = "C", next = "E", previousIsTone = true, nextIsTone = true)),
            describeMelodyFunction(input(current = "F#", scaleDegree = "♯4\u0302", previous = "E", next = "G", previousIsTone = true, nextIsTone = true)),
            describeMelodyFunction(input(current = "Db", scaleDegree = "♭2\u0302", previous = "C", next = "C")),
            describeMelodyFunction(input(current = "Db", scaleDegree = "♭2\u0302"))
        )
        val cues = descriptions.map { spokenMelodyFunction(it) }
        assertEquals(listOf("root", "passing", "chromatic passing", "upper neighbor", "chromatic color"), cues)
        assertTrue(cues.all { it != null && it.split(" ").size <= 2 })
        assertNull(spokenMelodyFunction(describeMelodyFunction(input(current = null))))
    }

    @Test
    fun modeAnnouncementsFollowTheRootDegreeVoicesOnly() {
        assertNull(modeAnnouncement(null, "dorian", PlaybackRootDegreeCue.SPOKEN_NUMBER, majorLocked = false))
        assertEquals(
            "dorian",
            modeAnnouncement("major", "dorian", PlaybackRootDegreeCue.SPOKEN_NUMBER, majorLocked = false)
        )
        assertEquals(
            "harmonic minor",
            modeAnnouncement("major", "harmonicMinor", PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS, majorLocked = false)
        )
        assertNull(modeAnnouncement("major", "major", PlaybackRootDegreeCue.SPOKEN_NUMBER, majorLocked = false))
        assertNull(modeAnnouncement("major", "dorian", PlaybackRootDegreeCue.SPOKEN_NUMBER, majorLocked = true))
        assertNull(modeAnnouncement("major", "dorian", PlaybackRootDegreeCue.MELODY_FUNCTION, majorLocked = false))
        assertNull(modeAnnouncement("major", "dorian", PlaybackRootDegreeCue.OFF, majorLocked = false))
        assertNull(modeAnnouncement("major", "major", PlaybackRootDegreeCue.SPOKEN_NUMBER, majorLocked = false))
    }
}
