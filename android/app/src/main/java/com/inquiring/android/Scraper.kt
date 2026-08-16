package com.inquiring.android

import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object Scraper {
    data class SectionRef(
        val songId: String,
        val sectionName: String?
    )

    data class PageExtraction(
        val sections: List<SectionRef>
    ) {
        val songIds: List<String>
            get() = sections.map { it.songId }

        val sectionMapping: Map<String, String>
            get() = linkedMapOf<String, String>().apply {
                sections.forEach { section ->
                    val name = section.sectionName ?: return@forEach
                    putIfAbsent(section.songId, name)
                }
            }
    }

    suspend fun extractSectionIds(url: String): PageExtraction = withContext(Dispatchers.IO) {
        val doc = Jsoup.connect(url).get()
        PageExtraction(sectionRefsFromDocument(doc))
    }

    internal fun sectionRefsFromDocument(doc: Document): List<SectionRef> {
        val sections = mutableListOf<SectionRef>()
        val seenSectionTypes = mutableSetOf<String>()

        // Look for <a class="tb-section-tab" href="#tab-XXXX">Name</a>
        val tabs = doc.select("a.tb-section-tab")
        for (tab in tabs) {
            val href = tab.attr("href")
            if (href.startsWith("#tab-")) {
                val id = href.removePrefix("#tab-")
                val name = tab.text().trim()
                
                if (id.isNotEmpty() && name.lowercase() != "all sections") {
                    // A single public song ID can back more than one named tab. Keep
                    // each distinct section type and let the caller assign a unique map key.
                    val normalizedName = sectionTypeKey(name)
                    if (seenSectionTypes.add(normalizedName)) {
                        sections.add(SectionRef(id, name))
                    }
                }
            }
        }

        if (sections.isEmpty()) {
            // Fallback: look for any element with an ID starting with tab-
            val containers = doc.select("[id^=tab-]")
            for (container in containers) {
                val id = container.id().removePrefix("tab-")
                if (id.isNotEmpty() && id != "player") {
                    if (sections.none { it.songId == id }) {
                        sections.add(SectionRef(id, null))
                    }
                }
            }
        }

        return sections
    }
}
