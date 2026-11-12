package com.acquiring.android

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
internal fun MelodyFunctionHelpArticle() {
    HelpBody(
        "During playback, the melody card names the current note’s job in one or two words. " +
            "The color tells you what to do with it."
    )
    HelpCallout(
        "Green means sit. Blue means lean. Amber means keep moving. Red means the note is outside the chord."
    )
    FunctionSection("Chord tones", HelpCatalog.melodyFunctionChordTones)
    FunctionSection("No chord under the note", HelpCatalog.melodyFunctionScaleDegrees)
    HelpSection("Tones that keep moving") {
        HelpBody(
            "These notes are not at rest in the chord. A neighbor outside the key still reads " +
                "Upper neighbor or Lower neighbor."
        )
        FunctionTable(HelpCatalog.melodyFunctionMotion)
    }
    FunctionSection("Outside the chord", HelpCatalog.melodyFunctionOutside)
}

@Composable
private fun FunctionSection(title: String, entries: List<MelodyFunctionHelpEntry>) {
    HelpSection(title) {
        FunctionTable(entries)
    }
}

@Composable
private fun FunctionTable(entries: List<MelodyFunctionHelpEntry>) {
    HelpPanel {
        entries.forEachIndexed { index, entry ->
            if (index > 0) Divider()
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp)
                    .semantics { contentDescription = "${entry.word}. ${entry.definition}" }
            ) {
                Text(
                    text = entry.word,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold)
                )
                Text(
                    text = entry.definition,
                    style = MaterialTheme.typography.bodyLarge
                )
            }
        }
    }
}
