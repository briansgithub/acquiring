package com.acquiring.android

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val PLAYBACK_MELODY_PAIR_CARD_HEIGHT = 44.dp
internal val PLAYBACK_MELODY_INTERVAL_CARD_HEIGHT = 88.dp

@Composable
internal fun PlaybackCurrentMelodyCard(
    pitch: SpelledPitch?,
    label: String,
    functionText: String,
    functionColor: Color,
    onPlayPitch: (SpelledPitch) -> Unit,
    onSingPitch: (SpelledPitch, String) -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    height: Dp = PLAYBACK_MELODY_PAIR_CARD_HEIGHT
) {
    if (pitch == null) {
        PlaybackEmptyCardSlot(
            modifier = modifier,
            fixedHeight = height
        )
        return
    }
    MelodyDegreeCard(
        label = label,
        description = "Melody. $functionText. Play current melody note $label. Double tap to sing it back.",
        height = height,
        onClick = { onPlayPitch(pitch) },
        onDoubleClick = { onSingPitch(pitch, label) },
        modifier = modifier,
        title = title,
        functionText = functionText,
        functionColor = functionColor
    )
}

internal fun showsMelodyPreviousCard(
    displayMode: MelodyPitchCardDisplayMode,
    pitchCards: List<MelodyPitchCard>
): Boolean = displayMode == MelodyPitchCardDisplayMode.INTERVAL &&
    pitchCards.any { it.role == MelodyPitchCardRole.PREVIOUS }

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun PlaybackMelodyRow(
    currentPitch: SpelledPitch?,
    currentLabel: String,
    intervalState: MelodyIntervalState?,
    pitchCards: List<MelodyPitchCard>,
    displayMode: MelodyPitchCardDisplayMode,
    onPlayPitch: (SpelledPitch) -> Unit,
    onSingPitch: (SpelledPitch, String) -> Unit,
    onPlayInterval: (MelodyIntervalState) -> Unit,
    onSingInterval: (MelodyIntervalState) -> Unit,
    functionText: String,
    functionColor: Color,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(PLAYBACK_MELODY_INTERVAL_CARD_HEIGHT),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        when (displayMode) {
            MelodyPitchCardDisplayMode.HIDDEN -> {
                PlaybackEmptyCardSlot(
                    modifier = Modifier.weight(1f),
                    fixedHeight = PLAYBACK_MELODY_INTERVAL_CARD_HEIGHT
                )
            }
            MelodyPitchCardDisplayMode.SINGLE -> {
                Row(
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    MelodyPairSlot(
                        card = null,
                        fallbackAlignment = Alignment.Center,
                        onPlayPitch = onPlayPitch,
                        onSingPitch = onSingPitch
                    )
                    if (currentPitch != null) {
                        Box(
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                            contentAlignment = Alignment.Center
                        ) {
                            MelodyDegreeCard(
                                label = currentLabel,
                                description = "Melody. $functionText. Play current melody note $currentLabel. Double tap to sing it back.",
                                height = PLAYBACK_MELODY_PAIR_CARD_HEIGHT,
                                onClick = { onPlayPitch(currentPitch) },
                                onDoubleClick = { onSingPitch(currentPitch, currentLabel) },
                                functionText = functionText,
                                functionColor = functionColor
                            )
                        }
                    } else {
                        MelodyPairSlot(
                            card = null,
                            fallbackAlignment = Alignment.Center,
                            onPlayPitch = onPlayPitch,
                            onSingPitch = onSingPitch
                        )
                    }
                }
                PlaybackEmptyCardSlot(
                    modifier = Modifier.weight(1f),
                    fixedHeight = PLAYBACK_MELODY_INTERVAL_CARD_HEIGHT
                )
            }
            MelodyPitchCardDisplayMode.INTERVAL -> {
                Row(
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val previous = pitchCards.firstOrNull { it.role == MelodyPitchCardRole.PREVIOUS }
                    val current = pitchCards.firstOrNull { it.role == MelodyPitchCardRole.CURRENT }
                    MelodyPairSlot(
                        card = previous,
                        fallbackAlignment = Alignment.BottomCenter,
                        onPlayPitch = onPlayPitch,
                        onSingPitch = onSingPitch
                    )
                    MelodyPairSlot(
                        card = current,
                        fallbackAlignment = Alignment.TopCenter,
                        onPlayPitch = onPlayPitch,
                        onSingPitch = onSingPitch,
                        functionText = functionText,
                        functionColor = functionColor
                    )
                }
                if (intervalState != null) {
                    Surface(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .semantics {
                                contentDescription =
                                    "${intervalState.contentDescription} Double tap to sing it back."
                            }
                            .combinedClickable(
                                onClick = { onPlayInterval(intervalState) },
                                onDoubleClick = { onSingInterval(intervalState) }
                            ),
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary
                    ) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                text = intervalState.interval.shorthand,
                                fontSize = 32.sp,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                                maxLines = 1
                            )
                        }
                    }
                } else {
                    PlaybackEmptyCardSlot(
                        modifier = Modifier.weight(1f),
                        fixedHeight = PLAYBACK_MELODY_INTERVAL_CARD_HEIGHT
                    )
                }
            }
        }
    }
}

