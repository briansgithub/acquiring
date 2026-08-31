package com.acquiring.android

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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Gray marks anything whose register the tessitura setting has moved. */
internal val TESSITURA_DOT_COLOR = Color(0xFF9E9E9E)

/**
 * Small dot with a soft gaussian-style glow, the app's shared mark for
 * "this element is tied to a singing target". White is the target's own
 * register; [TESSITURA_DOT_COLOR] means the tessitura setting is placing it.
 */
@Composable
internal fun PitchHintDot(
    modifier: Modifier = Modifier,
    color: Color = Color.White,
    size: Dp = 16.dp
) {
    // Stops approximate a gaussian falloff (dense near the center, thinning
    // out gradually) rather than a hard-edged two-tone circle.
    val glowBrush = remember(color) {
        Brush.radialGradient(
            colorStops = arrayOf(
                0.00f to color.copy(alpha = 1f),
                0.10f to color.copy(alpha = 0.95f),
                0.22f to color.copy(alpha = 0.80f),
                0.36f to color.copy(alpha = 0.58f),
                0.52f to color.copy(alpha = 0.36f),
                0.68f to color.copy(alpha = 0.18f),
                0.84f to color.copy(alpha = 0.07f),
                1.00f to color.copy(alpha = 0f)
            )
        )
    }
    Box(modifier = modifier.size(size).background(glowBrush))
}

/**
 * The [PitchHintDot] in its corner-badge role, indicating an element responds
 * to double-tap (usually to start singing/humming pitch-matching against a
 * target note). Callers are responsible for only rendering this when a
 * double-tap would actually do something useful. Gray means the target loaded
 * by that interaction is currently tessitura-adjusted.
 */
@Composable
internal fun BoxScope.DoubleTapHint(
    modifier: Modifier = Modifier,
    isTessituraAdjusted: Boolean = false
) {
    PitchHintDot(
        modifier = modifier
            .align(Alignment.TopEnd)
            .semantics {
                contentDescription = "Double tap to sing back"
                stateDescription = if (isTessituraAdjusted) {
                    "Tessitura adjusted"
                } else {
                    "Original target octave"
                }
            },
        color = if (isTessituraAdjusted) TESSITURA_DOT_COLOR else Color.White
    )
}
