package com.acquiring.android

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsEnabled
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
import org.junit.Assert.assertTrue

class PlaybackTransportDockVisibilityUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun assertHomeReferenceHeaderLayout() {
        val note = composeTestRule.onNodeWithTag("PlaybackHomeNote").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val chord = composeTestRule.onNodeWithTag("PlaybackHomeChord").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val lock = composeTestRule.onNodeWithTag(PLAYBACK_LOCK_IN_MAJOR_TEST_TAG).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val key = composeTestRule.onNodeWithTag("PlaybackKeySignature").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue("Home references precede the lock and key", note.right <= chord.left && chord.right <= lock.left && lock.right <= key.left)
        assertTrue("Home references share the key signature row", listOf(chord, lock, key).all { kotlin.math.abs(it.center.y - note.center.y) < 1f })
    }

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        AppAudioOutput.initialize(context)
        AppInstrumentSession.initialize(context)
        PlaybackController.initialize(context)
        PlaybackController.reset()
    }

    @After
    fun tearDown() {
        PlaybackController.pause()
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
                PlaybackDestination(
                    song = song,
                    sections = sections,
                    selectedSectionId = "verse",
                    onSectionChange = {},
                    currentWaveform = currentWaveform,
                    onWaveformChange = {},
                    globalTranspose = 0,
                    playbackTempoPercent = 100f,
                    onPlaybackTempoPercentChange = {},
                    playbackArpeggioOptionIndex = DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,
                    onPlaybackArpeggioOptionIndexChange = {},
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
        composeTestRule.onNodeWithTag(PLAYBACK_INFO_BUTTON_TEST_TAG).assertIsDisplayed()
        composeTestRule.onNodeWithTag(PLAYBACK_MODE_SWITCH_TEST_TAG).assertIsDisplayed()
        composeTestRule.onNodeWithTag(PLAYBACK_SECTION_BUTTON_TEST_TAG).assertIsDisplayed()

        composeTestRule.runOnIdle { dockExpanded = true }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithContentDescription("Play").assertIsDisplayed()
        composeTestRule.onNodeWithTag(PLAYBACK_INFO_BUTTON_TEST_TAG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PLAYBACK_MODE_SWITCH_TEST_TAG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(PLAYBACK_SECTION_BUTTON_TEST_TAG).assertDoesNotExist()
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
                PlaybackDestination(
                    song = song,
                    sections = sections,
                    selectedSectionId = "verse",
                    onSectionChange = {},
                    currentWaveform = currentWaveform,
                    onWaveformChange = {},
                    globalTranspose = 0,
                    playbackTempoPercent = 100f,
                    onPlaybackTempoPercentChange = {},
                    playbackArpeggioOptionIndex = DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,
                    onPlaybackArpeggioOptionIndexChange = {},
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

        composeTestRule.onNodeWithTag(PLAYBACK_MONITOR_PITCH_TEST_TAG).assertIsDisplayed()
        assertHomeReferenceHeaderLayout()
        composeTestRule.onNodeWithTag("PlaybackHomeNote").assertIsDisplayed().performClick()
        composeTestRule.onNodeWithTag("PlaybackHomeChord").assertIsDisplayed().performClick()
        composeTestRule.onNodeWithContentDescription("Pitch monitoring").assertExists()
        composeTestRule.onNodeWithTag(PLAYBACK_MODE_SWITCH_TEST_TAG, useUnmergedTree = true).performClick()
        composeTestRule.onNodeWithText("Full Chords").assertExists()
        composeTestRule.onNodeWithText("Root Only").performClick()
        composeTestRule.onNodeWithText("Previous Root").assertDoesNotExist()
        composeTestRule.onNodeWithText("Current Root").assertExists()
        assertHomeReferenceHeaderLayout()
        composeTestRule.onNodeWithTag("PlaybackHomeNote").assertIsDisplayed().performClick()
        composeTestRule.onNodeWithTag("PlaybackHomeChord").assertIsDisplayed().performClick()
    }

    @Test
    fun queueNavigationRemainsAvailableInExpandedDockAndRespectsBoundaries() {
        var position by mutableStateOf(0)
        var expanded by mutableStateOf(false)
        composeTestRule.setContent {
            MaterialTheme {
                PlaybackTransportBar(
                    showSecondaryRow = !expanded, isFavorite = false, onToggleFavorite = {},
                    currentWaveform = AudioEngine.Waveform.SINE, onWaveformChange = {},
                    transpose = 0, onTransposeChange = {}, onReset = {}, resetEnabled = true,
                    isPlaying = false, playEnabled = true, onPlay = {}, onShowSongInfo = {},
                    isSimpleMode = false, onSimpleModeChange = {},
                    sectionOptions = listOf("verse" to "Verse", "chorus" to "Chorus"),
                    selectedSectionId = "verse", selectedSectionLabel = "Verse", onSectionChange = {},
                    onPreviousSong = { position-- }, onNextSong = { position++ },
                    previousSongEnabled = position > 0, nextSongEnabled = position < 2
                )
            }
        }
        composeTestRule.onNodeWithTag("PlaybackPreviousSong").assertIsDisplayed().assertIsNotEnabled()
        composeTestRule.onNodeWithTag("PlaybackNextSong").assertIsDisplayed().performClick()
        composeTestRule.runOnIdle { assertTrue(position == 1); expanded = true }
        composeTestRule.onNodeWithTag(PLAYBACK_MODE_SWITCH_TEST_TAG).assertDoesNotExist()
        composeTestRule.onNodeWithTag("PlaybackPreviousSong").assertIsDisplayed().assertIsEnabled()
        composeTestRule.onNodeWithTag("PlaybackNextSong").assertIsDisplayed().performClick()
        composeTestRule.onNodeWithTag("PlaybackNextSong").assertIsNotEnabled()
        composeTestRule.onNodeWithTag("PlaybackPreviousSong").performClick()
        composeTestRule.runOnIdle { assertTrue(position == 1) }
    }

    @Test
    fun auralPassageKeepsTheEstablishedChordAndMelodyPlayerLayout() {
        val song = Song(
            slug = "aural-source-song",
            artist = "Test Artist",
            title = "Aural Source Song",
            url = "https://example.test/aural-source-song",
            status = "enriched",
            dataBlob = byteArrayOf()
        )
        composeTestRule.setContent {
            MaterialTheme {
                PlaybackDestination(
                    song = song,
                    sections = linkedMapOf("verse" to section("Verse")),
                    selectedSectionId = "verse",
                    onSectionChange = {},
                    currentWaveform = AudioEngine.Waveform.CLARINET,
                    onWaveformChange = {},
                    globalTranspose = 0,
                    playbackTempoPercent = 100f,
                    onPlaybackTempoPercentChange = {},
                    playbackArpeggioOptionIndex = DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,
                    onPlaybackArpeggioOptionIndexChange = {},
                    onTransposeChange = {},
                    onArtistClick = {},
                    onShowSongInfo = {},
                    onSingingTargetsRequested = {},
                    octaveOffset = 0,
                    persistentPitchSource = FakeExclusivePitchSource(),
                    isFavorite = false,
                    onToggleFavorite = {},
                    onBack = {},
                    initialPassage = 1.0 to 5.0
                )
            }
        }

        composeTestRule.onNodeWithTag(PLAYBACK_SCREEN_TEST_TAG).assertIsDisplayed()
        composeTestRule.onNodeWithText("Melody").assertIsDisplayed()
        composeTestRule.onNodeWithText("Chord").assertIsDisplayed()
        composeTestRule.onNodeWithTag("PlaybackJumpToQuizPassage").assertIsDisplayed()
        composeTestRule.onNodeWithText("Jump to quiz passage").assertDoesNotExist()
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
