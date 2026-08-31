package com.acquiring.android

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class AllSongsViewTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var db: AppDatabase

    @Before
    fun setUp() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        val dao = db.songDao()
        dao.upsertBrowseEntry(
            SongBrowseEntry(
                slug = "alpha",
                artist = "Artist A",
                title = "Alpha Song",
                alphaGroup = "A",
                complexityRating = 12.0,
                complexityBucket = 1
            )
        )
        dao.upsertBrowseEntry(
            SongBrowseEntry(
                slug = "beta",
                artist = "Artist B",
                title = "Beta Song",
                alphaGroup = "B",
                complexityRating = 25.0,
                complexityBucket = 2
            )
        )
        dao.insertBrowseModes(
            listOf(
                SongBrowseMode(slug = "alpha", mode = DiatonicMode.IONIAN.key),
                SongBrowseMode(slug = "beta", mode = DiatonicMode.DORIAN.key)
            )
        )
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun headingsStartCollapsedAndExpandingBReplacesA() {
        var clickedSlug: String? = null
        setContent(onSongClick = { clickedSlug = it.slug })

        composeTestRule.onNodeWithText("Alpha Song").assertDoesNotExist()
        composeTestRule.onNodeWithText("Beta Song").assertDoesNotExist()

        composeTestRule.onNodeWithContentDescription("Expand A").performClick()
        waitForSong("Alpha Song")
        composeTestRule.onNodeWithContentDescription("Collapse A").assertExists()

        composeTestRule.onNodeWithContentDescription("Expand B").performClick()
        waitForSong("Beta Song")
        composeTestRule.onNodeWithText("Alpha Song").assertDoesNotExist()
        composeTestRule.onNodeWithContentDescription("Expand A").assertExists()
        composeTestRule.onNodeWithContentDescription("Collapse B").assertExists()

        composeTestRule.onNodeWithText("Beta Song").performClick()
        composeTestRule.waitForIdle()
        assertEquals("beta", clickedSlug)

        composeTestRule.onNodeWithContentDescription("Collapse B").performClick()
        composeTestRule.onNodeWithText("Beta Song").assertDoesNotExist()
        composeTestRule.onNodeWithContentDescription("Expand B").assertExists()
    }

    @Test
    fun selectingModeResetsExpansionAndShowsEveryRequestedHeading() {
        setContent()

        composeTestRule.onNodeWithContentDescription("Expand A").performClick()
        waitForSong("Alpha Song")

        composeTestRule.onNodeWithText("Alphabetical").performClick()
        composeTestRule.onNodeWithText("Complexity").performClick()

        composeTestRule.onNodeWithText("Alpha Song").assertDoesNotExist()
        composeTestRule.onNodeWithContentDescription("Expand 0-10").assertExists()
        composeTestRule.onNodeWithText("Complexity").performClick()
        composeTestRule.onNodeWithText("Mode").performClick()

        val modeLabels = listOf(
            "Ionian (Major)",
            "Dorian",
            "Phrygian",
            "Lydian",
            "Mixolydian",
            "Aeolian (minor)",
            "Locrian"
        )
        val groupList = composeTestRule.onNode(hasScrollAction())
        modeLabels.forEach { label ->
            groupList.performScrollToNode(hasText(label))
            composeTestRule.onNodeWithText(label).assertIsDisplayed()
            composeTestRule.onNodeWithContentDescription("Expand $label").assertExists()
        }
    }

    @Test
    fun legacyCatalogExplainsMissingComplexityAndModeMetadata() {
        runBlocking {
            val dao = db.songDao()
            dao.upsertBrowseEntry(
                SongBrowseEntry("alpha", "Artist A", "Alpha Song", "A", null, null)
            )
            dao.upsertBrowseEntry(
                SongBrowseEntry("beta", "Artist B", "Beta Song", "B", null, null)
            )
            dao.deleteBrowseModes("alpha")
            dao.deleteBrowseModes("beta")
        }
        setContent()

        composeTestRule.onNodeWithText("Alphabetical").performClick()
        composeTestRule.onNodeWithText("Complexity").performClick()
        composeTestRule.onNodeWithText(
            "Complexity data requires the latest song catalog. Return to Library to update it."
        ).assertIsDisplayed()

        composeTestRule.onNodeWithText("Complexity").performClick()
        composeTestRule.onNodeWithText("Mode").performClick()
        composeTestRule.onNodeWithText(
            "Mode data requires the latest song catalog. Return to Library to update it."
        ).assertIsDisplayed()
    }

    @Test
    fun alphabeticalBrowseShowsDigitsAndSymbolsAsSeparateHeadings() {
        runBlocking {
            val dao = db.songDao()
            dao.upsertBrowseEntry(
                SongBrowseEntry("seven", "Artist", "7 Nation Army", "7", 12.0, 1)
            )
            dao.upsertBrowseEntry(
                SongBrowseEntry("symbol", "Artist", "! Anthem", "#", 22.0, 2)
            )
        }
        setContent()

        val groupList = composeTestRule.onNode(hasScrollAction())
        (('0'..'9').map(Char::toString) + "#").forEach { label ->
            groupList.performScrollToNode(hasContentDescription("Expand $label"))
            composeTestRule.onNodeWithContentDescription("Expand $label").assertIsDisplayed()
        }

        groupList.performScrollToNode(hasContentDescription("Expand 7"))
        composeTestRule.onNodeWithContentDescription("Expand 7").performClick()
        waitForSong("7 Nation Army")

        groupList.performScrollToNode(hasContentDescription("Expand #"))
        composeTestRule.onNodeWithContentDescription("Expand #").performClick()
        waitForSong("! Anthem")
        composeTestRule.onNodeWithText("7 Nation Army").assertDoesNotExist()
    }

    @Test
    fun typedNormalizedSubstringFilterKeepsTheExpandedHeading() {
        runBlocking {
            db.songDao().upsertBrowseEntry(
                SongBrowseEntry("bravo", "Other", "Bravo Tune", "B", 18.0, 1)
            )
        }
        setContent()

        composeTestRule.onNodeWithText("Filter songs").assertExists()
        composeTestRule.onNodeWithContentDescription("Expand B").performClick()
        waitForSong("Beta Song")
        waitForSong("Bravo Tune")

        composeTestRule.onNodeWithTag("AllSongsFilter").performTextInput("ETA_so")
        waitForSongToDisappear("Bravo Tune")
        waitForSong("Beta Song")
        composeTestRule.onNodeWithContentDescription("Collapse B").assertExists()

        composeTestRule.onNodeWithTag("AllSongsFilter").performTextClearance()
        waitForSong("Bravo Tune")
        composeTestRule.onNodeWithContentDescription("Collapse B").assertExists()
    }

    @Test
    fun expandedHeadingStaysVisibleWhileItsRowsScroll() {
        runBlocking {
            val dao = db.songDao()
            repeat(30) { index ->
                dao.upsertBrowseEntry(
                    SongBrowseEntry(
                        slug = "alpha-$index",
                        artist = "Artist",
                        title = "Alpha ${index.toString().padStart(2, '0')}",
                        alphaGroup = "A",
                        complexityRating = 10.0,
                        complexityBucket = 1
                    )
                )
            }
        }
        setContent()

        composeTestRule.onNodeWithContentDescription("Expand A").performClick()
        waitForSong("Alpha 00")
        composeTestRule.onNode(hasScrollAction()).performScrollToNode(hasText("Alpha 29"))

        composeTestRule.onNodeWithText("Alpha 29").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Collapse A").assertIsDisplayed()
    }

    private fun setContent(onSongClick: (SongBrowseRow) -> Unit = {}) {
        composeTestRule.setContent {
            MaterialTheme {
                val runtimeState = rememberAllSongsRuntimeState()
                AllSongsView(
                    songDao = db.songDao(),
                    runtimeState = runtimeState,
                    onSongClick = onSongClick,
                    onBack = {}
                )
            }
        }
        composeTestRule.waitForIdle()
    }

    private fun waitForSong(title: String) {
        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithText(title)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeTestRule.onNodeWithText(title).assertIsDisplayed()
    }

    private fun waitForSongToDisappear(title: String) {
        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithText(title)
                .fetchSemanticsNodes()
                .isEmpty()
        }
        composeTestRule.onNodeWithText(title).assertDoesNotExist()
    }
}
