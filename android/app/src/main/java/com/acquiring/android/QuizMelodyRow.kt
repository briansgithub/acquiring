package com.acquiring.android

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val QUIZ_MELODY_PAIR_CARD_HEIGHT = 44.dp
internal val QUIZ_MELODY_INTERVAL_CARD_HEIGHT = 88.dp

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun QuizMelodyRow(
    currentPitch: SpelledPitch?,
    currentLabel: String,
    intervalState: MelodyIntervalState?,
    pitchCards: List<MelodyPitchCard>,
    displayMode: MelodyPitchCardDisplayMode,
    onPlayPitch: (SpelledPitch) -> Unit,
    onSingPitch: (SpelledPitch, String) -> Unit,
    onPlayInterval: (MelodyIntervalState) -> Unit,
    onSingInterval: (MelodyIntervalState) -> Unit,
    modifier: Modifier = Modifier
) {
    val showsInterval = displayMode == MelodyPitchCardDisplayMode.INTERVAL && intervalState != null
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(QUIZ_MELODY_INTERVAL_CARD_HEIGHT),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier.weight(1f).fillMaxHeight(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (showsInterval) {
                val previous = pitchCards.firstOrNull { it.role == MelodyPitchCardRole.PREVIOUS }
                val current = pitchCards.firstOrNull { it.role == MelodyPitchCardRole.CURRENT }
                MelodyPairSlot(
                    card = previous,
                    fallbackAlignment = Alignment.TopCenter,
                    onPlayPitch = onPlayPitch,
                    onSingPitch = onSingPitch
                )
                MelodyPairSlot(
                    card = current,
                    fallbackAlignment = Alignment.BottomCenter,
                    onPlayPitch = onPlayPitch,
                    onSingPitch = onSingPitch
                )
            } else if (currentPitch != null) {
                MelodyEmptyPairSlot()
                Box(
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    contentAlignment = Alignment.Center
                ) {
                    MelodyDegreeCard(
                        label = currentLabel,
                        description = "Play current melody note $currentLabel. Double tap to sing it back.",
                        onClick = { onPlayPitch(currentPitch) },
                        onDoubleClick = { onSingPitch(currentPitch, currentLabel) }
                    )
                }
            } else {
                MelodyEmptyPairSlot()
                MelodyEmptyPairSlot()
            }
        }
        if (showsInterval && intervalState != null) {
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .semantics {
                        contentDescription = "${intervalState.contentDescription} Double tap to sing it back."
                    }
                    .combinedClickable(
                        onClick = { onPlayInterval(intervalState) },
                        onDoubleClick = { onSingInterval(intervalState) }
                    ),
                shape = RoundedCornerShape(16.dp),
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
            QuizExampleCard(
                modifier = Modifier.weight(1f),
                fixedHeight = QUIZ_MELODY_INTERVAL_CARD_HEIGHT
            ) {}
        }
    }
}

@Composable
private fun RowScope.MelodyEmptyPairSlot() {
    Box(
        modifier = Modifier.weight(1f).fillMaxHeight(),
        contentAlignment = Alignment.Center
    ) {
        QuizExampleCard(fixedHeight = QUIZ_MELODY_PAIR_CARD_HEIGHT) {}
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RowScope.MelodyPairSlot(
    card: MelodyPitchCard?,
    fallbackAlignment: Alignment,
    onPlayPitch: (SpelledPitch) -> Unit,
    onSingPitch: (SpelledPitch, String) -> Unit
) {
    val alignment = when (card?.verticalPosition) {
        MelodyPitchCardVerticalPosition.TOP -> Alignment.TopCenter
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
                description = "Play $title melody note ${card.scaleDegreeLabel}. Double tap to sing it back.",
                onClick = { onPlayPitch(card.pitch) },
                onDoubleClick = { onSingPitch(card.pitch, card.scaleDegreeLabel) }
            )
        } else {
            QuizExampleCard(fixedHeight = QUIZ_MELODY_PAIR_CARD_HEIGHT) {}
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MelodyDegreeCard(
    label: String,
    description: String,
    onClick: () -> Unit,
    onDoubleClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(QUIZ_MELODY_PAIR_CARD_HEIGHT)
            .semantics { contentDescription = description }
            .combinedClickable(onClick = onClick, onDoubleClick = onDoubleClick),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary
    ) {
        Box(
            modifier = Modifier.fillMaxSize().padding(horizontal = 4.dp),
            contentAlignment = Alignment.Center
        ) {
            ScaleDegreeText(
                label = label,
                fontSize = 22.sp,
                minFontSize = 10.sp,
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.onPrimary
            )
        }
    }
}
