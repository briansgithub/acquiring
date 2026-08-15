package com.inquiring.android

import org.jsoup.Jsoup
import org.junit.Assert.assertEquals
import org.junit.Test

class ScraperSectionOrderTest {
    @Test
    fun keepsUniqueTabTypesInPageOrderWhenSongIdsAreShared() {
        val document = Jsoup.parse(
            """
            <nav>
              <a class="tb-section-tab" href="#">All Sections</a>
              <a class="tb-section-tab" href="#tab-shared">Verse</a>
              <a class="tb-section-tab" href="#tab-chorus">Chorus</a>
              <a class="tb-section-tab" href="#tab-shared">Outro</a>
              <a class="tb-section-tab" href="#tab-another-verse"> verse </a>
            </nav>
            """.trimIndent()
        )

        val sections = Scraper.sectionRefsFromDocument(document)

        assertEquals(listOf("Verse", "Chorus", "Outro"), sections.map { it.sectionName })
        assertEquals(listOf("shared", "chorus", "shared"), sections.map { it.songId })
    }
}