@Composable
private fun RowScope.MelodyPairSlot(
    card: MelodyPitchCard?,
    fallbackAlignment: Alignment,
    onPlayPitch: (SpelledPitch) -> Unit,
    onSingPitch: (SpelledPitch, String) -> Unit,
    functionText: String? = null,
    functionColor: Color = Color.Unspecified
) {
    val alignment = when (card?.verticalPosition) {
        MelodyPitchCardVerticalPosition.TOP -> Alignment.TopCenter
        MelodyPitchCardVerticalPosition.CENTER -> Alignment.Center
        MelodyPitchCardVerticalPosition.BOTTOM -> Alignment.BottomCenter
        null -> fallbackAlignment
    }
    Box(
        modifier = Modifier.weight(1f).fillMaxHeight(),
        contentAlignment = alignment
    ) {
        if (card != null) {
            val title = when (card.role) {
                MelodyPitchCardRole.PREVIOUS -> "prior"
                MelodyPitchCardRole.CURRENT -> "current"
            }
            MelodyDegreeCard(
                label = card.scaleDegreeLabel,
                description = listOfNotNull(
                    functionText?.let { "Melody. $it." },
                    "Play $title melody note ${card.scaleDegreeLabel}. Double tap to sing it back."
                ).joinToString(" "),
                height = PLAYBACK_MELODY_PAIR_CARD_HEIGHT,
                onClick = { onPlayPitch(card.pitch) },
                onDoubleClick = { onSingPitch(card.pitch, card.scaleDegreeLabel) },
                functionText = functionText,
                functionColor = functionColor
            )
        } else {
            PlaybackEmptyCardSlot(fixedHeight = PLAYBACK_MELODY_PAIR_CARD_HEIGHT)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MelodyDegreeCard(
    label: String,
    description: String,
    height: Dp,
    onClick: () -> Unit,
    onDoubleClick: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    functionText: String? = null,
    functionColor: Color = Color.Unspecified
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .semantics { contentDescription = description }
            .combinedClickable(onClick = onClick, onDoubleClick = onDoubleClick),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 4.dp, vertical = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = if (title != null) Arrangement.Top else Arrangement.Center
        ) {
            if (title != null) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    textAlign = TextAlign.Center
                )
            }
            if (label.isNotEmpty()) {
                ScaleDegreeText(
                    label = label,
                    fontSize = if (height >= PLAYBACK_MELODY_INTERVAL_CARD_HEIGHT) 32.sp else 22.sp,
                    minFontSize = 11.sp,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    color = MaterialTheme.colorScheme.onPrimary
                )
            }
            if (!functionText.isNullOrEmpty()) {
                OutlinedFunctionText(
                    text = functionText,
                    color = functionColor,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@OptIn(ExperimentalTextApi::class)
@Composable
private fun OutlinedFunctionText(
    text: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    val style = TextStyle(
        fontSize = 15.sp,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center
    )
    Box(modifier) {
        Text(
            text = text,
            color = Color.Black,
            style = style.copy(
                // The stroke is centered on the letter edge and the fill covers the inner half.
                drawStyle = Stroke(width = 4f, join = StrokeJoin.Round)
            ),
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth()
        )
        Text(
            text = text,
            color = color,
            style = style,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .fillMaxWidth()
                .testTag(PLAYBACK_MELODY_FUNCTION_TEST_TAG)
        )
    }
}
