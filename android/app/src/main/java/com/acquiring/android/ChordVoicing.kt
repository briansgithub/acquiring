package com.acquiring.android

import kotlinx.serialization.json.*

/**
 * A voiced note keeps its harmonic role when it is altered, omitted or moved.
 * Written octave and normalized shift origin remain separate because the shared
 * decoder shifts a spelled B#3 as C3, while its literal MIDI spelling is C4.
 */
internal data class ChordTone(val midi: Int, val slot: Int, val degree: Int,
    val writtenOctave: Int = Math.floorDiv(midi, 12) - 1, val shiftMidi: Int = midi) {
    fun shifted(semitones: Int) = ChordTone(shiftMidi + semitones, slot, degree)
    fun raisedOctave() = copy(midi = midi + 12, shiftMidi = shiftMidi + 12, writtenOctave = writtenOctave + 1)
}

internal data class VoicedChord(val rootName: String, val rootMidi: Int, val tones: List<ChordTone>) {
    val labels: List<String> get() = tones.map { tone ->
        val natural = intArrayOf(0, 2, 4, 5, 7, 9, 11)[Math.floorMod(tone.degree - 1, 7)]
        var alteration = Math.floorMod(tone.midi - rootMidi - natural, 12)
        if (alteration > 6) alteration -= 12
        val prefix = if (alteration < 0) "♭".repeat(-alteration) else "♯".repeat(alteration)
        "$prefix${tone.degree}\u0302"
    }
}

