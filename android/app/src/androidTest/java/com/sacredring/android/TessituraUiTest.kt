package com.sacredring.android

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
        first = SingingTargetNote(sourceMidi = 60, scaleDegreeLabel = "\u266D3\u0302"),
        second = SingingTargetNote(sourceMidi = 67, scaleDegreeLabel = "\u266F4\u0302"),
        requestId = 1
    )

    @Test
    fun targetSlotsRenderVectorScaleDegreesAndAdjustedHints() {
        setHummingContent(octaveShift = 1)

        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertExists()
        composeTestRule.onNodeWithContentDescription("Scale degree sharp 4").assertExists()
        composeTestRule.onAllNodes(
            SemanticsMatcher.expectValue(
                SemanticsProperties.StateDescription,
                "Tessitura adjusted"
            )
        ).assertCountEquals(2)
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
                first = SingingTargetNote(60, "1\u0302"),
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
                    octaveShift = 0,
                    canCalibrate = true,
                    pitchSource = pitchSource,
                    recordAudioPermissionOverride = true
                )
            }
        }
        composeTestRule.mainClock.autoAdvance = false

        composeTestRule.onNodeWithText("Set Tessitura").performClick()
        composeTestRule.onNodeWithTag(TESSITURA_CALIBRATION_MODAL_TEST_TAG).assertExists()
        composeTestRule.onNodeWithTag(TESSITURA_CALIBRATION_CARD_TEST_TAG).assertExists()

        composeTestRule.onNodeWithText("Cancel").performClick()
        composeTestRule.onNodeWithTag(TESSITURA_CALIBRATION_CARD_TEST_TAG).assertDoesNotExist()
    }

    @Test
    fun tessituraControlOctaveSelectorReportsShifts() {
        val shift = mutableStateOf(0)
        composeTestRule.setContent {
            MaterialTheme {
                TessituraControl(
                    octaveShift = shift.value,
                    canCalibrate = true,
                    onOctaveShiftChange = { shift.value = it },
                    pitchSource = FakePitchSource(),
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule.onNodeWithContentDescription("Raise tessitura shift by one octave").performClick()
        composeTestRule.runOnIdle { assertEquals(1, shift.value) }
        composeTestRule.onNodeWithContentDescription(
            "Tessitura shifted 1 octaves from the song's actual pitch"
        ).assertExists()

        composeTestRule.onNodeWithContentDescription("Lower tessitura shift by one octave").performClick()
        composeTestRule.onNodeWithContentDescription("Lower tessitura shift by one octave").performClick()
        composeTestRule.runOnIdle { assertEquals(-1, shift.value) }
    }

    @Test
    fun clearingTheShiftKeepsLoadedTargets() {
        val shift = mutableStateOf(1)
        val pitchSource = FakePitchSource()
        composeTestRule.setContent {
            MaterialTheme {
                HummingIntervalPopup(
                    targetRequest = targetRequest,
                    octaveShift = shift.value,
                    pitchSource = pitchSource,
                    autoListenOnTargetLoad = false,
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule.runOnIdle { shift.value = 0 }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithContentDescription("Scale degree flat 3").assertExists()
        composeTestRule.onAllNodes(
            SemanticsMatcher.expectValue(
                SemanticsProperties.StateDescription,
                "Original target octave"
            )
        ).assertCountEquals(2)
    }

    @Test
    fun targetAutoListenStartsOnceAndRetargetsOnlyAfterShiftChanges() {
        val shift = mutableStateOf(0)
        val pitchSource = FakePitchSource()
        composeTestRule.mainClock.autoAdvance = false
        composeTestRule.setContent {
            MaterialTheme {
                HummingIntervalPopup(
                    targetRequest = targetRequest,
                    octaveShift = shift.value,
                    pitchSource = pitchSource,
                    autoListenOnTargetLoad = true,
                    recordAudioPermissionOverride = true
                )
            }
        }

        composeTestRule.mainClock.advanceTimeBy(850)
        composeTestRule.runOnIdle { assertEquals(1, pitchSource.startCount) }

        composeTestRule.runOnIdle { shift.value = 1 }
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
        octaveShift: Int = 0,
        request: SingingTargetRequest? = targetRequest,
        pitchSource: FakePitchSource = FakePitchSource()
    ) {
        composeTestRule.setContent {
            MaterialTheme {
                HummingIntervalPopup(
                    targetRequest = request,
                    octaveShift = octaveShift,
                    pitchSource = pitchSource,
                    autoListenOnTargetLoad = false,
                    recordAudioPermissionOverride = true
                )
            }
        }
        composeTestRule.waitForIdle()
    }
}
