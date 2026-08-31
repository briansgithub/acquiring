package com.acquiring.android

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class HistoryManagerTest {
    private lateinit var context: Context

    @Before
    fun clearHistory() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("search_history", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    @Test
    fun recentArtistsAreCanonicalOrderedAndUnique() {
        HistoryManager.addArtist(context, "The-Artists")
        HistoryManager.addArtist(context, "Other, Artist")
        HistoryManager.addArtist(context, "The Artists")

        assertEquals(
            listOf("The Artists", "Other, Artist"),
            HistoryManager.getRecentArtists(context)
        )
    }

    @Test
    fun recentArtistsKeepOnlyTenMostRecentNames() {
        (1..12).forEach { HistoryManager.addArtist(context, "Artist-$it") }

        assertEquals(
            (12 downTo 3).map { "Artist $it" },
            HistoryManager.getRecentArtists(context)
        )
    }
}
