import Foundation

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

/// The chord's tones as an insertion-ordered stack of (scale degree -> semitone
/// offset from the root). Order matters: an inverted chord rotates this stack as
/// built, and web appends later additions rather than sorting them into degree
/// order, so `add4` stacks *after* the fifth. Mirrors the LinkedHashMap the
/// Android port relies on for the same reason.
private struct DegreeStack {
    private var order: [Int] = []
    private var offsets: [Int: Int] = [:]

    subscript(degree: Int) -> Int? {
        get { offsets[degree] }
        set {
            guard let newValue else {
                if offsets.removeValue(forKey: degree) != nil { order.removeAll { $0 == degree } }
                return
            }
            if offsets.updateValue(newValue, forKey: degree) == nil { order.append(degree) }
        }
    }

    /// Semitone offsets in build order.
    var pitchOffsets: [Int] { order.compactMap { offsets[$0] } }
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
        guard (1...7).contains(root), !boolean(chord, "isRest"), !boolean(chord, "rest") else { return "Rest" }
        let applied = integer(chord, "applied")
        if (1...7).contains(applied) {
            let targetTonic = MusicTheory.noteLabel(degree: root, tonic: key.tonic, scale: key.scale)
            let numeratorKey = KeyInfo(tonic: targetTonic, scale: "major")
            let tritoneSubstitution = isTritoneSubstitution(chord)
            let numeratorDegree = tritoneSubstitution ? 2 : applied
            let targetQuality = qualities(for: key.scale)[root - 1]
            let type = integer(chord, "type", default: 5)
            let majorSeventh = type >= 7 && applied != 5
                && isMajorSeventh(degree: numeratorDegree, key: numeratorKey)
                && integers(chord, "suspensions").isEmpty
            let numerator = buildNumeral(
                degree: numeratorDegree,
                quality: qualities(for: "major")[numeratorDegree - 1],
                chord: chord,
                prefix: tritoneSubstitution ? "♭" : "",
                majorSeventh: majorSeventh,
                fullyDiminished: applied == 7 && !tritoneSubstitution
            )
            let denominator = (MusicTheory.romanNumerals[key.scale] ?? MusicTheory.romanNumerals["major"]!)[root - 1]
            let denominatorTag = applied == 5 && type >= 7 && targetQuality == "minor" ? "(maj)" : ""
            return "\(numerator)/\(denominator)\(denominatorTag)\(tritoneSubstitution ? "(∆-sub)" : "")"
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
                fullyDiminished: quality == "diminished" && type >= 7,
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
            borrowedTag: hasAdds ? tag : "",
            symbolKey: KeyInfo(tonic: key.tonic, scale: scale)
        )
        return result + (hasAdds ? "" : tag)
    }

    public static func letterName(for chord: [String: JSONValue], key: KeyInfo) -> String {
        let root = integer(chord, "root")
        guard (1...7).contains(root) else { return "" }
        let applied = integer(chord, "applied")
        let borrowed = string(chord, "borrowed")
        let type = integer(chord, "type", default: 5)
        let inversion = integer(chord, "inversion")
        let suspensions = integers(chord, "suspensions")
        let alterations = strings(chord, "alterations")
        let omits = integers(chord, "omits")
        var effectiveKey = key
        var degree = root
        // Set only for a custom borrowed scale, whose note spellings come from the
        // array rather than from any named scale.
        var customIntervals: [Int]?
        var customQuality: String?

        if (1...7).contains(applied) {
            let target = MusicTheory.noteLabel(degree: root, tonic: key.tonic, scale: key.scale)
            if isTritoneSubstitution(chord) {
                effectiveKey = KeyInfo(tonic: pitchClassNames[(MusicTheory.pitchClass(note: target) + 1) % 12], scale: "major")
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
        let sharpFive = alterations.contains("#5")
        // An applied chord's label ignores `borrowed` entirely, custom arrays
        // included -- the same rule the Roman-numeral path follows.
        let customSeventh = (1...7).contains(applied)
            ? nil
            : rawCustomBorrowedIntervals(chord["borrowed"]).map { customArraySeventhMajor($0, degree: degree) }
        let diatonicMajorSeventh = customSeventh
            ?? isMajorSeventh(degree: degree, key: effectiveKey, customIntervals: customIntervals)
        let majorSeventh = type >= 7 && quality != "diminished" && !augmented && suspensions.isEmpty
            && !isTritoneSubstitution(chord)
            && diatonicMajorSeventh
        let augmentedMajorSeventh = augmented && type >= 7 && diatonicMajorSeventh

        var suffix = ""
        if omits.contains(3), !omits.contains(5), type < 7 { suffix = "5" }
        else if quality == "minor" { suffix = "m" }
        else if quality == "diminished" && suspensions.isEmpty { suffix = "°" }
        else if augmentedMajorSeventh || (augmented && omits.contains(3) && omits.contains(5)) { suffix = "++" }
        else if augmented || sharpFive { suffix = "+" }
        if type >= 7 && !augmentedMajorSeventh { suffix += majorSeventh ? "maj\(type)" : "\(type)" }
        suffix += suspensions.map { "sus\($0)" }.joined()
        suffix += alterations.map { "(\($0))" }.joined()

        guard (1...3).contains(inversion) else { return rootName + suffix }
        let bassOffset: Int
        if inversion == 1 { bassOffset = type < 7 && suspensions.contains(4) && !suspensions.contains(2) ? 3 : 2 }
        else if inversion == 2 { bassOffset = 4 }
        else { bassOffset = 6 }
        let bassDegree = ((degree - 1 + bassOffset) % 7) + 1
        let bassName = MusicTheory.noteLabel(
            degree: bassDegree,
            tonic: effectiveKey.tonic,
            scale: effectiveKey.scale,
            customIntervals: customIntervals
        )
        return "\(rootName)\(suffix)/\(bassName)"
    }

    public static func chordNotes(for chord: [String: JSONValue], key: KeyInfo) -> [Int] {
        let root = integer(chord, "root")
        guard (1...7).contains(root), !boolean(chord, "isRest"), !boolean(chord, "rest") else { return [] }
        let applied = integer(chord, "applied")
        let type = integer(chord, "type", default: 5)
        let inversion = integer(chord, "inversion")
        let borrowed = string(chord, "borrowed")
        let customIntervals = customBorrowedIntervals(chord["borrowed"])
        let hasBorrowedScale = !borrowed.isEmpty || customIntervals != nil
        let suspensions = integers(chord, "suspensions")
        let alterations = strings(chord, "alterations")
        let omits = integers(chord, "omits")
        let adds = integers(chord, "adds")
        var effectiveKey = key
        var effectiveRoot = root
        var forcedTriadQuality: String?
        var forcedSeventh: Int?
        var usesAppliedVoicing = false

        if (1...7).contains(applied), !hasBorrowedScale {
            let target = MusicTheory.noteLabel(degree: root, tonic: key.tonic, scale: key.scale)
            if isTritoneSubstitution(chord) {
                effectiveKey = KeyInfo(tonic: pitchClassNames[(MusicTheory.pitchClass(note: target) + 1) % 12], scale: "major")
                effectiveRoot = 1
            } else {
                effectiveKey = KeyInfo(tonic: target, scale: "major")
                effectiveRoot = applied
            }
            usesAppliedVoicing = true
        } else if (1...7).contains(applied), hasBorrowedScale {
            let targetScale = customIntervals == nil ? borrowed : "custom"
            let target = MusicTheory.noteLabel(
                degree: root,
                tonic: key.tonic,
                scale: targetScale,
                customIntervals: customIntervals
            )
            if borrowed == "locrian", root == 1, applied == 1, type < 7 {
                effectiveKey = KeyInfo(tonic: target, scale: "major")
                effectiveRoot = 1
                forcedTriadQuality = "minor"
                usesAppliedVoicing = true
            } else if isTritoneSubstitution(chord) {
                effectiveKey = KeyInfo(
                    tonic: pitchClassNames[(MusicTheory.pitchClass(note: target) + 1) % 12],
                    scale: "major"
                )
                effectiveRoot = 1
                forcedTriadQuality = "major"
                forcedSeventh = 10
                usesAppliedVoicing = true
            } else if applied == 7, alterations.contains("#5") {
                effectiveKey = KeyInfo(tonic: target, scale: "major")
                effectiveRoot = 7
                forcedTriadQuality = "minor"
                forcedSeventh = 10
                usesAppliedVoicing = true
            } else if customIntervals != nil, inversion == 1 || inversion == 2 {
                effectiveKey = KeyInfo(tonic: target, scale: "major")
                effectiveRoot = 1
                forcedTriadQuality = "major"
                forcedSeventh = 10
                usesAppliedVoicing = true
            } else {
                effectiveKey = KeyInfo(tonic: target, scale: "major")
                effectiveRoot = applied
            }
        }

        let borrowedAppliedDefault = (1...7).contains(applied) && hasBorrowedScale && forcedTriadQuality == nil
        let scale: String
        if (1...7).contains(applied), hasBorrowedScale {
            scale = effectiveKey.scale
        } else if customIntervals != nil {
            scale = "custom"
        } else if !borrowed.isEmpty {
            scale = borrowed
        } else {
            scale = effectiveKey.scale
        }
        let scaleIntervals: [Int]
        if (1...7).contains(applied), hasBorrowedScale {
            scaleIntervals = MusicTheory.scaleIntervals["major"]!
        } else if let customIntervals {
            scaleIntervals = customIntervals
        } else {
            scaleIntervals = MusicTheory.scaleIntervals[scale] ?? MusicTheory.scaleIntervals["major"]!
        }
        let rootIndex = effectiveRoot - 1
        let rootPitchClass = (MusicTheory.pitchClass(note: effectiveKey.tonic) + scaleIntervals[rootIndex]) % 12
        let qualityTable: [String]
        if (1...7).contains(applied), hasBorrowedScale {
            qualityTable = qualities(for: "major")
        } else if let customIntervals {
            qualityTable = customChordQualities(customIntervals)
        } else {
            qualityTable = qualities(for: scale)
        }
        let quality = forcedTriadQuality ?? qualityTable[rootIndex]
        var degrees = DegreeStack()
        degrees[1] = 0
        degrees[3] = 4
        degrees[5] = 7
        if quality == "minor" || quality == "diminished" { degrees[3] = 3 }
        if quality == "diminished" { degrees[5] = 6 }
        if quality == "augmented" { degrees[5] = 8 }
        if suspensions.contains(2) { degrees[3] = 2 }
        if suspensions.contains(4) { degrees[3] = 5 }

        if type >= 7 {
            let fullyDiminished = !borrowedAppliedDefault && (
                quality == "diminished" && suspensions.isEmpty ||
                    applied == 7 ||
                    borrowed == "dorian" && effectiveRoot == 6 ||
                    borrowed == "lydian" && effectiveRoot == 4 ||
                    borrowed == "minor" && effectiveRoot == 2 ||
                    borrowed == "phrygian" && effectiveRoot == 5
            )
            let harmonicMinorAugmentedMajorSeven = scale == "harmonicMinor" && effectiveRoot == 3 && suspensions.isEmpty
            if let forcedSeventh {
                degrees[7] = forcedSeventh
            } else if harmonicMinorAugmentedMajorSeven {
                degrees[7] = 7
                degrees[11] = 11
                degrees[5] = nil
                degrees[3] = 4
            } else if fullyDiminished {
                degrees[7] = 9
            } else if isTritoneSubstitution(chord) {
                degrees[7] = 10
            } else if isMajorSeventh(
                // The seventh's quality comes from the scale actually in force -
                // the borrowed mode, or the custom interval array - not from the
                // song key. `effectiveKey` only tracks the applied-chord tonic, so
                // reading its scale here would spell a borrowed i7 as a major
                // seventh. Mirrors ChordInterpreter.kt's KeyInfo(effKey.tonic, scale).
                degree: effectiveRoot,
                key: KeyInfo(tonic: effectiveKey.tonic, scale: scale),
                customIntervals: customIntervals
            ) && suspensions.isEmpty {
                degrees[7] = 11
            } else {
                degrees[7] = 10
            }
        }
        if type >= 9 { degrees[9] = 14 }
        // The chord's own eleventh sits a fourth above the root, not a compound
        // fourth: web builds it as shiftNoteBySemitones(root, 5). An *added*
        // eleventh (adds: [11], below) is the compound one at +17.
        if type >= 11 { degrees[11] = degrees[11] ?? 5 }
        if type >= 13 { degrees[13] = 21 }
        if (effectiveKey.scale == "minor" || effectiveKey.scale == "harmonicMinor"), effectiveRoot == 5, type >= 13 {
            degrees[9] = 13
            degrees[13] = 21
            degrees[14] = 20
        }
        for omit in omits { degrees[omit] = nil }
        for alteration in alterations {
            switch alteration.replacingOccurrences(of: "♭", with: "b").replacingOccurrences(of: "♯", with: "#") {
            case "b5": degrees[5] = 6
            case "#5": degrees[5] = 8
            case "b9": degrees[9] = 13
            case "#9": degrees[9] = 15
            // Raise the chord's own eleventh where it exists; otherwise introduce
            // a compound #4 (web: rule {src: 5, delta: 1} with addSd "#4").
            case "#11": degrees[11] = degrees[11] == nil ? 18 : 6
            case "b13": degrees[13] = 20
            default: break
            }
        }
        for add in adds {
            let target = add <= 6 && type >= 7 ? add + 7 : add
            if degrees[target] == nil {
                degrees[target] = [2: 2, 4: 5, 6: 9, 9: 14, 11: 17, 13: 21][target] ?? 0
            }
        }
        // Hooktheory voices an added sixth on a triad without its fifth, unless a
        // ninth is also added (web/lib/chordAdds.js). Only an unaltered perfect
        // fifth is dropped.
        if adds.contains(6), type < 7, !adds.contains(9), degrees[5] == 7 { degrees[5] = nil }

        let alteredFifth = alterations.contains { ["b5", "#5", "♭5", "♯5"].contains($0) }
        if type >= 9, !suspensions.isEmpty, !omits.contains(5), !alteredFifth, degrees[5] == 7 { degrees[5] = nil }

        let rootPositionPitches = degrees.pitchOffsets.map { 48 + rootPitchClass + $0 }
        if usesAppliedVoicing {
            return voiceAppliedChord(
                rootPositionPitches,
                inversion: inversion,
                chordType: type,
                fullyDiminished: applied == 7 && quality == "diminished" && suspensions.isEmpty
            )
        }

        // Web sorts a voicing into pitch order only in root position; an inverted
        // chord rotates the degree-order stack as built. The two agree for every
        // chord whose offsets ascend, and differ exactly when an eleventh sits
        // below the fifth.
        var pitches = inversion > 0 ? rootPositionPitches : rootPositionPitches.sorted()
        if inversion > 0, inversion < pitches.count {
            for _ in 0..<inversion { pitches.append(pitches.removeFirst() + 12) }
        }
        return pitches
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
        guard (1...7).contains(root), !boolean(chord, "isRest"), !boolean(chord, "rest") else { return nil }

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
        let root = integer(chord, "root")
        guard (1...7).contains(root), !boolean(chord, "isRest"), !boolean(chord, "rest") else { return "Rest" }

        let sourceKey = KeyInfo(tonic: key.tonic, scale: RelativeIonianContext.canonicalScaleName(key.scale))
        let displayKey = KeyInfo(
            tonic: (explicitContextKey ?? RelativeIonianContext.key(for: key)).tonic,
            scale: "major"
        )
        let applied = integer(chord, "applied")
        let borrowed = string(chord, "borrowed")

        if (1...7).contains(applied) {
            guard let targetPitch = MusicTheory.spelledPitch(
                scaleDegree: String(root),
                relativeOctave: 0,
                key: sourceKey
            ), let displayDegree = RelativeIonianContext.degree(for: targetPitch, in: displayKey)
            else { return romanSymbol(for: chord, key: key) }

            let numeratorKey = KeyInfo(tonic: targetPitch.noteName, scale: "major")
            let tritoneSubstitution = isTritoneSubstitution(chord)
            let numeratorDegree = tritoneSubstitution ? 2 : applied
            let targetQuality = qualities(for: sourceKey.scale)[root - 1]
            let type = integer(chord, "type", default: 5)
            let majorSeventh = type >= 7 && applied != 5
                && isMajorSeventh(degree: numeratorDegree, key: numeratorKey)
                && integers(chord, "suspensions").isEmpty
            let numerator = buildNumeral(
                degree: numeratorDegree,
                quality: qualities(for: "major")[numeratorDegree - 1],
                chord: chord,
                prefix: tritoneSubstitution ? "♭" : "",
                majorSeventh: majorSeventh,
                fullyDiminished: applied == 7 && !tritoneSubstitution
            )
            var denominator = romanMap[displayDegree.degree] ?? ""
            if targetQuality == "minor" || targetQuality == "diminished" { denominator = denominator.lowercased() }
            denominator = displayDegree.accidentalPrefix + denominator
            if targetQuality == "diminished" { denominator += "°" }
            if targetQuality == "augmented" { denominator += "+" }
            let denominatorTag = applied == 5 && type >= 7 && targetQuality == "minor" ? "(maj)" : ""
            return "\(numerator)/\(denominator)\(denominatorTag)\(tritoneSubstitution ? "(∆-sub)" : "")"
        }

        guard let resolved = resolvedRoot(for: chord, key: sourceKey),
              let displayDegree = RelativeIonianContext.degree(for: resolved.pitch, in: displayKey)
        else { return romanSymbol(for: chord, key: key) }

        let sourceScale = borrowedTags[borrowed] == nil
            ? sourceKey.scale
            : RelativeIonianContext.canonicalScaleName(borrowed)
        let borrowedTag = borrowedTags[borrowed].map { "(\($0))" } ?? (borrowed.hasPrefix("[") ? "(bor)" : "")
        let type = integer(chord, "type", default: 5)
        let majorSeventh = type >= 7 && resolved.chordQuality != "diminished"
            && isMajorSeventh(degree: root, key: KeyInfo(tonic: sourceKey.tonic, scale: sourceScale))
        let hasAdds = !integers(chord, "adds").isEmpty
        let result = buildNumeral(
            degree: displayDegree.degree,
            quality: resolved.chordQuality,
            chord: chord,
            prefix: displayDegree.accidentalPrefix,
            majorSeventh: majorSeventh,
            borrowedTag: hasAdds ? borrowedTag : "",
            symbolKey: KeyInfo(tonic: sourceKey.tonic, scale: sourceScale)
        )
        return result + (hasAdds ? "" : borrowedTag)
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

    /// The figured-bass and quality suffix, ported from ChordInterpreter.kt's
    /// buildSuffix. `symbolKey` carries the tonic and the *resolved* scale (the
    /// borrowed mode where one applies) and is nil on the applied-numerator
    /// path, mirroring the opts map Android does and does not supply there --
    /// several of the Hooktheory spellings below key off exactly that absence.
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
        let implicitHalfDiminished = quality == "diminished" && type >= 7 && !fullyDiminished
        let displayAlterations = implicitHalfDiminished ? alterations.filter { $0 != "b5" } : alterations
        let alterationBody = displayAlterations.joined()
        let alterationText = alterationBody.isEmpty ? "" : "(\(alterationBody))"
        let suspensionText = suspensions.map { "sus\($0)" }.joined()
        let addBody = adds.map { "add\($0 <= 6 && type >= 7 ? $0 + 7 : $0)" }.joined()
        let omit3Only = omits.contains(3) && !omits.contains(5)
        let sharpFiveOnly = displayAlterations == ["#5"]
        // Once a triad is inverted, Hooktheory writes the raised fifth into the
        // figured bass instead of as a "+" on the numeral.
        let suppressPlus = type < 7 && sharpFiveOnly && (inversion == 1 || inversion == 2)
        let suppressDiminished = sharpFiveOnly && quality == "diminished" && inversion == 2 && type < 7
        // Nil exactly where Android leaves "borrowed" out of its opts map.
        let borrowedOpt = symbolKey == nil ? nil : string(chord, "borrowed")

        var result = ""
        var embeddedAlterations = false
        var placedSuspensions = false
        var placedOmits = false

        if quality == "augmented" || (alterations.contains("#5") && !suppressPlus) { result += "+" }
        if !suspended {
            if quality == "diminished", !suppressDiminished {
                result += type >= 7 && !fullyDiminished ? "ø" : "°"
                if majorSeventh && !(type >= 7 && !fullyDiminished) { result += "△" }
            } else if type >= 7 && majorSeventh {
                result += "△"
            }
        }

        switch inversion {
        case 1:
            if suspended && type < 7 {
                let sus4Only = suspensions.contains(4) && !suspensions.contains(2)
                if sus4Only && (borrowedOpt == "lydian" || borrowedTag == "(lyd)") {
                    result += "sus\(suspensions.map(String.init).joined())6"
                } else {
                    result += "6\(suspensionText)"
                }
                placedSuspensions = true
            } else if type >= 7 {
                result += alterationText.isEmpty ? "65" : "6\(alterationText)5"
                embeddedAlterations = !alterationText.isEmpty
            } else if !alterationText.isEmpty {
                result += "6\(alterationText)"
                embeddedAlterations = true
            } else {
                result += "6"
            }
        case 2:
            if type >= 7 {
                result += alterationText.isEmpty ? "43" : "4\(alterationText)3"
                embeddedAlterations = !alterationText.isEmpty
            } else if suspended {
                if !adds.isEmpty {
                    result += suspensions.contains(4) && suspensions.contains(2)
                        ? "4\(suspensionText)6(\(addBody))"
                        : "6(\(addBody))4\(suspensionText)"
                } else {
                    result += "4\(suspensionText)6"
                }
                placedSuspensions = true
            } else if sharpFiveOnly {
                if quality == "minor", root == 1, borrowedOpt == nil {
                    result += "46\(alterationText)"
                } else {
                    result += (quality == "minor" || quality == "diminished" ? "" : "+")
                        + "6\(alterationText)4"
                }
                embeddedAlterations = true
            } else if omit3Only {
                let tonic = symbolKey?.tonic ?? ""
                let use46 = (quality == "minor" && root == 4 && (tonic == "F" || tonic == "B"))
                    || (quality == "minor" && root == 1 && tonic == "C")
                    || (root == 7 && symbolKey?.scale == "phrygian")
                result += use46 ? "46(no3)" : "6(no3)4"
                placedOmits = true
            } else if !alterationText.isEmpty {
                result += "6\(alterationText)4"
                embeddedAlterations = true
            } else {
                result += "64"
            }
        case 3:
            if type >= 7 {
                result += implicitHalfDiminished && alterations.contains("b5") ? "4(b5)2" : "42"
                embeddedAlterations = !alterationText.isEmpty
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
                        if !omits.isEmpty { placedOmits = true }
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
        if !adds.isEmpty { result += "(\(addBody))" }
        if !omits.isEmpty, !placedOmits {
            result += omits.contains(3) && omits.contains(5) && quality == "augmented"
                ? "(no5no3)"
                : omits.map { "(no\($0))" }.joined()
        }
        if !displayAlterations.isEmpty && !embeddedAlterations { result += alterationText }
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
        strings(chord, "alterations").contains("b5") && quality == "minor" ? "diminished" : quality
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

    private static func voiceAppliedChord(
        _ rootPositionPitches: [Int],
        inversion: Int,
        chordType: Int,
        fullyDiminished: Bool
    ) -> [Int] {
        guard !rootPositionPitches.isEmpty else { return [] }
        if inversion > 0 {
            let rotation = inversion % rootPositionPitches.count
            let rotated = Array(rootPositionPitches.dropFirst(rotation)) + Array(rootPositionPitches.prefix(rotation))
            let originalBass = rotated[0]
            let bassOctave = max(1, originalBass / 12 - 2)
            let bass = (bassOctave + 1) * 12 + floorMod(originalBass, 12)
            let highestUpperOctave = rotated.dropFirst().map { $0 / 12 - 1 }.max() ?? 0
            let targetUpperOctave = max(highestUpperOctave, bassOctave + 1)
            let upperOctaveBase = (targetUpperOctave + 1) * 12
            return [bass] + rotated.dropFirst().map { upperOctaveBase + floorMod($0, 12) }
        }

        if chordType >= 7, fullyDiminished, rootPositionPitches.count >= 4 {
            var spread = rootPositionPitches
            let rootOctave = spread[0] / 12 - 1
            for index in [1, 2] where spread[index] / 12 - 1 == rootOctave {
                spread[index] += 12
            }
            return spread.sorted()
        }
        return rootPositionPitches.sorted()
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
