package com.acquiring.android

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
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
        searchAndOpenSong("Search by Artist", " sMaSh ", "Search Artist", 2)
    }

    @Test
    fun titleSearchShowsResultsAndOpensQuiz() {
        searchAndOpenSong("Search by Title", " ALL STAR ", "Search Title", 1)
    }

    private fun searchAndOpenSong(label: String, query: String, button: String, count: Int) {
        val session = TessituraSessionViewModel()
        composeRule.setContent {
            MaterialTheme { MainScreen(db, userDb, session) }
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
        composeRule.onNodeWithText("Play").assertIsDisplayed()
    }

    private fun waitForText(text: String) {
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }
}
