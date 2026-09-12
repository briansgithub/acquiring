package com.acquiring.android

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Previous keeps iOS's 40/60 share against each featured column (0.4 / 1.6). */
internal const val ROOT_ONLY_PREVIOUS_WEIGHT = 0.4f
internal const val ROOT_ONLY_FEATURED_WEIGHT = 0.6f
internal val ROOT_ONLY_PREVIOUS_HEIGHT = 128.dp
internal val ROOT_ONLY_FEATURED_HEIGHT = 162.dp
private val ROOT_ONLY_CARD_RADIUS = 14.dp

internal fun showsRootOnlyPrevious(previous: SpelledPitch?): Boolean = previous != null

internal fun showsRootOnlyInterval(
    previous: SpelledPitch?,
    current: SpelledPitch?,
    interval: NamedInterval?
): Boolean = previous != null && current != null && interval != null && previous != current

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun QuizRootOnlyRow(
    previousPitch: SpelledPitch?,
    currentPitch: SpelledPitch?,
    previousLabel: String,
    currentLabel: String,
    interval: NamedInterval?,
    onPreviewPitch: (SpelledPitch) -> Unit,
    onPreviewInterval: (SpelledPitch, SpelledPitch) -> Unit,
    onSingCurrent: () -> Unit,
    onSingInterval: () -> Unit,
    showPitchGauge: Boolean,
    pitchGaugeResult: MicrophonePitchTracker.PitchResult?,
    pitchGaugeLabel: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(ROOT_ONLY_FEATURED_HEIGHT),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        if (showsRootOnlyPrevious(previousPitch) && previousPitch != null) {
            RootOnlyDegreeCard(
                title = "Previous Root",
                label = previousLabel,
                description = "Play previous root scale degree.",
                maximumDegreeFontSize = 42.sp,
                modifier = Modifier
                    .weight(ROOT_ONLY_PREVIOUS_WEIGHT)
                    .height(ROOT_ONLY_PREVIOUS_HEIGHT),
                enabled = previousLabel.isNotEmpty(),
                onClick = { onPreviewPitch(previousPitch) }
            )
        } else {
            QuizEmptyCardSlot(
                modifier = Modifier.weight(ROOT_ONLY_PREVIOUS_WEIGHT),
                fixedHeight = ROOT_ONLY_PREVIOUS_HEIGHT
            )
        }
        if (currentPitch != null) {
            RootOnlyDegreeCard(
                title = "Current Root",
                label = currentLabel,
                description = "Play current root scale degree. Double tap to sing it back.",
                maximumDegreeFontSize = 52.sp,
                modifier = Modifier
                    .weight(ROOT_ONLY_FEATURED_WEIGHT)
                    .fillMaxHeight(),
                enabled = currentLabel.isNotEmpty(),
                onClick = { onPreviewPitch(currentPitch) },
                onDoubleClick = onSingCurrent,
                showPitchGauge = showPitchGauge,
                pitchGaugeResult = pitchGaugeResult,
                pitchGaugeLabel = pitchGaugeLabel
            )
        } else {
            QuizEmptyCardSlot(
                modifier = Modifier.weight(ROOT_ONLY_FEATURED_WEIGHT),
                fixedHeight = ROOT_ONLY_FEATURED_HEIGHT
            )
        }
        if (showsRootOnlyInterval(previousPitch, currentPitch, interval) &&
            previousPitch != null &&
            currentPitch != null &&
            interval != null
        ) {
            RootOnlyIntervalCard(
                interval = interval,
                modifier = Modifier
                    .weight(ROOT_ONLY_FEATURED_WEIGHT)
                    .fillMaxHeight(),
                onClick = { onPreviewInterval(previousPitch, currentPitch) },
                onDoubleClick = onSingInterval
            )
        } else {
            QuizEmptyCardSlot(
                modifier = Modifier.weight(ROOT_ONLY_FEATURED_WEIGHT),
                fixedHeight = ROOT_ONLY_FEATURED_HEIGHT
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RootOnlyDegreeCard(
    title: String,
    label: String,
    description: String,
    maximumDegreeFontSize: TextUnit,
    modifier: Modifier,
    enabled: Boolean,
    onClick: () -> Unit,
    onDoubleClick: (() -> Unit)? = null,
    showPitchGauge: Boolean = false,
    pitchGaugeResult: MicrophonePitchTracker.PitchResult? = null,
    pitchGaugeLabel: String = ""
) {
    val gestureModifier = if (onDoubleClick != null) {
        modifier
            .semantics { contentDescription = description }
            .combinedClickable(
                enabled = enabled,
                onClick = onClick,
                onDoubleClick = onDoubleClick
            )
    } else {
        modifier
            .semantics { contentDescription = description }
            .clickable(enabled = enabled, onClick = onClick)
    }
    Surface(
        modifier = gestureModifier,
        shape = RoundedCornerShape(ROOT_ONLY_CARD_RADIUS),
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary
    ) {
        Box(modifier = Modifier.fillMaxSize().padding(8.dp), contentAlignment = Alignment.Center) {
            if (showPitchGauge && pitchGaugeResult != null) {
                PitchGauge(
                    pitchResult = pitchGaugeResult,
                    targetLabel = pitchGaugeLabel,
                    modifier = Modifier.matchParentSize()
                )
            }
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    title,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    softWrap = false,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    if (label.isNotEmpty()) {
                        ScaleDegreeText(
                            label = label,
                            fontSize = maximumDegreeFontSize,
                            minFontSize = 13.sp,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RootOnlyIntervalCard(
    interval: NamedInterval,
    modifier: Modifier,
    onClick: () -> Unit,
    onDoubleClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .semantics {
                contentDescription =
                    "Play root interval ${interval.spokenName}. Double tap to sing it back."
            }
            .combinedClickable(onClick = onClick, onDoubleClick = onDoubleClick),
        shape = RoundedCornerShape(ROOT_ONLY_CARD_RADIUS),
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary
    ) {
        Box(modifier = Modifier.fillMaxSize().padding(8.dp), contentAlignment = Alignment.Center) {
            Text(
                text = interval.shorthand,
                textAlign = TextAlign.Center,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1
            )
        }
    }
}
