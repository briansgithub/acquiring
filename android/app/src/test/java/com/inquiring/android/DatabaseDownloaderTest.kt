package com.inquiring.android

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class DatabaseDownloaderTest {

    @Test
    fun testDownloadAndInstallCatalog_fromGitHubRelease() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()

        println("--- Testing Catalog Download from GitHub Release ---")
        val result = DatabaseDownloader.downloadAndInstallCatalog(context) { status ->
            println("Progress: $status")
        }

        assertTrue("Download and install should succeed, error: ${result.exceptionOrNull()?.message}", result.isSuccess)

        // Verify SQLite database exists on disk
        val dbFile = context.getDatabasePath(AppDatabase.DB_NAME)
        assertTrue("Installed database file should exist", dbFile.exists())
        assertTrue("Installed database file size should be > 1 MB", dbFile.length() > 1_000_000)

        // Open Room DB and verify song count is ~39,215
        val db = androidx.room.Room.databaseBuilder(context, AppDatabase::class.java, AppDatabase.DB_NAME)
            .allowMainThreadQueries()
            .build()

        val songCount = db.songDao().getSongCount()
        println("✅ Successfully imported database! Total songs in Room DB: $songCount")
        assertTrue("Room DB should contain thousands of songs", songCount > 30000)


        // Verify specific known songs exist in the downloaded DB
        val mapleLeaf = db.songDao().getSongBySlug("scott-joplin__maple-leaf-rag")
        assertNotNull("Maple Leaf Rag should exist in downloaded catalog", mapleLeaf)
        assertTrue("Maple Leaf Rag title should match case-insensitively", "maple leaf rag".equals(mapleLeaf?.title, ignoreCase = true))


        db.close()
    }
}
