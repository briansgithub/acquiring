package com.acquiring.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AuralQuizUiTest {
    @get:Rule val compose = createComposeRule()
    private class Store(var raw: String? = null) : AuralPersistence {
        override fun read() = raw
        override fun write(value: String): Boolean { raw = value; return true }
    }

    @Test fun guidedLearnerCanListenAnswerAndMoveToFreshExample() {
        val session = AuralSession(Store(), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session) {} } }
        compose.onNodeWithTag("AuralQuizTitle").assertTextEquals("Aural Quiz")
        compose.onNodeWithTag("AuralStart").performClick()
        compose.onNodeWithTag("AuralSubmit").assertDoesNotExist()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("AuralSubmit").performScrollTo().performClick()
        compose.onNodeWithTag("AuralNext").performScrollTo().assertIsDisplayed()
        val firstId = session.view().exercise!!.id
        compose.onNodeWithTag("AuralNext").performClick()
        assertNotEquals(firstId, session.view().exercise!!.id)
        assertFalse(session.view().heard)
        assertEquals(0, session.view().progress.cells.values.sumOf { it.independentCorrect })
    }

    @Test fun independentRecallContainsNoAnswerGuidanceInSemanticsUntilRequested() {
        val example = AuralCurriculum.generate(AuralTarget("predominant-cadence", "recall", 0), 492L)
        val store = Store(Json.encodeToString(AuralSavedSession(current = example)))
        val session = AuralSession(store)
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session) {} } }
        // Even unmerged accessibility semantics must not contain a hidden solution.
        compose.onAllNodesWithTag("AuralGuidance", useUnmergedTree = true).assertCountEquals(0)
        compose.onAllNodesWithText(example.guidance, useUnmergedTree = true).assertCountEquals(0)
        compose.onAllNodesWithText(example.fullDegrees.joinToString(" → "), useUnmergedTree = true).assertCountEquals(0)
        compose.onNodeWithText("Show guidance · practice").performScrollTo().performClick()
        compose.onNodeWithTag("AuralGuidance").assertExists()
        assertTrue(session.view().supported)
    }

    @Test fun silentGapQuestionDoesNotRenderMissingChordBeforeAnswer() {
        val example = AuralCurriculum.generate(AuralTarget("secondary-dominant", "audiate", 0), 91L)
        val session = AuralSession(Store(Json.encodeToString(AuralSavedSession(current = example))))
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session) {} } }
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("AuralEntered").assertTextEquals("Your answer")
        compose.onAllNodesWithText(example.guidance, useUnmergedTree = true).assertCountEquals(0)
        compose.onAllNodesWithTag("AuralGuidance", useUnmergedTree = true).assertCountEquals(0)
    }
}
