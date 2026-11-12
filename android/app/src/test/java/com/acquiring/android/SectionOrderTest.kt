package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class SectionOrderTest {
    @Test
    fun explicitSongIndicesWinAndRepeatedTypesCollapse() {
        val sections = linkedMapOf(
            "late-verse" to ExtractedSection(sectionName = "Verse", sectionIndex = 4),
            "chorus" to ExtractedSection(sectionName = "Chorus", sectionIndex = 2),
            "intro" to ExtractedSection(sectionName = "Intro", sectionIndex = 0),
            "first-verse" to ExtractedSection(sectionName = " verse ", sectionIndex = 1)
        )

        val ordered = sections.sectionsInSongOrder()

        assertEquals(listOf("intro", "first-verse", "chorus"), ordered.map { it.key })
        assertEquals("intro", ordered.first().key)
    }

    @Test
    fun legacySectionsUseCanonicalOrderAndKeepUnknownsStable() {
        val sections = linkedMapOf(
            "custom-a" to ExtractedSection(sectionName = "Theme A"),
            "outro" to ExtractedSection(sectionName = "Outro"),
            "solo-2" to ExtractedSection(sectionName = "Solo 2"),
            "chorus" to ExtractedSection(sectionName = "Chorus"),
            "verse-pre" to ExtractedSection(sectionName = "Verse and Pre-Chorus"),
            "verse" to ExtractedSection(sectionName = "Verse"),
            "intro" to ExtractedSection(sectionName = "Intro"),
            "bridge" to ExtractedSection(sectionName = "Bridge"),
            "solo-1" to ExtractedSection(sectionName = "Solo 1"),
            "custom-b" to ExtractedSection(sectionName = "Theme B")
        )

        val ordered = sections.sectionsInSongOrder()

        assertEquals(
            listOf(
                "intro",
                "verse",
                "verse-pre",
                "chorus",
                "bridge",
                "solo-1",
                "solo-2",
                "outro",
                "custom-a",
                "custom-b"
            ),
            ordered.map { it.key }
        )
    }

    @Test
    fun canonicalSectionTypesMatchStructuralOrder() {
        val ranks = CANONICAL_SECTION_TYPES.map(::canonicalSectionRank)
        assertEquals(ranks.sorted(), ranks)
        assertEquals(sectionTypeKey("Pre-Chorus"), sectionTypeKey(" pre chorus "))
    }

    @Test
    fun nextSectionWrapsFromTheLastBackToTheFirst() {
        val order = listOf("intro", "verse", "chorus")
        assertEquals("verse", nextSectionInSongOrder(order, "intro"))
        assertEquals("chorus", nextSectionInSongOrder(order, "verse"))
        assertEquals("intro", nextSectionInSongOrder(order, "chorus"))
        assertEquals("intro", nextSectionInSongOrder(order, "missing"))
        assertEquals(null, nextSectionInSongOrder(emptyList(), "intro"))
    }

    @Test
    fun chorusIsPreferredAndMissingChorusFallsBackToTheFirstSection() {
        val withChorus = linkedMapOf(
            "intro" to ExtractedSection(sectionName = "Intro", sectionIndex = 0),
            "pre" to ExtractedSection(sectionName = "Pre-Chorus", sectionIndex = 1),
            "chorus" to ExtractedSection(sectionName = "Chorus", sectionIndex = 2),
            "lead" to ExtractedSection(sectionName = "Chorus Lead-Out", sectionIndex = 3)
        )
        assertEquals("chorus", chorusOrFirstSection(withChorus))
        val noChorus = linkedMapOf(
            "intro" to ExtractedSection(sectionName = "Intro", sectionIndex = 0),
            "verse" to ExtractedSection(sectionName = "Verse", sectionIndex = 1)
        )
        assertEquals("intro", chorusOrFirstSection(noChorus))
        val combined = linkedMapOf(
            "verse" to ExtractedSection(sectionName = "Verse", sectionIndex = 0),
            "both" to ExtractedSection(sectionName = "Pre-Chorus and Chorus", sectionIndex = 1)
        )
        assertEquals("both", chorusOrFirstSection(combined))
    }
}
