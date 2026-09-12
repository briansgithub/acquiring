package com.acquiring.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class TessituraUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private class FakePitchSource : PitchSource {
        private val flow = MutableStateFlow<MicrophonePitchTracker.PitchResult>(
            MicrophonePitchTracker.PitchResult.NoSignal
        )

        override val pitchFlow: StateFlow<MicrophonePitchTracker.PitchResult> = flow
        var startCount = 0
            private set

        override fun start(targetMidi: Int) {
            startCount++
        }
        override fun stop() = Unit
        override fun release() = Unit
    }

    private val targetRequest = SingingTargetRequest(
        first = SingingTargetNote(sourceMidi = 60, scaleDegreeLabel = "♭3̂"),
        second = SingingTargetNote(sourceMidi = 67, scaleDegreeLabel = "♯4̂"),
        requestId = 1
    )

    @Test
    fun targetSlotsRenderVectorScaleDegrees() {
        setHummingContent(octaveOffset = -1)

        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertExists()
        composeTestRule.onNodeWithContentDescription("Scale degree sharp 4").assertExists()
        composeTestRule.onNodeWithText("Pitch 1").assertDoesNotExist()
        composeTestRule.onNodeWithText("Pitch 2").assertDoesNotExist()
        composeTestRule.onNodeWithTag(SINGING_INTERVAL_RESULT_TEST_TAG).assertIsNotEnabled()
    }

    @Test
    fun emptyTargetsUseBlankLabels() {
        setHummingContent(request = null)
        composeTestRule.onNodeWithText("Pitch 1").assertDoesNotExist()
        composeTestRule.onNodeWithText("Pitch 2").assertDoesNotExist()
        composeTestRule.onNodeWithContentDescription("Scale degree 1").assertDoesNotExist()
    }

    @Test
    fun naturalTargetUsesVectorLabel() {
        setHummingContent(
            request = SingingTargetRequest(
                first = SingingTargetNote(60, "1̂"),
                second = null,
                requestId = 2
            )
        )
        composeTestRule.onNodeWithContentDescription("Scale degree 1").assertExists()
    }

    @Test
    fun targetStateRemainsVisibleUntilCollapseAnimationFinishes() {
        composeTestRule.mainClock.autoAdvance = false
        setHummingContent()
        composeTestRule.mainClock.advanceTimeBy(350)

        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertExists()
        composeTestRule.onNodeWithContentDescription("Collapse").performClick()
        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertExists()

        composeTestRule.mainClock.advanceTimeBy(250)
        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertExists()

        composeTestRule.mainClock.advanceTimeBy(100)
        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertDoesNotExist()

        composeTestRule.onNodeWithContentDescription("Expand Humming Tool").performClick()
        composeTestRule.mainClock.advanceTimeBy(350)
        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertDoesNotExist()
    }

    @Test
    fun dockOffersSignedOctaveOffsetWithoutAPermanentStop() {
        setHummingContent(autoListen = false)
        composeTestRule.onNodeWithTag(SINGING_STOP_TEST_TAG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(SINGING_PERSISTENT_STOP_TEST_TAG).assertDoesNotExist()
        composeTestRule.onNodeWithTag(SINGING_OCTAVE_SHIFTER_TEST_TAG, useUnmergedTree = true)
            .assertExists()
        composeTestRule.onNodeWithContentDescription("Octave offset").assertExists()
        composeTestRule.onNodeWithText("0", useUnmergedTree = true).assertExists()
        composeTestRule.onNodeWithContentDescription("Lower singing octave").assertExists()
        composeTestRule.onNodeWithContentDescription("Raise singing octave").assertExists()
        composeTestRule.onAllNodesWithContentDescription("Record").assertCountEquals(0)
    }

    @Test
    fun changingOffsetKeepsLoadedTargetsAndShowsASignedLabel() {
        val offset = mutableStateOf(0)
        val pitchSource = FakePitchSource()
        composeTestRule.setContent {
            MaterialTheme {
                HummingIntervalPopup(
                    targetRequest = targetRequest,
                    octaveOffset = offset.value,
                    onOctaveOffsetChange = { offset.value = it },
                    pitchSource = pitchSource,
                    autoListenOnTargetLoad = false,
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule.onNodeWithContentDescription("Lower singing octave").performClick()
        composeTestRule.runOnIdle { assertEquals(-1, offset.value) }
        composeTestRule.onNodeWithText("-1", useUnmergedTree = true).assertExists()
        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertExists()
    }

    @Test
    fun targetAutoListenStartsOnceAndRetargetsOnlyAfterTheOffsetChanges() {
        val offset = mutableStateOf(0)
        val pitchSource = FakePitchSource()
        composeTestRule.mainClock.autoAdvance = false
        composeTestRule.setContent {
            MaterialTheme {
                HummingIntervalPopup(
                    targetRequest = targetRequest,
                    octaveOffset = offset.value,
                    pitchSource = pitchSource,
                    autoListenOnTargetLoad = true,
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule.mainClock.advanceTimeBy(850)
        composeTestRule.runOnIdle { assertEquals(1, pitchSource.startCount) }

        composeTestRule.runOnIdle { offset.value = -1 }
        composeTestRule.mainClock.advanceTimeByFrame()
        composeTestRule.runOnIdle { assertEquals(2, pitchSource.startCount) }
    }

    @Test
    fun collapsedDockShowsPersistentStopOnlyWhileMonitoring() {
        setHummingContent(request = null, persistentMonitoring = true)
        composeTestRule.onNodeWithTag(SINGING_PERSISTENT_STOP_TEST_TAG).assertExists()
        composeTestRule.onNodeWithTag(SINGING_STOP_TEST_TAG).assertDoesNotExist()
    }

    private fun setHummingContent(
        octaveOffset: Int = 0,
        request: SingingTargetRequest? = targetRequest,
        pitchSource: FakePitchSource = FakePitchSource(),
        autoListen: Boolean = false,
        persistentMonitoring: Boolean = false
    ) {
        composeTestRule.setContent {
            MaterialTheme {
                HummingIntervalPopup(
                    targetRequest = request,
                    octaveOffset = octaveOffset,
                    pitchSource = pitchSource,
                    autoListenOnTargetLoad = autoListen,
                    recordAudioPermissionOverride = true,
                    isPersistentMonitoring = persistentMonitoring
                )
            }
        }
        composeTestRule.waitForIdle()
    }
}
