package com.acquiring.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun ScaleDegreesHelpArticle() {
    HelpSection("A position in a scale") {
        HelpBody(
            "A scale is an ordered set of notes, with its home note called the tonic. " +
                "Scale degrees 1 through 7 count from that home note: 1 is the tonic, 2 is the next " +
                "scale note, and so on. The hat above a number identifies it as a scale degree, " +
                "not a fixed note name."
        )
        HelpBody(
            "A flat (♭) lowers a degree by one semitone, the smallest step between neighboring " +
                "piano keys. A sharp (♯) raises it by one. Double flats (♭♭) and double sharps (♯♯) " +
                "change it by two semitones."
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "Scale positions one through seven"
                },
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            HelpCatalog.scaleDegrees.forEach { degree ->
                ScaleDegreeText(
                    label = degree,
                    fontSize = 27.sp,
                    minFontSize = 12.sp,
                    modifier = Modifier
                        .weight(1f)
                        .height(38.dp)
                )
            }
        }
        DegreeAlignmentRow(
            notes = HelpCatalog.cMajorNotes,
            degrees = HelpCatalog.scaleDegrees,
            label = "C major: C D E F G A B align with scale degrees one through seven"
        )
    }
    HelpSection("Chord tones use the chord root") {
        HelpBody(
            "On chord-tone cards, degrees are measured from the chord’s root using a major-scale " +
                "reference. G–B–D is 5–7–2 in C major, but 1–3–5 within the G-major chord. " +
                "A–C–E is 1–♭3–5 within the A-minor chord."
        )
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.semantics {
                contentDescription =
                    "G B D is five seven two in C major and one three five inside G chord. " +
                        "A C E is one flat three five inside A minor chord"
            }
        ) {
            ChordDegreeRow("G–B–D", "5–7–2", "in C major")
            ChordDegreeRow("G–B–D", "1–3–5", "inside G chord")
            ChordDegreeRow("A–C–E", "1–♭3–5", "inside A minor chord")
        }
        HelpCallout(
            "Read the surrounding label first: a melody degree uses its section context; " +
                "a chord-tone degree uses the chord root."
        )
    }
}

@Composable
internal fun IntervalsHelpArticle() {
    Text(
        text = "P = perfect, M = major, m = minor, A = augmented, and d = diminished.",
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    HelpPanel {
        Row(modifier = Modifier.padding(vertical = 4.dp)) {
            Text(
                "Abbrev.",
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.weight(1f)
            )
            Text(
                "Meaning",
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.weight(2f)
            )
            Text(
                "Semitones",
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.weight(1f)
            )
        }
        Divider()
        HelpCatalog.intervalRows.forEach { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp)
                    .semantics {
                        contentDescription =
                            "${row.abbreviation}, ${row.meaning}, ${row.semitones} semitones"
                    }
            ) {
                Text(
                    row.abbreviation,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.SemiBold
                    ),
                    modifier = Modifier.weight(1f)
                )
                Text(row.meaning, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(2f))
                Text(
                    "${row.semitones}",
                    style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun DegreeAlignmentRow(
    notes: List<String>,
    degrees: List<String>,
    label: String
) {
    HelpPanel {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
                .semantics { contentDescription = label }
        ) {
            notes.forEachIndexed { index, note ->
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = note,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold)
                    )
                    ScaleDegreeText(
                        label = degrees[index],
                        fontSize = 18.sp,
                        minFontSize = 9.sp,
                        modifier = Modifier.height(24.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun ChordDegreeRow(notes: String, degrees: String, label: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)
        ) {
            Text(
                notes,
                style = MaterialTheme.typography.titleMedium.copy(fontFamily = FontFamily.Monospace)
            )
            Text(
                " → ",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
            Text(
                degrees,
                style = MaterialTheme.typography.titleMedium.copy(fontFamily = FontFamily.Monospace),
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.weight(1f))
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.End
            )
        }
    }
}
