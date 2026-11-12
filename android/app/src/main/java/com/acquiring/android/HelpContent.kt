package com.acquiring.android

internal const val HELP_CONTENTS_TEST_TAG = "HelpContents"
internal const val HELP_ARTICLE_TEST_TAG = "HelpArticle"
internal const val HELP_TOPIC_INSTRUCTIONS = "help.topic.instructions"
internal const val HELP_TOPIC_SCALE_DEGREES = "help.topic.scaleDegrees"
internal const val HELP_TOPIC_INTERVALS = "help.topic.intervals"
internal const val HELP_TOPIC_ROMAN = "help.topic.romanNumerals"
internal const val HELP_TOPIC_MELODY_FUNCTION = "help.topic.melodyFunction"

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

internal data class MelodyFunctionHelpEntry(
    val word: String,
    val definition: String
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
            detail = "How to use playback cards and singing practice"
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
        ),
        HelpTopic(
            id = HELP_TOPIC_MELODY_FUNCTION,
            title = "Melody function",
            detail = "The one- or two-word role on the melody card"
        )
    )

    val melodyFunctionChordTones = listOf(
        MelodyFunctionHelpEntry("Root", "Sit. This is the chord’s root."),
        MelodyFunctionHelpEntry("Third", "Sit. A stable tone of the chord."),
        MelodyFunctionHelpEntry("Fifth", "Sit. A stable tone of the chord."),
        MelodyFunctionHelpEntry("Second", "Lean. It belongs to the chord."),
        MelodyFunctionHelpEntry("Fourth", "Lean. It belongs to the chord and wants to fall to the third."),
        MelodyFunctionHelpEntry("Sixth", "Lean. It belongs to the chord."),
        MelodyFunctionHelpEntry("Seventh", "Lean. It belongs to the chord and wants to move."),
        MelodyFunctionHelpEntry("Ninth", "Lean. It belongs to the chord and wants to move."),
        MelodyFunctionHelpEntry("Eleventh", "Lean. It belongs to the chord and wants to move."),
        MelodyFunctionHelpEntry("Thirteenth", "Lean. It belongs to the chord and wants to move.")
    )

    val melodyFunctionScaleDegrees = listOf(
        MelodyFunctionHelpEntry("One", "Sit. Scale degree 1, and no chord is under the note."),
        MelodyFunctionHelpEntry("Two", "Keep moving. Scale degree 2, and no chord is under the note."),
        MelodyFunctionHelpEntry("Three", "Sit. Scale degree 3, and no chord is under the note."),
        MelodyFunctionHelpEntry("Four", "Keep moving. Scale degree 4, and no chord is under the note."),
        MelodyFunctionHelpEntry("Five", "Sit. Scale degree 5, and no chord is under the note."),
        MelodyFunctionHelpEntry("Six", "Keep moving. Scale degree 6, and no chord is under the note."),
        MelodyFunctionHelpEntry("Seven", "Keep moving. Scale degree 7, and no chord is under the note.")
    )

    val melodyFunctionMotion = listOf(
        MelodyFunctionHelpEntry("Passing", "Step between two chord tones in the same direction. Keep going."),
        MelodyFunctionHelpEntry("Chromatic passing", "A passing step on a note outside the key."),
        MelodyFunctionHelpEntry("Upper neighbor", "Step up and come back. Do not settle here."),
        MelodyFunctionHelpEntry("Lower neighbor", "Step down and come back. Do not settle here."),
        MelodyFunctionHelpEntry("Anticipation", "You are early. This note belongs to the next chord."),
        MelodyFunctionHelpEntry("Suspension", "The note was in the previous chord. Let it fall by step."),
        MelodyFunctionHelpEntry("Retardation", "The note was in the previous chord. Let it rise by step."),
        MelodyFunctionHelpEntry("Held over", "The chord changed under a note you are still holding."),
        MelodyFunctionHelpEntry("Appoggiatura", "You leapt onto a tension. Step off it onto a chord tone."),
        MelodyFunctionHelpEntry("Escape", "A short step off the chord, then a leap onward."),
        MelodyFunctionHelpEntry("Leading", "A half step under the next note. Let it rise."),
        MelodyFunctionHelpEntry("Pedal", "The melody holds still while the chords move.")
    )

    val melodyFunctionOutside = listOf(
        MelodyFunctionHelpEntry("Color", "Outside the chord, with no prepared path. Hear it against the root, then follow the melody."),
        MelodyFunctionHelpEntry("Chromatic color", "A color tone that is also outside the key.")
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
