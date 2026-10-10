package com.acquiring.android

import kotlinx.serialization.json.*

internal enum class ChordRootContext {
    STANDARD,
    BORROWED,
    CUSTOM_BORROWED,
    APPLIED,
    BORROWED_APPLIED,
    TRITONE_SUBSTITUTION
}

internal data class ResolvedChordRoot(
    val pitch: SpelledPitch,
    /**
     * The root placed in the fixed written register used by simple-mode root
     * playback. Chord JSON contains no root octave, so this is the only
     * register that can faithfully determine whether the rendered root moves
     * up or down without reducing its spelling to a MIDI pitch class.
     */
    val simpleModePitch: SpelledPitch,
    val sourceDegree: Int,
    val effectiveDegree: Int,
    val sourceKey: KeyInfo,
    val effectiveKey: KeyInfo,
    val customIntervals: List<Int>?,
    val chordQuality: String,
    val context: ChordRootContext,
    val genericStepsFromTonic: Int,
    val specificSemitonesFromTonic: Int
)

data class ChordInterpretation(val roman: String, val letter: String, val midi: List<Int>, val rootMidi: Int?, val toneLabels: List<String>)

object ChordInterpreter {
    
    private val ROMAN_MAP = mapOf(1 to "I", 2 to "II", 3 to "III", 4 to "IV", 5 to "V", 6 to "VI", 7 to "VII")
    private val PC_SPELL = listOf("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")

    private fun safeInt(element: JsonElement?, default: Int = 0): Int {
        return (element as? JsonPrimitive)?.intOrNull ?: default
    }

    private fun safeString(element: JsonElement?, default: String = ""): String {
        return (element as? JsonPrimitive)?.contentOrNull ?: default
    }

    private fun safeBoolean(element: JsonElement?, default: Boolean = false): Boolean {
        return (element as? JsonPrimitive)?.booleanOrNull ?: default
    }

    private fun customBorrowedIntervals(element: JsonElement?): List<Int>? {
        val borrowed = element as? JsonArray ?: return null
        if (borrowed.isEmpty()) return MusicTheory.SCALE_INTERVALS["major"]!!
        val source = borrowed.map { safeInt(it) }
        val intervals = mutableListOf<Int>()

        for (index in 0 until 7) {
            val rawInterval = source.getOrNull(index)
                ?: ((intervals.lastOrNull() ?: 0) + 2)
            intervals += ((rawInterval % 12) + 12) % 12
        }

        return intervals
    }

    private fun customChordQualities(intervals: List<Int>): List<String> {
        return (0 until 7).map { rootIndex ->
            val rootInterval = intervals[rootIndex]
            var thirdInterval = intervals[(rootIndex + 2) % 7]
            var fifthInterval = intervals[(rootIndex + 4) % 7]
            if (thirdInterval < rootInterval) thirdInterval += 12
            if (fifthInterval < rootInterval) fifthInterval += 12

            val thirdSemitones = thirdInterval - rootInterval
            val fifthSemitones = fifthInterval - rootInterval
            when {
                thirdSemitones == 4 && fifthSemitones == 7 -> "major"
                thirdSemitones == 3 && fifthSemitones == 7 -> "minor"
                thirdSemitones == 3 && fifthSemitones == 6 -> "diminished"
                thirdSemitones == 4 && fifthSemitones == 8 -> "augmented"
                thirdSemitones == 4 -> "major"
                else -> "minor"
            }
        }
    }

    /**
     * The raw `borrowed` array as authored, before the 7-slot/mod-12 normalisation
     * customBorrowedIntervals applies. Hooktheory writes offsets like -1 for a
     * flattened tonic, and the accidental prefix below is a raw subtraction, so it
     * has to see the -1 rather than the 11 it normalises to.
     */
    private fun rawCustomBorrowedIntervals(element: JsonElement?): List<Int>? {
        val borrowed = element as? JsonArray ?: return null
        val values = borrowed.mapNotNull { (it as? JsonPrimitive)?.intOrNull }
        return if (values.size >= 7) values else null
    }

    /**
     * Triad quality read straight off a custom borrowed scale, ported from
     * jsonToSymbol.js's customArrayTriadQuality. Deliberately separate from
     * customChordQualities, which the note builder uses: web keeps the two apart
     * as well, and their fallbacks differ.
     */
    private fun customArrayTriadQuality(intervals: List<Int>, degree: Int): String {
        fun at(index: Int) = intervals[Math.floorMod(index - 1, 7)]
        val root = at(degree)
        val third = Math.floorMod(at(degree + 2) - root, 12)
        val fifth = Math.floorMod(at(degree + 4) - root, 12)
        return when {
            third == 4 && fifth == 7 -> "major"
            third == 3 && fifth == 7 -> "minor"
            third == 3 && fifth == 6 -> "diminished"
            third == 4 && fifth == 8 -> "augmented"
            third <= 3 -> "minor"
            else -> "major"
        }
    }

