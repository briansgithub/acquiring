package com.acquiring.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

internal const val PLAYBACK_MELODY_FUNCTION_TEST_TAG = "PlaybackMelodyFunction"
internal const val PLAYBACK_ROOT_SCRUB_BAR_TEST_TAG = "PlaybackRootScrubBar"
internal val PLAYBACK_MELODY_FUNCTION_HEIGHT = 58.dp

@Composable
internal fun PlaybackMelodyFunctionBanner(
    description: MelodyFunctionDescription,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .height(PLAYBACK_MELODY_FUNCTION_HEIGHT)
            .testTag(PLAYBACK_MELODY_FUNCTION_TEST_TAG)
            .semantics {
                contentDescription = "${description.title}. ${description.detail}"
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = description.title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = description.detail,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
internal fun PlaybackRootScrubBar(
    currentBeat: Double,
    startBeat: Double,
    endBeat: Double,
    onScrub: (Double) -> Unit,
    onScrubFinished: () -> Unit,
    modifier: Modifier = Modifier
) {
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
