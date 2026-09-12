package com.acquiring.android

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.pressBack
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class SongSearchUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    private lateinit var db: AppDatabase
    private lateinit var userDb: UserDataDatabase

    @Before
    fun setUp() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        AppAudioOutput.initialize(context)
        AppInstrumentSession.initialize(context)
        QuizPlaybackController.initialize(context)
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        userDb = Room.inMemoryDatabaseBuilder(context, UserDataDatabase::class.java).build()
        val sections = """{"verse":{"sectionName":"Verse","chords":[{"root":1,"beat":1,"duration":4}],"metadata":{"keys":[{"tonic":"C","scale":"major"}]}}}""".toByteArray()
        db.songDao().insertSong(Song("all-star", "smash-mouth", "All Star", "https://example.test/all-star", "enriched", sections))
        db.songDao().insertSong(Song("tonight", "the-smashing-pumpkins", "Tonight Tonight", "https://example.test/tonight", "enriched", sections))
    }

    @After
    fun tearDown() {
        db.close()
        userDb.close()
    }

    @Test
    fun partialArtistSearchShowsResultsAndOpensQuiz() {
        searchAndOpenSong("Search Library", " sMaSh ", "Search", 2, artists = true)
    }

    @Test
    fun titleSearchShowsResultsAndOpensQuiz() {
        searchAndOpenSong("Search Library", " ALL STAR ", "Search", 1)
    }

    @Test
    fun quizBackPreservesAllSongsFilterAndGroup() {
        runBlocking {
            db.songDao().upsertBrowseEntry(SongBrowseEntry("all-star", "smash-mouth", "All Star", "A", 12.0, 1))
        }
        val session = SongOctaveOffsetViewModel()
        composeRule.setContent {
            MaterialTheme { MainScreen(db, userDb, session) }
        }
        composeRule.onNodeWithText("All Songs").performClick()
        composeRule.onNodeWithTag("AllSongsFilter").performTextInput("All Star")
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("A").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithContentDescription("Expand A").performClick()
        val songRow = hasText("All Star") and hasClickAction() and !hasSetTextAction()
        composeRule.waitUntil(5_000) { composeRule.onAllNodes(songRow).fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNode(songRow).performClick()
        waitForPlay()
        pressBack()
        composeRule.onNodeWithTag("AllSongsFilter").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Collapse A").assertIsDisplayed()
        composeRule.onNode(songRow).assertIsDisplayed()
    }

    @Test
    fun informationIsADetourAndQuizBackReturnsToSearchOrArtist() {
        val session = SongOctaveOffsetViewModel()
        composeRule.setContent {
            MaterialTheme { MainScreen(db, userDb, session) }
        }
        val field = composeRule.onNode(hasSetTextAction() and hasText("Search Library"))
        field.performClick().performTextInput("All")
        waitForText("All Star")
        composeRule.onNodeWithText("All Star").performClick()
        waitForPlay()
        androidx.test.espresso.Espresso.closeSoftKeyboard()
        repeat(2) { visit ->
            composeRule.onNodeWithTag(QUIZ_INFO_BUTTON_TEST_TAG).performClick()
            waitForText("OVERVIEW")
            if (visit == 0) pressBack() else composeRule.onNodeWithText("< Back").performClick()
            waitForPlay()
            composeRule.onNodeWithTag(QUIZ_INFO_BUTTON_TEST_TAG).assertIsDisplayed()
        }
        pressBack()
        field.assertIsDisplayed()
        composeRule.onNodeWithTag(QUIZ_INFO_BUTTON_TEST_TAG).assertDoesNotExist()

        field.performClick()
        waitForText("All Star")
        composeRule.onNodeWithText("All Star").performClick()
        waitForPlay()
        composeRule.onNodeWithText("Smash Mouth").performClick()
        waitForText("All Star")
        composeRule.onNodeWithText("All Star").performClick()
        waitForPlay()
        composeRule.onNodeWithText("< Back").performClick()
        waitForText("All Star")
        composeRule.onNodeWithText("Smash Mouth").assertIsDisplayed()
        composeRule.onNodeWithTag(QUIZ_INFO_BUTTON_TEST_TAG).assertDoesNotExist()
    }


    private fun searchAndOpenSong(
        label: String,
        query: String,
        button: String,
        count: Int,
        artists: Boolean = false
    ) {
        val session = SongOctaveOffsetViewModel()
        composeRule.setContent {
            MaterialTheme { MainScreen(db, userDb, session) }
        }
        composeRule.onNodeWithText("Privacy policy").assertDoesNotExist()
        if (artists) {
            composeRule.onNodeWithTag("LibrarySearchScopeArtists").performClick()
        }
        val field = composeRule.onNode(hasSetTextAction() and hasText(label))
        field.performClick().performTextInput(query)
        composeRule.onNodeWithText(button).performClick()
        waitForText("Found $count matches")
        // Clearing input focus releases the keyboard's space for the result list.
        field.assertIsNotFocused()
        composeRule.onNodeWithText("All Star").assertIsDisplayed().performClick()
        waitForText("Arpeggiate")
        composeRule.onNodeWithText("Arpeggiate").assertIsDisplayed()
        composeRule.onNodeWithText("All Star").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Play").assertIsDisplayed()
    }

    private fun waitForPlay() {
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithContentDescription("Play").fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun waitForText(text: String) {
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }
}
