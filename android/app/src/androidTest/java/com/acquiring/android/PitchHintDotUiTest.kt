package com.acquiring.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class PitchHintDotUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun constrainedDotsCanCollapseAndGrowWithoutCrashing() {
        val collapsed = mutableStateOf(true)
        composeRule.setContent {
            Column(Modifier.size(80.dp).background(Color.Black).testTag("dots")) {
                // Cover each zero dimension, including a zero-size draw after
                // a positive-size draw has already populated the brush cache.
                Box(Modifier.size(if (collapsed.value) 0.dp else 16.dp, 16.dp)) {
                    PitchHintDot()
                }
                Box(Modifier.size(16.dp, if (collapsed.value) 0.dp else 16.dp)) {
                    PitchHintDot()
                }
                Box(Modifier.size(if (collapsed.value) 0.dp else 16.dp)) {
                    PitchHintDot()
                }
            }
        }

        fun brightestPixel(): Float {
            val pixels = composeRule.onNodeWithTag("dots").captureToImage().toPixelMap()
            return (0 until pixels.height).maxOf { y ->
                (0 until pixels.width).maxOf { x -> pixels[x, y].red }
            }
        }

        assertTrue("Collapsed dots leave the background untouched", brightestPixel() < 0.05f)
        composeRule.runOnIdle { collapsed.value = false }
        assertTrue("Visible dots retain their glow", brightestPixel() > 0.8f)
        composeRule.runOnIdle { collapsed.value = true }
        assertTrue("Dots can collapse again without drawing", brightestPixel() < 0.05f)
    }
}
