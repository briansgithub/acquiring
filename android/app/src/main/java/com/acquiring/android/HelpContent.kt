package com.acquiring.android

internal const val HELP_CONTENTS_TEST_TAG = "HelpContents"
internal const val HELP_ARTICLE_TEST_TAG = "HelpArticle"

internal data class HelpTopic(
    val id: String,
    val title: String,
    val detail: String
)

internal data class IntervalHelpRow(
    val abbreviation: String,
    val meaning: String,
    val semitones: Int
)

internal data class RomanHelpExample(
    val symbol: String,
    val meaning: String,
    val borrowedLabel: String? = null
)

internal object HelpCatalog {
    val topics = listOf(
        HelpTopic(
            id = "help.topic.instructions",
            title = "Instructions",
            detail = "How to use quiz cards and singing practice"
        ),
        HelpTopic(
            id = "help.topic.scaleDegrees",
            title = "Scale degrees",
            detail = "Numbers, accidentals, and chord-tone reference"
        ),
        HelpTopic(
            id = "help.topic.intervals",
            title = "Intervals",
            detail = "Abbreviations, names, and semitone distances"
        ),
        HelpTopic(
            id = "help.topic.romanNumerals",
            title = "Roman numerals",
            detail = "Chord quality, figures, alterations, and applied chords"
        ),
        HelpTopic(
            id = "help.topic.tessitura",
            title = "Tessitura",
            detail = "Choose a comfortable octave for singing targets"
        )
    )

    val intervalRows = listOf(
        IntervalHelpRow("P1", "Perfect unison", 0),
        IntervalHelpRow("m2", "Minor second", 1),
        IntervalHelpRow("M2", "Major second", 2),
        IntervalHelpRow("m3", "Minor third", 3),
        IntervalHelpRow("M3", "Major third", 4),
        IntervalHelpRow("P4", "Perfect fourth", 5),
        IntervalHelpRow("A4", "Augmented fourth", 6),
        IntervalHelpRow("d5", "Diminished fifth", 6),
        IntervalHelpRow("P5", "Perfect fifth", 7),
        IntervalHelpRow("m6", "Minor sixth", 8),
        IntervalHelpRow("M6", "Major sixth", 9),
        IntervalHelpRow("m7", "Minor seventh", 10),
        IntervalHelpRow("M7", "Major seventh", 11),
        IntervalHelpRow("P8", "Perfect octave", 12)
    )

    val scaleDegrees = listOf("1", "2", "3", "4", "5", "6", "7")

    val romanRootExamples = listOf(
        RomanHelpExample("I", "major one"),
        RomanHelpExample("ii", "minor two"),
        RomanHelpExample("♭VII", "flat seven"),
        RomanHelpExample("V+", "augmented five"),
        RomanHelpExample("vii°7", "fully diminished seven"),
        RomanHelpExample("I△7", "one major seventh")
    )

    val romanFigureExamples = listOf(
        RomanHelpExample("I6", "first inversion triad"),
        RomanHelpExample("I64", "second inversion triad"),
        RomanHelpExample("V65", "first inversion seventh chord")
    )

    fun topic(id: String): HelpTopic? = topics.firstOrNull { it.id == id }
}
