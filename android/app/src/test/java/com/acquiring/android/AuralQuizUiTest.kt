package com.acquiring.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.coroutines.awaitCancellation
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
        compose.onNodeWithTag("AuralContinue").performClick()
        // Even unmerged accessibility semantics must not contain a hidden solution.
        compose.onAllNodesWithTag("AuralGuidance", useUnmergedTree = true).assertCountEquals(0)
        compose.onAllNodesWithText(example.guidance, useUnmergedTree = true).assertCountEquals(0)
        compose.onAllNodesWithText(example.fullDegrees.joinToString(" → "), useUnmergedTree = true).assertCountEquals(0)
        compose.onNodeWithTag("AuralProgressionTitle").assertDoesNotExist()
        compose.onNodeWithTag("AuralHint").performScrollTo().performClick()
        compose.onNodeWithTag("AuralGuidance").assertExists()
        assertTrue(session.view().supported)
    }

    @Test fun silentGapQuestionDoesNotRenderMissingChordBeforeAnswer() {
        val example = AuralCurriculum.generate(AuralTarget("secondary-dominant", "audiate", 0), 91L)
        val session = AuralSession(Store(Json.encodeToString(AuralSavedSession(current = example))))
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session) {} } }
        compose.onNodeWithTag("AuralContinue").performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("AuralEntered").assertTextEquals("Your answer")
        compose.onAllNodesWithText(example.guidance, useUnmergedTree = true).assertCountEquals(0)
        compose.onAllNodesWithTag("AuralGuidance", useUnmergedTree = true).assertCountEquals(0)
    }

    @Test fun familyProgressionAndPhaseTabsKeepTheChosenProgressionAcrossExamples() {
        val session = AuralSession(Store(), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session) {} } }
        compose.onNodeWithTag("AuralFamily-predominant-cadence").performScrollTo().performClick()
        compose.onNodeWithTag("AuralProgression-departure").performScrollTo().performClick()
        compose.onNodeWithTag("AuralProgressionTitle").assertTextEquals("I → ii → V → I")
        compose.onNodeWithTag("AuralPhase-guided").assertIsSelected()
        compose.onNodeWithTag("AuralPhase-recall").performScrollTo().performClick()
        compose.onNodeWithTag("AuralPhase-recall").assertIsSelected()
        assertEquals("recall", session.view().exercise!!.skillId)
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        for (degree in listOf("I", "ii", "V", "I")) {
            compose.onNodeWithTag("AuralDegree-$degree").performScrollTo().performClick()
        }
        compose.onNodeWithTag("AuralSubmit").performScrollTo().performClick()
        val first = session.view().exercise!!.id
        compose.onNodeWithTag("AuralNext").performScrollTo().performClick()
        assertNotEquals(first, session.view().exercise!!.id)
        assertEquals("departure", session.view().exercise!!.variantId)
        assertEquals("recall", session.view().exercise!!.skillId)
        assertEquals(0, session.view().progress.cells.values.sumOf { it.independentAttempts })
        compose.onNodeWithTag("AuralBack").performClick()
        compose.onNodeWithTag("AuralProgression-supertonic").assertExists()
        compose.onNodeWithTag("AuralBack").performClick()
        compose.onNodeWithTag("AuralFamily-dominant-return").assertExists()
    }

    @Test fun everyPhaseIsReachableAndChangingTabCancelsPlaybackWithoutGrading() {
        val session = AuralSession(Store(), seedFor = { it })
        var cancelled = false
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session) {
            try { awaitCancellation() } finally { cancelled = true }
        } } }
        compose.onNodeWithTag("AuralFamily-dominant-return").performClick()
        compose.onNodeWithTag("AuralProgression-departure").performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        for (skill in AuralCurriculum.skills.drop(1)) {
            compose.onNodeWithTag("AuralPhase-${skill.id}").performScrollTo().performClick()
            compose.onNodeWithTag("AuralPhase-${skill.id}").assertIsSelected()
            assertEquals(skill.id, session.view().exercise!!.skillId)
            assertEquals("departure", session.view().exercise!!.variantId)
            assertFalse(session.view().heard)
        }
        assertTrue(cancelled)
        assertEquals(0, session.view().progress.attempts)
    }

    @Test fun advancedSelectedPracticeStillShowsPracticeAndNoAutomaticSolution() {
        val progress = AuralProgress(cells = mapOf("dominant-return:recall" to AuralCell(practice = 4, practiceCorrect = 4)))
        val session = AuralSession(Store(Json.encodeToString(AuralSavedSession(progress = progress))), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session) {} } }
        compose.onNodeWithTag("AuralFamily-dominant-return").performClick()
        compose.onNodeWithTag("AuralProgression-direct").performClick()
        compose.onNodeWithTag("AuralPhase-recall").performScrollTo().performClick()
        compose.onNodeWithTag("AuralEvidence").assertTextEquals("Practice")
        compose.onNodeWithTag("AuralGuidance").assertDoesNotExist()
        assertEquals(0, session.view().exercise!!.support)
        assertTrue(session.view().supported)
    }

    @Test fun leavingAdaptiveMidListenCancelsAndContinueRemainsSupported() {
        val session = AuralSession(Store(), seedFor = { it })
        var cancelled = false
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session) {
            try { awaitCancellation() } finally { cancelled = true }
        } } }
        compose.onNodeWithTag("AuralStart").performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("AuralBack").performClick()
        compose.onNodeWithTag("AuralContinue").performScrollTo().performClick()
        assertTrue(cancelled)
        assertFalse(session.view().heard)
        assertTrue(session.view().supported)
        assertEquals(0, session.view().progress.attempts)
    }
}
