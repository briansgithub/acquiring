import Foundation

public enum MusicTheory {
    public static let noteToPitchClass: [String: Int] = [
        "C": 0, "C♯": 1, "D♭": 1, "D": 2, "D♯": 3, "E♭": 3,
        "E": 4, "F♭": 4, "E♯": 5, "F": 5, "F♯": 6, "G♭": 6,
        "G": 7, "G♯": 8, "A♭": 8, "A": 9, "A♯": 10, "B♭": 10,
        "B": 11, "C♭": 11, "B♯": 0,
        "C#": 1, "Db": 1, "D#": 3, "Eb": 3, "E#": 5, "Fb": 4,
        "F#": 6, "Gb": 6, "G#": 8, "Ab": 8, "A#": 10, "Bb": 10,
        "B#": 0, "Cb": 11, "C##": 2, "Cx": 2, "D##": 4, "Dx": 4,
        "E##": 6, "Ex": 6, "F##": 7, "Fx": 7, "G##": 9, "Gx": 9,
        "A##": 11, "Ax": 11, "B##": 1, "Bx": 1, "Dbb": 0, "Ebb": 2,
        "Fbb": 3, "Gbb": 5, "Abb": 7, "Bbb": 9, "Cbb": 10
    ]

    public static let scaleIntervals: [String: [Int]] = [
        "major": [0, 2, 4, 5, 7, 9, 11],
        "minor": [0, 2, 3, 5, 7, 8, 10],
        "dorian": [0, 2, 3, 5, 7, 9, 10],
        "phrygian": [0, 1, 3, 5, 7, 8, 10],
        "lydian": [0, 2, 4, 6, 7, 9, 11],
        "mixolydian": [0, 2, 4, 5, 7, 9, 10],
        "locrian": [0, 1, 3, 5, 6, 8, 10],
        "harmonicMinor": [0, 2, 3, 5, 7, 8, 11],
        "phrygianDominant": [0, 1, 4, 5, 7, 8, 10]
    ]

    public static let romanNumerals: [String: [String]] = [
        "major": ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
        "minor": ["i", "ii°", "III", "iv", "v", "VI", "VII"],
        "dorian": ["i", "ii", "III", "IV", "v", "vi°", "VII"],
        "phrygian": ["i", "II", "III", "iv", "v°", "VI", "vii"],
        "lydian": ["I", "II", "iii", "iv°", "V", "vi", "vii"],
        "mixolydian": ["I", "ii", "iii°", "IV", "v", "vi", "VII"],
        "locrian": ["i°", "II", "iii", "iv", "V", "VI", "vii"],
        "harmonicMinor": ["i", "ii°", "III+", "iv", "V", "VI", "vii°"],
        "phrygianDominant": ["I", "II", "iii°", "iv", "v°", "VI+", "vii"]
    ]

    public static let chordQualities: [String: [String]] = [
        "major": ["major", "minor", "minor", "major", "major", "minor", "diminished"],
        "minor": ["minor", "diminished", "major", "minor", "minor", "major", "major"],
        "dorian": ["minor", "minor", "major", "major", "minor", "diminished", "major"],
        "phrygian": ["minor", "major", "major", "minor", "diminished", "major", "minor"],
        "lydian": ["major", "major", "minor", "diminished", "major", "minor", "minor"],
        "mixolydian": ["major", "minor", "diminished", "major", "minor", "minor", "major"],
        "locrian": ["diminished", "major", "minor", "minor", "major", "major", "minor"],
        "harmonicMinor": ["minor", "diminished", "augmented", "minor", "major", "major", "diminished"],
        "phrygianDominant": ["major", "major", "diminished", "minor", "diminished", "augmented", "minor"]
    ]

    private static let letters = ["C", "D", "E", "F", "G", "A", "B"]

    public static func pitchClass(note: String) -> Int { noteToPitchClass[note.trimmingCharacters(in: .whitespaces)] ?? 0 }

    public static func modifierValue(_ text: String) -> Int {
        text.reduce(into: 0) { value, character in
            switch character {
            case "#", "♯": value += 1
            case "b", "♭": value -= 1
            case "x": value += 2
            default: break
            }
        }
    }

    public static func rawDegree(_ scaleDegree: String) -> Int {
        Int(scaleDegree.filter(\.isNumber)) ?? 1
    }

    public static func noteLabel(degree: Int, tonic: String, scale: String) -> String {
        let intervals = scaleIntervals[scale] ?? scaleIntervals["major"]!
        let tonic = tonic.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let tonicLetter = tonic.first.map({ String($0).uppercased() }),
              let tonicIndex = letters.firstIndex(of: tonicLetter)
        else { return "C" }
        let tonicPitchClass = pitchClass(note: tonic)
        let index = ((degree - 1) % 7 + 7) % 7
        let targetPitchClass = (tonicPitchClass + intervals[index]) % 12
        let letter = letters[(tonicIndex + index) % 7]
        for accidental in ["", "b", "#", "bb", "##", "x"] {
            let candidate = letter + accidental
            if pitchClass(note: candidate) == targetPitchClass { return candidate }
        }
        return letter
    }

