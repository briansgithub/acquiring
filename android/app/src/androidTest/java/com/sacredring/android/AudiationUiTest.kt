package com.sacredring.android

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
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

    @Test
    fun testPuckDragAndDrop() {
        val targets = listOf(
            AudiationTarget(id = 0, label = "1\u0302", untransposedMidi = 60, transposedMidi = 60)
        )
        val fakeSource = FakePitchSource()

        composeTestRule.setContent {
            AudiationPitchPracticeContainer(
                targets = targets,
                onTargetSelected = {},
                onSessionCanceled = {},
                pitchSource = fakeSource
            ) { state, onPositioned ->
                Box(modifier = Modifier
                    .size(100.dp)
                    .onGloballyPositioned { onPositioned(0, it) }
                )
            }
        }

        // Find the puck and drag it to the target
        // The puck starts at Offset.Zero. The target is a 100dp box at the top left.
        // We'll perform a swipe from the puck (home) to the target.
        composeTestRule.onNodeWithContentDescription("Practice puck").performTouchInput {
            swipe(start = Offset.Zero, end = Offset(50f, 50f))
        }

        // After dropping on target, it should transition to Listening
        composeTestRule.onNodeWithContentDescription("Listening to 1\u0302").assertExists()
    }
}
