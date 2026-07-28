package com.sacredring.android

import kotlinx.serialization.json.*

object ChordInterpreter {
    
    private val ROMAN_MAP = mapOf(1 to "I", 2 to "II", 3 to "III", 4 to "IV", 5 to "V", 6 to "VI", 7 to "VII")

    private val BORROWED_TAG = mapOf(
        "minor" to "min", "dorian" to "dor", "phrygian" to "phr",
        "lydian" to "lyd", "mixolydian" to "mix", "locrian" to "loc", "major" to "maj",
        "harmonicMinor" to "hmin", "phrygianDominant" to "phdm",
    )


    private fun isTriSubApplied(chordJson: JsonObject): Boolean {
        val applied = chordJson["applied"]?.jsonPrimitive?.int ?: 0
        val substitutions = chordJson["substitutions"]?.jsonArray
        return (applied == 5) && (substitutions?.any { it.jsonPrimitive.content == "tri" } == true)
    }


    private fun isMajorSeventh(degree: Int, effKey: KeyInfo, customIntervals: List<Int>? = null): Boolean {
        return try {
            val rootNote = MusicTheory.getNoteLabel(degree, effKey.tonic, effKey.scale, customIntervals)
            val rootPc = MusicTheory.NOTE_TO_PC[rootNote] ?: return false
            
            val seventhSD = ((degree - 1 + 6) % 7) + 1
            val seventhNote = MusicTheory.getNoteLabel(seventhSD, effKey.tonic, effKey.scale, customIntervals)
            val seventhPc = MusicTheory.NOTE_TO_PC[seventhNote] ?: return false
            
            ((seventhPc - rootPc + 12) % 12) == 11
        } catch (_: Exception) {
            false
        }

    }


    private fun accidentalValue(note: String): Int {
        val m = Regex("^([A-G])(.*)$").find(note) ?: return 0
        val accidental = m.groupValues[2]
        var value = 0
        for (ch in accidental) {
            when (ch) {
                '♭', 'b' -> value -= 1
                '♯', '#' -> value += 1
                'x' -> value += 2
            }
        }
        return value
    }

    private fun borrowedPrefix(degree: Int, key: KeyInfo, borrowedScale: String): String {
        try {
            val borrowedNote = MusicTheory.getNoteLabel(degree, key.tonic, borrowedScale)
            val refNote = MusicTheory.getNoteLabel(degree, key.tonic, key.scale.ifEmpty { "major" })
            val diff = accidentalValue(borrowedNote) - accidentalValue(refNote)
            return when (diff) {
                -1 -> "♭"
                -2 -> "♭♭"
                1 -> "♯"
                2 -> "♯♯"
                else -> ""
            }

        } catch (e: Exception) {
            return ""
        }
    }

