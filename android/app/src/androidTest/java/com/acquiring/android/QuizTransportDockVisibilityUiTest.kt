package com.acquiring.android

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class QuizTransportDockVisibilityUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        AppAudioOutput.initialize(context)
        AppInstrumentSession.initialize(context)
        QuizPlaybackController.initialize(context)
        QuizPlaybackController.reset()
    }

    @After
    fun tearDown() {
        QuizPlaybackController.pause()
        AudioEngine.stopAllPlayback()
    }

    @Test
    fun expandingSingingDockHidesSecondaryTransportRow() {
        val sections = linkedMapOf(
            "verse" to section("Verse"),
            "chorus" to section("Chorus")
        )
        val song = Song(
            slug = "dock-song",
            artist = "Test Artist",
            title = "Dock Song",
            url = "https://example.test/dock-song",
            status = "enriched",
            dataBlob = byteArrayOf()
        )
        var dockExpanded by mutableStateOf(false)
        composeTestRule.setContent {
            val currentWaveform by AppInstrumentSession.sessionInstrument.collectAsState()
            MaterialTheme {
                QuizDestination(
                    song = song,
                    sections = sections,
                    selectedSectionId = "verse",
                    onSectionChange = {},
                    currentWaveform = currentWaveform,
                    onWaveformChange = {},
                    globalTranspose = 0,
                    quizTempoPercent = 100f,
                    onQuizTempoPercentChange = {},
                    quizArpeggioOptionIndex = DEFAULT_QUIZ_ARPEGGIO_OPTION_INDEX,
                    onQuizArpeggioOptionIndexChange = {},
                    onTransposeChange = {},
                    onArtistClick = {},
                    onShowSongInfo = {},
                    onSingingTargetsRequested = {},
                    octaveOffset = 0,
                    persistentPitchSource = FakeExclusivePitchSource(),
                    isFavorite = false,
                    onToggleFavorite = {},
                    onBack = {},
                    singingDockExpanded = dockExpanded
                )
            }
        }

        composeTestRule.onNodeWithContentDescription("Play").assertIsDisplayed()
        composeTestRule.onNodeWithTag(QUIZ_INFO_BUTTON_TEST_TAG).assertIsDisplayed()
        composeTestRule.onNodeWithTag(QUIZ_MODE_SWITCH_TEST_TAG).assertIsDisplayed()
        composeTestRule.onNodeWithTag(QUIZ_SECTION_BUTTON_TEST_TAG).assertIsDisplayed()

        composeTestRule.runOnIdle { dockExpanded = true }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithContentDescription("Play").assertIsDisplayed()
        composeTestRule.onNodeWithTag(QUIZ_INFO_BUTTON_TEST_TAG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(QUIZ_MODE_SWITCH_TEST_TAG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(QUIZ_SECTION_BUTTON_TEST_TAG).assertDoesNotExist()
    }

    @Test
    fun headerMicAndModeMenuMatchIosLabels() {
        val sections = linkedMapOf("verse" to section("Verse"))
        val song = Song(
            slug = "monitor-song",
            artist = "Test Artist",
            title = "Monitor Song",
            url = "https://example.test/monitor-song",
            status = "enriched",
            dataBlob = byteArrayOf()
        )
        composeTestRule.setContent {
            val currentWaveform by AppInstrumentSession.sessionInstrument.collectAsState()
            MaterialTheme {
                QuizDestination(
                    song = song,
                    sections = sections,
                    selectedSectionId = "verse",
                    onSectionChange = {},
                    currentWaveform = currentWaveform,
                    onWaveformChange = {},
                    globalTranspose = 0,
                    quizTempoPercent = 100f,
                    onQuizTempoPercentChange = {},
                    quizArpeggioOptionIndex = DEFAULT_QUIZ_ARPEGGIO_OPTION_INDEX,
                    onQuizArpeggioOptionIndexChange = {},
                    onTransposeChange = {},
                    onArtistClick = {},
                    onShowSongInfo = {},
                    onSingingTargetsRequested = {},
                    octaveOffset = 0,
                    persistentPitchSource = FakeExclusivePitchSource(),
                    isFavorite = false,
                    onToggleFavorite = {},
                    onBack = {}
                )
            }
        }

        composeTestRule.onNodeWithTag(QUIZ_MONITOR_PITCH_TEST_TAG).assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Pitch monitoring").assertExists()
        composeTestRule.onNodeWithTag(QUIZ_MODE_SWITCH_TEST_TAG, useUnmergedTree = true).performClick()
        composeTestRule.onNodeWithText("Full Chords").assertExists()
        composeTestRule.onNodeWithText("Root Only").performClick()
        composeTestRule.onNodeWithText("Previous Root").assertExists()
        composeTestRule.onNodeWithText("Current Root").assertExists()
    }

    private fun section(name: String): ExtractedSection = Json.decodeFromString(
        """
        {
          "sectionName": "$name",
          "sectionIndex": 0,
          "chords": [{"root": 1, "beat": 1, "duration": 8}],
          "notes": [{"sd": "1", "beat": 1, "duration": 8, "octave": 0}],
          "metadata": {
            "endBeat": 9,
            "keys": [{"tonic": "C", "scale": "major", "beat": 1}],
            "tempos": [{"bpm": 120}]
          }
        }
        """.trimIndent()
    )

    private class FakeExclusivePitchSource : ExclusivePitchSource {
        private val pitch = MutableStateFlow<MicrophonePitchTracker.PitchResult>(
            MicrophonePitchTracker.PitchResult.NoSignal
        )
        private val ownership = MutableStateFlow(false)

        override val pitchFlow: StateFlow<MicrophonePitchTracker.PitchResult> = pitch
        override val ownsMicrophone: StateFlow<Boolean> = ownership

        override fun claim(trackingMode: PitchTrackingMode) {
            ownership.value = true
        }

        override fun start(targetMidi: Int) = Unit
        override fun retarget(targetMidi: Int) = Unit
        override fun stop() {
            ownership.value = false
        }

        override fun release() = stop()
    }
}
