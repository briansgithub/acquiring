package com.acquiring.android

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle

/**
 * The Playback scale-degree palette, applied to the numerator of each displayed
 * Roman numeral. Quality, accidentals, inversions, and applied denominators
 * belong to that chord token, so they deliberately keep its root-degree color.
 */
internal fun auralScaleDegreeColor(degree: Int): Color? = when (degree) {
    1 -> Color(0xFFFF0000)
    2 -> Color(0xFFFFB014)
    3 -> Color(0xFFEFE600)
    4 -> Color(0xFF00D300)
    5 -> Color(0xFF4800FF)
    6 -> Color(0xFFB800E5)
    7 -> Color(0xFFFF00CB)
    else -> null
}

/** Finds the primary Roman numeral; `♭VII`, `V6/V`, and `iiø7` are 7, 5, and 2. */
internal fun auralRomanDegree(label: String): Int? {
    val numeral = Regex("^[♭♯#b]*([ivxlcdmIVXLCDM]+)").find(label.trim())
        ?.groupValues?.getOrNull(1)?.uppercase()
        ?: return null
    return when (numeral) {
        "I" -> 1; "II" -> 2; "III" -> 3; "IV" -> 4
        "V" -> 5; "VI" -> 6; "VII" -> 7
        else -> null
    }
}

internal fun auralRomanColor(label: String): Color =
    auralRomanDegree(label)?.let(::auralScaleDegreeColor) ?: Color.Unspecified

/** Keeps arrows neutral while every actual chord label receives its own span. */
internal fun auralRomanSequence(labels: List<String>, separator: String = " → "): AnnotatedString = buildAnnotatedString {
    labels.forEachIndexed { index, label ->
        if (index > 0) append(separator)
        val color = auralScaleDegreeColor(auralRomanDegree(label) ?: -1)
        if (color == null) append(label) else withStyle(SpanStyle(color = color)) { append(label) }
    }
}
