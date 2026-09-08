import Foundation

public struct ChordInterpretation: Equatable, Sendable {
    public let roman: String
    public let letter: String
    public let midi: [Int]
    public let rootMidi: Int?
    public let toneLabels: [String]
}

public enum ChordRootContext: String, Equatable, Sendable {
    case standard
    case borrowed
    case customBorrowed
    case applied
    case borrowedApplied
    case tritoneSubstitution
}

public struct ResolvedChordRoot: Equatable, Sendable {
    public let pitch: SpelledPitch
    public let simpleModePitch: SpelledPitch
    public let sourceDegree: Int
    public let effectiveDegree: Int
    public let sourceKey: KeyInfo
    public let effectiveKey: KeyInfo
    public let customIntervals: [Int]?
    public let chordQuality: String
    public let context: ChordRootContext
    public let genericStepsFromTonic: Int
    public let specificSemitonesFromTonic: Int

    public init(
        pitch: SpelledPitch,
        simpleModePitch: SpelledPitch,
        sourceDegree: Int,
        effectiveDegree: Int,
        sourceKey: KeyInfo,
        effectiveKey: KeyInfo,
        customIntervals: [Int]?,
        chordQuality: String,
        context: ChordRootContext,
        genericStepsFromTonic: Int,
        specificSemitonesFromTonic: Int
    ) {
        self.pitch = pitch
        self.simpleModePitch = simpleModePitch
        self.sourceDegree = sourceDegree
        self.effectiveDegree = effectiveDegree
        self.sourceKey = sourceKey
        self.effectiveKey = effectiveKey
        self.customIntervals = customIntervals
        self.chordQuality = chordQuality
        self.context = context
        self.genericStepsFromTonic = genericStepsFromTonic
        self.specificSemitonesFromTonic = specificSemitonesFromTonic
    }
}

