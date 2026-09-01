import Foundation

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
            borrowedTag: hasAdds ? tag : ""
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

        if (1...7).contains(applied) {
            let target = MusicTheory.noteLabel(degree: root, tonic: key.tonic, scale: key.scale)
            if isTritoneSubstitution(chord) {
                effectiveKey = KeyInfo(tonic: pitchClassNames[(MusicTheory.pitchClass(note: target) + 1) % 12], scale: "major")
                degree = 1
            } else {
                effectiveKey = KeyInfo(tonic: target, scale: "major")
                degree = applied
            }
        } else if borrowedTags[borrowed] != nil {
            effectiveKey = KeyInfo(tonic: key.tonic, scale: borrowed)
        }

        let quality = adjustedQuality(qualities(for: effectiveKey.scale)[degree - 1], chord: chord)
        let rootName = MusicTheory.noteLabel(degree: degree, tonic: effectiveKey.tonic, scale: effectiveKey.scale)
        let augmented = quality == "augmented"
        let sharpFive = alterations.contains("#5")
        let majorSeventh = type >= 7 && quality != "diminished" && !augmented && suspensions.isEmpty
            && !isTritoneSubstitution(chord)
            && isMajorSeventh(degree: degree, key: effectiveKey)
        let augmentedMajorSeventh = augmented && type >= 7 && isMajorSeventh(degree: degree, key: effectiveKey)

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
        return "\(rootName)\(suffix)/\(MusicTheory.noteLabel(degree: bassDegree, tonic: effectiveKey.tonic, scale: effectiveKey.scale))"
    }

    public static func chordNotes(for chord: [String: JSONValue], key: KeyInfo) -> [Int] {
        let root = integer(chord, "root")
        guard (1...7).contains(root) else { return [] }
        let applied = integer(chord, "applied")
        let borrowed = string(chord, "borrowed")
        let type = integer(chord, "type", default: 5)
        let suspensions = integers(chord, "suspensions")
        let alterations = strings(chord, "alterations")
        let omits = integers(chord, "omits")
        let adds = integers(chord, "adds")
        var effectiveKey = key
        var effectiveRoot = root

        if (1...7).contains(applied) {
            let targetScale = borrowedTags[borrowed] == nil ? key.scale : borrowed
            let target = MusicTheory.noteLabel(degree: root, tonic: key.tonic, scale: targetScale)
            if isTritoneSubstitution(chord) {
                effectiveKey = KeyInfo(tonic: pitchClassNames[(MusicTheory.pitchClass(note: target) + 1) % 12], scale: "major")
                effectiveRoot = 1
            } else {
                effectiveKey = KeyInfo(tonic: target, scale: "major")
                effectiveRoot = applied
            }
        } else if borrowedTags[borrowed] != nil {
            effectiveKey = KeyInfo(tonic: key.tonic, scale: borrowed)
        }

        let scale = effectiveKey.scale
        let scaleIntervals = MusicTheory.scaleIntervals[scale] ?? MusicTheory.scaleIntervals["major"]!
        let rootIndex = effectiveRoot - 1
        let rootPitchClass = (MusicTheory.pitchClass(note: effectiveKey.tonic) + scaleIntervals[rootIndex]) % 12
        let quality = qualities(for: scale)[rootIndex]
        var degrees = [1: 0, 3: 4, 5: 7]
        if quality == "minor" || quality == "diminished" { degrees[3] = 3 }
        if quality == "diminished" { degrees[5] = 6 }
        if quality == "augmented" { degrees[5] = 8 }
        if suspensions.contains(2) { degrees[3] = 2 }
        if suspensions.contains(4) { degrees[3] = 5 }

        if type >= 7 {
            let fullyDiminished = quality == "diminished" && suspensions.isEmpty
                || (key.scale == "minor" && root == 2)
            let harmonicMinorAugmentedMajorSeven = scale == "harmonicMinor" && effectiveRoot == 3 && suspensions.isEmpty
            if harmonicMinorAugmentedMajorSeven {
                degrees[7] = 7
                degrees[11] = 11
                degrees[5] = nil
                degrees[3] = 4
            } else if fullyDiminished {
                degrees[7] = 9
            } else if isTritoneSubstitution(chord) {
                degrees[7] = 10
            } else if isMajorSeventh(degree: effectiveRoot, key: effectiveKey) && suspensions.isEmpty {
                degrees[7] = 11
            } else {
                degrees[7] = 10
            }
        }
        if type >= 9 { degrees[9] = 14 }
        if type >= 11 { degrees[11] = degrees[11] ?? 17 }
        if type >= 13 { degrees[13] = 21 }
        if (scale == "minor" || scale == "harmonicMinor"), effectiveRoot == 5, type >= 13 {
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
            case "#11": degrees[11] = 18
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
        let alteredFifth = alterations.contains { ["b5", "#5", "♭5", "♯5"].contains($0) }
        if type >= 9, !suspensions.isEmpty, !omits.contains(5), !alteredFifth, degrees[5] == 7 { degrees[5] = nil }
        return degrees.values.map { 48 + rootPitchClass + $0 }.sorted()
    }

    private static func buildNumeral(
        degree: Int,
        quality: String,
        chord: [String: JSONValue],
        prefix: String,
        majorSeventh: Bool,
        fullyDiminished: Bool = false,
        borrowedTag: String = ""
    ) -> String {
        var numeral = romanMap[degree] ?? ""
        if quality == "minor" || quality == "diminished" { numeral = numeral.lowercased() }
        return prefix + numeral + suffix(
            chord: chord,
            quality: quality,
            majorSeventh: majorSeventh,
            fullyDiminished: fullyDiminished,
            borrowedTag: borrowedTag
        )
    }

    private static func suffix(
        chord: [String: JSONValue],
        quality: String,
        majorSeventh: Bool,
        fullyDiminished: Bool,
        borrowedTag: String
    ) -> String {
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
        var result = ""
        var embeddedAlterations = false
        var placedSuspensions = false

        if quality == "augmented" || alterations.contains("#5") { result += "+" }
        if !suspended {
            if quality == "diminished" {
                result += type >= 7 && !fullyDiminished ? "ø" : "°"
                if majorSeventh && !(type >= 7 && !fullyDiminished) { result += "△" }
            } else if type >= 7 && majorSeventh {
                result += "△"
            }
        }
        switch inversion {
        case 1:
            if suspended && type < 7 {
                result += "6\(suspensionText)"
                placedSuspensions = true
            } else if type >= 7 {
                result += alterationText.isEmpty ? "65" : "6\(alterationText)5"
                embeddedAlterations = !alterationText.isEmpty
            } else { result += "6" }
        case 2:
            if type >= 7 {
                result += alterationText.isEmpty ? "43" : "4\(alterationText)3"
                embeddedAlterations = !alterationText.isEmpty
            } else if suspended {
                result += "4\(suspensionText)6"
                placedSuspensions = true
            } else { result += "64" }
        case 3:
            result += type >= 7 && implicitHalfDiminished && alterations.contains("b5") ? "4(b5)2" : "42"
            embeddedAlterations = !alterationText.isEmpty
        default: break
        }
        if suspended && !placedSuspensions {
            result += type >= 7 && !result.contains(where: \.isNumber) ? "\(type)\(alterationText)\(suspensionText)" : suspensionText
            embeddedAlterations = type >= 7 && !alterationText.isEmpty
        } else if type >= 7 && !result.contains(where: \.isNumber) {
            result += "\(type)"
        }
        result += borrowedTag
        if !adds.isEmpty { result += "(\(adds.map { "add\($0 <= 6 && type >= 7 ? $0 + 7 : $0)" }.joined()))" }
        result += omits.map { "(no\($0))" }.joined()
        if !displayAlterations.isEmpty && !embeddedAlterations { result += alterationText }
        return result
    }

    private static func qualities(for scale: String) -> [String] {
        MusicTheory.chordQualities[scale] ?? MusicTheory.chordQualities["major"]!
    }

    private static func adjustedQuality(_ quality: String, chord: [String: JSONValue]) -> String {
        strings(chord, "alterations").contains("b5") && quality == "minor" ? "diminished" : quality
    }

    private static func isMajorSeventh(degree: Int, key: KeyInfo) -> Bool {
        let intervals = MusicTheory.scaleIntervals[key.scale] ?? MusicTheory.scaleIntervals["major"]!
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
}
