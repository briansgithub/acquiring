package com.sacredring.android

import org.jsoup.Jsoup
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object Scraper {
    data class PageExtraction(
        val songIds: List<String>,
        val sectionMapping: Map<String, String>
    )

    suspend fun extractSectionIds(url: String): PageExtraction = withContext(Dispatchers.IO) {
        val doc = Jsoup.connect(url).get()
        val songIds = mutableListOf<String>()
        val sectionMapping = mutableMapOf<String, String>()

        // Look for <a class="tb-section-tab" href="#tab-XXXX">Name</a>
        val tabs = doc.select("a.tb-section-tab")
        for (tab in tabs) {
            val href = tab.attr("href")
            if (href.startsWith("#tab-")) {
                val id = href.removePrefix("#tab-")
                val name = tab.text().trim()
                
                if (id.isNotEmpty() && name.lowercase() != "all sections") {
                    if (!songIds.contains(id)) {
                        songIds.add(id)
                        sectionMapping[id] = name
                    }
                }
            }
        }

        if (songIds.isEmpty()) {
            // Fallback: look for any element with an ID starting with tab-
            val containers = doc.select("[id^=tab-]")
            for (container in containers) {
                val id = container.id().removePrefix("tab-")
                if (id.isNotEmpty() && id != "player") {
                    if (!songIds.contains(id)) {
                        songIds.add(id)
                    }
                }
            }
        }

        PageExtraction(songIds, sectionMapping)
    }
}
