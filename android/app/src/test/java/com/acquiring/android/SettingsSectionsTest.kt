package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsSectionsTest {
    @Test
    fun settingsKeepsHelpDisplayAndDiagnostics() {
        assertEquals(
            listOf("Instructions", "Scale degrees", "Intervals", "Roman numerals", "Tessitura"),
            HelpCatalog.topics.map { it.title }
        )
        assertEquals(
            listOf("60 fps", "Maximum"),
            TimelineFrameRatePreference.entries.map { it.title }
        )
        assertTrue(AudioDiagnostics.ALLOWED_OPERATIONS.contains("diagnostics.export"))
        assertTrue(AudioDiagnostics.ALLOWED_OPERATIONS.contains("diagnostics.reset"))
    }
}