    public static func midiNote(scaleDegree: String, octave: Int, key: KeyInfo) -> Int {
        let raw = rawDegree(scaleDegree)
        let modifier = modifierValue(scaleDegree)
        let tonic = pitchClass(note: key.tonic)
        let intervals = scaleIntervals[key.scale] ?? scaleIntervals["major"]!
        let degreeBase = raw - 1
        let octaveShift = floorDiv(degreeBase, 7)
        let degreeIndex = floorMod(degreeBase, 7)
        let absolute = tonic + intervals[degreeIndex] + modifier
        let pitchClass = floorMod(absolute, 12)
        let overflow = floorDiv(absolute, 12)
        return (5 + octave + octaveShift + overflow) * 12 + pitchClass
    }

    public static func frequency(midi: Double) -> Double {
        440 * pow(2, (midi - 69) / 12)
    }

    public static func midi(frequency: Double) -> Double {
        69 + 12 * log2(frequency / 440)
    }

    public static func degreeLabel(midi: Int, key: KeyInfo) -> String {
        let tonic = pitchClass(note: key.tonic)
        let relative = floorMod(midi - tonic, 12)
        let intervals = scaleIntervals[key.scale] ?? scaleIntervals["major"]!
        var best = 0
        var bestDistance = Int.max
        for (index, value) in intervals.enumerated() {
            let rawDifference = relative - value
            let difference = rawDifference > 6 ? rawDifference - 12 : (rawDifference < -6 ? rawDifference + 12 : rawDifference)
            if abs(difference) < bestDistance {
                best = index
                bestDistance = abs(difference)
            }
        }
        let rawDifference = relative - intervals[best]
        let difference = rawDifference > 6 ? rawDifference - 12 : (rawDifference < -6 ? rawDifference + 12 : rawDifference)
        let prefix = difference == -2 ? "♭♭" : difference == -1 ? "♭" : difference == 1 ? "♯" : difference == 2 ? "♯♯" : ""
        return "\(prefix)\(best + 1)\u{0302}"
    }

    public static func relativeMajorDegreeLabel(midi: Int, rootMIDI: Int) -> String {
        let relative = floorMod(midi - rootMIDI, 12)
        let intervals = scaleIntervals["major"]!
        var best = 0
        var bestDistance = Int.max
        for (index, value) in intervals.enumerated() {
            let rawDifference = relative - value
            let difference = rawDifference > 6 ? rawDifference - 12 : (rawDifference < -6 ? rawDifference + 12 : rawDifference)
            if abs(difference) < bestDistance || (abs(difference) == bestDistance && index > best) {
                best = index
                bestDistance = abs(difference)
            }
        }
        let rawDifference = relative - intervals[best]
        let difference = rawDifference > 6 ? rawDifference - 12 : (rawDifference < -6 ? rawDifference + 12 : rawDifference)
        let prefix = difference == -2 ? "♭♭" : difference == -1 ? "♭" : difference == 1 ? "♯" : difference == 2 ? "♯♯" : ""
        return "\(prefix)\(best + 1)\u{0302}"
    }

    public static func spelledPitch(
        scaleDegree: String,
        relativeOctave: Int,
        key: KeyInfo,
        baseOctave: Int = 4
    ) -> SpelledPitch? {
        let normalized = scaleDegree.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "𝄪", with: "x")
            .replacingOccurrences(of: "𝄫", with: "bb")
            .replacingOccurrences(of: "♯", with: "#")
            .replacingOccurrences(of: "♭", with: "b")
            .replacingOccurrences(of: "♮", with: "")
        guard normalized.range(of: "^[#bx]*[1-9][0-9]*$", options: .regularExpression) != nil,
              let raw = Int(normalized.drop(while: { !$0.isNumber }))
        else { return nil }

        let degreeBase = raw - 1
        let degreeIndex = floorMod(degreeBase, 7)
        let baseLabel = noteLabel(degree: degreeIndex + 1, tonic: key.tonic, scale: key.scale)
        guard let basePitch = SpelledPitch.parse(noteName: baseLabel, octave: 0),
              let tonicPitch = SpelledPitch.parse(noteName: key.tonic, octave: baseOctave)
        else { return nil }
        let staffPosition = tonicPitch.staffPosition + degreeBase + relativeOctave * 7
        return SpelledPitch(
            letter: basePitch.letter,
            accidental: basePitch.accidental + modifierValue(normalized),
            octave: floorDiv(staffPosition, 7)
        )
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
