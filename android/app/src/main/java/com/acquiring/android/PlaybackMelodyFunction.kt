package com.acquiring.android

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

internal const val PLAYBACK_MELODY_FUNCTION_TEST_TAG = "PlaybackMelodyFunction"
internal const val PLAYBACK_ROOT_SCRUB_BAR_TEST_TAG = "PlaybackRootScrubBar"

@Composable
internal fun melodyFunctionColor(tone: MelodyFunctionTone): Color = when (tone) {
    MelodyFunctionTone.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant
    MelodyFunctionTone.STABLE -> Color(0xFF4CAF50)
    MelodyFunctionTone.LEANING -> Color(0xFF4FC3F7)
    MelodyFunctionTone.MOVING -> Color(0xFFFFB74D)
    MelodyFunctionTone.OUTSIDE -> Color(0xFFFF8A80)
}

@Composable
internal fun PlaybackRootScrubBar(
    beat: androidx.compose.runtime.State<Double>,
    scrubBeat: Double?,
    startBeat: Double,
    endBeat: Double,
    onScrub: (Double) -> Unit,
    onScrubFinished: () -> Unit,
    modifier: Modifier = Modifier
) {
    val currentBeat = scrubBeat ?: beat.value
    val upperBeat = endBeat.coerceAtLeast(startBeat + 0.001)
    Slider(
        value = currentBeat.coerceIn(startBeat, upperBeat).toFloat(),
        onValueChange = { onScrub(it.toDouble()) },
        onValueChangeFinished = onScrubFinished,
        valueRange = startBeat.toFloat()..upperBeat.toFloat(),
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp)
            .testTag(PLAYBACK_ROOT_SCRUB_BAR_TEST_TAG)
            .semantics {
                contentDescription = "Playback timeline, beat ${
                    currentBeat.coerceIn(startBeat, upperBeat).toInt()
                }"
            }
    )
}
