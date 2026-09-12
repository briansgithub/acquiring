package com.acquiring.android

internal const val HELP_CONTENTS_TEST_TAG = "HelpContents"
internal const val HELP_ARTICLE_TEST_TAG = "HelpArticle"
internal const val HELP_TOPIC_INSTRUCTIONS = "help.topic.instructions"
internal const val HELP_TOPIC_SCALE_DEGREES = "help.topic.scaleDegrees"
internal const val HELP_TOPIC_INTERVALS = "help.topic.intervals"
internal const val HELP_TOPIC_ROMAN = "help.topic.romanNumerals"

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

internal data class RomanFigureExample(
    val symbol: String,
    val bass: String,
    val meaning: String
)

internal object HelpCatalog {
    val topics = listOf(
        HelpTopic(
            id = HELP_TOPIC_INSTRUCTIONS,
            title = "Instructions",
            detail = "How to use quiz cards and singing practice"
        ),
        HelpTopic(
            id = HELP_TOPIC_SCALE_DEGREES,
            title = "Scale degrees",
            detail = "Numbers, accidentals, and chord-tone reference"
        ),
        HelpTopic(
            id = HELP_TOPIC_INTERVALS,
            title = "Intervals",
            detail = "Abbreviations, names, and semitone distances"
        ),
        HelpTopic(
            id = HELP_TOPIC_ROMAN,
            title = "Roman numerals",
            detail = "Chord quality, figures, alterations, and applied chords"
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
    val cMajorNotes = listOf("C", "D", "E", "F", "G", "A", "B")

    val romanQualityExamples = listOf(
        RomanHelpExample("I", "major one"),
        RomanHelpExample("ii", "minor two"),
        RomanHelpExample("♭VII", "flat seven"),
        RomanHelpExample("♯♯IV", "double sharp four"),
        RomanHelpExample("V+", "augmented five"),
        RomanHelpExample("vii°7", "fully diminished seven"),
        RomanHelpExample("iiø7", "half-diminished two seven"),
        RomanHelpExample("I△7", "one major seventh")
    )

    val romanExtensionExamples = listOf(
        RomanHelpExample("I7", "one with a seventh"),
        RomanHelpExample("ii9", "minor two with a ninth"),
        RomanHelpExample("V11", "five with an eleventh"),
        RomanHelpExample("I13", "one with a thirteenth")
    )

    val romanFigureExamples = listOf(
        RomanFigureExample("I6", "third in bass", "first inversion triad"),
        RomanFigureExample("I64", "fifth in bass", "second inversion triad"),
        RomanFigureExample("V65", "third in bass", "first inversion seventh chord"),
        RomanFigureExample("V43", "fifth in bass", "second inversion seventh chord"),
        RomanFigureExample("V42", "seventh in bass", "third inversion seventh chord")
    )

    val romanSuspensionExamples = listOf(
        RomanHelpExample("Vsus2", "five with suspended second"),
        RomanHelpExample("Vsus4", "five with suspended fourth"),
        RomanHelpExample("I(add2)", "one with added second"),
        RomanHelpExample("I(add6)", "one with added sixth"),
        RomanHelpExample("I(add13)", "one with added thirteenth"),
        RomanHelpExample("I(no5no3)", "one without fifth and third")
    )

    val romanAlterationExamples = listOf(
        RomanHelpExample("V7(♭9♯11)", "five seven with flat nine and sharp eleven"),
        RomanHelpExample("♭VI", "flat six"),
        RomanHelpExample("iv", "minor four")
    )

    val romanAppliedExamples = listOf(
        RomanHelpExample("V/V", "dominant of five"),
        RomanHelpExample("V7/vi", "dominant seventh of six"),
        RomanHelpExample("vii°7/V", "leading-tone seventh of five"),
        RomanHelpExample("♭ii7/V(∆-sub)", "tritone substitution for five seven")
    )

    fun topic(id: String): HelpTopic? = topics.firstOrNull { it.id == id }
}
