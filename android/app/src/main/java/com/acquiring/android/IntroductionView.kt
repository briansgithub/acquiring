package com.acquiring.android

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

internal val INTRODUCTION_BULLETS = listOf(
    "Swipe the quiz timeline to move through the song.",
    "Tap Play to hear the section; Reset returns to the start.",
    "Gray octave dots appear when the singing octave is shifted from the written part.",
    "The center card is the current root; the card beside it is the interval."
)

@Composable
fun IntroductionView(onContinue: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp)
            .testTag(INTRODUCTION_SCREEN_TEST_TAG)
    ) {
        Text(
            text = "Welcome to Acquiring",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { heading() }
        )
        Text(
            text = "A few gestures before the library.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp)
        )
        INTRODUCTION_BULLETS.forEach { line ->
            Text(
                text = "• $line",
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.padding(vertical = 6.dp)
            )
        }
        Button(
            onClick = onContinue,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 24.dp)
                .semantics { }
        ) {
            Text("Continue to Library")
        }
    }
}