    private fun customArrayPrefix(intervals: List<Int>, degree: Int, key: KeyInfo): String {
        val reference = MusicTheory.SCALE_INTERVALS[key.scale] ?: MusicTheory.SCALE_INTERVALS["major"]!!
        return when (intervals[degree - 1] - reference[degree - 1]) {
            -2 -> "♭♭"
            -1 -> "♭"
            1 -> "♯"
            2 -> "♯♯"
            else -> ""
        }
    }

    private fun customArraySeventhMajor(intervals: List<Int>, degree: Int): Boolean {
        fun at(index: Int) = intervals[Math.floorMod(index - 1, 7)]
        return Math.floorMod(at(degree + 6) - at(degree), 12) == 11
    }

    private val BORROWED_TAG = mapOf(
        "minor" to "min", "dorian" to "dor", "phrygian" to "phr",
        "lydian" to "lyd", "mixolydian" to "mix", "locrian" to "loc", "major" to "maj",
        "harmonicMinor" to "hmin", "phrygianDominant" to "phdm",
    )


    private fun isTriSubApplied(chordJson: JsonObject): Boolean {
        val applied = safeInt(chordJson["applied"])
        val substitutions = chordJson["substitutions"] as? JsonArray
        return (applied == 5) && (substitutions?.any { safeString(it) == "tri" } == true)
    }


    private fun notePitchClass(note: String): Int? {
        val natural = MusicTheory.NOTE_TO_PC[note.take(1)] ?: return null
        return Math.floorMod(natural + MusicTheory.getModifierValue(note.drop(1)), 12)
    }

    private fun isMajorSeventh(degree: Int, effKey: KeyInfo, customIntervals: List<Int>? = null): Boolean {
        return try {
            val rootNote = MusicTheory.getNoteLabel(degree, effKey.tonic, effKey.scale, customIntervals)
            val rootPc = notePitchClass(rootNote) ?: return false
            
            val seventhSD = ((degree - 1 + 6) % 7 + 7) % 7 + 1
            val seventhNote = MusicTheory.getNoteLabel(seventhSD, effKey.tonic, effKey.scale, customIntervals)
            val seventhPc = notePitchClass(seventhNote) ?: return false
            
            ((seventhPc - rootPc + 12) % 12) == 11
        } catch (_: Exception) {
            false
        }
    }

    private fun borrowedPrefix(degree: Int, key: KeyInfo, borrowedScale: String): String {
        try {
            val borrowedNote = MusicTheory.getNoteLabel(degree, key.tonic, borrowedScale)
            val refNote = MusicTheory.getNoteLabel(degree, key.tonic, key.scale.ifEmpty { "major" })
            val diff = MusicTheory.getModifierValue(borrowedNote) - MusicTheory.getModifierValue(refNote)
            return when (diff) {
                -1 -> "♭"
                -2 -> "♭♭"
                1 -> "♯"
                2 -> "♯♯"
                else -> ""
            }
        } catch (_: Exception) {
            return ""
        }
    }

