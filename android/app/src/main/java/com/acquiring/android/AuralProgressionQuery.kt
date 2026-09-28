package com.acquiring.android

import kotlinx.serialization.Serializable

@Serializable internal data class AuralChordConstraint(
    val degree: Int,
    val accidental: String = "",
    val family: String = "any",
    val exact: String? = null,
    val inversion: String? = null,
) {
    init {
        require(degree in 1..7 && accidental in setOf("", "♭", "♯"))
        require(family in setOf("any", "major", "minor", "7", "maj7", "m7"))
    }
    val label: String get() = inversion ?: exact ?: buildString {
        append(accidental)
        append(listOf("I", "II", "III", "IV", "V", "VI", "VII")[degree - 1])
        if (family != "any") {
            append(" · ")
            append(when (family) {
                "major" -> "Major"; "minor" -> "Minor"; "7" -> "7"; "maj7" -> "maj7"; else -> "m7"
            })
        }
    }
}

@Serializable internal data class AuralProgressionQuery(val version: Int = 1, val chords: List<AuralChordConstraint> = emptyList()) {
    init { require(version == 1 && chords.size <= 32) }
    fun matches(labels: List<String>, rootLabels: List<String> = labels): Boolean {
        if (chords.isEmpty()) return true
        if (labels.size < chords.size) return false
        return (0..labels.size - chords.size).any { start ->
            chords.indices.all { index -> chords[index].matches(labels[start + index], rootLabels[start + index]) }
        }
    }
}

internal fun auralCanonicalChord(label: String): String = label.trim()
    .replace(Regex("^[b#]+")) { it.value.replace('b', '♭').replace('#', '♯') }
    .replace('#', '♯').replace(Regex("b(?=\\d)"), "♭")

internal fun AuralChordConstraint.matches(label: String, rootLabel: String = label): Boolean {
    val canonical = auralCanonicalChord(label)
    if (exact != null) return auralCanonicalChord(rootLabel) == auralCanonicalChord(exact) &&
        (inversion == null || canonical == auralCanonicalChord(inversion))
    if ('/' in canonical) return false // Applied functions have their own explicit forms.
    val group = auralStartGroup(canonical) ?: return false
    if (group.degree != degree || group.accidental != accidental) return false
    return when (family) {
        "any" -> true
        "major", "minor" -> group.quality == family
        "7" -> group.quality == "major" && group.seventhQuality == "minor"
        "maj7" -> group.quality == "major" && group.seventhQuality == "major"
        "m7" -> group.quality == "minor" && group.seventhQuality == "minor"
        else -> false
    }
}