/** Native port of chordBuild, chordPolicy and the ordered web modifier pipeline. */
internal object ChordVoicing {
    private val major = listOf(0, 2, 4, 5, 7, 9, 11)
    private val pcs = listOf("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")
    private fun JsonObject.int(name: String, fallback: Int = 0) = (this[name] as? JsonPrimitive)?.intOrNull ?: fallback
    private fun JsonObject.string(name: String) = (this[name] as? JsonPrimitive)?.contentOrNull.orEmpty()
    private fun JsonObject.flag(name: String) = (this[name] as? JsonPrimitive)?.booleanOrNull == true
    private fun JsonObject.ints(name: String) = (this[name] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull }.orEmpty()
    private fun JsonObject.strings(name: String) = (this[name] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
    private fun pc(name: String): Int = Math.floorMod(absolutePc(name), 12)
    private fun absolutePc(name: String): Int = (mapOf('C' to 0, 'D' to 2, 'E' to 4, 'F' to 5, 'G' to 7, 'A' to 9, 'B' to 11)[name.firstOrNull()?.uppercaseChar()] ?: 0) + MusicTheory.getModifierValue(name.drop(1))
    private fun note(degree: Int, key: KeyInfo, custom: List<Int>? = null) = MusicTheory.getNoteLabel(degree, key.tonic, key.scale, custom)
    private fun custom(chord: JsonObject): List<Int>? {
        val source = chord["borrowed"] as? JsonArray ?: return null
        if (source.isEmpty()) return major
        val result = mutableListOf<Int>()
        repeat(7) { index -> result += Math.floorMod((source.getOrNull(index) as? JsonPrimitive)?.intOrNull ?: ((result.lastOrNull() ?: 0) + 2), 12) }
        return result
    }
    private fun qualities(intervals: List<Int>): List<String> = (0..6).map { i ->
        val third = Math.floorMod(intervals[(i + 2) % 7] - intervals[i], 12)
        val fifth = Math.floorMod(intervals[(i + 4) % 7] - intervals[i], 12)
        when { third == 3 && fifth == 6 -> "diminished"; third == 4 && fifth == 8 -> "augmented"; third == 4 -> "major"; else -> "minor" }
    }

    fun build(chord: JsonObject, key: KeyInfo): VoicedChord? {
        val root = chord.int("root")
        if (chord.flag("isRest") || chord.flag("rest")) return null
        if (root !in 1..7) {
            if (root != 0) return null
            val letterRoot = chord.string("_letterRootName")
            if (!Regex("^[A-G][#bx]*$").matches(letterRoot)) return null
            val built = buildFrame(chord, key, letterRoot, chord.string("_letterQuality").ifEmpty { "major" }, 1, null, true,
                chord.flag("dimTriad") && !chord.flag("halfDim"))
            val slash = chord.string("_letterBassName")
            if (slash.isEmpty()) return built
            val index = built.tones.indexOfFirst { Math.floorMod(it.midi, 12) == pc(slash) }
            if (index < 0) return built
            val rotated = (built.tones.drop(index) + built.tones.take(index)).toMutableList()
            if (rotated.size > 1) {
                while (rotated.first().shiftMidi >= rotated[1].shiftMidi) rotated[0] = rotated.first().shifted(-12)
            }
            return built.copy(tones = rotated)
        }
        val custom = custom(chord)
        val borrowed = chord.string("borrowed")
        val hasBorrowed = borrowed.isNotEmpty() || custom != null
        val resolvedKey = KeyInfo(key.tonic, if (custom != null) "custom" else borrowed.ifEmpty { key.scale })
        val applied = chord.int("applied")
        val target = note(root, resolvedKey, custom)
        val type = chord.int("type", 5)
        val sus = chord.ints("suspensions").isNotEmpty()
        if (applied in 1..7) {
            val targetKey = KeyInfo(target, "major")
            val triSub = applied == 5 && chord.strings("substitutions").contains("tri")
            if (triSub) return buildFrame(chord, key, pcs[(pc(target) + 1) % 12], "major", 1, null, true, false)
            val actualRoot = note(applied, targetKey)
            val quality = MusicTheory.CHORD_QUALITIES["major"]!![applied - 1]
            val sharp5 = chord.strings("alterations").contains("#5") && applied == 7
            if (!hasBorrowed) {
                val minorSharp5 = sharp5 && type < 7
                val effective = JsonObject(chord + mapOf("useMaj7" to JsonPrimitive(chord.flag("useMaj7") || (type >= 7 && quality == "major" && applied != 5 && !sus))))
                return buildFrame(effective, key, actualRoot, if (minorSharp5) "minor" else quality, applied, null, true, !minorSharp5 && applied == 7 && !sus)
            }
            if (borrowed == "locrian" && root == 1 && applied == 1 && type < 7)
                return buildFrame(chord, key, target, "minor", 1, null, true, false)
            if (sharp5) return buildFrame(chord, key, actualRoot, "minor", applied, null, true, false)
            if (custom != null && chord.int("inversion") in 1..2)
                return buildFrame(chord, key, target, "major", 1, null, true, false)
            // The web's composite branch delegates to its diatonic builder in the target major key.
            return buildFrame(chord, targetKey, actualRoot, quality, applied, null, false, false, borrowedOverride = "")
        }
        val quality = (custom?.let(::qualities) ?: MusicTheory.CHORD_QUALITIES[resolvedKey.scale] ?: MusicTheory.CHORD_QUALITIES["major"]!!)[root - 1]
        return buildFrame(chord, key, target, quality, root, custom, false, false)
    }

    private fun buildFrame(chord: JsonObject, key: KeyInfo, rootName: String, rawQuality: String, root: Int, custom: List<Int>?, appliedFrame: Boolean, fullyDim: Boolean, borrowedOverride: String? = null): VoicedChord {
        val type = chord.int("type", 5)
        val inversion = chord.int("inversion").coerceAtLeast(0)
        val suspensions = chord.ints("suspensions")
        val sus = suspensions.isNotEmpty()
        val omits = chord.ints("omits")
        val omit35 = omits.containsAll(listOf(3, 5))
        val adds = chord.ints("adds")
        val alts = chord.strings("alterations").toMutableList()
        val borrowed = borrowedOverride ?: chord.string("borrowed")
        val scale = if (custom != null) "custom" else borrowed.ifEmpty { key.scale }
        val halfDim = chord.flag("halfDim")
        val dimTriad = chord.flag("dimTriad")
        val sharp5Minor = alts.contains("#5") && rawQuality == "diminished"
        val halfDimIi = !sus && root == 2 && scale == "major" && type >= 7 && halfDim
        val customHalf = custom != null && halfDim
        val phdmBVI = borrowed == "phrygianDominant" && root == 6 && type >= 7 && inversion != 3 && !alts.contains("#5")
        val phdmII = borrowed.isEmpty() && key.scale == "phrygianDominant" && root == 2 && type >= 7 && inversion == 3
        val quality = if (appliedFrame) {
            if (halfDim || dimTriad) "diminished" else if (sus && rawQuality == "diminished") "major" else rawQuality
        } else when {
            halfDimIi -> "diminished"; customHalf -> "minor"; sharp5Minor -> "minor"; dimTriad || halfDim -> "diminished"
            phdmBVI || phdmII -> "major"; sus && rawQuality in listOf("diminished", "augmented") -> "major"; else -> rawQuality
        }
        val policyHalf = halfDim || halfDimIi || (rawQuality == "diminished" && type >= 7 && !sharp5Minor && !customHalf)
        val augStack = !appliedFrame && quality == "augmented" && type >= 7 && !sus && !omit35
        val minorV13 = !appliedFrame && scale == "minor" && root == 5 && rawQuality == "minor" && type >= 13 && !sus
        val minorI13 = !appliedFrame && scale == "minor" && root == 1 && rawQuality == "minor" && type >= 13 && !sus && !omit35
        val hmV13 = !appliedFrame && borrowed == "harmonicMinor" && root == 5 && type >= 13 && !sus && !omit35
        if (!appliedFrame) {
            if (customHalf) { alts.removeAll { it == "b9" }; if (type >= 7 && !alts.contains("b5")) alts += "b5" }
            else if (halfDim && type >= 9) { if (!alts.contains("b5")) alts += "b5"; if (omit35) alts.remove("b9") }
            if (minorV13) { if (!alts.contains("b9")) alts += "b9"; if (!alts.contains("b13")) alts += "b13" }
            if (minorI13 && !alts.contains("b13")) alts += "b13"
        }
        val flattenB5 = !customHalf && (chord["flattenHalfDimB5"]?.let { chord.flag("flattenHalfDimB5") } ?: (halfDim && alts.contains("b5") && type <= 7))
        val rootMidi = 48 + pc(rootName)
        fun scaleTone(offset: Int, slot: Int, degree: Int): ChordTone {
            val simple = Math.floorMod(degree - 1, 7) + 1
            val octave = Math.floorDiv(degree - 1, 7)
            val natural = major[simple - 1]
            val accidental = offset - natural - octave * 12
            val unaltered = note(simple, KeyInfo(rootName, "major"))
            val label = unaltered.first().toString() + run {
                val modifier = MusicTheory.getModifierValue(unaltered.drop(1)) + accidental
                if (modifier < 0) "b".repeat(-modifier) else "#".repeat(modifier)
            }
            var octaveOffset = Math.floorDiv(pc(rootName) + natural + accidental, 12)
            val order = "CDEFGAB"
            if (order.indexOf(label.first()) < order.indexOf(rootName.first()) && pc(rootName) + natural + accidental >= 0 && pc(rootName) + natural + accidental < 12 && octaveOffset == 0) octaveOffset = 1
            val written = 3 + octave + octaveOffset
            return ChordTone((written + 1) * 12 + absolutePc(label), slot, degree, written, (written + 1) * 12 + pc(label))
        }
        val rootPc = pc(rootName)
        val tones = mutableListOf<ChordTone>()
        fun tone(offset: Int, slot: Int, degree: Int, scaleNote: Boolean = false) {
            tones += if (scaleNote) scaleTone(offset, slot, degree) else ChordTone(rootMidi + offset, slot, degree)
        }
        fun has(offset: Int) = tones.any { Math.floorMod(it.midi - rootMidi, 12) == Math.floorMod(offset, 12) }
        fun append(offset: Int, slot: Int, degree: Int, scaleNote: Boolean = false) { if (!has(offset)) tone(offset, slot, degree, scaleNote) }
        fun removeFirst(offset: Int) { val index = tones.indexOfFirst { Math.floorMod(it.midi - rootMidi, 12) == offset }; if (index >= 0) tones.removeAt(index) }
        tone(0, 0, 1, !appliedFrame)
        tone(if (quality == "minor" || quality == "diminished") 3 else 4, 1, 3, !appliedFrame)
        if (!(augStack && inversion != 3)) tone(when (quality) { "diminished" -> 6; "augmented" -> 8; else -> 7 }, 2, 5, !appliedFrame)
        val dimScale = rawQuality == "diminished" && (scale == "custom" || (scale to root) in setOf("dorian" to 6, "lydian" to 4, "minor" to 2, "harmonicMinor" to 2, "major" to 7, "phrygian" to 5, "locrian" to 1))
        val m6Stack = !appliedFrame && halfDim && type >= 7 && inversion == 1 && !sus && !omit35 && (borrowed == "mixolydian" || (scale to root) in setOf("harmonicMinor" to 2, "major" to 7, "mixolydian" to 3))
        val intervals = custom ?: MusicTheory.SCALE_INTERVALS[scale] ?: major
        val seventhInterval = Math.floorMod(intervals[(root + 5) % 7] - intervals[root - 1], 12)
        val diatonic7 = when (seventhInterval) { 11 -> 11; 9 -> 9; else -> 10 }
        if (type >= 7) {
            if (augStack && inversion != 3) { tone(11, 3, 7); if (!omits.contains(5)) tone(7, 2, 5) }
            else {
                val seventh = if (appliedFrame) when {
                    fullyDim -> 9; halfDim -> 10; dimTriad -> 9; rawQuality == "diminished" && alts.contains("#5") -> 10; chord.flag("useMaj7") -> 11; else -> 10
                } else if (omit35) when { halfDim -> 9; sus -> 10; dimScale -> 9; else -> diatonic7 }
                else when {
                    augStack -> 11; m6Stack -> 9; phdmII && suspensions.contains(2) && !suspensions.contains(4) -> 11
                    sus || (chord.int("applied") == 5 && !chord.flag("useMaj7")) -> 10
                    borrowed == "minor" && key.scale == "harmonicMinor" && root == 1 -> 10
                    customHalf -> 9; sharp5Minor -> 10; dimTriad -> 9; custom != null && rawQuality == "diminished" -> diatonic7
                    phdmII -> 11; dimScale -> 9; else -> diatonic7
                }
                tone(seventh, if (m6Stack) 9 else 3, if (m6Stack) 6 else 7, !appliedFrame && omit35)
            }
        }
        val customHalf11 = !appliedFrame && customHalf && type >= 11
        val dimNatural11 = !appliedFrame && type >= 11 && ((custom != null && dimTriad && !halfDim) || ((borrowed == "harmonicMinor" || borrowed == "phrygianDominant") && quality == "diminished"))
        val skipNine = !appliedFrame && ((borrowed == "lydian" && (halfDim || quality == "diminished") && type >= 11)
            || ((borrowed == "harmonicMinor" || borrowed == "phrygianDominant") && type >= 11 && quality == "diminished")
            || (omit35 && (halfDim || policyHalf)))
        if (type >= 9 && !skipNine && !customHalf11) append(14, 4, 9, true)
        if (customHalf11 && quality == "minor") append(1, 4, 9)
        else if (dimNatural11 && quality == "diminished") { append(1, 4, 9); append(5, 5, 11) }
        else if (type >= 11) { if (policyHalf && skipNine && borrowed != "lydian") append(1, 4, 9) else append(5, 5, 11) }
        if (type >= 13) append(21, 6, 13, true)
        else if (type >= 11 && appliedFrame && alts.contains("b5") && !has(9)) { removeFirst(5); tone(21, 6, 13, true) }
        // Captured minor ii elevenths keep b7, b9 and 11 even when the
        // source explicitly omits the third/fifth; apply alterations later.
        if (!appliedFrame && type == 11 && scale == "minor" && root == 2 && !dimTriad && !sus) {
            val rootTone = tones.first { it.slot == 0 }
            for ((role, semitones) in listOf(3 to 10, 4 to 1, 5 to 5)) {
                val index = tones.indexOfFirst { it.slot == role }
                if (index < 0) {
                    tones += rootTone.shifted(if (role == 4) 13 else semitones)
                        .copy(slot = role, degree = if (role == 3) 7 else if (role == 4) 9 else 11)
                } else {
                    var shift = Math.floorMod(rootPc + semitones, 12) - Math.floorMod(tones[index].midi, 12)
                    while (shift > 6) shift -= 12
                    while (shift < -6) shift += 12
                    if (shift != 0) tones[index] = tones[index].shifted(shift)
                }
            }
        }
        // Implicit ninths/custom extensions follow the prevailing scale; explicit
        // suspension, diminished-symbol and 13th-stack frames retain their policy.
        if (!appliedFrame && type < 13 && !halfDim && !dimTriad && !sus) {
            val customExtensions = chord["borrowed"] is JsonArray
            for (index in tones.indices) {
                val role = tones[index].slot
                if (role != 4 && role != 5) continue
                if (!customExtensions && role == 5 && scale != "lydian") continue
                val minorSupertonicNinth = role == 4 && scale == "minor" && root == 2
                if (!customExtensions && quality == "diminished" && !minorSupertonicNinth) continue
                val extension = if (role == 4) 9 else 11
                val targetDegree = Math.floorMod(root + extension - 2, 7) + 1
                val desired = pc(note(targetDegree, KeyInfo(key.tonic, scale), custom))
                var shift = desired - Math.floorMod(tones[index].midi, 12)
                while (shift > 6) shift -= 12
                while (shift < -6) shift += 12
                if (shift != 0) tones[index] = tones[index].shifted(shift)
            }
        }
        if (suspensions.contains(4) || suspensions.contains(2)) {
            val index = tones.indexOfFirst { it.slot == 1 }
            val degree = if (suspensions.contains(4)) 4 else 2
            if (index >= 0) {
                tones[index] = scaleTone(if (degree == 4) 5 else 2, if (degree == 4) 8 else 7, degree)
                if (degree == 2 && !appliedFrame && phdmII) tones[index] = tones[index].shifted(1)
                if (suspensions.contains(2) && suspensions.contains(4)) {
                    tones += scaleTone(2, 7, 2)
                    if (!appliedFrame && scale == "harmonicMinor" && root == 6) {
                        for (toneIndex in tones.indices) {
                            if (tones[toneIndex].slot in setOf(3, 7, 8)) tones[toneIndex] = tones[toneIndex].shifted(1)
                        }
                    }
                }
            }
        }
        val modifierHalf = if (appliedFrame) halfDim else !dimTriad && (halfDim || policyHalf)
        var effectiveOmits = omits
        if (modifierHalf && omits.contains(5)) effectiveOmits = omits.filter { it != 5 }
        if (omits.contains(3) && (suspensions.contains(2) || suspensions.contains(4))) effectiveOmits = omits.filter { it != 3 }
        if (!appliedFrame && quality == "augmented" && omits.contains(5) && (!omits.contains(3) && type < 7 || omits.contains(3))) effectiveOmits = omits.filter { it != 5 }
        tones.removeAll { it.slot == 1 && effectiveOmits.contains(3) || it.slot == 2 && effectiveOmits.contains(5) }
        fun shiftFirst(offset: Int, delta: Int, degree: Int? = null): Boolean {
            val index = tones.indexOfFirst { Math.floorMod(it.midi - rootMidi, 12) == offset }
            if (index < 0) return false
            val changed = tones[index].shifted(delta)
            tones[index] = if (degree == null) changed else changed.copy(degree = degree, slot = when (degree) { 9 -> 4; 11 -> 5; 13 -> 6; else -> changed.slot })
            return true
        }
        for (raw in alts) {
            val alt = raw.lowercase().replace("♭", "b").replace("♯", "#")
            if (alt == "b5" || alt == "#5") {
                val delta = if (alt == "b5") -1 else 1
                if (alt == "b5" && customHalf && !appliedFrame) {
                    val index = tones.indexOfFirst { it.slot == 2 }
                    if (index >= 0) tones[index] = ChordTone(tones.first().shiftMidi + 6, 2, 5)
                    continue
                }
                if (alt == "b5" && modifierHalf && flattenB5) { shiftFirst(7, -1); shiftFirst(10, -1); continue }
                if (alt == "b5" && type >= 13) removeFirst(5)
                if (alt == "b5" && (modifierHalf || dimTriad || (!appliedFrame && quality == "diminished"))) continue
                if (alt == "#5" && chord.int("applied") == 7 && type >= 7) {
                    tones.indices.forEach { index -> val offset = Math.floorMod(tones[index].midi - rootMidi, 12); if (offset == 6 || offset == 9) tones[index] = ChordTone(tones.first().shiftMidi + if (offset == 6) 8 else 10, tones[index].slot, tones[index].degree) }
                    continue
                }
                if (alt == "b5" && !appliedFrame && quality == "augmented" && shiftFirst(8, -2)) continue
                val index = tones.indexOfFirst { val offset = Math.floorMod(it.midi - rootMidi, 12); offset == 7 || alt == "#5" && offset == 6 }
                if (index >= 0) tones[index] = tones[index].shifted(delta)
                else if (!has(6 + delta)) tone(if (alt == "b5") 6 else 8, 2, 5, true)
                continue
            }
            val spec = when (alt) {
                "b9" -> Triple(2, -1, 9); "#9" -> Triple(2, 1, 9); "9" -> Triple(2, 0, 9)
                "b11" -> Triple(5, -1, 11); "#11" -> Triple(5, 1, 11); "11" -> Triple(5, 0, 11)
                "b13" -> Triple(9, -1, 13); "#13" -> Triple(9, 1, 13); else -> continue
            }
            val (offset, delta, degree) = spec
            if (alt == "#9" && type >= 13) append(6, 5, 11)
            if (alt == "b13" && (minorV13 || minorI13 || hmV13)) { append(20, 6, 13, true); continue }
            if (alt == "#11" && suspensions.contains(4)) { append(18, 5, 11, true); continue }
            if (!shiftFirst(offset, delta, degree) && delta != 0) append(offset + delta + 12, when (degree) { 9 -> 4; 11 -> 5; else -> 6 }, degree, true)
        }
        val hasSeventh = tones.any { it.slot == 3 }
        for (add in adds) {
            val degree = if (add <= 6 && hasSeventh) add + 7 else add
            val spec = when (degree) { 2, 9 -> Triple(14, 4, 9); 4 -> Triple(5, 8, 4); 6 -> Triple(9, 9, 6); 11 -> Triple(17, 5, 11); 13 -> Triple(21, 6, 13); else -> continue }
            append(spec.first, spec.second, spec.third, true)
        }
        if (adds.contains(6) && type < 7 && !adds.contains(9)) {
            val index = tones.indexOfLast { it.slot == 2 && Math.floorMod(it.midi - rootMidi, 12) == 7 }
            if (index >= 0) tones.removeAt(index)
        }
        if (type >= 9 && sus && !omits.contains(5) && chord.strings("alterations").none { it in listOf("b5", "#5", "♭5", "♯5") }) {
            val index = tones.indexOfFirst { it.slot == 2 && Math.floorMod(it.midi - rootMidi, 12) == 7 }
            if (index >= 0) tones.removeAt(index)
        }
        if (type == 11 && inversion == 0 &&
            chord.strings("alterations").none { it in listOf("b5", "#5", "♭5", "♯5") }) {
            tones.removeAll { it.slot == 1 || it.slot == 2 }
        }
        if (tones.isNotEmpty() && inversion > 0) {
            if (appliedFrame) {
                val rotation = inversion % tones.size
                val rotated = tones.drop(rotation) + tones.take(rotation)
                val bassOctave = maxOf(1, rotated.first().writtenOctave - 1)
                val upperOctave = maxOf(rotated.drop(1).maxOfOrNull { it.writtenOctave } ?: 0, bassOctave + 1)
                tones.clear()
                tones += rotated.mapIndexed { i, tone -> ChordTone((if (i == 0) bassOctave + 1 else upperOctave + 1) * 12 + Math.floorMod(tone.midi, 12), tone.slot, tone.degree) }
            } else repeat(inversion) { val moved = tones.removeAt(0); tones += moved.raisedOctave() }
        }
        if (!appliedFrame && type < 7 && inversion == 2 && omits.contains(3) && !omits.contains(5) && tones.size == 2) {
            val rootTone = tones.find { it.slot == 0 }; val fifth = tones.find { it.slot == 2 }
            if (rootTone != null && fifth != null) {
                var bass = fifth.midi
                while (bass >= rootTone.midi) bass -= 12
                tones.clear(); tones += fifth.copy(midi = bass); tones += rootTone
            }
        }
        if (inversion == 0) {
            val spread = if (appliedFrame) fullyDim || quality == "diminished" && type >= 7 else type >= 7 && !customHalf && !sharp5Minor && (rawQuality == "diminished" || halfDimIi || dimScale)
            if (spread && tones.size >= 4) {
                val rootOctave = tones.first().writtenOctave
                for (index in listOf(1, 2)) if (tones[index].writtenOctave == rootOctave) tones[index] = tones[index].shifted(12)
            }
            tones.sortBy { it.midi }
        }
        return VoicedChord(rootName, 48 + rootPc, tones)
    }
}
