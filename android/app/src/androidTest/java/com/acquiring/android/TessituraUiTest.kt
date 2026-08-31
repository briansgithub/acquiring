package com.acquiring.android

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
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
    fun targetSlotsRenderVectorScaleDegreesAndAdjustedHints() {
        // Anchored at C3, the pair moves down an octave to C3 and G3.
        setHummingContent(comfortablePitchMidi = 48.0)

        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertExists()
        composeTestRule.onNodeWithContentDescription("Scale degree sharp 4").assertExists()
        composeTestRule.onAllNodes(
            SemanticsMatcher.expectValue(
                SemanticsProperties.StateDescription,
                "Tessitura adjusted"
            ),
            useUnmergedTree = true
        ).assertCountEquals(2)
        composeTestRule.onNodeWithText("Pitch 1").assertDoesNotExist()
        composeTestRule.onNodeWithText("Pitch 2").assertDoesNotExist()
        composeTestRule.onNodeWithTag(SINGING_INTERVAL_RESULT_TEST_TAG).assertIsNotEnabled()
    }

    @Test
    fun anAnchorThatLeavesTheRegisterAloneDoesNotMarkTheSlotsAdjusted() {
        // Anchored at C4, the pair is already in the register it would be moved
        // to, so nothing about it has been adjusted.
        setHummingContent(comfortablePitchMidi = 60.0)

        composeTestRule.onAllNodes(
            SemanticsMatcher.expectValue(
                SemanticsProperties.StateDescription,
                "Original target octave"
            ),
            useUnmergedTree = true
        ).assertCountEquals(2)
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
    fun calibrationCardOpensAndCancelsFromTheTessituraControl() {
        val pitchSource = FakePitchSource()
        composeTestRule.setContent {
            MaterialTheme {
                TessituraControl(
                    comfortablePitchMidi = null,
                    canCalibrate = true,
                    pitchSource = pitchSource,
                    recordAudioPermissionOverride = true
                )
            }
        }
        composeTestRule.mainClock.autoAdvance = false

        composeTestRule.onNodeWithContentDescription(
            "Match target pitch to your comfortable singing tessitura. Hum a note to calibrate. Song and source-object playback are unaffected; target previews follow this setting."
        ).performClick()
        composeTestRule.mainClock.advanceTimeByFrame()
        composeTestRule.onNodeWithTag(TESSITURA_CALIBRATION_MODAL_TEST_TAG).assertExists()
        composeTestRule.onNodeWithTag(TESSITURA_CALIBRATION_CARD_TEST_TAG).assertExists()

        composeTestRule.onNodeWithText("Cancel").performClick()
        composeTestRule.mainClock.advanceTimeByFrame()
        composeTestRule.onNodeWithTag(TESSITURA_CALIBRATION_CARD_TEST_TAG).assertDoesNotExist()
    }

    @Test
    fun pillOffersNothingToClearUntilAPitchHasBeenRecorded() {
        composeTestRule.setContent {
            MaterialTheme {
                TessituraControl(
                    comfortablePitchMidi = null,
                    canCalibrate = true,
                    pitchSource = FakePitchSource(),
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule.onNodeWithText("Set Tessitura").assertExists()
        composeTestRule.onNodeWithText("Clear").assertDoesNotExist()
        composeTestRule.onNodeWithTag(TESSITURA_ACTIVE_DOT_TEST_TAG).assertDoesNotExist()
    }

    @Test
    fun pillShowsTheDotAndClearsTheAnchorOnDemand() {
        val anchor = mutableStateOf<Double?>(57.0) // A3
        composeTestRule.setContent {
            MaterialTheme {
                TessituraControl(
                    comfortablePitchMidi = anchor.value,
                    canCalibrate = true,
                    onClearAdjustment = { anchor.value = null },
                    pitchSource = FakePitchSource(),
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule.onNodeWithTag(TESSITURA_ACTIVE_DOT_TEST_TAG).assertExists()
        composeTestRule.onNodeWithText("Clear").assertExists()

        composeTestRule.onNodeWithContentDescription("Clear tessitura anchor").performClick()
        composeTestRule.runOnIdle { assertEquals(null, anchor.value) }

        composeTestRule.onNodeWithText("Clear").assertDoesNotExist()
        composeTestRule.onNodeWithTag(TESSITURA_ACTIVE_DOT_TEST_TAG).assertDoesNotExist()
    }

    @Test
    fun pillNoLongerOffersTheOctaveStepper() {
        composeTestRule.setContent {
            MaterialTheme {
                TessituraControl(
                    comfortablePitchMidi = 57.0,
                    canCalibrate = true,
                    pitchSource = FakePitchSource(),
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule
            .onNodeWithContentDescription("Raise tessitura shift by one octave")
            .assertDoesNotExist()
        composeTestRule
            .onNodeWithContentDescription("Lower tessitura shift by one octave")
            .assertDoesNotExist()
    }

    @Test
    fun clearingTheTessituraKeepsLoadedTargets() {
        val anchor = mutableStateOf<Double?>(48.0)
        val pitchSource = FakePitchSource()
        composeTestRule.setContent {
            MaterialTheme {
                HummingIntervalPopup(
                    targetRequest = targetRequest,
                    comfortablePitchMidi = anchor.value,
                    pitchSource = pitchSource,
                    autoListenOnTargetLoad = false,
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule.runOnIdle { anchor.value = null }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertExists()
        composeTestRule.onAllNodes(
            SemanticsMatcher.expectValue(
                SemanticsProperties.StateDescription,
                "Original target octave"
            ),
            useUnmergedTree = true
        ).assertCountEquals(2)
    }

    @Test
    fun targetAutoListenStartsOnceAndRetargetsOnlyAfterTheAnchorChanges() {
        val anchor = mutableStateOf<Double?>(null)
        val pitchSource = FakePitchSource()
        composeTestRule.mainClock.autoAdvance = false
        composeTestRule.setContent {
            MaterialTheme {
                HummingIntervalPopup(
                    targetRequest = targetRequest,
                    comfortablePitchMidi = anchor.value,
                    pitchSource = pitchSource,
                    autoListenOnTargetLoad = true,
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule.mainClock.advanceTimeBy(850)
        composeTestRule.runOnIdle { assertEquals(1, pitchSource.startCount) }

        composeTestRule.runOnIdle { anchor.value = 48.0 }
        composeTestRule.mainClock.advanceTimeByFrame()
        composeTestRule.runOnIdle { assertEquals(2, pitchSource.startCount) }
    }

    @Test
    fun doubleTapHintExposesUnadjustedState() {
        composeTestRule.setContent {
            Box { DoubleTapHint(isTessituraAdjusted = false) }
        }

        composeTestRule.onNode(
            SemanticsMatcher.expectValue(
                SemanticsProperties.StateDescription,
                "Original target octave"
            )
        ).assertExists()
    }

    private fun setHummingContent(
        comfortablePitchMidi: Double? = null,
        request: SingingTargetRequest? = targetRequest,
        pitchSource: FakePitchSource = FakePitchSource()
    ) {
        composeTestRule.setContent {
            MaterialTheme {
                HummingIntervalPopup(
                    targetRequest = request,
                    comfortablePitchMidi = comfortablePitchMidi,
                    pitchSource = pitchSource,
                    autoListenOnTargetLoad = false,
                    recordAudioPermissionOverride = true
                )
            }
        }
        composeTestRule.waitForIdle()
    }
}
