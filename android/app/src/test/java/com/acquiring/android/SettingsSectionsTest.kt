package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsSectionsTest {
    @Test
    fun settingsKeepsHelpAndDiagnosticsWithoutAFrameRateControl() {
        assertEquals(
            listOf("Instructions", "Scale degrees", "Intervals", "Roman numerals", "Melody function"),
            HelpCatalog.topics.map { it.title }
        )
        val settings = androidMainSource("AppSettings.kt")
        assertTrue(!settings.contains("timelineFrameRate"))
        assertTrue(!settings.contains("60 fps"))
        assertTrue(AudioDiagnostics.ALLOWED_OPERATIONS.contains("diagnostics.export"))
        assertTrue(AudioDiagnostics.ALLOWED_OPERATIONS.contains("diagnostics.reset"))
    }

    @Test
    fun privacyPolicyIsLastSettingsSectionNotOnSearch() {
        val settings = androidMainSource("AppSettings.kt")
        val library = androidMainSource("LibraryView.kt")
        val link = settings.lastIndexOf("PrivacyPolicyLink()")
        val version = settings.lastIndexOf("VERSION_NAME")
        assertTrue(link > version)
        assertTrue(!library.contains("PrivacyPolicyLink()"))
    }

    private fun androidMainSource(name: String): String {
        val candidates = listOf(
            java.io.File("src/main/java/com/acquiring/android/$name"),
            java.io.File("app/src/main/java/com/acquiring/android/$name"),
            java.io.File("android/app/src/main/java/com/acquiring/android/$name")
        )
        return candidates.first { it.exists() }.readText()
    }
}
