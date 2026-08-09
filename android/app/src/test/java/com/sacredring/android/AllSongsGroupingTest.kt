package com.sacredring.android

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AllSongsGroupingTest {
    @Test
    fun expansionStartsCollapsedAndSwitchingHeadingsReplacesThePreviousOne() {
        var expanded: String? = null
        expanded = AllSongsGrouping.toggledExpandedGroup(expanded, "A")
        assertEquals("A", expanded)
        expanded = AllSongsGrouping.toggledExpandedGroup(expanded, "B")
        assertEquals("B", expanded)
        expanded = AllSongsGrouping.toggledExpandedGroup(expanded, "B")
        assertNull(expanded)
    }

    @Test
    fun alphabeticalHeadingsAreLettersThenDigitsThenSymbols() {
        assertEquals(
            ('A'..'Z').map(Char::toString) +
                ('0'..'9').map(Char::toString) +
                "#",
            AllSongsGrouping.alphabeticalGroups.map(AllSongsGroup::label)
        )
        assertEquals("A", AllSongsGrouping.alphabeticalGroup("  autumn leaves"))
        assertEquals("0", AllSongsGrouping.alphabeticalGroup("007 Theme"))
        assertEquals("7", AllSongsGrouping.alphabeticalGroup("7 Nation Army"))
        assertEquals("9", AllSongsGrouping.alphabeticalGroup("99 Luftballons"))
        assertEquals("#", AllSongsGrouping.alphabeticalGroup("!Song"))
        assertEquals("#", AllSongsGrouping.alphabeticalGroup("  "))
        assertEquals("#", AllSongsGrouping.alphabeticalGroup(null))
    }

    @Test
    fun fuzzyFilterMatchesTitleOrArtistIgnoringCaseSpacesHyphensAndUnderscores() {
        val song = SongBrowseRow(
            slug = "beta",
            artist = "The White-Stripes",
            title = "Beta Song"
        )

        assertTrue(AllSongsGrouping.fuzzySongMatches(song, "ETA_so"))
        assertTrue(AllSongsGrouping.fuzzySongMatches(song, "white stripes"))
        assertTrue(AllSongsGrouping.fuzzySongMatches(song, "WHITE_STRIPES"))
        assertTrue(AllSongsGrouping.fuzzySongMatches(song, ""))
        assertFalse(AllSongsGrouping.fuzzySongMatches(song, "bravo"))
    }

    @Test
    fun complexityBoundariesUseTenPointBucketsAndPutOneHundredInFinalBucket() {
        assertEquals(0, AllSongsGrouping.complexityBucket(0.0))
        assertEquals(0, AllSongsGrouping.complexityBucket(9.999))
        assertEquals(1, AllSongsGrouping.complexityBucket(10.0))
        assertEquals(1, AllSongsGrouping.complexityBucket(19.999))
        assertEquals(9, AllSongsGrouping.complexityBucket(90.0))
        assertEquals(9, AllSongsGrouping.complexityBucket(100.0))
        assertNull(AllSongsGrouping.complexityBucket(null))
        assertNull(AllSongsGrouping.complexityBucket(-0.1))
        assertNull(AllSongsGrouping.complexityBucket(100.1))
    }

    @Test
    fun modeHeadingsUseRequestedNamesAndAliases() {
        assertEquals(
            listOf(
                "Ionian (Major)",
                "Dorian",
                "Phrygian",
                "Lydian",
                "Mixolydian",
                "Aeolian (minor)",
                "Locrian"
            ),
            AllSongsGrouping.modeGroups.map(AllSongsGroup::label)
        )
        assertEquals(DiatonicMode.IONIAN, AllSongsGrouping.canonicalMode("major"))
        assertEquals(DiatonicMode.IONIAN, AllSongsGrouping.canonicalMode("Ionian"))
        assertEquals(DiatonicMode.AEOLIAN, AllSongsGrouping.canonicalMode("minor"))
        assertEquals(DiatonicMode.AEOLIAN, AllSongsGrouping.canonicalMode("natural_minor"))
        assertNull(AllSongsGrouping.canonicalMode("harmonicMinor"))
        assertNull(AllSongsGrouping.canonicalMode("phrygianDominant"))
    }

    @Test
    fun songBelongsToEveryModeAcrossAllKeyEventsWithoutDuplicatesWithinAMode() {
        val sections = listOf(
            sectionWithScales("major", "dorian", "dorian"),
            sectionWithScales("minor", "major")
        )

        assertEquals(
            setOf(DiatonicMode.IONIAN, DiatonicMode.DORIAN, DiatonicMode.AEOLIAN),
            AllSongsGrouping.modesInSections(sections)
        )
    }

    private fun sectionWithScales(vararg scales: String): ExtractedSection = ExtractedSection(
        metadata = JsonObject(
            mapOf(
                "keys" to JsonArray(
                    scales.map { scale ->
                        JsonObject(mapOf("scale" to JsonPrimitive(scale)))
                    }
                )
            )
        )
    )
}
