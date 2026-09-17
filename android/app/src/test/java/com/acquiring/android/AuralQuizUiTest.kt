package com.acquiring.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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

    @Test fun fivePreferencesApplyNextExerciseAndUnavailablePopularityIsDisabled() {
        val session = AuralSession(Store(), seedFor = { it })
        session.practice("dominant-return", "recall", variantId = "departure")
        val original = session.view().exercise
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {} } }
        compose.onNodeWithTag("AuralExampleSettings").performClick()
        compose.onAllNodes(isToggleable()).assertCountEquals(5)
        compose.onNodeWithTag("AuralFlatList").assertIsOff().performScrollTo().performClick()
        assertTrue(session.exampleSettings.flatList)
        compose.onNodeWithTag("AuralPopularity").assertIsNotEnabled().assertIsOff()
        compose.onNodeWithTag("AuralVariety").assertIsOn().performClick()
        compose.onNodeWithTag("AuralFavorites").assertIsOff().performClick()
        compose.onNodeWithTag("AuralInversions").assertIsOff().performClick()
        assertFalse(session.exampleSettings.variety)
        assertTrue(session.exampleSettings.favorites)
        assertTrue(session.exampleSettings.distinguishInversions)
        assertEquals(original!!.events, session.view().exercise!!.events)
        compose.onNodeWithTag("AuralExampleSettingsBack").performScrollTo().performClick()
        compose.onNodeWithTag("AuralQuiz").assertExists()
    }

    @Test fun missingSongCatalogShowsAnInterstitialInsteadOfRetiredFamilies() {
        val session = AuralSession(Store(), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session) {} } }
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("AuralCatalogInterstitial").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Families").assertDoesNotExist()
        compose.onAllNodesWithTag("AuralFamily-dominant-return").assertCountEquals(0)
    }

    @Test fun songAndSectionAppearImmediatelyWithoutRevealingTheAnswer() {
        val provider = object : AuralExampleProvider {
            override fun example(base: AuralExercise, settings: AuralExampleSettings, context: AuralSelectionContext) = corpusFixture(base, settings)
        }
        val session = AuralSession(Store(), seedFor = { it }, exampleProvider = provider)
        session.practice("dominant-return", "recall", variantId = "departure")
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {} } }
        compose.onNodeWithTag("AuralContinue").performClick()
        compose.onNodeWithTag("AuralSource").assertExists()
        compose.onNodeWithText("Hidden song", substring = true).assertExists()
        compose.onNodeWithTag("AuralEntered").assertDoesNotExist()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        session.view().exercise!!.answer.degrees.forEach { compose.onNodeWithTag("AuralDegree-$it").performScrollTo().performClick() }
        compose.onNodeWithTag("AuralSubmit").performScrollTo().performClick()
        compose.onNodeWithTag("AuralSource").performScrollTo().assertTextContains("Hidden song", substring = true)
    }

    @Test fun sourcePlaybackUsesTheHostRouteAndPreservesTheQuiz() {
        val provider = object : AuralExampleProvider {
            override fun example(base: AuralExercise, settings: AuralExampleSettings, context: AuralSelectionContext) = corpusFixture(base, settings)
        }
        val session = AuralSession(Store(), seedFor = { it }, exampleProvider = provider)
        var opened: AuralSourcePassage? = null
        session.practice("dominant-return", "recall", variantId = "departure")
        compose.setContent { MaterialTheme {
            AuralQuizScreen({}, session, catalogEnabled = false, openFullPlayback = { passage, _ ->
                opened = passage
                true
            })
        } }
        compose.waitForIdle()
        val exerciseId = session.view().exercise!!.id
        compose.onNodeWithTag("AuralContinue").performClick()
        compose.onNodeWithTag("AuralOpenPlayback").performScrollTo().assertIsEnabled().performClick()
        compose.waitUntil(5_000) { opened != null }
        assertEquals("Hidden song", opened!!.title)
        assertEquals(session.view().exercise!!.provenance.corpus!!.passage.sourceId, opened!!.sourceId)
        assertEquals(exerciseId, session.view().exercise!!.id)
        assertTrue(session.view().supported)
    }

    @Test fun failedPlaybackDoesNotMakeAnUnheardPassageFamiliar() {
        val store = Store()
        val provider = object : AuralExampleProvider {
            override fun example(base: AuralExercise, settings: AuralExampleSettings, context: AuralSelectionContext): AuralCorpusProvenance {
                val source = corpusFixture(base, settings)
                return source.copy(familiar = AuralExposureIndex(context.heardSourceIds).contains(source.passage.sourceId))
            }
        }
        val session = AuralSession(store, seedFor = { it }, exampleProvider = provider)
        session.practice("dominant-return", "recall", variantId = "departure")
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) { error("Audio preparation failed") } } }
        compose.onNodeWithTag("AuralContinue").performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        assertFalse(session.view().heard)
        assertEquals(0, session.view().progress.attempts)
        assertTrue(Json.decodeFromString<AuralSavedSession>(store.raw!!).sourceExposures.isEmpty())
        session.practice("dominant-return", "recall", variantId = "departure")
        assertFalse(session.view().exercise!!.previouslyExposed)
    }

    @Test fun threeTabsReplaceSevenAndIntroductionLeadsStraightIntoRecognition() {
        val session = AuralSession(Store(), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {} } }
        compose.onNodeWithTag("AuralFamily-dominant-return").performClick()
        compose.onNodeWithTag("AuralProgression-direct").performClick()
        compose.onAllNodes(isSelectable()).assertCountEquals(3)
        compose.onNodeWithText("Recognize").assertExists()
        compose.onNodeWithText("Recall").assertExists()
        compose.onNodeWithText("Sing").assertExists()
        compose.onNodeWithTag("AuralPhase-guided").assertDoesNotExist()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.onNodeWithTag("AuralSubmit").performScrollTo().performClick()
        compose.onNodeWithTag("AuralMode-recognize").assertIsSelected()
        assertEquals("compare", session.view().exercise!!.skillId)
        assertFalse(session.view().heard)
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        val choice = session.view().exercise!!.answer.optionId!!
        compose.onNodeWithTag("AuralChoice-$choice").performScrollTo().performClick()
        compose.onNodeWithTag("AuralSubmit").performScrollTo().performClick()
        assertEquals(1, AuralCurriculum.cell(session.view().progress, "dominant-return", "compare").practiceCorrect)
    }

    @Test fun sharedSettingsStopsAudioReturnsToSamePhaseAndUsesNewDefault() {
        val session = AuralSession(Store(), seedFor = { it })
        var instrument by mutableStateOf(AudioEngine.Waveform.CLARINET)
        val played = mutableListOf<String>()
        var cancelled = false
        compose.setContent { MaterialTheme {
            AuralQuizScreen({}, session, defaultInstrument = instrument, settingsContent = { close ->
                AppSettingsScreen(instrument, { instrument = it }, "", "", {}, PlayUpdateStatus.entries.first(), {},
                    TimelineFrameRatePreference.STANDARD, {}, {}, {}, close)
            }, catalogEnabled = false) { exercise ->
                played += exercise.instrument
                if (played.size == 1) try { awaitCancellation() } finally { cancelled = true }
            }
        } }
        compose.onNodeWithTag("AuralFamily-dominant-return").performClick()
        compose.onNodeWithTag("AuralProgression-departure").performClick()
        compose.onNodeWithTag("AuralMode-recall").performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.onNodeWithTag("AuralSettings").performClick()
        compose.onNodeWithTag(SETTINGS_SCREEN_TEST_TAG).assertExists()
        compose.onNodeWithTag("AuralQuiz").assertDoesNotExist()
        compose.onNodeWithContentDescription("Default instrument: Marimba").performScrollTo().performClick()
        compose.onNodeWithTag(SETTINGS_BACK_TEST_TAG).performScrollTo().performClick()
        compose.onNodeWithTag("AuralProgressionTitle").assertTextEquals("I → V → I")
        compose.onNodeWithTag("AuralMode-recall").assertIsSelected()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        assertEquals(listOf("CLARINET", "MARIMBA"), played)
        assertTrue(cancelled)
        assertTrue(session.view().heard)
        assertEquals(0, session.view().progress.attempts)
    }

    @Test fun guidedLearnerCanListenAnswerAndMoveToFreshExample() {
        val session = AuralSession(Store(), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {} } }
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
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {} } }
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
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {} } }
        compose.onNodeWithTag("AuralContinue").performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("AuralEntered").assertTextEquals("Your answer")
        compose.onAllNodesWithText(example.guidance, useUnmergedTree = true).assertCountEquals(0)
        compose.onAllNodesWithTag("AuralGuidance", useUnmergedTree = true).assertCountEquals(0)
    }

    @Test fun familyProgressionAndPhaseTabsKeepTheChosenProgressionAcrossExamples() {
        val session = AuralSession(Store(), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {} } }
        compose.onNodeWithTag("AuralFamily-predominant-cadence").performScrollTo().performClick()
        compose.onNodeWithTag("AuralProgression-departure").performScrollTo().performClick()
        compose.onNodeWithTag("AuralProgressionTitle").assertTextEquals("I → ii → V → I")
        compose.onNodeWithTag("AuralMode-recognize").assertIsSelected()
        compose.onNodeWithTag("AuralMode-recall").performClick()
        compose.onNodeWithTag("AuralMode-recall").assertIsSelected()
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
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {
            try { awaitCancellation() } finally { cancelled = true }
        } } }
        compose.onNodeWithTag("AuralFamily-dominant-return").performClick()
        compose.onNodeWithTag("AuralProgression-departure").performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitForIdle()
        for (mode in AuralPracticeModes.modes.drop(1)) {
            compose.onNodeWithTag("AuralMode-${mode.id}").performClick()
            compose.onNodeWithTag("AuralMode-${mode.id}").assertIsSelected()
            assertEquals(mode.id, AuralPracticeModes.forSkill(session.view().exercise!!.skillId).id)
            assertEquals("departure", session.view().exercise!!.variantId)
            assertFalse(session.view().heard)
        }
        assertTrue(cancelled)
        assertEquals(0, session.view().progress.attempts)
    }

    @Test fun advancedSelectedPracticeStillShowsPracticeAndNoAutomaticSolution() {
        val progress = AuralProgress(cells = listOf("recall", "complete", "audiate").associate { "dominant-return:$it" to AuralCell(practice = 4, practiceCorrect = 4) })
        val session = AuralSession(Store(Json.encodeToString(AuralSavedSession(progress = progress))), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {} } }
        compose.onNodeWithTag("AuralFamily-dominant-return").performClick()
        compose.onNodeWithTag("AuralProgression-direct").performClick()
        compose.onNodeWithTag("AuralMode-recall").performClick()
        compose.onNodeWithTag("AuralEvidence").assertTextEquals("Practice")
        compose.onNodeWithTag("AuralGuidance").assertDoesNotExist()
        assertEquals(0, session.view().exercise!!.support)
        assertTrue(session.view().supported)
    }

    @Test fun leavingAdaptiveMidListenCancelsAndContinueRemainsSupported() {
        val session = AuralSession(Store(), seedFor = { it })
        var cancelled = false
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled = false) {
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
