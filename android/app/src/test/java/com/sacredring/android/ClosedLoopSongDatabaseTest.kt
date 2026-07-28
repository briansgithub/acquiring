package com.sacredring.android

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class ClosedLoopSongDatabaseTest {

    private lateinit var db: AppDatabase
    private lateinit var harvestService: HarvestService

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        harvestService = HarvestService(db)
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun testValidHooktheorySongs_foundInDatabase() = runBlocking {
        val testCases = listOf(
            TestCase(
                url = "https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag",
                expectedSlug = "scott-joplin__maple-leaf-rag"
            ),
            TestCase(
                url = "https://www.hooktheory.com/theorytab/view/the-proclaimers/500-miles",
                expectedSlug = "the-proclaimers__500-miles"
            ),
            TestCase(
                url = "https://www.hooktheory.com/theorytab/view/fun/we-are-young",
                expectedSlug = "fun__we-are-young"
            )
        )

        for (testCase in testCases) {
            println("--- Testing Valid Song: ${testCase.url} ---")
            val harvestResult = harvestService.harvest(testCase.url)
            assertTrue("Harvest should succeed for valid URL ${testCase.url}, error: ${harvestResult.exceptionOrNull()?.message}", harvestResult.isSuccess)

            val harvestedSong = harvestResult.getOrNull()
            assertNotNull("Harvested song object should not be null", harvestedSong)
            assertEquals(testCase.expectedSlug, harvestedSong?.slug)

            // Closed-loop verification: Query Room DB directly
            val dbExists = db.songDao().songExists(testCase.expectedSlug)
            assertTrue("Song should exist in database for slug: ${testCase.expectedSlug}", dbExists)

            val songFromDb = db.songDao().getSongBySlug(testCase.expectedSlug)
            assertNotNull("Fetched song from DB should not be null for slug: ${testCase.expectedSlug}", songFromDb)
            assertEquals(testCase.expectedSlug, songFromDb?.slug)
            assertNotNull("Title should be extracted", songFromDb?.title)
            assertNotNull("Artist should be extracted", songFromDb?.artist)
            assertEquals("enriched", songFromDb?.status)
            assertNotNull("Data blob should contain section JSON", songFromDb?.dataBlob)
            assertTrue("Data blob should be non-empty", songFromDb!!.dataBlob!!.isNotEmpty())

            println("✅ Verified in DB: Title='${songFromDb.title}', Artist='${songFromDb.artist}', Slug='${songFromDb.slug}'")
        }
    }

    @Test
    fun testInvalidUrlSubmissions_noFalsePositivesInDatabase() = runBlocking {
        val invalidUrls = listOf(
            "https://www.hooktheory.com/theorytab/view/nonexistent-artist-9999/nonexistent-song-8888",
            "https://www.hooktheory.com/theorytab/view/invalid/url-slug-test-12345",
            "https://www.example.com/not-hooktheory-page",
            "invalid_garbage_url"
        )

        for (invalidUrl in invalidUrls) {
            println("--- Testing Invalid URL: $invalidUrl ---")
            val harvestResult = harvestService.harvest(invalidUrl)
            assertTrue("Harvest should fail for invalid URL $invalidUrl", harvestResult.isFailure)

            val slug = invalidUrl.trim().trimEnd('/').substringAfter("theorytab/view/").replace("/", "__")

            // Closed-loop verification: Verify no false positives in DB
            val dbExists = db.songDao().songExists(slug)
            assertFalse("Database should NOT contain false positive for invalid slug: $slug", dbExists)

            val songFromDb = db.songDao().getSongBySlug(slug)
            assertNull("Fetched song from DB should be null for invalid slug: $slug", songFromDb)

            println("✅ Correctly rejected invalid URL without creating false positive entry.")
        }
    }

    private data class TestCase(
        val url: String,
        val expectedSlug: String
    )
}
