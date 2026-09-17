package com.acquiring.android

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/** Uses actual device audio, while keeping the learner's saved progress untouched. */
class AuralQuizDeviceTest {
    @get:Rule val compose = createComposeRule()
    private class Store : AuralPersistence {
        override fun read(): String? = null
        override fun write(value: String) = true
    }

    @Before fun initializeAudio() {
        AppAudioOutput.initialize(ApplicationProvider.getApplicationContext<Context>())
    }

    @Test fun progressionPlaysToCompletionAndNextRetainsTheChosenVariant() {
        val session = AuralSession(Store(), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled=false) } }
        compose.onNodeWithTag("AuralFamily-dominant-return").performScrollTo().performClick()
        compose.onNodeWithTag("AuralProgression-departure").performScrollTo().performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.waitUntil(20_000) { session.view().heard }
        compose.onNodeWithTag("AuralSubmit").performScrollTo().performClick()
        assertEquals("departure", session.view().exercise!!.variantId)
        assertEquals("compare", session.view().exercise!!.skillId)
        assertFalse(session.view().heard)
        assertEquals(1, session.view().progress.attempts)
        compose.onNodeWithTag("AuralMode-sing").performClick()
        compose.onNodeWithTag("AuralMode-sing").assertIsSelected()
        assertEquals("microphone", session.view().exercise!!.responseType)
        compose.onNodeWithTag("AuralBack").performClick()
        compose.onNodeWithTag("AuralProgression-direct").assertExists()
    }

    @Test fun switchingPhaseDuringRealPlaybackCannotGradeTheNewQuestion() {
        val session = AuralSession(Store(), seedFor = { it })
        compose.setContent { MaterialTheme { AuralQuizScreen({}, session, catalogEnabled=false) } }
        compose.onNodeWithTag("AuralFamily-dominant-return").performScrollTo().performClick()
        compose.onNodeWithTag("AuralProgression-departure").performScrollTo().performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        compose.onNodeWithContentDescription("Stop").assertExists()
        compose.onNodeWithTag("AuralMode-recall").performClick()
        compose.onNodeWithContentDescription("Stop").assertDoesNotExist()
        compose.onNodeWithTag("AuralSubmit").assertDoesNotExist()
        assertEquals("recall", session.view().exercise!!.skillId)
        assertFalse(session.view().heard)
        assertEquals(0, session.view().progress.attempts)
    }
}
