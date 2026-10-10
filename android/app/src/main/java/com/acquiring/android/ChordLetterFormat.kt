package com.acquiring.android

import kotlinx.serialization.json.*

/** Formats source-style letter names from the resolved chord and its actual roles. */
internal object ChordLetterFormat {
    private fun number(value: String) = value.filter(Char::isDigit).toIntOrNull() ?: 0
    private fun accidental(value: String) = value.filterNot(Char::isDigit)
    private fun JsonObject.ints(name: String) = (this[name] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull }.orEmpty().distinct()
    private fun JsonObject.strings(name: String) = (this[name] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty().distinct()
    private fun group(tokens: List<String>) = if (tokens.isEmpty()) "" else "(${tokens.joinToString("")})"
    private fun pitchClass(name: String): Int? {
        val natural = MusicTheory.NOTE_TO_PC[name.take(1).uppercase()] ?: return null
        return Math.floorMod(natural + MusicTheory.getModifierValue(name.drop(1)), 12)
    }
    private fun flatSeventh(root: String): String {
        val name = MusicTheory.getNoteLabel(7, root, "major")
        val modifier = MusicTheory.getModifierValue(name.drop(1)) - 1
        return name.first().toString() + if (modifier < 0) "b".repeat(-modifier) else "#".repeat(modifier)
    }

    fun format(chord: JsonObject, root: String, quality: String, degree: Int,
        majorSeventhHint: Boolean, augmentedMajorSeventhHint: Boolean, triSub: Boolean,
        voiced: VoicedChord?, bassName: String?, effectiveKey: KeyInfo, customIntervals: List<Int>?): String {
        val type = (chord["type"] as? JsonPrimitive)?.intOrNull ?: 5
        val inversion = (chord["inversion"] as? JsonPrimitive)?.intOrNull ?: 0
        val suspensions = chord.ints("suspensions")
        val suspended = suspensions.isNotEmpty()
        val alterations = chord.strings("alterations")
        val omits = chord.ints("omits")
        val adds = chord.ints("adds")
        val roles = voiced?.labels?.map { it.replace("♭", "b").replace("♯", "#").replace("\u0302", "") }.orEmpty()
        fun symbolicNote(relativeDegree: Int): String = MusicTheory.getNoteLabel(
            Math.floorMod(degree + relativeDegree - 2, 7) + 1, effectiveKey.tonic, effectiveKey.scale, customIntervals)
        fun symbolicInterval(relativeDegree: Int): Int? {
            val note = symbolicNote(relativeDegree)
            val notePc = pitchClass(note) ?: return null
            val rootPc = pitchClass(root) ?: return null
            return Math.floorMod(notePc - rootPc, 12)
        }
        val seventhInterval = symbolicInterval(7)
        val majorSeventh = type >= 7 && !suspended && !triSub && (seventhInterval == 11 || majorSeventhHint || augmentedMajorSeventhHint)
        val diminishedSeventh = type >= 7 && !suspended && ((chord["applied"] as? JsonPrimitive)?.intOrNull == 7 || seventhInterval == 9)
        val diminished = quality == "diminished"
        val halfDiminished = diminished && type >= 7 && !majorSeventh && !diminishedSeventh
        val minor = quality == "minor"
        val augmented = quality == "augmented" || (quality == "major" && alterations.contains("#5"))
        val bassRole = when (inversion) {
            1 -> if (suspensions.contains(4)) 4 else if (suspensions.contains(2)) 2 else 3
            2 -> 5; 3 -> 7; else -> null
        }
        // Source slash notation names the original harmonic slot even if
        // omitted or added tones change the lowest sounding note.
        val writtenBass = if (bassRole != null && bassName != null) when {
            triSub -> MusicTheory.getNoteLabel(if (bassRole == 7) "b7" else "$bassRole", root, "major")
            (chord["applied"] as? JsonPrimitive)?.intOrNull == 7 && bassRole == 7 -> MusicTheory.getNoteLabel("bb7", root, "major")
            bassRole == 3 -> MusicTheory.getNoteLabel(if (minor || diminished) "b3" else "3", root, "major")
            bassRole == 5 && type >= 7 && !suspended && alterations.contains("b5") -> MusicTheory.getNoteLabel("b5", root, "major")
            else -> symbolicNote(bassRole)
        } else bassName
        if (type == 11 && !majorSeventh && quality == "major" && (degree == 5 || triSub)
            && !suspended && alterations.isEmpty() && omits.isEmpty() && adds.isEmpty() && inversion == 0) {
            return "${flatSeventh(root)}/$root"
        }
        val plainMinorSeventh = type == 7 && inversion == 1 && !suspended && !majorSeventh && !diminishedSeventh
            && (minor || halfDiminished) && adds.isEmpty() && omits.isEmpty() && alterations.all { it == "b5" }
        if (plainMinorSeventh && writtenBass != null) return writtenBass.replace("x", "##") + (if (halfDiminished) "m" else "") + "6"
        val thirdInversion = type == 7 && inversion == 3 && !suspended && writtenBass != null
        val power = type < 7 && omits.contains(3) && !omits.contains(5) && !suspended && !diminished && alterations.isEmpty()
        val qualityText = when {
            power -> "5"; suspended -> ""
            diminished && (thirdInversion || type < 7 || diminishedSeventh) -> "°"
            minor || halfDiminished || diminished && majorSeventh -> "m"
            augmented && (!majorSeventh || thirdInversion) -> "+"; else -> ""
        }
        val implicitAlterations = mutableListOf<String>()
        if (!suspended && (halfDiminished || diminished && majorSeventh)) implicitAlterations += "b5"
        for (role in roles) if (number(role) >= 9 && accidental(role).isNotEmpty()) implicitAlterations += role
        var writtenType = type
        if (type >= 9 && implicitAlterations.any { number(it) == type }) writtenType = 7
        if (thirdInversion || type < 7) writtenType = 0
        val additionTokens = adds.filter { !(it == 2 && type >= 9) && !(it == 4 && type >= 11) && !(it == 6 && type >= 13) }
            .map { "add${if (it == 2) 9 else if (type >= 7 && it == 4) 11 else if (type >= 7 && it == 6) 13 else it}" }
        val plainSixth = type < 7 && adds == listOf(6) && !suspended && !diminished && omits.isEmpty() && alterations.isEmpty()
        val sixNine = type < 7 && adds.size == 2 && adds.containsAll(listOf(6, 9)) && !suspended && omits.isEmpty() && alterations.isEmpty()
        val extensionText = if (writtenType >= 7) (if (majorSeventh) "maj" else "") + writtenType else if (sixNine) "6/9" else if (plainSixth) "6" else ""
        val omissionTokens = omits.filter { !(power && it == 3) }.map { "no$it" }
        val modifierTokens = (alterations + implicitAlterations).distinct().toMutableList()
        if (thirdInversion && diminished) modifierTokens.remove("b5")
        if (thirdInversion && augmented) modifierTokens.remove("#5")
        if (augmented && majorSeventh && !thirdInversion && alterations.contains("#5") && !modifierTokens.contains("#5")) modifierTokens += "#5"
        val susText = suspensions.joinToString("") { suspension ->
            val interval = symbolicInterval(suspension)
            val difference = if (interval == null) 0 else interval - if (suspension == 2) 2 else 5
            var accidental = if (difference > 0) "#".repeat(difference) else "b".repeat(-difference)
            if (suspension == 4 && alterations.contains("#11")) accidental = "#"
            "sus$accidental$suspension"
        }
        return root + qualityText + extensionText + group(if (plainSixth || sixNine) emptyList() else additionTokens) + group(omissionTokens) +
            group(modifierTokens) + susText + (writtenBass?.let { "/${it.replace("x", "##")}" } ?: "")
    }
}