    /**
     * Resolves the written chord root from the same degree/applied/borrowed
     * inputs that precede Roman-numeral rendering. No MIDI or pitch-class
     * respelling is used, so C# and Db remain distinct.
     */
    internal fun resolveChordRoot(
        chordJson: JsonObject,
        key: KeyInfo,
        referenceOctave: Int = 3
    ): ResolvedChordRoot? {
        val root = safeInt(chordJson["root"])
        val isRest = safeBoolean(chordJson["isRest"]) || safeBoolean(chordJson["rest"])
        if (isRest) return null
        if (root !in 1..7) {
            if (root != 0) return null
            val rootName = safeString(chordJson["_letterRootName"])
            val pitch = SpelledPitch.parse(rootName, referenceOctave) ?: return null
            val tonic = SpelledPitch.parse(key.tonic, referenceOctave) ?: return null
            val genericSteps = Math.floorMod(pitch.letter.index - tonic.letter.index, 7)
            val registered = pitch.copy(octave = Math.floorDiv(tonic.staffPosition + genericSteps, 7))
            return ResolvedChordRoot(registered, pitch, root, 1, key, KeyInfo(rootName, "major"), null,
                safeString(chordJson["_letterQuality"], "major"), ChordRootContext.STANDARD,
                registered.staffPosition - tonic.staffPosition, registered.chromaticPosition - tonic.chromaticPosition)
        }

        val applied = safeInt(chordJson["applied"])
        val borrowedName = safeString(chordJson["borrowed"])
        val customIntervals = customBorrowedIntervals(chordJson["borrowed"])
        val hasNamedBorrowing = borrowedName.isNotEmpty() && BORROWED_TAG.containsKey(borrowedName)
        val hasBorrowedScale = borrowedName.isNotEmpty() || customIntervals != null
        val modifiedKey = when {
            customIntervals != null -> KeyInfo(key.tonic, "custom")
            hasNamedBorrowing -> KeyInfo(key.tonic, borrowedName)
            else -> key
        }
        val targetPitch = MusicTheory.resolveScaleDegreePitch(
            sd = root.toString(),
            relativeOctave = 0,
            key = modifiedKey,
            baseOctave = referenceOctave,
            customIntervals = customIntervals
        ) ?: return null

        val triSubstitution = applied == 5 && isTriSubApplied(chordJson)
        val effectiveDegree: Int
        val effectiveKey: KeyInfo
        val pitch: SpelledPitch
        val context: ChordRootContext
        // Forced triad quality for the applied+borrowed special cases below (ported from
        // web/lib/chordBuild.js resolveAppliedBorrowedChord). Null means "use the
        // normal scale-degree quality table lookup" further down.
        var borrowedAppliedQuality: String? = null

        if (applied in 1..7 && !hasBorrowedScale) {
            val targetKey = KeyInfo(targetPitch.noteName, "major")
            effectiveDegree = if (triSubstitution) 2 else applied
            effectiveKey = targetKey
            pitch = MusicTheory.resolveScaleDegreePitch(
                sd = if (triSubstitution) "b2" else applied.toString(),
                relativeOctave = 0,
                key = targetKey,
                baseOctave = targetPitch.octave
            ) ?: return null
            context = when {
                triSubstitution -> ChordRootContext.TRITONE_SUBSTITUTION
                else -> ChordRootContext.APPLIED
            }
        } else if (applied in 1..7 && hasBorrowedScale) {
            // Resolve the same borrowed tonicization target for root spelling,
            // Roman/letter labels, and voiced notes.
            val chordType = safeInt(chordJson["type"], 5)
            val chordInversion = safeInt(chordJson["inversion"])
            val alterations0 = (chordJson["alterations"] as? JsonArray)
                ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
            val targetNoteName = targetPitch.noteName

            when {
                // Special case 1: borrowed-locrian tonic triad is voiced MINOR, not the
                // locrian mode's natural (diminished) tonic quality. Triads only - sevenths
                // fall through to the default case.
                borrowedName == "locrian" && root == 1 && applied == 1 && chordType < 7 -> {
                    effectiveDegree = 1
                    effectiveKey = modifiedKey
                    pitch = targetPitch
                    borrowedAppliedQuality = "minor"
                    context = ChordRootContext.BORROWED_APPLIED
                }
                // Special case 2: tritone-substitution dominant of the borrowed target (root a
                // tritone away from V/target), MAJOR quality.
                triSubstitution -> {
                    val targetKey = KeyInfo(targetNoteName, "major")
                    effectiveDegree = 2
                    effectiveKey = targetKey
                    pitch = MusicTheory.resolveScaleDegreePitch(
                        sd = "b2",
                        relativeOctave = 0,
                        key = targetKey,
                        baseOctave = targetPitch.octave
                    ) ?: return null
                    borrowedAppliedQuality = "major"
                    context = ChordRootContext.TRITONE_SUBSTITUTION
                }
                // Special case 3: applied vii°(#5) is voiced as a MINOR triad instead of
                // diminished, at the same (leading-tone) numerator position.
                applied == 7 && alterations0.contains("#5") -> {
                    val targetKey = KeyInfo(targetNoteName, "major")
                    effectiveDegree = 7
                    effectiveKey = targetKey
                    pitch = MusicTheory.resolveScaleDegreePitch(
                        sd = "7",
                        relativeOctave = 0,
                        key = targetKey,
                        baseOctave = targetPitch.octave
                    ) ?: return null
                    borrowedAppliedQuality = "minor"
                    context = ChordRootContext.BORROWED_APPLIED
                }
                // Special case 4: custom-array borrowed scale in first/second inversion
                // ignores the tonicization entirely and voices a MAJOR triad directly on the
                // borrowed target note.
                customIntervals != null && (chordInversion == 1 || chordInversion == 2) -> {
                    effectiveDegree = root
                    effectiveKey = modifiedKey
                    pitch = targetPitch
                    borrowedAppliedQuality = "major"
                    context = ChordRootContext.BORROWED_APPLIED
                }
                // Default: numerator built from the MAJOR scale of the borrowed-resolved target.
                else -> {
                    val targetKey = KeyInfo(targetNoteName, "major")
                    effectiveDegree = applied
                    effectiveKey = targetKey
                    pitch = MusicTheory.resolveScaleDegreePitch(
                        sd = applied.toString(),
                        relativeOctave = 0,
                        key = targetKey,
                        baseOctave = targetPitch.octave
                    ) ?: return null
                    context = ChordRootContext.BORROWED_APPLIED
                }
            }
        } else {
            effectiveDegree = root
            effectiveKey = modifiedKey
            pitch = targetPitch
            context = when {
                customIntervals != null -> ChordRootContext.CUSTOM_BORROWED
                hasNamedBorrowing -> ChordRootContext.BORROWED
                else -> ChordRootContext.STANDARD
            }
        }

        val qualities = when {
            applied in 1..7 && !hasBorrowedScale -> MusicTheory.CHORD_QUALITIES["major"]!!
            applied in 1..7 && hasBorrowedScale -> MusicTheory.CHORD_QUALITIES["major"]!!
            customIntervals != null -> customChordQualities(customIntervals)
            else -> MusicTheory.CHORD_QUALITIES[effectiveKey.scale]
                ?: MusicTheory.CHORD_QUALITIES["major"]!!
        }
        val baseQuality = borrowedAppliedQuality
            ?: qualities.getOrElse(Math.floorMod(effectiveDegree - 1, 7)) { "major" }
        val alterations = (chordJson["alterations"] as? JsonArray)
            ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            ?: emptyList()
        val quality = triadQualityWithAlts(baseQuality, chordJson)
            .let { if (alterations.contains("#5") && it == "major") "augmented" else it }
        val sourceTonic = SpelledPitch.parse(key.tonic, referenceOctave) ?: return null
        // Chord JSON carries a root scale degree, but no octave. Keep every
        // resolved root in the source key's written scale-degree register so
        // applied chords do not acquire an invented compound-octave shift.
        val sourceGenericSteps = Math.floorMod(
            pitch.letter.index - sourceTonic.letter.index,
            7
        )
        val registeredPitch = pitch.copy(
            octave = Math.floorDiv(sourceTonic.staffPosition + sourceGenericSteps, 7)
        )

        return ResolvedChordRoot(
            pitch = registeredPitch,
            simpleModePitch = pitch.copy(octave = referenceOctave),
            sourceDegree = root,
            effectiveDegree = effectiveDegree,
            sourceKey = key,
            effectiveKey = effectiveKey,
            customIntervals = customIntervals,
            chordQuality = quality,
            context = context,
            genericStepsFromTonic = registeredPitch.staffPosition - sourceTonic.staffPosition,
            specificSemitonesFromTonic = registeredPitch.chromaticPosition - sourceTonic.chromaticPosition
        )
    }

