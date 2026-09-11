package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsSectionsTest {
    @Test
    fun placeholderSectionsReserveHelpCatalogUpdatesFpsAndDiagnostics() {
        val titles = SettingsPlaceholderSection.entries.map { it.title }
        assertEquals(
            listOf("Help", "Updates", "Timeline", "Audio diagnostics"),
            titles
        )
        SettingsPlaceholderSection.entries.forEach { section ->
            assertTrue(section.body.isNotBlank())
        }
    }
}
