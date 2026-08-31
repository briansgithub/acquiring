package com.acquiring.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.advanceEventTime
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class TripleClickableUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun tripleTapInvokesOnlyPersistentAction() {
        var singleCount = 0
        var doubleCount = 0
        var tripleCount = 0

        composeRule.setContent {
            Box(
                modifier = Modifier
                    .size(100.dp)
                    .testTag("triple-card")
                    .tripleClickable(
                        onClick = { singleCount++ },
                        onDoubleClick = { doubleCount++ },
                        onTripleClick = { tripleCount++ }
                    )
            )
        }

        composeRule.onNodeWithTag("triple-card").performTouchInput {
            click()
            advanceEventTime(80)
            click()
            advanceEventTime(80)
            click()
        }
        composeRule.waitForIdle()

        assertEquals(0, singleCount)
        assertEquals(0, doubleCount)
        assertEquals(1, tripleCount)
    }
}
