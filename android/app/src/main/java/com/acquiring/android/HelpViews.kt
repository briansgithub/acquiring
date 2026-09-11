package com.acquiring.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Divider
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
import androidx.compose.ui.unit.sp

@Composable
internal fun HelpIndex(
    onOpenTopic: (HelpTopic) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.testTag(HELP_CONTENTS_TEST_TAG)) {
        SettingsSectionHeading("Help")
        Text(
            text = "This reference is built into Acquiring and works offline.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
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
    }
}

@Composable
internal fun HelpArticleScreen(
    topic: HelpTopic,
    onBack: () -> Unit
) {
    BackHandler(onBack = onBack)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag(HELP_ARTICLE_TEST_TAG)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            TextButton(onClick = onBack) { Text("< Back") }
            Text(
                text = topic.title,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .semantics { heading() }
            )
        }
        when (topic.id) {
            "help.topic.instructions" -> IntroductionArticle()
            "help.topic.scaleDegrees" -> ScaleDegreesHelpArticle()
            "help.topic.intervals" -> IntervalsHelpArticle()
            "help.topic.romanNumerals" -> RomanNumeralsHelpArticle()
            "help.topic.tessitura" -> TessituraHelpArticle()
        }
    }
}

@Composable
private fun HelpSection(title: String, content: @Composable () -> Unit) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier
            .padding(horizontal = 8.dp, vertical = 8.dp)
            .semantics { heading() }
    )
    content()
}

@Composable
private fun HelpBody(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
    )
}

@Composable
private fun HelpCallout(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp)
        )
    }
}

@Composable
private fun ScaleDegreesHelpArticle() {
    HelpSection("A position in a scale") {
        HelpBody(
            "A scale is an ordered set of notes, with its home note called the tonic. " +
                "Scale degrees 1 through 7 count from that home note. " +
                "A flat lowers a degree by one semitone; a sharp raises it by one."
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            HelpCatalog.scaleDegrees.forEach { degree ->
                ScaleDegreeText(
                    label = degree,
                    fontSize = 22.sp,
                    modifier = Modifier
                        .width(36.dp)
                        .height(40.dp)
                )
            }
        }
        HelpBody("C major: C D E F G A B align with scale degrees one through seven.")
    }
    HelpSection("Chord tones use the chord root") {
        HelpBody(
            "On chord-tone cards, degrees are measured from the chord’s root using a major-scale reference. " +
                "G–B–D is 5–7–2 in C major, but 1–3–5 within the G-major chord."
        )
        HelpCallout("Read the surrounding label first: a melody degree uses its section context; a chord-tone degree uses the chord root.")
    }
}

@Composable
private fun IntervalsHelpArticle() {
    HelpBody("P = perfect, M = major, m = minor, A = augmented, and d = diminished.")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp)
    ) {
        Text("Abbrev.", style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
        Text("Meaning", style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(2f))
        Text("Semitones", style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
    }
    Divider(modifier = Modifier.padding(horizontal = 8.dp))
    HelpCatalog.intervalRows.forEach { row ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp)
                .semantics {
                    contentDescription = "${row.abbreviation}, ${row.meaning}, ${row.semitones} semitones"
                }
        ) {
            Text(row.abbreviation, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            Text(row.meaning, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(2f))
            Text("${row.semitones}", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun RomanNumeralsHelpArticle() {
    HelpSection("Root, quality & extensions") {
        HelpBody(
            "Roman numerals name the chord root’s scale position: I = 1, II = 2, III = 3, IV = 4, V = 5, VI = 6, VII = 7. " +
                "Uppercase normally marks a major chord and lowercase a minor chord."
        )
        RomanExampleRow(HelpCatalog.romanRootExamples)
        HelpBody("7, 9, 11, and 13 count chord extensions above the root.")
    }
    HelpSection("Figures, suspensions & added tones") {
        HelpBody("6 and 64 are triad inversions; 65, 43, and 42 are seventh-chord inversions.")
        RomanExampleRow(HelpCatalog.romanFigureExamples)
    }
    HelpSection("Alterations, borrowing & applied chords") {
        HelpBody(
            "A secondary dominant temporarily treats another chord as home: V/V means “five of five.” " +
                "Read the slash as “of.”"
        )
        RomanNumeralText(
            display = RomanNumeralDisplay(symbol = "iv", borrowedLabel = "(min)"),
            fontSize = 32.sp,
            modifier = Modifier
                .padding(horizontal = 8.dp)
                .width(110.dp)
                .height(56.dp)
        )
        HelpCallout(
            "Use the singing octave shifter to move targets; song playback stays at the written pitch."
        )
    }
}

@Composable
private fun RomanExampleRow(examples: List<RomanHelpExample>) {
    Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
        examples.forEach { example ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp)
                    .semantics { contentDescription = "${example.symbol}: ${example.meaning}" }
            ) {
                RomanNumeralText(
                    display = RomanNumeralDisplay(
                        symbol = example.symbol,
                        borrowedLabel = example.borrowedLabel
                    ),
                    fontSize = 28.sp,
                    modifier = Modifier
                        .width(72.dp)
                        .height(40.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(example.meaning, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun TessituraHelpArticle() {
    HelpSection("Your comfortable octave") {
        HelpBody(
            "Tessitura is the register where your voice feels comfortable. " +
                "The singing dock’s octave shifter moves practice targets by whole octaves from −2 to +3. " +
                "0 is the written octave for that song."
        )
        HelpBody("C4 and C5 are both C, one octave apart. The musical role stays the same.")
        HelpCallout(
            "Gray hint dots appear when the offset is not zero. Song playback does not shift."
        )
    }
}