    private fun buildSuffix(chordJson: JsonObject, quality: String, opts: Map<String, Any> = emptyMap()): String {
        val type = chordJson["type"]?.jsonPrimitive?.int ?: 5
        val inversion = chordJson["inversion"]?.jsonPrimitive?.int ?: 0
        val suspensions = chordJson["suspensions"]?.jsonArray?.map { it.jsonPrimitive.int } ?: emptyList()
        val alterations = chordJson["alterations"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
        val omits = chordJson["omits"]?.jsonArray?.map { it.jsonPrimitive.int } ?: emptyList()
        val adds = chordJson["adds"]?.jsonArray?.map { it.jsonPrimitive.int } ?: emptyList()

        val fullyDiminished = opts["fullyDiminished"] as? Boolean ?: false
        val majorSeventh = opts["majorSeventh"] as? Boolean ?: false
        val suspended = suspensions.isNotEmpty()
        
        val implicitHalfDimB5 = quality == "diminished" && type >= 7 && !fullyDiminished
        val displayAlts = if (implicitHalfDimB5) alterations.filter { it != "♭5" && it != "b5" } else alterations
        val altInline = if (displayAlts.isNotEmpty()) displayAlts.joinToString("") { "($it)" }.replace("b", "♭").replace("#", "♯") else ""
        
        val susStr = if (suspended) suspensions.joinToString("") { "sus$it" } else ""
        val omit3Only = omits.contains(3) && !omits.contains(5)
        val sharp5Only = displayAlts.size == 1 && (displayAlts[0] == "#5" || displayAlts[0] == "♯5")
        
        val suppressPlusForSharp5 = type < 7 && sharp5Only && (inversion == 1 || inversion == 2)
        val suppressDimForSharp5Inv2 = sharp5Only && quality == "diminished" && inversion == 2 && type < 7

        var suffix = ""
        var alterationsEmbedded = false
        var susPlaced = false
        var addsPlaced = false
        var omitsPlaced = false

        val augmented = quality == "augmented" || (alterations.any { it == "#5" || it == "♯5" } && !suppressPlusForSharp5)
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

        // Figured-bass
        when (inversion) {
            1 -> {
                if (type >= 7) {
                    if (altInline.isNotEmpty()) {
                        suffix += "6${altInline}5"
                        alterationsEmbedded = true
                    } else suffix += "65"
                } else if (altInline.isNotEmpty()) {
                    suffix += "6$altInline"
                    alterationsEmbedded = true
                } else if (suspended) {
                    val sus4Only = suspensions.contains(4) && !suspensions.contains(2)
                    suffix += if (sus4Only && (opts["borrowed"] == "lydian" || opts["borrowedTag"] == "(lyd)")) {
                        "sus${suspensions.joinToString("")}6"
                    } else {
                        "6$susStr"
                    }
                    susPlaced = true

                } else {
                    suffix += "6"
                }
            }
            2 -> {
                if (type >= 7) {
                    if (altInline.isNotEmpty()) {
                        suffix += "4${altInline}3"
                        alterationsEmbedded = true
                    } else suffix += "43"
                } else if (suspended) {
                    if (adds.isNotEmpty()) {
                        val addBody = adds.joinToString("") { "add$it" }
                        val dualSus = suspensions.contains(4) && suspensions.contains(2)
                        if (dualSus) suffix += "4${susStr}6($addBody)"
                        else suffix += "6($addBody)4$susStr"
                        susPlaced = true
                        addsPlaced = true
                    } else {
                        suffix += "4${susStr}6"
                        susPlaced = true
                    }
                } else if (sharp5Only) {
                    val iMinorTonicSharp5 = quality == "minor" && (chordJson["root"]?.jsonPrimitive?.int ?: 0) == 1 && opts["borrowed"] == null
                    if (iMinorTonicSharp5) suffix += "46$altInline"
                    else if (adds.isNotEmpty()) {
                        val addBody = adds.joinToString("") { "add$it" }
                        if (quality == "minor" || quality == "diminished") suffix += "6($addBody)${altInline}4"
                        else suffix += "+6($addBody)${altInline}4"
                        addsPlaced = true
                    } else if (quality == "minor" || quality == "diminished") suffix += "6${altInline}4"
                    else suffix += "+6${altInline}4"
                    alterationsEmbedded = true
                } else if (omit3Only) {
                    // Simplified HT logic for omit3Use46
                    suffix += "6(no3)4"
                    omitsPlaced = true
                } else if (altInline.isNotEmpty()) {
                    suffix += "6${altInline}4"
                    alterationsEmbedded = true
                } else {
                    suffix += "64"
                }
            }
            3 -> {
                if (type >= 7 && implicitHalfDimB5 && alterations.any { it == "b5" || it == "♭5" }) {
                    suffix += "4(♭5)2"
                    alterationsEmbedded = true
                } else if (type >= 7 && altInline.isNotEmpty()) {
                    suffix += "4${altInline}2"
                    alterationsEmbedded = true
                } else {
                    suffix += "42"
                }
            }
        }

        if (suspended && !susPlaced) {
            val hasFigured = Regex("[0-9]").containsMatchIn(suffix)
            if (suspensions.size > 1) {
                val a = suspensions[0]
                val b = suspensions[1]
                if (type >= 7 && !hasFigured) {
                    if (a < b) suffix += susStr + type.toString()
                    else suffix += type.toString() + susStr // simplified omits check
                } else suffix += susStr
            } else if (type >= 7 && !hasFigured) {
                suffix += type.toString() + altInline + susStr
                if (altInline.isNotEmpty()) alterationsEmbedded = true
            } else suffix += susStr
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
            suffix += omits.joinToString("") { "(no$it)" }
        }

        if (displayAlts.isNotEmpty() && !alterationsEmbedded) {
            suffix += "(${displayAlts.joinToString("").replace("b", "♭").replace("#", "♯")})"
        }

        return suffix
    }

    private fun buildNumeral(degree: Int, qualities: List<String>, chordJson: JsonObject, prefix: String, opts: Map<String, Any> = emptyMap()): String {
        val baseQuality = opts["quality"] as? String ?: qualities.getOrElse(degree - 1) { "major" }
        val alterations = chordJson["alterations"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
        val quality = if (alterations.contains("b5") && baseQuality == "minor") "diminished" else baseQuality
        
        var roman = ROMAN_MAP[degree] ?: ""
        if (quality == "minor" || quality == "diminished") roman = roman.lowercase()
        
        return prefix + roman + buildSuffix(chordJson, quality, opts)
    }

    fun getRomanSymbol(chordJson: JsonObject, key: KeyInfo): String {
        val root = chordJson["root"]?.jsonPrimitive?.int ?: return ""
        val applied = chordJson["applied"]?.jsonPrimitive?.int ?: 0
        
        if (applied in 1..7) {
            val targetTonic = MusicTheory.getNoteLabel(root, key.tonic, key.scale)
            val numeratorKey = KeyInfo(targetTonic, "major")
            val triSub = isTriSubApplied(chordJson)
            val numDegree = if (triSub) 2 else applied
            val numPrefix = if (triSub) "♭" else ""
            
            val majorSeventh = (chordJson["type"]?.jsonPrimitive?.int ?: 5) >= 7 && applied != 5
                && isMajorSeventh(numDegree, numeratorKey)
                && (chordJson["suspensions"]?.jsonArray?.isEmpty() ?: true)
            
            val numerator = buildNumeral(numDegree, MusicTheory.CHORD_QUALITIES["major"]!!, chordJson, numPrefix, 
                mapOf("fullyDiminished" to (applied == 7 && !isTriSubApplied(chordJson)), "majorSeventh" to majorSeventh))
                
            val denominator = MusicTheory.ROMAN_NUMERALS[key.scale]?.getOrNull(root - 1) ?: ""
            return "$numerator/$denominator"
        }

        val borrowed = chordJson["borrowed"]?.jsonPrimitive?.contentOrNull
        var scale = key.scale
        var tag = ""
        var prefix = ""
        
        if (borrowed != null && BORROWED_TAG.containsKey(borrowed)) {
            scale = borrowed
            prefix = borrowedPrefix(root, key, borrowed)
            tag = "(${BORROWED_TAG[borrowed]})"
        }
        
        val qualities = MusicTheory.CHORD_QUALITIES[scale] ?: MusicTheory.CHORD_QUALITIES["major"]!!
        val quality = qualities.getOrElse(root - 1) { "major" }
        val majorSeventh = (chordJson["type"]?.jsonPrimitive?.int ?: 5) >= 7 && quality != "diminished" && isMajorSeventh(root, KeyInfo(key.tonic, scale))
        
        val hasAdds = chordJson["adds"]?.jsonArray?.isNotEmpty() ?: false
        val opts = mutableMapOf<String, Any>("majorSeventh" to majorSeventh, "keyScale" to scale, "keyTonic" to key.tonic)
        if (tag.isNotEmpty() && hasAdds) opts["borrowedTag"] = tag
        
        return buildNumeral(root, qualities, chordJson, prefix, opts) + (if (tag.isNotEmpty() && !hasAdds) tag else "")
    }

    fun getLetterName(chordJson: JsonObject, key: KeyInfo): String {
        val root = chordJson["root"]?.jsonPrimitive?.int ?: 1
        val applied = chordJson["applied"]?.jsonPrimitive?.int ?: 0
        val borrowed = chordJson["borrowed"]?.jsonPrimitive?.contentOrNull
        val type = chordJson["type"]?.jsonPrimitive?.int ?: 5
        val inversion = chordJson["inversion"]?.jsonPrimitive?.int ?: 0
        val suspensions = chordJson["suspensions"]?.jsonArray?.map { it.jsonPrimitive.int } ?: emptyList()
        val alterations = chordJson["alterations"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
        val omits = chordJson["omits"]?.jsonArray?.map { it.jsonPrimitive.int } ?: emptyList()
        
        var effKey = key
        var degree = root
        
        if (applied in 1..7) {
            val targetTonic = MusicTheory.getNoteLabel(root, key.tonic, key.scale)
            if (isTriSubApplied(chordJson)) {
                // Simplified tri-sub resolution
                val rootPc = MusicTheory.NOTE_TO_PC[MusicTheory.normalizeTonic(targetTonic)] ?: 0
                val subRootPc = (rootPc + 1) % 12
                val subRoot = MusicTheory.NOTE_TO_PC.entries.firstOrNull { it.value == subRootPc && it.key.length <= 2 }?.key ?: targetTonic
                effKey = KeyInfo(subRoot, "major")
                degree = 1
            } else {
                effKey = KeyInfo(targetTonic, "major")
                degree = applied
            }
        } else if (borrowed != null && BORROWED_TAG.containsKey(borrowed)) {
            effKey = KeyInfo(key.tonic, borrowed)
        }
        
        val qualities = MusicTheory.CHORD_QUALITIES[effKey.scale] ?: MusicTheory.CHORD_QUALITIES["major"]!!
        val baseQuality = qualities.getOrElse(degree - 1) { "major" }
        val quality = if (alterations.contains("b5") && baseQuality == "minor") "diminished" else baseQuality
        
        val rootNoteName = MusicTheory.getNoteLabel(degree, effKey.tonic, effKey.scale)
        val augmented = quality == "augmented"
        val suspended = suspensions.isNotEmpty()
        val majorSeventh = type >= 7 && quality != "diminished" && !augmented && !suspended && isMajorSeventh(degree, effKey)
        
        val omit3Only = omits.contains(3) && !omits.contains(5)
        var suffix = ""
        if (omit3Only && type < 7) suffix += "5"
        else if (quality == "minor") suffix += "m"
        else if (quality == "diminished" && !suspended) suffix += "°"
        else if (augmented) suffix += "+"
        
        if (type >= 7) suffix += (if (majorSeventh) "maj" else "") + type.toString()
        
        if (suspended) suffix += suspensions.joinToString("") { "sus$it" }
        if (alterations.isNotEmpty()) suffix += "(${alterations.joinToString("").replace("b", "♭").replace("#", "♯")})"

        if (inversion in 1..3) {
            val bassOffset = when (inversion) {
                1 -> if (type < 7 && suspensions.contains(4) && !suspensions.contains(2)) 3 else 2
                2 -> 4
                3 -> 6
                else -> 0
            }
            val bassDegree = ((degree - 1 + bassOffset) % 7) + 1
            val bassNoteName = MusicTheory.getNoteLabel(bassDegree, effKey.tonic, effKey.scale)
            return "$rootNoteName$suffix/$bassNoteName"
        }

        return rootNoteName + suffix
    }

    fun getChordNotes(chordJson: JsonObject, key: KeyInfo): List<Int> {
        val root = chordJson["root"]?.jsonPrimitive?.int ?: 1
        val type = chordJson["type"]?.jsonPrimitive?.int ?: 5
        val borrowed = chordJson["borrowed"]?.jsonPrimitive?.contentOrNull
        
        val scale = borrowed ?: key.scale
        val intervals = MusicTheory.SCALE_INTERVALS[scale] ?: MusicTheory.SCALE_INTERVALS["major"]!!
        val tonicPc = MusicTheory.NOTE_TO_PC[MusicTheory.normalizeTonic(key.tonic)] ?: 0
        
        val rootPc = (tonicPc + intervals[(root - 1) % 7]) % 12
        
        val notes = mutableListOf<Int>()
        notes.add(rootPc + 48) // Root
        
        // 3rd
        val thirdInterval = (intervals[(root + 1) % 7] - intervals[(root - 1) % 7] + 12) % 12
        notes.add(rootPc + thirdInterval + 48)
        
        // 5th
        val fifthInterval = (intervals[(root + 3) % 7] - intervals[(root - 1) % 7] + 12) % 12
        notes.add(rootPc + fifthInterval + 48)
        
        // 7th
        if (type >= 7) {
            val seventhInterval = (intervals[(root + 5) % 7] - intervals[(root - 1) % 7] + 12) % 12
            notes.add(rootPc + seventhInterval + 48)
        }
        
        return notes
    }
}
