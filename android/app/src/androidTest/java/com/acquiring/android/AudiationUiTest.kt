package com.acquiring.android

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.test.click
import androidx.compose.ui.test.doubleClick
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.junit.Rule
import org.junit.Test

class AudiationUiTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    class FakePitchSource : PitchSource {
        private val _pitchFlow = MutableStateFlow<MicrophonePitchTracker.PitchResult>(MicrophonePitchTracker.PitchResult.NoSignal)
        override val pitchFlow: StateFlow<MicrophonePitchTracker.PitchResult> = _pitchFlow.asStateFlow()
        override fun start(targetMidi: Int) {}
        override fun stop() {}
        override fun release() {}

        fun emit(result: MicrophonePitchTracker.PitchResult) {
            _pitchFlow.value = result
        }
    }

    @OptIn(ExperimentalFoundationApi::class)
    @Test
    fun testDoubleTapScaleDegreeStartsListening() {
        val target = AudiationTarget(id = 0, label = "1̂", untransposedMidi = 60, transposedMidi = 60)
        val fakeSource = FakePitchSource()

        composeTestRule.setContent {
            AudiationPitchPracticeContainer(
                targets = listOf(target),
                onTargetSelected = {},
                onSessionCanceled = {},
                pitchSource = fakeSource
            ) { _, onTargetDoubleTap, _, onTargetPositioned ->
                Box(
                    modifier = Modifier
                        .size(100.dp)
                        .onGloballyPositioned { onTargetPositioned(0, it) }
                        .semantics { contentDescription = "Scale degree target" }
                        .combinedClickable(
                            onClick = {},
                            onDoubleClick = { onTargetDoubleTap(target) }
                        )
                )
            }
        }

        // Double-tapping the scale-degree object should start the singing-back session.
        composeTestRule.onNodeWithContentDescription("Scale degree target").performTouchInput {
            doubleClick()
        }

        composeTestRule.onNodeWithContentDescription("Listening to 1̂").assertExists()
    }

    @OptIn(ExperimentalFoundationApi::class)
    @Test
    fun testTappingOutsideActiveTargetStopsListening() {
        val target = AudiationTarget(id = 0, label = "1̂", untransposedMidi = 60, transposedMidi = 60)
        val fakeSource = FakePitchSource()

        composeTestRule.setContent {
            AudiationPitchPracticeContainer(
                targets = listOf(target),
                onTargetSelected = {},
                onSessionCanceled = {},
                pitchSource = fakeSource
            ) { _, onTargetDoubleTap, _, onTargetPositioned ->
                Column {
                    Box(
                        modifier = Modifier
                            .size(100.dp)
                            .onGloballyPositioned { onTargetPositioned(0, it) }
                            .semantics { contentDescription = "Scale degree target" }
                            .combinedClickable(
                                onClick = {},
                                onDoubleClick = { onTargetDoubleTap(target) }
                            )
                    )
                    Box(
                        modifier = Modifier
                            .size(100.dp)
                            .semantics { contentDescription = "Unrelated button" }
                            .combinedClickable(onClick = {})
                    )
                }
            }
        }

        composeTestRule.onNodeWithContentDescription("Scale degree target").performTouchInput {
            doubleClick()
        }
        composeTestRule.onNodeWithContentDescription("Listening to 1̂").assertExists()

        // Tapping an unrelated element outside the active target's bounds should stop listening.
        composeTestRule.onNodeWithContentDescription("Unrelated button").performTouchInput {
            click()
        }

        composeTestRule.onNodeWithContentDescription("Listening to 1̂").assertDoesNotExist()
    }

    @OptIn(ExperimentalFoundationApi::class)
    @Test
    fun testDoubleTapSameTargetAgainStopsListening() {
        val target = AudiationTarget(id = 0, label = "1̂", untransposedMidi = 60, transposedMidi = 60)
        val fakeSource = FakePitchSource()

        composeTestRule.setContent {
            AudiationPitchPracticeContainer(
                targets = listOf(target),
                onTargetSelected = {},
                onSessionCanceled = {},
                pitchSource = fakeSource
            ) { _, onTargetDoubleTap, _, onTargetPositioned ->
                Box(
                    modifier = Modifier
                        .size(100.dp)
                        .onGloballyPositioned { onTargetPositioned(0, it) }
                        .semantics { contentDescription = "Scale degree target" }
                        .combinedClickable(
                            onClick = {},
                            onDoubleClick = { onTargetDoubleTap(target) }
                        )
                )
            }
        }

        composeTestRule.onNodeWithContentDescription("Scale degree target").performTouchInput {
            doubleClick()
        }
        composeTestRule.onNodeWithContentDescription("Listening to 1̂").assertExists()

        // Double-tapping the same, already-listening object again should toggle it off.
        composeTestRule.onNodeWithContentDescription("Scale degree target").performTouchInput {
            doubleClick()
        }
        composeTestRule.onNodeWithContentDescription("Listening to 1̂").assertDoesNotExist()
    }
}