    private fun buildSuffix(chordJson: JsonObject, quality: String, opts: Map<String, Any> = emptyMap()): String {
        val type = (chordJson["type"] as? JsonPrimitive)?.intOrNull ?: 5
        val inversion = safeInt(chordJson["inversion"])
        val suspensions = (chordJson["suspensions"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()
        val alterations = (chordJson["alterations"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
        val omits = (chordJson["omits"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()
        val adds = (chordJson["adds"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()

        val fullyDiminished = opts["fullyDiminished"] as? Boolean ?: false
        val majorSeventh = opts["majorSeventh"] as? Boolean ?: false
        val suspended = suspensions.isNotEmpty()
        
        val displayAlts = alterations
        val altInline = if (displayAlts.isNotEmpty()) displayAlts.joinToString("") { "($it)" } else ""
        
        val susStr = if (suspended) suspensions.joinToString("") { "sus$it" } else ""
        val omit3Only = omits.contains(3) && !omits.contains(5)
        val sharp5Only = displayAlts.size == 1 && (displayAlts[0] == "#5")
        
        val suppressPlusForSharp5 = safeInt(chordJson["applied"]) !in 1..7 && type < 7 && sharp5Only && (inversion == 1 || inversion == 2)
        val suppressDimForSharp5Inv2 = sharp5Only && quality == "diminished" && inversion == 2 && type < 7

        var suffix = ""
        var alterationsEmbedded = false
        var susPlaced = false
        var omitsPlaced = false
        var addsPlaced = false

        val augmented = quality == "augmented" || (quality == "major" && !suspended && alterations.any { it == "#5" } && !suppressPlusForSharp5)
        if (augmented) suffix += "+"

        if (!suspended) {
            if (quality == "diminished" && !suppressDimForSharp5Inv2) {
                if (type >= 7 && !fullyDiminished) {
                    suffix += "ø"
                } else {
                    suffix += "°"
                    if (majorSeventh) suffix += "△"
                }
            } else if (type >= 7 && majorSeventh) {
                suffix += "△"
            }
        }

        // Figured-bass (Refined via Fix 057-062)
        when (inversion) {
            1 -> {
                if (type >= 7) {
                    suffix += if (altInline.isNotEmpty()) "6${altInline}5" else "65"
                    if (altInline.isNotEmpty()) alterationsEmbedded = true
                } else if (altInline.isNotEmpty()) {
                    suffix += "6$altInline"
                    alterationsEmbedded = true
                } else if (suspended) {
                    val sus4Only = suspensions.contains(4) && !suspensions.contains(2)
                    suffix += if (sus4Only && (safeString(chordJson["borrowed"]) == "lydian" || opts["borrowedTag"] == "(lyd)")) "sus${suspensions.joinToString("")}6" else "6$susStr"
                    susPlaced = true
                } else suffix += "6"
            }
            2 -> {
                if (type >= 7) {
                    suffix += if (altInline.isNotEmpty()) "4${altInline}3" else "43"
                    if (altInline.isNotEmpty()) alterationsEmbedded = true
                } else if (suspended) {
                    if (adds.isNotEmpty()) {
                        val addBody = adds.joinToString("") { "add${if (it <= 6 && type >= 7) it + 7 else it}" }
                        if (suspensions.contains(4) && suspensions.contains(2)) {
                            suffix += "4${susStr}6($addBody)"
                        } else {
                            suffix += "6($addBody)4$susStr"
                        }
                        susPlaced = true
                        addsPlaced = true
                    } else {
                        suffix += if (safeInt(chordJson["applied"]) in 1..7) "64$susStr" else "4${susStr}6"
                        susPlaced = true
                    }
                } else if (sharp5Only) {
                    val rootVal = safeInt(chordJson["root"])
                    val iMinorTonicSharp5 = quality == "minor" && rootVal == 1 && safeString(chordJson["borrowed"]).isEmpty() && chordJson["borrowed"] !is JsonArray
                    if (iMinorTonicSharp5) suffix += "46$altInline"
                    else if (adds.isNotEmpty()) {
                        suffix += (if (quality == "minor" || quality == "diminished" || suffix.contains('+')) "" else "+") + "6(" + adds.joinToString("") { "add$it" } + ")$altInline" + "4"
                        addsPlaced = true
                    }
                    else suffix += (if (quality == "minor" || quality == "diminished" || suffix.contains('+')) "" else "+") + "6$altInline" + "4"
                    alterationsEmbedded = true
                } else if (omit3Only) {
                    val tonic = opts["keyTonic"] as? String ?: ""
                    val omit3Use46 = safeString(chordJson["borrowed"]).isEmpty() && chordJson["borrowed"] !is JsonArray && ((quality == "minor" && safeInt(chordJson["root"]) == 4 && (tonic == "F" || tonic == "B"))
                        || (quality == "minor" && safeInt(chordJson["root"]) == 1 && tonic == "C")
                        || (safeInt(chordJson["root"]) == 7 && opts["keyScale"] == "phrygian"))
                    
                    if (omit3Use46) suffix += "46(no3)"
                    else suffix += "6(no3)4"
                    omitsPlaced = true
                } else if (altInline.isNotEmpty()) {
                    suffix += "6${altInline}4"
                    alterationsEmbedded = true
                } else {
                    suffix += "64"
                }
            }
            3 -> {
                if (type >= 7 && altInline.isNotEmpty()) {
                    suffix += "4${altInline}2"
                    alterationsEmbedded = true
                } else suffix += "42"
            }
        }

        if (suspended && !susPlaced) {
            val hasFigured = Regex("[0-9]").containsMatchIn(suffix)
            if (type >= 7 && !hasFigured) {
                if (suspensions.size > 1) {
                    val a = suspensions[0]; val b = suspensions[1]
                    if (a < b) suffix += susStr + type.toString()
                    else {
                        suffix += type.toString() + omits.joinToString("") { "(no$it)" } + susStr
                        if (omits.isNotEmpty()) omitsPlaced = true
                    }
                } else {
                    suffix += type.toString() + altInline + susStr
                    if (altInline.isNotEmpty()) alterationsEmbedded = true
                }
            } else {
                suffix += susStr
            }
        } else if (type >= 7) {
            if (!Regex("[0-9]").containsMatchIn(suffix)) suffix += type.toString()
        }

        val borrowedTag = opts["borrowedTag"] as? String ?: ""
        if (borrowedTag.isNotEmpty()) suffix += borrowedTag

        if (adds.isNotEmpty() && !addsPlaced) {
            val addBody = adds.joinToString("") { 
                val n = if (it <= 6 && type >= 7) it + 7 else it
                "add$n"
            }
            suffix += "($addBody)"
        }

        if (omits.isNotEmpty() && !omitsPlaced) {
            val omit3 = omits.contains(3); val omit5 = omits.contains(5)
            if (omit3 && omit5 && quality == "augmented") {
                suffix += "(no5no3)"
            } else {
                suffix += omits.joinToString("") { "(no$it)" }
            }
        }

        if (displayAlts.isNotEmpty() && !alterationsEmbedded) {
            suffix += "(${displayAlts.joinToString("")})"
        }

        return suffix
    }

    private fun buildNumeral(degree: Int, qualities: List<String>, chordJson: JsonObject, prefix: String, opts: Map<String, Any> = emptyMap()): String {
        val baseQuality = opts["quality"] as? String ?: qualities.getOrElse(((degree - 1) % 7 + 7) % 7) { "major" }
        val quality = triadQualityWithAlts(baseQuality, chordJson)
        
        var roman = ROMAN_MAP[degree] ?: ""
        if (quality == "minor" || quality == "diminished") roman = roman.lowercase()
        
        return prefix + roman + buildSuffix(chordJson, quality, opts)
    }

    private fun triadQualityWithAlts(baseQuality: String, chord: JsonObject): String {
        val alterations = (chord["alterations"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
        if (alterations.contains("#5") && baseQuality == "diminished") return "minor"
        if (alterations.contains("b5") && baseQuality == "minor") return "diminished"
        return baseQuality
    }

    private fun appliedTarget(chord: JsonObject, key: KeyInfo): Pair<String, String> {
        val root = safeInt(chord["root"])
        val borrowed = safeString(chord["borrowed"])
        val raw = rawCustomBorrowedIntervals(chord["borrowed"])
        val custom = raw?.let { customBorrowedIntervals(chord["borrowed"]) }
        val scale = if (custom != null) "custom" else if (BORROWED_TAG.containsKey(borrowed)) borrowed else key.scale
        val target = MusicTheory.getNoteLabel(root, key.tonic, scale, custom)
        val quality = if (custom != null) customChordQualities(custom)[root - 1] else (MusicTheory.CHORD_QUALITIES[scale] ?: MusicTheory.CHORD_QUALITIES["major"]!!)[root - 1]
        val original = MusicTheory.getNoteLabel(root, key.tonic, key.scale)
        var shift = (notePitchClass(target) ?: 0) - (notePitchClass(original) ?: 0)
        while (shift > 6) shift -= 12
        while (shift < -6) shift += 12
        val prefix = if (shift < 0) "♭".repeat(-shift) else "♯".repeat(shift)
        val roman = ROMAN_MAP[root].orEmpty().let { if (quality == "minor" || quality == "diminished") it.lowercase() else it }
        return target to (prefix + roman + when (quality) { "diminished" -> "°"; "augmented" -> "+"; else -> "" })
    }

    fun getRomanSymbol(chordJson: JsonObject, key: KeyInfo): String {
        val root = safeInt(chordJson["root"])
        if (root !in 1..7 || safeBoolean(chordJson["isRest"]) || safeBoolean(chordJson["rest"])) return ""

        val applied = safeInt(chordJson["applied"])
        val borrowed = safeString(chordJson["borrowed"])
        
        if (applied in 1..7) {
            val target = appliedTarget(chordJson, key)
            val numeratorKey = KeyInfo(target.first, "major")
            val triSub = isTriSubApplied(chordJson)
            val numDegree = if (triSub) 2 else applied
            val type = safeInt(chordJson["type"], 5)
            val suspended = (chordJson["suspensions"] as? JsonArray)?.isNotEmpty() == true
            val majorSeventh = type >= 7 && applied != 5 && MusicTheory.CHORD_QUALITIES["major"]!![applied - 1] == "major" && isMajorSeventh(applied, numeratorKey) && !suspended
            val numerator = buildNumeral(numDegree, MusicTheory.CHORD_QUALITIES["major"]!!, chordJson,
                if (triSub) "♭" else "", mapOf("fullyDiminished" to (applied == 7 && !triSub && !suspended), "majorSeventh" to majorSeventh) + if (triSub) mapOf("quality" to "major") else emptyMap())
            val borrowTag = if (chordJson["borrowed"] is JsonArray) "(bor)" else BORROWED_TAG[borrowed]?.let { "($it)" }.orEmpty()
            val numeratorTag = if (!triSub && key.scale in setOf("minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "phrygianDominant")) "(maj)" else ""
            return numerator + (if (triSub) "(∆-sub)" else "") + "$numeratorTag/${target.second}$borrowTag"
        }

        // A custom borrowed scale arrives as an array of absolute semitone offsets.
        // Its quality and accidental come from the array itself, never from the
        // song key's scale (web/lib/jsonToSymbol.js, the Array.isArray branch).
        rawCustomBorrowedIntervals(chordJson["borrowed"])?.let { raw ->
            val type = safeInt(chordJson["type"], 5)
            val quality = triadQualityWithAlts(customArrayTriadQuality(raw, root), chordJson)
            val hasAdds = (chordJson["adds"] as? JsonArray)?.isNotEmpty() ?: false
            val opts = mutableMapOf<String, Any>(
                "quality" to quality,
                "majorSeventh" to (type >= 7 && customArraySeventhMajor(raw, root)),
                "fullyDiminished" to (quality == "diminished" && type >= 7 && Math.floorMod(raw[(root + 5) % 7] - raw[root - 1], 12) in listOf(9, 11))
            )
            if (hasAdds) opts["borrowedTag"] = "(bor)"
            val numeral = buildNumeral(
                root,
                MusicTheory.CHORD_QUALITIES["major"]!!,
                chordJson,
                customArrayPrefix(raw, root, key),
                opts
            )
            return numeral + (if (hasAdds) "" else "(bor)")
        }

        var scale = key.scale
        var tag = ""
        var prefix = ""
        
        if (borrowed.isNotEmpty()) {
            if (BORROWED_TAG.containsKey(borrowed)) {
                scale = borrowed
                prefix = borrowedPrefix(root, key, borrowed)
                tag = "(${BORROWED_TAG[borrowed]})"
            } else if (borrowed.startsWith("[")) {
                tag = "(bor)"
            }
        }
        
        val qualities = MusicTheory.CHORD_QUALITIES[scale] ?: MusicTheory.CHORD_QUALITIES["major"]!!
        val quality = triadQualityWithAlts(qualities.getOrElse(((root - 1) % 7 + 7) % 7) { "major" }, chordJson)
        val majorSeventh = safeInt(chordJson["type"], 5) >= 7 && quality != "diminished" && isMajorSeventh(root, KeyInfo(key.tonic, scale))
        
        val hasAdds = (chordJson["adds"] as? JsonArray)?.isNotEmpty() ?: false
        val opts = mutableMapOf<String, Any>("majorSeventh" to majorSeventh, "fullyDiminished" to (quality == "diminished" && (scale == "harmonicMinor" && root == 7 || scale == "phrygianDominant" && root == 3)), "keyScale" to scale, "keyTonic" to key.tonic, "borrowed" to borrowed)
        if (tag.isNotEmpty() && hasAdds) opts["borrowedTag"] = tag
        
        return buildNumeral(root, qualities, chordJson, prefix, opts) + (if (tag.isNotEmpty() && !hasAdds) tag else "")
    }

    /**
     * Renders the source chord against an Ionian label context without changing
     * any pitch or playback input. The sounding chord quality and all
     * extensions/inversions stay sourced from the original modal context. The
     * overload with an explicit context key lets an entire section keep one
     * tonic across local key changes.
     */
    fun getRelativeIonianRomanSymbol(chordJson: JsonObject, key: KeyInfo): String =
        getRelativeIonianRomanSymbol(chordJson, key, relativeIonianKey(key))

    fun getRelativeIonianRomanSymbol(
        chordJson: JsonObject,
        key: KeyInfo,
        ionianContextKey: KeyInfo
    ): String {
        val symbol = getRomanSymbol(chordJson, key)
        if (symbol.isEmpty()) return symbol
        val sourceKey = KeyInfo(key.tonic, canonicalScaleName(key.scale))
        val displayKey = KeyInfo(ionianContextKey.tonic, "major")
        val applied = safeInt(chordJson["applied"])
        val pitch = if (applied in 1..7) {
            val target = appliedTarget(chordJson, sourceKey).first
            MusicTheory.resolveScaleDegreePitch("1", 0, KeyInfo(target, "major"))
        } else resolveChordRoot(chordJson, sourceKey)?.pitch
        val degree = pitch?.let { degreeInKey(it, displayKey) } ?: return symbol
        val slash = if (applied in 1..7) symbol.indexOf('/') else -1
        val start = if (slash >= 0) slash + 1 else 0
        val base = Regex("^[♭♯]*([IViv]+)").find(symbol.substring(start)) ?: return symbol
        val roman = ROMAN_MAP[degree.degree].orEmpty().let { if (base.groupValues[1].first().isLowerCase()) it.lowercase() else it }
        return symbol.substring(0, start) + degree.accidentalPrefix + roman + symbol.substring(start + base.value.length)
    }

    fun getLetterName(chordJson: JsonObject, key: KeyInfo): String {
        val root = safeInt(chordJson["root"])
        if (safeBoolean(chordJson["isRest"]) || safeBoolean(chordJson["rest"])) return ""
        if (root !in 1..7) return letterAnchoredName(chordJson, key)

        val applied = safeInt(chordJson["applied"])
        val borrowed = safeString(chordJson["borrowed"])
        val rawCustom = rawCustomBorrowedIntervals(chordJson["borrowed"])
        val customIntervals = if (rawCustom != null) customBorrowedIntervals(chordJson["borrowed"]) else null
        val type = (chordJson["type"] as? JsonPrimitive)?.intOrNull ?: 5
        val inversion = safeInt(chordJson["inversion"])
        val suspensions = (chordJson["suspensions"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()

        var effKey = key
        var degree = root
        
        // Resolve the target's prevailing scale before spelling an applied root.
        if (applied in 1..7) {
            val targetTonic = appliedTarget(chordJson, key).first
            if (isTriSubApplied(chordJson)) {
                effKey = KeyInfo(MusicTheory.getNoteLabel("b2", targetTonic, "major"), "major")
                degree = 1
            } else {
                effKey = KeyInfo(targetTonic, "major")
                degree = applied
            }
        } else if (rawCustom != null) {
            // Custom borrowed scale: spellings and quality come from the array.
            effKey = KeyInfo(key.tonic, "custom")
        } else if (borrowed.isNotEmpty()) {
            if (BORROWED_TAG.containsKey(borrowed)) {
                effKey = KeyInfo(key.tonic, borrowed)
            }
        }

        val qualities = MusicTheory.CHORD_QUALITIES[effKey.scale] ?: MusicTheory.CHORD_QUALITIES["major"]!!
        val baseQuality = if (rawCustom != null && applied !in 1..7) {
            customArrayTriadQuality(rawCustom, degree)
        } else {
            qualities.getOrElse(((degree - 1) % 7 + 7) % 7) { "major" }
        }
        val quality = triadQualityWithAlts(baseQuality, chordJson)

        val rootNoteName = MusicTheory.getNoteLabel(degree, effKey.tonic, effKey.scale, customIntervals).replace("x", "##")
        val augmented = quality == "augmented"
        val triSub = isTriSubApplied(chordJson)
        val suspended = suspensions.isNotEmpty()
        
        var majorSeventh = false
        if (type >= 7 && quality != "diminished" && !augmented && !suspended) {
            if (applied in 1..7) {
                if (!triSub) {
                    val targetTonic = appliedTarget(chordJson, key).first
                    majorSeventh = quality == "major" && applied != 5 && !suspended
                        && isMajorSeventh(applied, KeyInfo(targetTonic, "major"))
                }
            } else if (rawCustom != null) {
                majorSeventh = customArraySeventhMajor(rawCustom, degree)
            } else {
                majorSeventh = isMajorSeventh(degree, effKey)
            }
        }
        
        val augMaj7Letter = augmented && type >= 7 && (
            if (applied in 1..7 && !triSub) {
                val targetTonic = appliedTarget(chordJson, key).first
                isMajorSeventh(applied, KeyInfo(targetTonic, "major"))
            } else if (rawCustom != null) {
                customArraySeventhMajor(rawCustom, degree)
            } else {
                isMajorSeventh(degree, effKey)
            }
        )
        val voiced = ChordVoicing.build(chordJson, key)
        val bass = if (inversion > 0) voiced?.tones?.firstOrNull() else null
        val bassName = if (bass != null && voiced != null) spellChordTone(rootNoteName, bass, voiced.rootMidi) else null
        return ChordLetterFormat.format(chordJson, rootNoteName, quality, degree, majorSeventh,
            augMaj7Letter, triSub, bassName, effKey, customIntervals).replace("x", "##")
    }

    private fun spellChordTone(rootName: String, tone: ChordTone, rootMidi: Int): String {
        val degree = Math.floorMod(tone.degree - 1, 7) + 1
        val natural = MusicTheory.SCALE_INTERVALS["major"]!![degree - 1]
        var delta = Math.floorMod(tone.midi - rootMidi - natural, 12)
        if (delta > 6) delta -= 12
        val name = MusicTheory.getNoteLabel(degree, rootName, "major")
        val accidental = MusicTheory.getModifierValue(name.drop(1)) + delta
        return name.first().toString() + if (accidental < 0) "b".repeat(-accidental) else "#".repeat(accidental)
    }

    private fun letterAnchoredName(chord: JsonObject, key: KeyInfo): String {
        val root = safeString(chord["_letterRootName"])
        if (!Regex("^[A-G][#bx]*$").matches(root) || (chord["root"] != null && safeInt(chord["root"]) != 0)) return ""
        val quality = safeString(chord["_letterQuality"], "major")
        val type = safeInt(chord["type"], 5)
        var suffix = when (quality) { "minor" -> "m"; "diminished" -> "°"; "augmented" -> "+"; else -> "" }
        if (type >= 7) suffix += (if (safeBoolean(chord["useMaj7"])) "maj" else "") + type
        suffix += (chord["suspensions"] as? JsonArray)?.joinToString("") { "sus${(it as? JsonPrimitive)?.contentOrNull.orEmpty()}" }.orEmpty()
        suffix += (chord["alterations"] as? JsonArray)?.joinToString("") { "(${(it as? JsonPrimitive)?.contentOrNull.orEmpty()})" }.orEmpty()
        suffix += (chord["adds"] as? JsonArray)?.joinToString("") { "(add${(it as? JsonPrimitive)?.contentOrNull.orEmpty()})" }.orEmpty()
        val bass = safeString(chord["_letterBassName"])
        return root + suffix + if (bass.isNotEmpty()) "/$bass" else ""
    }

    fun getChordNotes(chordJson: JsonObject, key: KeyInfo): List<Int> =
        ChordVoicing.build(chordJson, key)?.tones?.map { it.midi }.orEmpty()

    fun getResolvedRootMidi(chordJson: JsonObject, key: KeyInfo): Int? =
        ChordVoicing.build(chordJson, key)?.rootMidi

    fun getChordToneLabels(chordJson: JsonObject, key: KeyInfo): List<String> =
        ChordVoicing.build(chordJson, key)?.labels.orEmpty()

    fun interpret(chordJson: JsonObject, key: KeyInfo): ChordInterpretation {
        val voiced = ChordVoicing.build(chordJson, key)
        return ChordInterpretation(getRomanSymbol(chordJson, key), getLetterName(chordJson, key),
            voiced?.tones?.map { it.midi }.orEmpty(), voiced?.rootMidi, voiced?.labels.orEmpty())
    }

    /**
     * Returns the same chord voiced in root position, regardless of the
     * inversion encoded in the source JSON. Use getResolvedRootMidi() to
     * identify the harmonic root: the first sounded note can be another role.
     */
    fun getRootPositionChordNotes(chordJson: JsonObject, key: KeyInfo): List<Int> {
        val rootPositionChord = buildJsonObject {
            chordJson.forEach { (name, value) -> put(name, value) }
            put("inversion", 0)
        }
        return getChordNotes(rootPositionChord, key)
    }

    fun getUniqueDisplayChords(chords: List<JsonObject>, key: KeyInfo): List<JsonObject> {
        val result = mutableListOf<JsonObject>()
        val seenSignatures = mutableSetOf<String>()

        for (chord in chords) {
            val root = safeInt(chord["root"])
            val isRest = safeBoolean(chord["isRest"]) || safeBoolean(chord["rest"])

            if (isRest || root <= 0) continue

            val romanSymbol = getRomanSymbol(chord, key)
            if (romanSymbol.isEmpty() || romanSymbol == "Rest") continue

            val type = safeInt(chord["type"], 5)
            val inversion = safeInt(chord["inversion"])
            val applied = safeInt(chord["applied"])
            val borrowed = safeString(chord["borrowed"])
            val alts = (chord["alterations"] as? JsonArray)?.toString() ?: ""
            val sus = (chord["suspensions"] as? JsonArray)?.toString() ?: ""

            val signature = "${root}_${type}_${inversion}_${applied}_${borrowed}_${alts}_${sus}"

            if (seenSignatures.add(signature)) {
                result.add(chord)
            }
        }

        return result
    }
}
