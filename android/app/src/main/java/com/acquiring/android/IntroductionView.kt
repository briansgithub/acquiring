package com.acquiring.android

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal const val INTRODUCTION_CONTINUE_TEST_TAG = "introduction.continue"
internal const val INTRODUCTION_OBJECTIVE_TEST_TAG = "introduction.objective"
internal const val INTRODUCTION_GESTURES_TEST_TAG = "introduction.gestures"
internal const val INTRODUCTION_OCTAVE_TEST_TAG = "introduction.octaveOffset"

internal object IntroductionCopy {
    const val TITLE = "Introduction"
    const val OBJECTIVE_HEADING = "Objective:"
    const val OBJECTIVE =
        "To learn intervals and harmony through catchy songs and real-world examples."
    const val GESTURES_HEADING = "Tapping on Notes/Intervals/Chords"
    const val TAP_ACTION = "Tap"
    const val TAP_DETAIL = "Play the card."
    const val DOUBLE_TAP_ACTION = "Double-tap"
    const val DOUBLE_TAP_DETAIL = "Open the Singing Tool."
    const val MIC_ACTION = "Microphone button"
    const val MIC_DETAIL = "Turn on continuous pitch monitoring."
    const val OCTAVE_HEADING = "Octave offset"
    const val OCTAVE =
        "The minus and plus buttons in the Interval Singing Tool move every singing target up or down by whole octaves, so a target sits where your voice can reach it. The note keeps its musical role; only its octave changes."
    const val CONTINUE = "Continue"
    const val EXAMPLE_CARDS = "Example cards: a scale degree card and an interval card"
}

@Composable
fun IntroductionView(
    onContinue: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.04f))
            .testTag(INTRODUCTION_SCREEN_TEST_TAG)
    ) {
        Text(
            text = IntroductionCopy.TITLE,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier
                .padding(horizontal = 20.dp, vertical = 12.dp)
                .semantics { heading() }
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            IntroductionArticle()
        }
        if (onContinue != null) {
            Surface(tonalElevation = 3.dp) {
                Button(
                    onClick = onContinue,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 12.dp)
                        .heightIn(min = 44.dp)
                        .testTag(INTRODUCTION_CONTINUE_TEST_TAG)
                ) {
                    Text(IntroductionCopy.CONTINUE, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
internal fun IntroductionArticle() {
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
    IntroductionSection(
        title = IntroductionCopy.OBJECTIVE_HEADING,
        identifier = INTRODUCTION_OBJECTIVE_TEST_TAG
    ) {
        Text(
            text = IntroductionCopy.OBJECTIVE,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
    IntroductionSection(
        title = IntroductionCopy.GESTURES_HEADING,
        identifier = INTRODUCTION_GESTURES_TEST_TAG
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            IntroductionExampleCards()
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                IntroductionGestureRow(
                    action = IntroductionCopy.TAP_ACTION,
                    detail = IntroductionCopy.TAP_DETAIL,
                    icon = ImageVector.vectorResource(R.drawable.ic_hand_tap)
                )
                IntroductionGestureRow(
                    action = IntroductionCopy.DOUBLE_TAP_ACTION,
                    detail = IntroductionCopy.DOUBLE_TAP_DETAIL,
                    icon = ImageVector.vectorResource(R.drawable.ic_hand_tap_fill)
                )
                IntroductionGestureRow(
                    action = IntroductionCopy.MIC_ACTION,
                    detail = IntroductionCopy.MIC_DETAIL,
                    icon = ImageVector.vectorResource(R.drawable.ic_mic)
                )
            }
        }
    }
    IntroductionSection(
        title = IntroductionCopy.OCTAVE_HEADING,
        identifier = INTRODUCTION_OCTAVE_TEST_TAG
    ) {
        Text(
            text = IntroductionCopy.OCTAVE,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
    }
}

@Composable
private fun IntroductionExampleCards() {
    val shorthand = remember {
        val low = SpelledPitch.fromMidi(60)
        val high = SpelledPitch.fromMidi(67)
        calculateNamedInterval(low, high).shorthand
    }
    Row(
        modifier = Modifier
            .widthIn(max = 300.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = IntroductionCopy.EXAMPLE_CARDS
            },
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        QuizExampleCard(modifier = Modifier.weight(1f), fixedHeight = 56.dp) {
            ScaleDegreeText(
                label = "3",
                fontSize = 28.sp,
                minFontSize = 11.sp,
                color = Color.White,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(34.dp)
            )
        }
        QuizExampleCard(modifier = Modifier.weight(1f), fixedHeight = 56.dp) {
            Text(
                text = shorthand,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 32.sp,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun IntroductionSection(
    title: String,
    identifier: String,
    content: @Composable () -> Unit
) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background, shape)
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.22f),
                shape = shape
            )
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            modifier = Modifier
                .testTag(identifier)
                .semantics { heading() }
        )
        content()
    }
}

@Composable
private fun IntroductionGestureRow(
    action: String,
    detail: String,
    icon: ImageVector
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 28.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(22.dp)
        )
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(action) }
                append(" — $detail")
            },
            style = MaterialTheme.typography.bodyLarge
        )
    }
}
