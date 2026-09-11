package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogAutoInstallTest {
    @Test
    fun emptyCatalogStartsOnce() {
        assertTrue(CatalogAutoInstall.shouldStart(songCount = 0, alreadyStarted = false))
        assertFalse(CatalogAutoInstall.shouldStart(songCount = 0, alreadyStarted = true))
        assertFalse(CatalogAutoInstall.shouldStart(songCount = 12, alreadyStarted = false))
    }

    @Test
    fun freshnessLabelUsesStoredTimestamp() {
        assertEquals("Catalog freshness unknown", CatalogAutoInstall.freshnessLabel(0L, nowMs = 1_000L))
        assertEquals("Catalog updated 2h ago", CatalogAutoInstall.freshnessLabel(1L, nowMs = 7_200_001L))
        assertEquals("Catalog updated 2d ago", CatalogAutoInstall.freshnessLabel(1L, nowMs = 172_800_001L))
    }
}
