package com.acquiring.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

@Composable
internal fun HelpIndex(
    onOpenTopic: (HelpTopic) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.testTag(HELP_CONTENTS_TEST_TAG)) {
        SettingsSectionHeading("Help")
        Text(
            text = "Card notation",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier
                .padding(horizontal = 8.dp, vertical = 4.dp)
                .semantics { heading() }
        )
        HelpCatalog.topics.forEach { topic ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenTopic(topic) }
                    .padding(horizontal = 8.dp, vertical = 10.dp)
                    .semantics { contentDescription = topic.title }
            ) {
                Text(text = topic.title, style = MaterialTheme.typography.bodyLarge)
                Text(
                    text = topic.detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Text(
            text = "This reference is built into Acquiring and works offline.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp)
        )
    }
}

@Composable
internal fun HelpArticleScreen(
    topic: HelpTopic,
    onBack: () -> Unit
) {
    BackHandler(onBack = onBack)
    val title = if (topic.id == HELP_TOPIC_INSTRUCTIONS) IntroductionCopy.TITLE else topic.title
    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag(HELP_ARTICLE_TEST_TAG)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            TextButton(onClick = onBack) { Text("< Back") }
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .semantics { heading() }
            )
        }
        val articleModifier = Modifier
            .fillMaxWidth()
            .weight(1f)
            .then(
                if (topic.id == HELP_TOPIC_INSTRUCTIONS) {
                    Modifier.background(MaterialTheme.colorScheme.primary.copy(alpha = 0.04f))
                } else {
                    Modifier
                }
            )
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 24.dp)
            .widthIn(max = 680.dp)
        Column(
            modifier = articleModifier,
            verticalArrangement = Arrangement.spacedBy(22.dp)
        ) {
            when (topic.id) {
                HELP_TOPIC_INSTRUCTIONS -> IntroductionArticle()
                HELP_TOPIC_SCALE_DEGREES -> ScaleDegreesHelpArticle()
                HELP_TOPIC_INTERVALS -> IntervalsHelpArticle()
                HELP_TOPIC_ROMAN -> RomanNumeralsHelpArticle()
            }
        }
    }
}

@Composable
internal fun HelpSection(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.semantics { heading() }
        )
        content()
    }
}

@Composable
internal fun HelpBody(text: String) {
    Text(text = text, style = MaterialTheme.typography.bodyLarge)
}

@Composable
internal fun HelpCallout(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp)
        )
    }
}

@Composable
internal fun HelpPanel(content: @Composable () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            content()
        }
    }
}
