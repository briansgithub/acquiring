package com.acquiring.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Rule
import org.junit.Test

/**
 * Backgrounding the app ends the singing session: the tool is collapsed again by the
 * time the user comes back, so a re-opened app looks like a freshly launched one.
 */
class HummingIntervalLifecycleUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private class FakePitchSource : PitchSource {
        private val flow = MutableStateFlow<MicrophonePitchTracker.PitchResult>(
            MicrophonePitchTracker.PitchResult.NoSignal
        )

        override val pitchFlow: StateFlow<MicrophonePitchTracker.PitchResult> = flow
        override fun start(targetMidi: Int) = Unit
        override fun stop() = Unit
        override fun release() = Unit
    }

    private class FakeLifecycleOwner : LifecycleOwner {
        val registry = LifecycleRegistry.createUnsafe(this)
        override val lifecycle: Lifecycle get() = registry
    }

    private val targetRequest = SingingTargetRequest(
        first = SingingTargetNote(sourceMidi = 60, scaleDegreeLabel = "1̂"),
        second = SingingTargetNote(sourceMidi = 67, scaleDegreeLabel = "5̂"),
        requestId = 1
    )

    @Test
    fun backgroundingCollapsesTheToolUntilANewTargetArrives() {
        val owner = FakeLifecycleOwner()
        composeTestRule.setContent {
            CompositionLocalProvider(LocalLifecycleOwner provides owner) {
                MaterialTheme {
                    HummingIntervalPopup(
                        targetRequest = targetRequest,
                        pitchSource = FakePitchSource(),
                        autoListenOnTargetLoad = false,
                        recordAudioPermissionOverride = true
                    )
                }
            }
        }
        composeTestRule.runOnIdle { owner.registry.currentState = Lifecycle.State.RESUMED }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithContentDescription("Collapse").assertIsDisplayed()

        // ON_PAUSE followed by ON_STOP: the app really went to the background.
        composeTestRule.runOnIdle { owner.registry.currentState = Lifecycle.State.CREATED }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithContentDescription("Expand Humming Tool").assertIsDisplayed()

        // Re-opening leaves it collapsed; only a fresh target request expands it again.
        composeTestRule.runOnIdle { owner.registry.currentState = Lifecycle.State.RESUMED }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithContentDescription("Expand Humming Tool").assertIsDisplayed()
    }
}
