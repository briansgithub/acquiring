package com.sacredring.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp

/**
 * Small white or gray dot with a soft gaussian-style glow, indicating an element
 * responds to double-tap (usually to start singing/humming pitch-matching
 * against a target note). Callers are responsible for only rendering this
 * when a double-tap would actually do something useful. Gray means the target
 * loaded by that interaction is currently tessitura-adjusted.
 */
@Composable
internal fun BoxScope.DoubleTapHint(
    modifier: Modifier = Modifier,
    isTessituraAdjusted: Boolean = false
) {
    // Stops approximate a gaussian falloff (dense near the center, thinning
    // out gradually) rather than a hard-edged two-tone circle.
    val glowColor = if (isTessituraAdjusted) Color(0xFF9E9E9E) else Color.White
    val glowBrush = remember(glowColor) {
        Brush.radialGradient(
            colorStops = arrayOf(
                0.00f to glowColor.copy(alpha = 1f),
                0.10f to glowColor.copy(alpha = 0.95f),
                0.22f to glowColor.copy(alpha = 0.80f),
                0.36f to glowColor.copy(alpha = 0.58f),
                0.52f to glowColor.copy(alpha = 0.36f),
                0.68f to glowColor.copy(alpha = 0.18f),
                0.84f to glowColor.copy(alpha = 0.07f),
                1.00f to glowColor.copy(alpha = 0f)
            )
        )
    }
    Box(
        modifier = modifier
            .align(Alignment.TopEnd)
            .size(16.dp)
            .semantics {
                contentDescription = "Double tap to sing back"
                stateDescription = if (isTessituraAdjusted) {
                    "Tessitura adjusted"
                } else {
                    "Original target octave"
                }
            }
            .background(glowBrush)
    )
}
