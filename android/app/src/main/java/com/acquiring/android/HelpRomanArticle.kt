package com.acquiring.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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

@Composable
internal fun RomanNumeralsHelpArticle() {
    HelpSection("Root, quality & extensions") {
        HelpBody(
            "Roman numerals name the chord root’s scale position: I = 1, II = 2, III = 3, " +
                "IV = 4, V = 5, VI = 6, VII = 7. The root is the note from which the chord is " +
                "built; the bass is the lowest sounding note. They need not be the same."
        )
        HelpBody(
            "Uppercase normally marks a major chord and lowercase a minor chord. ♭, ♯, ♭♭, and ♯♯ " +
                "before the numeral alter its root. + marks an augmented triad (1–3–♯5); ° a " +
                "diminished triad (1–♭3–♭5). °7 adds a diminished seventh (♭♭7), while ø adds a " +
                "minor seventh (♭7). △ marks a major seventh (7), not merely a major triad."
        )
        RomanExampleGrid(HelpCatalog.romanQualityExamples)
        HelpBody(
            "7, 9, 11, and 13 count chord extensions above the root: a seventh, ninth, " +
                "eleventh, or thirteenth."
        )
        RomanExampleGrid(HelpCatalog.romanExtensionExamples)
    }
    HelpSection("Figures, suspensions & added tones") {
        HelpBody(
            "6 and 64 are triad inversions; 65, 43, and 42 are seventh-chord inversions. " +
                "These figures describe intervals above the bass, not literal fractions or exponents."
        )
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            HelpCatalog.romanFigureExamples.forEach { figure ->
                RomanFigureRow(figure)
            }
        }
        HelpBody(
            "sus2 and sus4 replace the third; sus2sus4 combines both labels. add2, add4, add6, " +
                "add9, add11, and add13 add tones; no3, no5, and grouped (no5no3) omit tones."
        )
        RomanExampleGrid(HelpCatalog.romanSuspensionExamples)
    }
    HelpSection("Alterations, borrowing & applied chords") {
        HelpBody(
            "Alterations appear in parentheses: (♭5), (♯5), (♭9), (♯9), (♯11), (♭13), or " +
                "combinations. A mode tag below the numeral marks borrowing: min minor, dor Dorian, " +
                "phr Phrygian, lyd Lydian, mix Mixolydian, loc Locrian, maj major, hmin harmonic " +
                "minor, phdm Phrygian dominant, or bor for a grouped source."
        )
        RomanExampleGrid(HelpCatalog.romanAlterationExamples)
        RomanNumeralText(
            display = RomanNumeralDisplay(symbol = "iv", borrowedLabel = "(min)"),
            fontSize = 38.sp,
            minFontSize = 14.sp,
            modifier = Modifier
                .width(110.dp)
                .height(65.dp)
                .semantics { contentDescription = "Minor four, borrowed from minor" }
        )
        HelpBody(
            "A dominant is the chord built on degree 5. A secondary dominant temporarily treats " +
                "another chord as home: V/V means “five of five.” In C major, D7 can lead to G, " +
                "so D7 is V7/V. V7/vi similarly points toward the minor chord on degree 6."
        )
        HelpBody(
            "A leading tone lies one semitone below its target. vii°7/V is a diminished " +
                "leading-tone seventh chord pointing toward V. Read the slash as “of”: the numeral " +
                "to its right supplies a temporary reference. A Roman slash therefore does not " +
                "always mean a secondary dominant, and it is different from a bass-note slash in " +
                "a letter-name symbol such as C/E."
        )
        RomanExampleGrid(HelpCatalog.romanAppliedExamples)
        HelpCallout(
            "A tritone substitution replaces a dominant chord with a chord whose root is a " +
                "tritone away; (∆-sub) names that substitution and is separate from △. (maj) can " +
                "label borrowing or appear in an applied context such as V7/vi(maj); it does not " +
                "change vi into a major chord."
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RomanExampleGrid(examples: List<RomanHelpExample>) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        examples.forEach { example ->
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                shape = RoundedCornerShape(9.dp),
                modifier = Modifier
                    .width(150.dp)
                    .padding(bottom = 10.dp)
                    .semantics {
                        contentDescription = "${example.symbol}: ${example.meaning}"
                    }
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(horizontal = 3.dp, vertical = 4.dp)
                ) {
                    RomanNumeralText(
                        display = RomanNumeralDisplay(
                            symbol = example.symbol,
                            borrowedLabel = example.borrowedLabel
                        ),
                        fontSize = 38.sp,
                        minFontSize = 16.sp,
                        modifier = Modifier.height(58.dp)
                    )
                    Text(
                        text = example.meaning,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@Composable
private fun RomanFigureRow(figure: RomanFigureExample) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        shape = RoundedCornerShape(9.dp),
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {}
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
        ) {
            RomanNumeralText(
                display = RomanNumeralDisplay(symbol = figure.symbol),
                fontSize = 30.sp,
                minFontSize = 12.sp,
                modifier = Modifier
                    .width(78.dp)
                    .height(42.dp)
            )
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(
                    figure.bass,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold)
                )
                Text(
                    figure.meaning,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.weight(1f))
        }
    }
}
