package com.sacredring.android

import kotlinx.serialization.json.*

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


    private fun isMajorSeventh(degree: Int, effKey: KeyInfo, customIntervals: List<Int>? = null): Boolean {
        return try {
            val rootNote = MusicTheory.getNoteLabel(degree, effKey.tonic, effKey.scale, customIntervals)
            val rootPc = MusicTheory.NOTE_TO_PC[MusicTheory.normalizeTonic(rootNote)] ?: return false
            
            val seventhSD = ((degree - 1 + 6) % 7 + 7) % 7 + 1
            val seventhNote = MusicTheory.getNoteLabel(seventhSD, effKey.tonic, effKey.scale, customIntervals)
            val seventhPc = MusicTheory.NOTE_TO_PC[MusicTheory.normalizeTonic(seventhNote)] ?: return false
            
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
        
        val implicitHalfDimB5 = quality == "diminished" && type >= 7 && !fullyDiminished
        val displayAlts = if (implicitHalfDimB5) alterations.filter { it != "b5" } else alterations
        val altInline = if (displayAlts.isNotEmpty()) displayAlts.joinToString("") { "($it)" } else ""
        
        val susStr = if (suspended) suspensions.joinToString("") { "sus$it" } else ""
        val omit3Only = omits.contains(3) && !omits.contains(5)
        val sharp5Only = displayAlts.size == 1 && (displayAlts[0] == "#5")
        
        val suppressPlusForSharp5 = type < 7 && sharp5Only && (inversion == 1 || inversion == 2)
        val suppressDimForSharp5Inv2 = sharp5Only && quality == "diminished" && inversion == 2 && type < 7

        var suffix = ""
        var alterationsEmbedded = false
        var susPlaced = false
        var omitsPlaced = false

        val augmented = quality == "augmented" || (alterations.any { it == "#5" } && !suppressPlusForSharp5)
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
                if (suspended && type < 7) {
                    val sus4Only = suspensions.contains(4) && !suspensions.contains(2)
                    if (sus4Only && (opts["borrowed"] == "lydian" || opts["borrowedTag"] == "(lyd)")) {
                        suffix += "sus${suspensions.joinToString("")}6"
                        susPlaced = true
                    } else {
                        suffix += "6$susStr"
                        susPlaced = true
                    }
                } else if (type >= 7) {
                    suffix += if (altInline.isNotEmpty()) "6${altInline}5" else "65"
                    if (altInline.isNotEmpty()) alterationsEmbedded = true
                } else if (altInline.isNotEmpty()) {
                    suffix += "6$altInline"
                    alterationsEmbedded = true
                } else {
                    suffix += "6"
                }
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
                    } else {
                        suffix += "4${susStr}6"
                        susPlaced = true
                    }
                } else if (sharp5Only) {
                    val rootVal = safeInt(chordJson["root"])
                    val iMinorTonicSharp5 = quality == "minor" && rootVal == 1 && opts["borrowed"] == null
                    if (iMinorTonicSharp5) suffix += "46$altInline"
                    else suffix += (if (quality == "minor" || quality == "diminished") "" else "+") + "6$altInline" + "4"
                    alterationsEmbedded = true
                } else if (omit3Only) {
                    val tonic = opts["keyTonic"] as? String ?: ""
                    val omit3Use46 = (quality == "minor" && safeInt(chordJson["root"]) == 4 && (tonic == "F" || tonic == "B"))
                        || (quality == "minor" && safeInt(chordJson["root"]) == 1 && tonic == "C")
                        || (safeInt(chordJson["root"]) == 7 && opts["keyScale"] == "phrygian")
                    
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
                if (type >= 7) {
                    suffix += if (implicitHalfDimB5 && alterations.contains("b5")) "4(b5)2" else "42"
                    if (altInline.isNotEmpty()) alterationsEmbedded = true
                } else {
                    suffix += "42"
                }
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

        if (adds.isNotEmpty()) {
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
        if (alterations.contains("b5") && baseQuality == "minor") return "diminished"
        return baseQuality
    }

    fun getRomanSymbol(chordJson: JsonObject, key: KeyInfo): String {
        val root = safeInt(chordJson["root"])
        if (root <= 0) return "Rest"

        val applied = safeInt(chordJson["applied"])
        val borrowed = safeString(chordJson["borrowed"])
        
        // --- Applied chords (Fix 001/041) ---
        if (applied in 1..7 && borrowed.isEmpty()) {
            val targetTonic = MusicTheory.getNoteLabel(root, key.tonic, key.scale)
            val numeratorKey = KeyInfo(targetTonic, "major")
            val triSub = isTriSubApplied(chordJson)
            val numDegree = if (triSub) 2 else applied
            val numPrefix = if (triSub) "♭" else ""
            
            val parentQualities = MusicTheory.CHORD_QUALITIES[key.scale] ?: MusicTheory.CHORD_QUALITIES["major"]!!
            val targetQual = parentQualities.getOrElse(((root - 1) % 7 + 7) % 7) { "major" }
            
            val type = (chordJson["type"] as? JsonPrimitive)?.intOrNull ?: 5
            val appliedDenomMaj = (applied == 5 && type >= 7 && targetQual == "minor")
            
            val majorSeventh = type >= 7 && applied != 5
                && isMajorSeventh(numDegree, numeratorKey)
                && ((chordJson["suspensions"] as? JsonArray)?.isEmpty() ?: true)
            
            val numerator = buildNumeral(numDegree, MusicTheory.CHORD_QUALITIES["major"]!!, chordJson, numPrefix, 
                mapOf("fullyDiminished" to (applied == 7 && !triSub), "majorSeventh" to majorSeventh))
                
            val denominator = MusicTheory.ROMAN_NUMERALS[key.scale]?.getOrNull(((root - 1) % 7 + 7) % 7) ?: ""
            val denomTag = if (appliedDenomMaj) "(maj)" else ""
            val subTag = if (triSub) "(∆-sub)" else ""
            
            return "$numerator/$denominator$denomTag$subTag"
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
        val quality = qualities.getOrElse(((root - 1) % 7 + 7) % 7) { "major" }
        val majorSeventh = safeInt(chordJson["type"], 5) >= 7 && quality != "diminished" && isMajorSeventh(root, KeyInfo(key.tonic, scale))
        
        val hasAdds = (chordJson["adds"] as? JsonArray)?.isNotEmpty() ?: false
        val opts = mutableMapOf<String, Any>("majorSeventh" to majorSeventh, "keyScale" to scale, "keyTonic" to key.tonic, "borrowed" to borrowed)
        if (tag.isNotEmpty() && hasAdds) opts["borrowedTag"] = tag
        
        return buildNumeral(root, qualities, chordJson, prefix, opts) + (if (tag.isNotEmpty() && !hasAdds) tag else "")
    }

    fun getLetterName(chordJson: JsonObject, key: KeyInfo): String {
        val root = safeInt(chordJson["root"])
        if (root <= 0) return ""

        val applied = safeInt(chordJson["applied"])
        val borrowed = safeString(chordJson["borrowed"])
        val type = (chordJson["type"] as? JsonPrimitive)?.intOrNull ?: 5
        val inversion = safeInt(chordJson["inversion"])
        val suspensions = (chordJson["suspensions"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()
        val alterations = (chordJson["alterations"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
        val omits = (chordJson["omits"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()
        
        var effKey = key
        var degree = root
        
        // Fix 027: Handle borrowed applied targets
        if (applied in 1..7 && borrowed.isEmpty()) {
            val targetTonic = MusicTheory.getNoteLabel(root, key.tonic, key.scale)
            if (isTriSubApplied(chordJson)) {
                val rootPc = MusicTheory.NOTE_TO_PC[MusicTheory.normalizeTonic(targetTonic)] ?: 0
                val subRootPc = (rootPc + 1) % 12
                effKey = KeyInfo(PC_SPELL[subRootPc], "major")
                degree = 1
            } else {
                effKey = KeyInfo(targetTonic, "major")
                degree = applied
            }
        } else if (borrowed.isNotEmpty()) {
            if (BORROWED_TAG.containsKey(borrowed)) {
                effKey = KeyInfo(key.tonic, borrowed)
            } else if (borrowed.startsWith("[")) {
                effKey = KeyInfo(key.tonic, "custom")
            }
        }
        
        val qualities = MusicTheory.CHORD_QUALITIES[effKey.scale] ?: MusicTheory.CHORD_QUALITIES["major"]!!
        val baseQuality = qualities.getOrElse(((degree - 1) % 7 + 7) % 7) { "major" }
        val quality = if (alterations.contains("b5") && baseQuality == "minor") "diminished" else baseQuality
        
        val rootNoteName = MusicTheory.getNoteLabel(degree, effKey.tonic, effKey.scale)
        val augmented = quality == "augmented"
        val triSub = isTriSubApplied(chordJson)
        val sharp5 = alterations.contains("#5")
        val suspended = suspensions.isNotEmpty()
        val sus4Only = suspensions.contains(4) && !suspensions.contains(2)
        
        var majorSeventh = false
        if (type >= 7 && quality != "diminished" && !augmented && !suspended) {
            if (applied in 1..7) {
                if (!triSub) {
                    val targetTonic = MusicTheory.getNoteLabel(root, key.tonic, key.scale)
                    majorSeventh = quality == "major" && applied != 5 && !suspended
                        && isMajorSeventh(applied, KeyInfo(targetTonic, "major"))
                }
            } else {
                majorSeventh = isMajorSeventh(degree, effKey)
            }
        }
        
        val augMaj7Letter = augmented && type >= 7 && (
            if (applied in 1..7 && !triSub) {
                val targetTonic = MusicTheory.getNoteLabel(root, key.tonic, key.scale)
                isMajorSeventh(applied, KeyInfo(targetTonic, "major"))
            } else {
                isMajorSeventh(degree, effKey)
            }
        )
        val augOmit35 = augmented && omits.contains(3) && omits.contains(5)

        val sharp5ParenLetter = sharp5 && type < 7 && (
          (inversion == 2 && !suspended) || (inversion == 1 && sus4Only)
        )
        
        val omit3Only = omits.contains(3) && !omits.contains(5)
        val typeOrNull = (chordJson["type"] as? JsonPrimitive)?.intOrNull
        val omit3Power = omit3Only && typeOrNull != null && typeOrNull < 7
        
        var suffix = ""
        if (omit3Power) suffix += "5"
        else if (quality == "minor") suffix += "m"
        else if (quality == "diminished" && !suspended) suffix += "°"
        else if (augMaj7Letter || augOmit35) suffix += "++"
        else if (augmented || (sharp5 && !sharp5ParenLetter)) suffix += "+"
        
        if (type >= 7 && !augMaj7Letter) suffix += (if (majorSeventh) "maj" else "") + type.toString()
        if (sharp5ParenLetter) suffix += "(#5)"
        
        if (suspended) {
            suffix += suspensions.joinToString("") { s ->
                 if (s == 4 && sharp5ParenLetter) "sus#4" else "sus$s"
            }
        }
        if (alterations.isNotEmpty()) {
            val trailing = alterations.filter { it != "#5" || !sharp5ParenLetter }
            if (trailing.isNotEmpty()) suffix += trailing.joinToString("") { "($it)" }
        }

        if (inversion in 1..3) {
            val sus4Bass = type < 7 && suspensions.contains(4) && !suspensions.contains(2)
            val bassOffset = when (inversion) {
                1 -> if (sus4Bass) 3 else 2
                2 -> 4
                3 -> 6
                else -> 0
            }
            val bassDegree = ((degree - 1 + bassOffset) % 7 + 7) % 7 + 1
            val bassNoteName = MusicTheory.getNoteLabel(bassDegree, effKey.tonic, effKey.scale)
            return "$rootNoteName$suffix/$bassNoteName"
        }

        return rootNoteName + suffix
    }

    fun getChordNotes(chordJson: JsonObject, key: KeyInfo): List<Int> {
        val root = safeInt(chordJson["root"])
        if (root <= 0) return emptyList()

        val applied = safeInt(chordJson["applied"])
        val type = (chordJson["type"] as? JsonPrimitive)?.intOrNull ?: 5
        val inversion = safeInt(chordJson["inversion"])
        val borrowed = safeString(chordJson["borrowed"])
        val suspensions = (chordJson["suspensions"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()
        val alterations = (chordJson["alterations"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
        val omits = (chordJson["omits"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()
        val adds = (chordJson["adds"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()
        
        var effKey = key
        var effRoot = root
        if (applied in 1..7 && borrowed.isEmpty()) {
            val targetTonic = MusicTheory.getNoteLabel(root, key.tonic, key.scale)
            if (isTriSubApplied(chordJson)) {
                val rootPc = MusicTheory.NOTE_TO_PC[MusicTheory.normalizeTonic(targetTonic)] ?: 0
                val subRootPc = (rootPc + 1) % 12
                effKey = KeyInfo(PC_SPELL[subRootPc], "major")
                effRoot = 1
            } else {
                effKey = KeyInfo(targetTonic, "major")
                effRoot = applied
            }
        }

        val scale = if (borrowed.isNotEmpty()) borrowed else effKey.scale
        val intervals = MusicTheory.SCALE_INTERVALS[scale] ?: MusicTheory.SCALE_INTERVALS["major"]!!
        val tonicPc = MusicTheory.NOTE_TO_PC[MusicTheory.normalizeTonic(effKey.tonic)] ?: 0
        
        val idxRoot = ((effRoot - 1) % 7 + 7) % 7
        val rootPc = (tonicPc + intervals[idxRoot]) % 12
        
        // Base major-frame offsets relative to root
        val degrees = mutableMapOf<Int, Int>()
        degrees[1] = 0
        degrees[3] = 4
        degrees[5] = 7
        
        val qualities = MusicTheory.CHORD_QUALITIES[scale] ?: MusicTheory.CHORD_QUALITIES["major"]!!
        val triadQuality = qualities.getOrElse(idxRoot) { "major" }
        if (triadQuality == "minor" || triadQuality == "diminished") degrees[3] = 3
        if (triadQuality == "diminished") degrees[5] = 6
        if (triadQuality == "augmented") degrees[5] = 8

        // Fix 018: Suspensions
        if (suspensions.contains(2)) degrees[3] = 2
        if (suspensions.contains(4)) degrees[3] = 5

        // Extensions
        if (type >= 7) {
            val triSub = isTriSubApplied(chordJson)
            val isMaj7 = if (applied in 1..7) {
                 !triSub && applied != 5 && triadQuality == "major" && isMajorSeventh(effRoot, KeyInfo(effKey.tonic, scale))
            } else {
                 isMajorSeventh(effRoot, KeyInfo(effKey.tonic, scale))
            }
            
            // Fix 025/026: Diminished 7th voicing
            val isDim7 = (triadQuality == "diminished" && !suspensions.isNotEmpty()) || (applied == 7) ||
                        (borrowed == "dorian" && effRoot == 6) || (borrowed == "lydian" && effRoot == 4) ||
                        (borrowed == "minor" && effRoot == 2) || (borrowed == "phrygian" && effRoot == 5)
            
            // Fix 043: Harmonic-minor III+△7 voicing
            val isHmAugMaj7 = scale == "harmonicMinor" && effRoot == 3 && !suspensions.isNotEmpty()

            degrees[7] = when {
                isHmAugMaj7 -> 7 // Scale degree 7 (Bb) is PC 10 relative to Tonic C, PC 7 relative to Root Eb!
                isDim7 -> 9
                isMaj7 && !suspensions.isNotEmpty() -> 11
                else -> 10
            }

            if (isHmAugMaj7) {
                 degrees[11] = 11 // add maj7 (D)
                 degrees.remove(5) // omit #5
                 degrees[3] = 4 // ensure maj 3rd
            }
        }
        if (type >= 9) degrees[9] = 14
        if (type >= 11) {
             degrees[11] = if (degrees.containsKey(11)) degrees[11]!! else 17
        }
        if (type >= 13) degrees[13] = 21

        // Port Fix 044/045: minorExtended13Stack (v13 in minor keys)
        val isMinorV13 = (effKey.scale == "minor" || effKey.scale == "harmonicMinor") && effRoot == 5 && type >= 13
        if (isMinorV13) {
             degrees[9] = 13 // b9
             degrees[13] = 21 // natural 13
             degrees[14] = 20 // additive b13
        }

        // Fix 019-022: Modifier Pipeline (Omits -> Alterations -> Adds)
        for (o in omits) degrees.remove(o)
        
        for (alt in alterations) {
            when (alt) {
                "b5", "♭5" -> degrees[5] = 6
                "#5", "♯5" -> degrees[5] = 8
                "b9", "♭9" -> degrees[9] = 13
                "#9", "♯9" -> degrees[9] = 15
                "#11", "♯11" -> degrees[11] = 18
                "b13", "♭13" -> degrees[13] = 20
            }
        }
        
        for (add in adds) {
            val target = if (add <= 6 && type >= 7) add + 7 else add
            if (!degrees.containsKey(target)) {
                degrees[target] = when(target) {
                    2 -> 2; 4 -> 5; 6 -> 9; 9 -> 14; 11 -> 17; 13 -> 21
                    else -> 0
                }
            }
        }

        // Build pitches
        val pitches = degrees.values.map { rootPc + 48 + it }.toMutableList()
        
        // Fix 031: Sort pitches ascending for inversion 0
        pitches.sort()

        // Apply inversion rotation
        if (inversion > 0 && inversion < pitches.size) {
            for (i in 0 until inversion) {
                val moved = pitches.removeAt(0)
                pitches.add(moved + 12)
            }
        }

        return pitches
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
