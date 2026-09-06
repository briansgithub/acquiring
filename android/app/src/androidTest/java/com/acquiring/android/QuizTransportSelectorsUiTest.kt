package com.acquiring.android

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import kotlin.math.abs

class QuizTransportSelectorsUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        AppAudioOutput.initialize(context)
        AppInstrumentSession.initialize(context)
        AppInstrumentSession.selectForSession(AudioEngine.Waveform.SAWTOOTH)
        QuizPlaybackController.initialize(context)
        QuizPlaybackController.reset()
    }

    @After
    fun tearDown() {
        QuizPlaybackController.pause()
        AudioEngine.stopAllPlayback()
    }

    @Test
    fun productionQuizSelectorsCommitRepeatedlyDuringNormalAndFastPlayback() {
        val sections = linkedMapOf(
            "verse" to section("Verse", 1),
            "chorus" to section("Chorus", 4)
        )
        var song by mutableStateOf(song("first-song", "First Song"))
        var selectedSectionId by mutableStateOf("verse")
        var currentTab by mutableStateOf(2)
        var transpose by mutableStateOf(0)
        var tempoPercent by mutableStateOf(100f)
        var arpeggioOptionIndex by mutableStateOf(DEFAULT_QUIZ_ARPEGGIO_OPTION_INDEX)
        val pitchSource = FakeExclusivePitchSource()

        composeTestRule.setContent {
            val currentWaveform by AppInstrumentSession.sessionInstrument.collectAsState()
            MaterialTheme {
                SongDetailView(
                    song = song,
                    sections = sections,
                    selectedSectionId = selectedSectionId,
                    onSectionChange = { selectedSectionId = it },
                    currentTab = currentTab,
                    onTabChange = { currentTab = it },
                    showLetterNames = false,
                    onShowLetterNamesChange = {},
                    isArpeggiated = false,
                    onArpeggiatedChange = {},
                    arpeggioStepMs = 160f,
                    onArpeggioStepMsChange = {},
                    currentWaveform = currentWaveform,
                    onWaveformChange = AppInstrumentSession::selectForSession,
                    globalTranspose = transpose,
                    quizTempoPercent = tempoPercent,
                    onQuizTempoPercentChange = { tempoPercent = it },
                    quizArpeggioOptionIndex = arpeggioOptionIndex,
                    onQuizArpeggioOptionIndexChange = { arpeggioOptionIndex = it },
                    onTransposeChange = {
                        transpose = it
                        AudioEngine.globalTranspose = it
                    },
                    quizPlayButtonXFraction = Float.NaN,
                    quizPlayButtonYFraction = Float.NaN,
                    onQuizPlayButtonPositionChange = { _, _ -> },
                    onArtistClick = {},
                    onSingingTargetsRequested = {},
                    comfortablePitchMidi = null,
                    lastSourceMidi = null,
                    lastTargetMidi = null,
                    onUpdateContinuity = { _, _ -> },
                    tessituraControl = {},
                    persistentPitchSource = pitchSource,
                    isFavorite = false,
                    onToggleFavorite = {},
                    onBack = { currentTab = 0 }
                )
            }
        }
        waitForQuiz()

        composeTestRule.onNodeWithText("Play").performClick()
        waitForAdvancingPlayback()

        selectInstrument(AudioEngine.Waveform.WARM_ORGAN)
        assertEquals(AudioEngine.Waveform.WARM_ORGAN, AppInstrumentSession.sessionInstrument.value)
        waitForAdvancingPlayback()

        composeTestRule.onNodeWithContentDescription("Tempo: 100%", useUnmergedTree = true)
            .performSemanticsAction(SemanticsActions.SetProgress) { setProgress ->
                assertTrue(setProgress(160f))
            }
        composeTestRule.runOnIdle { assertEquals(160f, tempoPercent) }
        selectTranspose(4)
        assertEquals(4, AudioEngine.globalTranspose)
        waitForAdvancingPlayback()

        composeTestRule.onNodeWithTag(QUIZ_MODE_SWITCH_TEST_TAG, useUnmergedTree = true)
            .performScrollTo()
            .performClick()
        waitForAdvancingPlayback()

        composeTestRule.onNodeWithTag(QUIZ_SECTION_BUTTON_TEST_TAG, useUnmergedTree = true)
            .performScrollTo()
            .performClick()
        composeTestRule.onNodeWithTag("QuizSection-chorus", useUnmergedTree = true)
            .performScrollTo()
            .performClick()
        composeTestRule.runOnIdle { assertEquals("chorus", selectedSectionId) }
        waitForAdvancingPlayback()

        composeTestRule.onNodeWithText("< Back").performClick()
        composeTestRule.waitUntil(5_000) {
            QuizPlaybackController.state.value.phase == QuizPlaybackPhase.PAUSED
        }
        assertFalse(QuizPlaybackController.isPlaybackRequested)
        val retainedBeat = QuizPlaybackController.state.value.beat

        composeTestRule.onNodeWithText("Quiz").performClick()
        waitForQuiz()
        assertFalse(QuizPlaybackController.isPlaybackRequested)
        assertTrue(abs(QuizPlaybackController.state.value.beat - retainedBeat) < 0.001)

        composeTestRule.runOnIdle {
            song = song("second-song", "Second Song")
        }
        composeTestRule.waitUntil(5_000) {
            val state = QuizPlaybackController.state.value
            state.phase != QuizPlaybackPhase.PLAYING &&
                state.phase != QuizPlaybackPhase.BUFFERING &&
                abs(state.beat - 1.0) < 0.001
        }
        assertEquals(AudioEngine.Waveform.WARM_ORGAN, AppInstrumentSession.sessionInstrument.value)
        assertFalse(QuizPlaybackController.isPlaybackRequested)

        composeTestRule.onNodeWithText("Play").performClick()
        waitForAdvancingPlayback()
        selectInstrument(AudioEngine.Waveform.SINE)
        assertEquals(AudioEngine.Waveform.SINE, AppInstrumentSession.sessionInstrument.value)
        waitForAdvancingPlayback()
    }

    private fun waitForQuiz() {
        composeTestRule.waitUntil(5_000) {
            composeTestRule.onAllNodesWithTag(
                QUIZ_INSTRUMENT_BUTTON_TEST_TAG,
                useUnmergedTree = true
            ).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun selectInstrument(instrument: AudioEngine.Waveform) {
        composeTestRule.onNodeWithTag(QUIZ_INSTRUMENT_BUTTON_TEST_TAG, useUnmergedTree = true)
            .performScrollTo()
            .performClick()
        composeTestRule.onNodeWithTag(
            "QuizInstrument-${instrument.name}",
            useUnmergedTree = true
        ).performScrollTo().performClick()
    }

    private fun selectTranspose(transpose: Int) {
        composeTestRule.onNodeWithTag(QUIZ_TRANSPOSE_BUTTON_TEST_TAG, useUnmergedTree = true)
            .performScrollTo()
            .performClick()
        composeTestRule.onNodeWithTag("QuizTranspose-$transpose", useUnmergedTree = true)
            .performScrollTo()
            .performClick()
    }

    private fun waitForAdvancingPlayback() {
        composeTestRule.waitUntil(8_000) {
            QuizPlaybackController.state.value.phase == QuizPlaybackPhase.PLAYING
        }
        val startingBeat = QuizPlaybackController.state.value.beat
        composeTestRule.waitUntil(8_000) {
            val state = QuizPlaybackController.state.value
            state.phase == QuizPlaybackPhase.PLAYING && abs(state.beat - startingBeat) > 0.05
        }
    }

    private fun song(slug: String, title: String) = Song(
        slug = slug,
        artist = "Test Artist",
        title = title,
        url = "https://example.test/$slug",
        status = "enriched",
        dataBlob = byteArrayOf()
    )

    private fun section(name: String, root: Int): ExtractedSection = Json.decodeFromString(
        """
        {
          "sectionName": "$name",
          "sectionIndex": ${if (name == "Verse") 0 else 1},
          "chords": [{"root": $root, "beat": 1, "duration": 16}],
          "notes": [{"sd": "1", "beat": 1, "duration": 16, "octave": 0}],
          "metadata": {
            "endBeat": 17,
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

        override val pitchFlow: StateFlow<MicrophonePitchTracker.PitchResult> = pitch.asStateFlow()
        override val ownsMicrophone: StateFlow<Boolean> = ownership.asStateFlow()

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
