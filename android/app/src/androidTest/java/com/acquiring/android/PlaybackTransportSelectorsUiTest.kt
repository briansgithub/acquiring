package com.acquiring.android

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.IdlingRegistry
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

class PlaybackTransportSelectorsUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        AppAudioOutput.initialize(context)
        AppInstrumentSession.initialize(context)
        AppInstrumentSession.selectForSession(AudioEngine.Waveform.CLARINET)
        PlaybackController.initialize(context)
        PlaybackController.reset()
    }

    @After
    fun tearDown() {
        PlaybackController.pause()
        AudioEngine.stopAllPlayback()
    }

    @Test
    fun productionPlaybackSelectorsCommitRepeatedlyDuringNormalAndFastPlayback() {
        val sections = linkedMapOf(
            "verse" to section("Verse", 1),
            "chorus" to section("Chorus", 4)
        )
        var song by mutableStateOf(song("first-song", "First Song"))
        var selectedSectionId by mutableStateOf("verse")
        var showingPlayback by mutableStateOf(true)
        var transpose by mutableStateOf(0)
        var tempoPercent by mutableStateOf(100f)
        var arpeggioOptionIndex by mutableStateOf(DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX)
        val pitchSource = FakeExclusivePitchSource()

        composeTestRule.setContent {
            val currentWaveform by AppInstrumentSession.sessionInstrument.collectAsState()
            MaterialTheme {
                Box {
                    PlaybackDestination(
                        song = song,
                        sections = sections,
                        selectedSectionId = selectedSectionId,
                        onSectionChange = { selectedSectionId = it },
                        currentWaveform = currentWaveform,
                        onWaveformChange = AppInstrumentSession::selectForSession,
                        globalTranspose = transpose,
                        playbackTempoPercent = tempoPercent,
                        onPlaybackTempoPercentChange = { tempoPercent = it },
                        playbackArpeggioOptionIndex = arpeggioOptionIndex,
                        onPlaybackArpeggioOptionIndexChange = { arpeggioOptionIndex = it },
                        onTransposeChange = {
                            transpose = it
                            AudioEngine.globalTranspose = it
                        },
                        onArtistClick = {},
                        onShowSongInfo = {
                            PlaybackController.pause()
                            showingPlayback = false
                        },
                        onSingingTargetsRequested = {},
                        octaveOffset = 0,
                        persistentPitchSource = pitchSource,
                        isFavorite = false,
                        onToggleFavorite = {},
                        onBack = { showingPlayback = true }
                    )
                    if (!showingPlayback) {
                        SongDetailView(
                            song = song,
                            sections = sections,
                            selectedSectionId = selectedSectionId,
                            onSectionChange = { selectedSectionId = it },
                            showLetterNames = false,
                            onShowLetterNamesChange = {},
                            onBack = { showingPlayback = true }
                        )
                    }
                }
            }
        }
        waitForPlayback()
        // Playhead StateFlow ticks ~60 fps; Compose's idling resource never goes idle.
        IdlingRegistry.getInstance().resources.toList().forEach { resource ->
            IdlingRegistry.getInstance().unregister(resource)
        }

        clickDescription("Play")
        waitForAdvancingPlayback()

        selectInstrument(AudioEngine.Waveform.WARM_ORGAN)
        assertEquals(AudioEngine.Waveform.WARM_ORGAN, AppInstrumentSession.sessionInstrument.value)
        waitForAdvancingPlayback()

        setDialProgress("Tempo: 100%", 160f)
        assertEquals(160f, tempoPercent)
        selectTranspose(4)
        assertEquals(4, AudioEngine.globalTranspose)
        waitForAdvancingPlayback()

        clickTag(PLAYBACK_MODE_SWITCH_TEST_TAG)
        clickText("Root Only")
        waitForAdvancingPlayback()

        clickTag(PLAYBACK_SECTION_BUTTON_TEST_TAG)
        clickTag("PlaybackSection-chorus")
        assertEquals("chorus", selectedSectionId)
        waitForAdvancingPlayback()

        clickTag(PLAYBACK_INFO_BUTTON_TEST_TAG)
        composeTestRule.runOnUiThread {
            PlaybackController.pause()
            showingPlayback = false
        }
        composeTestRule.waitUntil(5_000) {
            val phase = PlaybackController.state.value.phase
            phase == PlaybackPhase.PAUSED || phase == PlaybackPhase.STOPPED
        }
        assertFalse(PlaybackController.isPlaybackRequested)
        val retainedBeat = PlaybackController.state.value.beat

        clickText("< Back")
        waitForPlayback()
        composeTestRule.waitUntil(5_000) {
            !PlaybackController.isPlaybackRequested &&
                PlaybackController.state.value.phase != PlaybackPhase.PLAYING &&
                PlaybackController.state.value.phase != PlaybackPhase.BUFFERING
        }
        val restoredBeat = PlaybackController.state.value.beat
        assertTrue(
            "info detour moved beat from $retainedBeat to $restoredBeat",
            abs(restoredBeat - retainedBeat) < 0.05
        )

        composeTestRule.runOnUiThread {
            song = song("second-song", "Second Song")
        }
        composeTestRule.waitUntil(5_000) {
            val state = PlaybackController.state.value
            state.phase != PlaybackPhase.PLAYING &&
                state.phase != PlaybackPhase.BUFFERING &&
                abs(state.beat - 1.0) < 0.001
        }
        assertEquals(AudioEngine.Waveform.WARM_ORGAN, AppInstrumentSession.sessionInstrument.value)
        assertFalse(PlaybackController.isPlaybackRequested)

        clickDescription("Play")
        waitForAdvancingPlayback()
        selectInstrument(AudioEngine.Waveform.SINE)
        assertEquals(AudioEngine.Waveform.SINE, AppInstrumentSession.sessionInstrument.value)
        waitForAdvancingPlayback()
    }

    private fun waitForPlayback() {
        composeTestRule.waitUntil(5_000) {
            composeTestRule.onAllNodesWithTag(
                PLAYBACK_INSTRUMENT_BUTTON_TEST_TAG,
                useUnmergedTree = true
            ).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun selectInstrument(instrument: AudioEngine.Waveform) {
        clickTag(PLAYBACK_INSTRUMENT_BUTTON_TEST_TAG)
        clickTag("PlaybackInstrument-${instrument.name}")
    }

    private fun selectTranspose(transpose: Int) {
        clickTag(PLAYBACK_TRANSPOSE_BUTTON_TEST_TAG)
        clickTag("PlaybackTranspose-$transpose")
    }

    // performClick/runOnIdle wait for Compose idle. The playhead publishes ~60 fps,
    // so idle never arrives during playback.
    private fun clickTag(tag: String) {
        invokeClick {
            composeTestRule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes()
        }
    }

    private fun clickText(text: String) {
        invokeClick {
            composeTestRule.onAllNodesWithText(text, useUnmergedTree = true).fetchSemanticsNodes()
        }
    }

    private fun clickDescription(description: String) {
        invokeClick {
            composeTestRule.onAllNodesWithContentDescription(
                description,
                useUnmergedTree = true
            ).fetchSemanticsNodes()
        }
    }

    private fun SemanticsNode.firstClickAction(): (() -> Boolean)? {
        var current: SemanticsNode? = this
        while (current != null) {
            current.config.getOrNull(SemanticsActions.OnClick)?.action?.let { return it }
            current = current.parent
        }
        return null
    }

    private fun invokeClick(nodes: () -> List<SemanticsNode>) {
        composeTestRule.waitUntil(8_000) {
            val action = nodes().firstOrNull()?.firstClickAction() ?: return@waitUntil false
            composeTestRule.runOnUiThread { action() }
            true
        }
    }

    private fun setDialProgress(contentDescription: String, value: Float) {
        composeTestRule.waitUntil(8_000) {
            val action = composeTestRule.onAllNodesWithContentDescription(
                contentDescription,
                useUnmergedTree = true
            ).fetchSemanticsNodes().firstOrNull()
                ?.config
                ?.getOrNull(SemanticsActions.SetProgress)
                ?.action
                ?: return@waitUntil false
            composeTestRule.runOnUiThread { action(value) }
            true
        }
    }

    private fun waitForAdvancingPlayback() {
        val deadline = System.currentTimeMillis() + 8_000
        var markedBeat: Double? = null
        while (System.currentTimeMillis() < deadline) {
            val state = PlaybackController.state.value
            if (state.phase == PlaybackPhase.PLAYING) {
                val start = markedBeat
                if (start == null || state.beat + 0.001 < start) {
                    // First PLAYING sample, or a section reload jumped back to the top.
                    markedBeat = state.beat
                } else if (abs(state.beat - start) > 0.05) {
                    return
                }
            } else {
                markedBeat = null
            }
            Thread.sleep(20)
        }
        val state = PlaybackController.state.value
        throw AssertionError(
            "playback did not advance (phase=${state.phase}, beat=${state.beat}, marked=$markedBeat)"
        )
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