public enum ChordInterpreter {
    private static let romanMap = [1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII"]
    private static let pitchClassNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    private static let borrowedTags = [
        "minor": "min", "dorian": "dor", "phrygian": "phr", "lydian": "lyd",
        "mixolydian": "mix", "locrian": "loc", "major": "maj",
        "harmonicMinor": "hmin", "phrygianDominant": "phdm"
    ]

    public static func romanSymbol(for chord: [String: JSONValue], key: KeyInfo) -> String {
        let root = integer(chord, "root")
        guard (1...7).contains(root), !boolean(chord, "isRest"), !boolean(chord, "rest") else { return "" }
        let applied = integer(chord, "applied")
        if (1...7).contains(applied) {
            let target = appliedContext(chord, key: key)
            let targetTonic = target.tonic
            let numeratorKey = KeyInfo(tonic: targetTonic, scale: "major")
            let tritoneSubstitution = isTritoneSubstitution(chord)
            let numeratorDegree = tritoneSubstitution ? 2 : applied
            let type = integer(chord, "type", default: 5)
            let majorSeventh = type >= 7 && applied != 5
                && qualities(for: "major")[applied - 1] == "major"
                && isMajorSeventh(degree: numeratorDegree, key: numeratorKey)
                && integers(chord, "suspensions").isEmpty
            let numerator = buildNumeral(
                degree: numeratorDegree,
                quality: adjustedQuality(tritoneSubstitution ? "major" : qualities(for: "major")[numeratorDegree - 1], chord: chord),
                chord: chord,
                prefix: tritoneSubstitution ? "♭" : "",
                majorSeventh: majorSeventh,
                fullyDiminished: applied == 7 && !tritoneSubstitution
            )
            let numeratorTag = !tritoneSubstitution && ["minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "phrygianDominant"].contains(key.scale) ? "(maj)" : ""
            return numerator + (tritoneSubstitution ? "(∆-sub)" : "") + numeratorTag + "/" + target.denominator + borrowedTag(for: chord)
        }

        // A custom borrowed scale arrives as an array of absolute semitone offsets.
        // Its quality and accidental come from the array itself, never from the
        // song key's scale (web/lib/jsonToSymbol.js, the Array.isArray branch).
        if let raw = rawCustomBorrowedIntervals(chord["borrowed"]) {
            let type = integer(chord, "type", default: 5)
            let quality = adjustedQuality(customArrayTriadQuality(raw, degree: root), chord: chord)
            let hasAdds = !integers(chord, "adds").isEmpty
            let result = buildNumeral(
                degree: root,
                quality: quality,
                chord: chord,
                prefix: customArrayPrefix(raw, degree: root, key: key),
                majorSeventh: type >= 7 && customArraySeventhMajor(raw, degree: root),
                fullyDiminished: quality == "diminished" && type >= 7 && [9, 11].contains(floorMod(raw[(root + 5) % 7] - raw[root - 1], 12)),
                borrowedTag: hasAdds ? "(bor)" : ""
            )
            return result + (hasAdds ? "" : "(bor)")
        }

        let borrowed = string(chord, "borrowed")
        let scale = borrowedTags[borrowed] == nil ? key.scale : borrowed
        let quality = adjustedQuality(qualities(for: scale)[root - 1], chord: chord)
        let prefix = borrowed.isEmpty ? "" : borrowedPrefix(degree: root, key: key, borrowedScale: scale)
        let tag = borrowedTags[borrowed].map { "(\($0))" } ?? (borrowed.hasPrefix("[") ? "(bor)" : "")
        let hasAdds = !integers(chord, "adds").isEmpty
        let result = buildNumeral(
            degree: root,
            quality: quality,
            chord: chord,
            prefix: prefix,
            majorSeventh: integer(chord, "type", default: 5) >= 7
                && quality != "diminished"
                && isMajorSeventh(degree: root, key: KeyInfo(tonic: key.tonic, scale: scale)),
            fullyDiminished: quality == "diminished" && ((scale == "harmonicMinor" && root == 7) || (scale == "phrygianDominant" && root == 3)),
            borrowedTag: hasAdds ? tag : "",
            symbolKey: KeyInfo(tonic: key.tonic, scale: scale)
        )
        return result + (hasAdds ? "" : tag)
    }

    public static func letterName(for chord: [String: JSONValue], key: KeyInfo) -> String {
        let root = integer(chord, "root")
        guard !boolean(chord, "isRest"), !boolean(chord, "rest") else { return "" }
        guard (1...7).contains(root) else { return letterAnchoredName(chord).replacingOccurrences(of: "x", with: "##") }
        let applied = integer(chord, "applied")
        let borrowed = string(chord, "borrowed")
        let type = integer(chord, "type", default: 5)
        let inversion = integer(chord, "inversion")
        let suspensions = integers(chord, "suspensions")
        var effectiveKey = key
        var degree = root
        // Set only for a custom borrowed scale, whose note spellings come from the
        // array rather than from any named scale.
        var customIntervals: [Int]?
        var customQuality: String?

        if (1...7).contains(applied) {
            let target = appliedContext(chord, key: key).tonic
            if isTritoneSubstitution(chord) {
                let second = MusicTheory.noteLabel(degree: 2, tonic: target, scale: "major")
                let modifier = MusicTheory.modifierValue(String(second.dropFirst())) - 1
                let accidental = modifier == 2 ? "x" : String(repeating: modifier < 0 ? "b" : "#", count: abs(modifier))
                effectiveKey = KeyInfo(tonic: String(second.prefix(1)) + accidental, scale: "major")
                degree = 1
            } else {
                effectiveKey = KeyInfo(tonic: target, scale: "major")
                degree = applied
            }
        } else if let raw = rawCustomBorrowedIntervals(chord["borrowed"]) {
            customIntervals = customBorrowedIntervals(chord["borrowed"])
            effectiveKey = KeyInfo(tonic: key.tonic, scale: "custom")
            customQuality = adjustedQuality(customArrayTriadQuality(raw, degree: root), chord: chord)
        } else if borrowedTags[borrowed] != nil {
            effectiveKey = KeyInfo(tonic: key.tonic, scale: borrowed)
        }

        let quality = customQuality ?? adjustedQuality(qualities(for: effectiveKey.scale)[degree - 1], chord: chord)
        let rootName = MusicTheory.noteLabel(
            degree: degree,
            tonic: effectiveKey.tonic,
            scale: effectiveKey.scale,
            customIntervals: customIntervals
        )
        let augmented = quality == "augmented"
        // An applied numerator uses its target's major frame; borrowed/custom
        // scales have already selected that target above.
        let customSeventh = (1...7).contains(applied)
            ? nil
            : rawCustomBorrowedIntervals(chord["borrowed"]).map { customArraySeventhMajor($0, degree: degree) }
        let diatonicMajorSeventh = customSeventh
            ?? isMajorSeventh(degree: degree, key: effectiveKey, customIntervals: customIntervals)
        let majorSeventh = type >= 7 && quality != "diminished" && !augmented && suspensions.isEmpty
            && !isTritoneSubstitution(chord)
            && (!(1...7).contains(applied) || (quality == "major" && applied != 5))
            && diatonicMajorSeventh
        let augmentedMajorSeventh = augmented && type >= 7 && diatonicMajorSeventh

        let voiced = ChordVoicing.build(chord, key: key)
        let bassName = inversion > 0 ? voiced.flatMap { result in
            result.tones.first.map { roleNoteName($0, rootMidi: result.rootMidi, tonic: rootName) }
        } : nil
        return ChordLetterFormat.format(
            chord, rootName: rootName, quality: quality, degree: degree,
            effectiveKey: effectiveKey, customIntervals: customIntervals,
            majorSeventh: majorSeventh, augmentedMajorSeventh: augmentedMajorSeventh,
            tritoneSubstitution: isTritoneSubstitution(chord), voiced: voiced, bassName: bassName
        ).replacingOccurrences(of: "x", with: "##")
    }

    private static func borrowedTag(for chord: [String: JSONValue]) -> String {
        if chord["borrowed"]?.arrayValue != nil { return "(bor)" }
        return borrowedTags[string(chord, "borrowed")].map { "(\($0))" } ?? ""
    }

    private static func appliedContext(_ chord: [String: JSONValue], key: KeyInfo) -> (tonic: String, denominator: String) {
        let root = integer(chord, "root")
        let intervals = customBorrowedIntervals(chord["borrowed"])
        let borrowed = string(chord, "borrowed")
        let scale = intervals != nil ? "custom" : borrowedTags[borrowed] != nil ? borrowed : key.scale
        let tonic = MusicTheory.noteLabel(degree: root, tonic: key.tonic, scale: scale, customIntervals: intervals)
        let quality = (intervals.map(customChordQualities) ?? qualities(for: scale))[root - 1]
        let original = MusicTheory.noteLabel(degree: root, tonic: key.tonic, scale: key.scale)
        var shift = MusicTheory.pitchClass(note: tonic) - MusicTheory.pitchClass(note: original)
        if shift > 6 { shift -= 12 }
        if shift < -6 { shift += 12 }
        let prefix = String(repeating: shift < 0 ? "♭" : "♯", count: abs(shift))
        let numeral = romanMap[root] ?? ""
        let denominator = quality == "minor" || quality == "diminished" ? numeral.lowercased() : numeral
        return (tonic, prefix + denominator + (quality == "diminished" ? "°" : quality == "augmented" ? "+" : ""))
    }

    private static func roleNoteName(_ tone: ChordTone, rootMidi: Int, tonic: String) -> String {
        let degree = floorMod(tone.degree - 1, 7) + 1
        let natural = [0, 2, 4, 5, 7, 9, 11][degree - 1]
        var alteration = floorMod(tone.midi - rootMidi - natural, 12)
        if alteration > 6 { alteration -= 12 }
        let base = MusicTheory.noteLabel(degree: degree, tonic: tonic, scale: "major")
        guard alteration != 0 else { return base }
        let modifier = MusicTheory.modifierValue(String(base.dropFirst())) + alteration
        let accidental = modifier == 2 ? "x" : String(repeating: modifier < 0 ? "b" : "#", count: abs(modifier))
        return String(base.prefix(1)) + accidental
    }

    private static func letterAnchoredName(_ chord: [String: JSONValue]) -> String {
        let root = string(chord, "_letterRootName")
        guard integer(chord, "root") == 0, root.range(of: "^[A-G][#bx]*$", options: .regularExpression) != nil else { return "" }
        let quality = ["minor": "m", "diminished": "°", "augmented": "+"][string(chord, "_letterQuality")] ?? ""
        let type = integer(chord, "type", default: 5)
        let extensionText = type >= 7 ? (boolean(chord, "useMaj7") ? "maj" : "") + String(type) : ""
        let suspensions = integers(chord, "suspensions").map { "sus\($0)" }.joined()
        let alterations = strings(chord, "alterations").map { "(\($0))" }.joined()
        let adds = integers(chord, "adds").map { "(add\($0))" }.joined()
        let bass = string(chord, "_letterBassName")
        return root + quality + extensionText + suspensions + alterations + adds + (bass.isEmpty ? "" : "/" + bass)
    }

    public static func interpret(_ chord: [String: JSONValue], key: KeyInfo) -> ChordInterpretation {
        let voiced = ChordVoicing.build(chord, key: key)
        return ChordInterpretation(
            roman: romanSymbol(for: chord, key: key), letter: letterName(for: chord, key: key),
            midi: voiced?.tones.map(\.midi) ?? [], rootMidi: voiced?.rootMidi, toneLabels: voiced?.labels ?? []
        )
    }

    public static func chordNotes(for chord: [String: JSONValue], key: KeyInfo) -> [Int] {
        ChordVoicing.build(chord, key: key)?.tones.map(\.midi) ?? []
    }

    public static func resolvedRootMIDI(for chord: [String: JSONValue], key: KeyInfo) -> Int? {
        ChordVoicing.build(chord, key: key)?.rootMidi
    }

    public static func chordToneLabels(for chord: [String: JSONValue], key: KeyInfo) -> [String] {
        ChordVoicing.build(chord, key: key)?.labels ?? []
    }

    public static func rootPositionChordNotes(for chord: [String: JSONValue], key: KeyInfo) -> [Int] {
        var rootPosition = chord
        rootPosition["inversion"] = .number(0)
        return chordNotes(for: rootPosition, key: key)
    }

    public static func resolvedRoot(
        for chord: [String: JSONValue],
        key: KeyInfo,
        referenceOctave: Int = 3
    ) -> ResolvedChordRoot? {
        let root = integer(chord, "root")
        guard !boolean(chord, "isRest"), !boolean(chord, "rest") else { return nil }
        if root == 0, !letterAnchoredName(chord).isEmpty,
           let pitch = SpelledPitch.parse(noteName: string(chord, "_letterRootName"), octave: referenceOctave),
           let tonic = SpelledPitch.parse(noteName: key.tonic, octave: referenceOctave) {
            let quality = string(chord, "_letterQuality")
            return ResolvedChordRoot(
                pitch: pitch, simpleModePitch: pitch, sourceDegree: 0, effectiveDegree: 1,
                sourceKey: key, effectiveKey: KeyInfo(tonic: pitch.noteName, scale: "major"),
                customIntervals: nil, chordQuality: quality.isEmpty ? "major" : quality, context: .standard,
                genericStepsFromTonic: pitch.staffPosition - tonic.staffPosition,
                specificSemitonesFromTonic: pitch.midiNote - tonic.midiNote
            )
        }
        guard (1...7).contains(root) else { return nil }

        let sourceKey = KeyInfo(tonic: key.tonic, scale: RelativeIonianContext.canonicalScaleName(key.scale))
        let borrowedName = string(chord, "borrowed")
        let customIntervals = customBorrowedIntervals(chord["borrowed"])
        let borrowedIsNamed = borrowedTags[borrowedName] != nil
        let hasBorrowedScale = !borrowedName.isEmpty || customIntervals != nil
        let rootKey: KeyInfo
        if customIntervals != nil {
            rootKey = KeyInfo(tonic: sourceKey.tonic, scale: "custom")
        } else if borrowedIsNamed {
            rootKey = KeyInfo(tonic: sourceKey.tonic, scale: RelativeIonianContext.canonicalScaleName(borrowedName))
        } else {
            rootKey = sourceKey
        }
        guard let targetPitch = MusicTheory.spelledPitch(
            scaleDegree: String(root),
            relativeOctave: 0,
            key: rootKey,
            baseOctave: referenceOctave,
            customIntervals: customIntervals
        ) else { return nil }

        let applied = integer(chord, "applied")
        let tritoneSubstitution = isTritoneSubstitution(chord)
        let effectivePitch: SpelledPitch
        let effectiveDegree: Int
        let effectiveKey: KeyInfo
        let context: ChordRootContext
        var borrowedAppliedQuality: String?

        if (1...7).contains(applied), !hasBorrowedScale {
            let targetKey = KeyInfo(tonic: targetPitch.noteName, scale: "major")
            effectiveDegree = tritoneSubstitution ? 2 : applied
            effectiveKey = targetKey
            if tritoneSubstitution {
                guard let pitch = MusicTheory.spelledPitch(
                    scaleDegree: "b2",
                    relativeOctave: 0,
                    key: targetKey,
                    baseOctave: targetPitch.octave
                ) else { return nil }
                effectivePitch = pitch
                context = .tritoneSubstitution
            } else {
                guard let pitch = MusicTheory.spelledPitch(
                    scaleDegree: String(applied),
                    relativeOctave: 0,
                    key: targetKey,
                    baseOctave: targetPitch.octave
                ) else { return nil }
                effectivePitch = pitch
                context = .applied
            }
        } else if (1...7).contains(applied), hasBorrowedScale {
            let type = integer(chord, "type", default: 5)
            let inversion = integer(chord, "inversion")
            let alterations = strings(chord, "alterations")
            let targetName = targetPitch.noteName

            if borrowedName == "locrian", root == 1, applied == 1, type < 7 {
                effectiveDegree = 1
                effectiveKey = rootKey
                effectivePitch = targetPitch
                borrowedAppliedQuality = "minor"
                context = .borrowedApplied
            } else if tritoneSubstitution {
                let targetKey = KeyInfo(tonic: targetName, scale: "major")
                guard let pitch = MusicTheory.spelledPitch(
                    scaleDegree: "b2",
                    relativeOctave: 0,
                    key: targetKey,
                    baseOctave: targetPitch.octave
                ) else { return nil }
                effectiveDegree = 2
                effectiveKey = targetKey
                effectivePitch = pitch
                borrowedAppliedQuality = "major"
                context = .tritoneSubstitution
            } else if applied == 7, alterations.contains("#5") {
                let targetKey = KeyInfo(tonic: targetName, scale: "major")
                guard let pitch = MusicTheory.spelledPitch(
                    scaleDegree: "7",
                    relativeOctave: 0,
                    key: targetKey,
                    baseOctave: targetPitch.octave
                ) else { return nil }
                effectiveDegree = 7
                effectiveKey = targetKey
                effectivePitch = pitch
                borrowedAppliedQuality = "minor"
                context = .borrowedApplied
            } else if customIntervals != nil, inversion == 1 || inversion == 2 {
                effectiveDegree = root
                effectiveKey = rootKey
                effectivePitch = targetPitch
                borrowedAppliedQuality = "major"
                context = .borrowedApplied
            } else {
                let targetKey = KeyInfo(tonic: targetName, scale: "major")
                guard let pitch = MusicTheory.spelledPitch(
                    scaleDegree: String(applied),
                    relativeOctave: 0,
                    key: targetKey,
                    baseOctave: targetPitch.octave
                ) else { return nil }
                effectiveDegree = applied
                effectiveKey = targetKey
                effectivePitch = pitch
                context = .borrowedApplied
            }
        } else {
            effectiveDegree = root
            effectiveKey = rootKey
            effectivePitch = targetPitch
            context = customIntervals != nil ? .customBorrowed : borrowedIsNamed ? .borrowed : .standard
        }

        guard let sourceTonic = SpelledPitch.parse(noteName: sourceKey.tonic, octave: referenceOctave) else { return nil }
        let genericSteps = floorMod(effectivePitch.letter.rawValue - sourceTonic.letter.rawValue, 7)
        let registeredStaffPosition = sourceTonic.staffPosition + genericSteps
        let registered = SpelledPitch(
            letter: effectivePitch.letter,
            accidental: effectivePitch.accidental,
            octave: floorDiv(registeredStaffPosition, 7)
        )
        let qualityTable: [String]
        if (1...7).contains(applied) {
            qualityTable = qualities(for: "major")
        } else if let customIntervals {
            qualityTable = customChordQualities(customIntervals)
        } else {
            qualityTable = qualities(for: effectiveKey.scale)
        }
        let baseQuality = borrowedAppliedQuality ?? qualityTable[floorMod(effectiveDegree - 1, 7)]
        var quality = adjustedQuality(baseQuality, chord: chord)
        if strings(chord, "alterations").contains(where: { $0 == "#5" || $0 == "♯5" }), quality == "major" {
            quality = "augmented"
        }
        return ResolvedChordRoot(
            pitch: registered,
            simpleModePitch: SpelledPitch(
                letter: effectivePitch.letter,
                accidental: effectivePitch.accidental,
                octave: referenceOctave
            ),
            sourceDegree: root,
            effectiveDegree: effectiveDegree,
            sourceKey: sourceKey,
            effectiveKey: effectiveKey,
            customIntervals: customIntervals,
            chordQuality: quality,
            context: context,
            genericStepsFromTonic: registered.staffPosition - sourceTonic.staffPosition,
            specificSemitonesFromTonic: registered.chromaticPosition - sourceTonic.chromaticPosition
        )
    }

    public static func relativeIonianRomanSymbol(
        for chord: [String: JSONValue],
        key: KeyInfo,
        contextKey explicitContextKey: KeyInfo? = nil
    ) -> String {
        let symbol = romanSymbol(for: chord, key: key)
        let root = integer(chord, "root")
        guard (1...7).contains(root), symbol != "Rest", !symbol.isEmpty else { return symbol }
        let sourceKey = KeyInfo(tonic: key.tonic, scale: RelativeIonianContext.canonicalScaleName(key.scale))
        let displayKey = KeyInfo(tonic: (explicitContextKey ?? RelativeIonianContext.key(for: key)).tonic, scale: "major")
        if sourceKey.scale == "major" && sourceKey.tonic == displayKey.tonic { return symbol }
        let applied = integer(chord, "applied")
        if (1...7).contains(applied) {
            let customIntervals = customBorrowedIntervals(chord["borrowed"])
            let borrowed = string(chord, "borrowed")
            let targetKey = KeyInfo(
                tonic: sourceKey.tonic,
                scale: customIntervals != nil ? "custom" : borrowedTags[borrowed] != nil ? borrowed : sourceKey.scale
            )
            guard let target = MusicTheory.spelledPitch(
                scaleDegree: String(root), relativeOctave: 0, key: targetKey, customIntervals: customIntervals
            ), let degree = RelativeIonianContext.degree(for: target, in: displayKey),
                  let slash = symbol.firstIndex(of: "/") else { return symbol }
            return String(symbol[...slash]) + rebaseNumeral(String(symbol[symbol.index(after: slash)...]), to: degree)
        }
        guard let resolved = resolvedRoot(for: chord, key: sourceKey),
              let degree = RelativeIonianContext.degree(for: resolved.pitch, in: displayKey) else { return symbol }
        return rebaseNumeral(symbol, to: degree)
    }

    /// Rebase only the numeral. All quality, inversion and borrowed annotations
    /// remain exactly those selected by the canonical symbol interpreter.
    private static func rebaseNumeral(_ symbol: String, to degree: RelativeIonianDegree) -> String {
        guard let range = symbol.range(of: "^[♭♯]*[ivIV]+", options: .regularExpression) else { return symbol }
        let original = symbol[range].drop(while: { $0 == "♭" || $0 == "♯" })
        let numeral = romanMap[degree.degree] ?? ""
        let isMinor = original.first?.isLowercase == true
        return degree.accidentalPrefix + (isMinor ? numeral.lowercased() : numeral) + String(symbol[range.upperBound...])
    }

    private static func buildNumeral(
        degree: Int,
        quality: String,
        chord: [String: JSONValue],
        prefix: String,
        majorSeventh: Bool,
        fullyDiminished: Bool = false,
        borrowedTag: String = "",
        symbolKey: KeyInfo? = nil
    ) -> String {
        var numeral = romanMap[degree] ?? ""
        if quality == "minor" || quality == "diminished" { numeral = numeral.lowercased() }
        return prefix + numeral + suffix(
            chord: chord,
            quality: quality,
            majorSeventh: majorSeventh,
            fullyDiminished: fullyDiminished,
            borrowedTag: borrowedTag,
            symbolKey: symbolKey
        )
    }

    /// Hooktheory's ordered figured-bass spelling. Keep insertion points separate
    /// from trailing modifiers: their order is part of the shared text contract.
    private static func suffix(
        chord: [String: JSONValue],
        quality: String,
        majorSeventh: Bool,
        fullyDiminished: Bool,
        borrowedTag: String,
        symbolKey: KeyInfo?
    ) -> String {
        let root = integer(chord, "root")
        let type = integer(chord, "type", default: 5)
        let inversion = integer(chord, "inversion")
        let suspensions = integers(chord, "suspensions")
        let alterations = strings(chord, "alterations")
        let omits = integers(chord, "omits")
        let adds = integers(chord, "adds")
        let suspended = !suspensions.isEmpty
        let applied = (1...7).contains(integer(chord, "applied"))
        let implicitHalfDiminished = quality == "diminished" && type >= 7 && !fullyDiminished
        let displayAlterations = alterations
        let alterationText = displayAlterations.map { "(\($0))" }.joined()
        let suspensionText = suspensions.map { "sus\($0)" }.joined()
        let addBody = adds.map { "add\($0 <= 6 && type >= 7 ? $0 + 7 : $0)" }.joined()
        let omit3Only = omits.contains(3) && !omits.contains(5)
        let sharpFiveOnly = displayAlterations == ["#5"]
        let suppressPlus = !applied && type < 7 && sharpFiveOnly && (inversion == 1 || inversion == 2)
        let suppressDiminished = sharpFiveOnly && quality == "diminished" && inversion == 2 && type < 7
        let hasBorrowed = chord["borrowed"]?.arrayValue != nil || !string(chord, "borrowed").isEmpty
        var result = ""
        var embeddedAlterations = false
        var placedSuspensions = false
        var placedOmits = false
        var placedAdds = false

        if quality == "augmented" || (quality == "major" && !suspended && alterations.contains("#5") && !suppressPlus) { result += "+" }
        if !suspended {
            if quality == "diminished", !suppressDiminished {
                result += implicitHalfDiminished ? "ø" : "°"
                if majorSeventh && !implicitHalfDiminished { result += "△" }
            } else if type >= 7 && majorSeventh {
                result += "△"
            }
        }
        switch inversion {
        case 1:
            if type >= 7 {
                result += "6\(alterationText)5"
                embeddedAlterations = !alterationText.isEmpty
            } else if !alterationText.isEmpty {
                result += "6\(alterationText)"
                embeddedAlterations = true
            } else if suspended {
                if suspensions.contains(4) && !suspensions.contains(2)
                    && (string(chord, "borrowed") == "lydian" || borrowedTag == "(lyd)") {
                    result += "sus\(suspensions.map(String.init).joined())6"
                } else {
                    result += "6\(suspensionText)"
                }
                placedSuspensions = true
            } else {
                result += "6"
            }
        case 2:
            if type >= 7 {
                result += "4\(alterationText)3"
                embeddedAlterations = !alterationText.isEmpty
            } else if suspended {
                if !adds.isEmpty {
                    result += suspensions.contains(4) && suspensions.contains(2)
                        ? "4\(suspensionText)6(\(addBody))"
                        : "6(\(addBody))4\(suspensionText)"
                    placedAdds = true
                } else {
                    result += applied ? "64\(suspensionText)" : "4\(suspensionText)6"
                }
                placedSuspensions = true
            } else if sharpFiveOnly {
                if quality == "minor", root == 1, !hasBorrowed {
                    result += "46\(alterationText)"
                } else if !adds.isEmpty {
                    result += (quality == "minor" || quality == "diminished" || result.contains("+") ? "" : "+")
                        + "6(\(addBody))\(alterationText)4"
                    placedAdds = true
                } else {
                    result += (quality == "minor" || quality == "diminished" || result.contains("+") ? "" : "+")
                        + "6\(alterationText)4"
                }
                embeddedAlterations = true
            } else if omit3Only {
                let tonic = symbolKey?.tonic ?? ""
                let use46 = !hasBorrowed && (
                    (quality == "minor" && root == 4 && (tonic == "F" || tonic == "B"))
                    || (quality == "minor" && root == 1 && tonic == "C")
                    || (root == 7 && symbolKey?.scale == "phrygian")
                )
                result += use46 ? "46(no3)" : "6(no3)4"
                placedOmits = true
            } else {
                result += "6\(alterationText)4"
                embeddedAlterations = !alterationText.isEmpty
            }
        case 3:
            if type >= 7 && !alterationText.isEmpty {
                result += "4\(alterationText)2"
                embeddedAlterations = true
            } else {
                result += "42"
            }
        default: break
        }
        let hasFiguredBass = result.contains(where: \.isNumber)
        if suspended && !placedSuspensions {
            if type >= 7 && !hasFiguredBass {
                if suspensions.count > 1 {
                    if suspensions[0] < suspensions[1] {
                        result += "\(suspensionText)\(type)"
                    } else {
                        result += "\(type)" + omits.map { "(no\($0))" }.joined() + suspensionText
                        placedOmits = !omits.isEmpty
                    }
                } else {
                    result += "\(type)\(alterationText)\(suspensionText)"
                    embeddedAlterations = !alterationText.isEmpty
                }
            } else {
                result += suspensionText
            }
        } else if type >= 7, !hasFiguredBass {
            result += "\(type)"
        }
        result += borrowedTag
        if !adds.isEmpty && !placedAdds { result += "(\(addBody))" }
        if !omits.isEmpty, !placedOmits {
            result += omits.contains(3) && omits.contains(5) && quality == "augmented"
                ? "(no5no3)" : omits.map { "(no\($0))" }.joined()
        }
        if !displayAlterations.isEmpty && !embeddedAlterations {
            result += "(\(displayAlterations.joined()))"
        }
        return result
    }

    private static func qualities(for scale: String) -> [String] {
        MusicTheory.chordQualities[scale] ?? MusicTheory.chordQualities["major"]!
    }

    private static func customBorrowedIntervals(_ value: JSONValue?) -> [Int]? {
        guard case let .array(source) = value else { return nil }
        if source.isEmpty { return MusicTheory.scaleIntervals["major"]! }
        var intervals: [Int] = []
        for index in 0..<7 {
            let fallback = (intervals.last ?? 0) + 2
            intervals.append(floorMod(source.indices.contains(index) ? source[index].intValue ?? fallback : fallback, 12))
        }
        return intervals
    }

    /// The raw `borrowed` array as authored, before the 7-slot/mod-12 normalisation
    /// `customBorrowedIntervals` applies. Hooktheory writes offsets like -1 for a
    /// flattened tonic, and the accidental prefix below is a raw subtraction, so it
    /// has to see the -1 rather than the 11 it normalises to.
    private static func rawCustomBorrowedIntervals(_ value: JSONValue?) -> [Int]? {
        guard case let .array(source) = value else { return nil }
        let intervals = source.compactMap(\.intValue)
        return intervals.count >= 7 ? intervals : nil
    }

    /// Triad quality read straight off a custom borrowed scale, ported from
    /// jsonToSymbol.js's customArrayTriadQuality. Deliberately separate from
    /// `customChordQualities`, which the note builder uses: web keeps the two
    /// apart as well, and their fallbacks differ.
    private static func customArrayTriadQuality(_ intervals: [Int], degree: Int) -> String {
        func at(_ index: Int) -> Int { intervals[floorMod(index - 1, 7)] }
        let root = at(degree)
        let third = floorMod(at(degree + 2) - root, 12)
        let fifth = floorMod(at(degree + 4) - root, 12)
        switch (third, fifth) {
        case (4, 7): return "major"
        case (3, 7): return "minor"
        case (3, 6): return "diminished"
        case (4, 8): return "augmented"
        default: return third <= 3 ? "minor" : "major"
        }
    }

    private static func customArrayPrefix(_ intervals: [Int], degree: Int, key: KeyInfo) -> String {
        let reference = MusicTheory.scaleIntervals[key.scale] ?? MusicTheory.scaleIntervals["major"]!
        switch intervals[degree - 1] - reference[degree - 1] {
        case -2: return "♭♭"
        case -1: return "♭"
        case 1: return "♯"
        case 2: return "♯♯"
        default: return ""
        }
    }

    private static func customArraySeventhMajor(_ intervals: [Int], degree: Int) -> Bool {
        func at(_ index: Int) -> Int { intervals[floorMod(index - 1, 7)] }
        return floorMod(at(degree + 6) - at(degree), 12) == 11
    }

    private static func customChordQualities(_ intervals: [Int]) -> [String] {
        (0..<7).map { rootIndex in
            let root = intervals[rootIndex]
            var third = intervals[(rootIndex + 2) % 7]
            var fifth = intervals[(rootIndex + 4) % 7]
            if third < root { third += 12 }
            if fifth < root { fifth += 12 }
            return switch (third - root, fifth - root) {
            case (4, 7): "major"
            case (3, 7): "minor"
            case (3, 6): "diminished"
            case (4, 8): "augmented"
            case (4, _): "major"
            default: "minor"
            }
        }
    }

    private static func adjustedQuality(_ quality: String, chord: [String: JSONValue]) -> String {
        let alterations = strings(chord, "alterations")
        if alterations.contains("#5") && quality == "diminished" { return "minor" }
        return alterations.contains("b5") && quality == "minor" ? "diminished" : quality
    }

    private static func isMajorSeventh(
        degree: Int,
        key: KeyInfo,
        customIntervals: [Int]? = nil
    ) -> Bool {
        let intervals = key.scale == "custom" && customIntervals != nil
            ? customIntervals!
            : MusicTheory.scaleIntervals[key.scale] ?? MusicTheory.scaleIntervals["major"]!
        let root = intervals[(degree - 1 + 7) % 7]
        var seventh = intervals[(degree - 1 + 6) % 7]
        if seventh < root { seventh += 12 }
        return seventh - root == 11
    }

    private static func borrowedPrefix(degree: Int, key: KeyInfo, borrowedScale: String) -> String {
        let borrowed = MusicTheory.noteLabel(degree: degree, tonic: key.tonic, scale: borrowedScale)
        let reference = MusicTheory.noteLabel(degree: degree, tonic: key.tonic, scale: key.scale)
        switch MusicTheory.modifierValue(borrowed) - MusicTheory.modifierValue(reference) {
        case -2: return "♭♭"
        case -1: return "♭"
        case 1: return "♯"
        case 2: return "♯♯"
        default: return ""
        }
    }

    private static func isTritoneSubstitution(_ chord: [String: JSONValue]) -> Bool {
        integer(chord, "applied") == 5 && strings(chord, "substitutions").contains("tri")
    }

    private static func integer(_ chord: [String: JSONValue], _ key: String, default defaultValue: Int = 0) -> Int {
        chord[key]?.intValue ?? defaultValue
    }

    private static func string(_ chord: [String: JSONValue], _ key: String) -> String {
        chord[key]?.stringValue ?? ""
    }

    private static func boolean(_ chord: [String: JSONValue], _ key: String) -> Bool {
        chord[key]?.boolValue ?? false
    }

    private static func integers(_ chord: [String: JSONValue], _ key: String) -> [Int] {
        chord[key]?.arrayValue?.compactMap(\.intValue) ?? []
    }

    private static func strings(_ chord: [String: JSONValue], _ key: String) -> [String] {
        chord[key]?.arrayValue?.compactMap(\.stringValue) ?? []
    }

    private static func floorMod(_ value: Int, _ divisor: Int) -> Int {
        let remainder = value % divisor
        return remainder >= 0 ? remainder : remainder + divisor
    }

    private static func floorDiv(_ value: Int, _ divisor: Int) -> Int {
        let quotient = value / divisor
        return value < 0 && value % divisor != 0 ? quotient - 1 : quotient
    }
}
