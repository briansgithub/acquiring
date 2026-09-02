import Foundation

public enum DiatonicLetter: Int, CaseIterable, Codable, Sendable {
    case c, d, e, f, g, a, b

    public var naturalSemitone: Int { [0, 2, 4, 5, 7, 9, 11][rawValue] }
    public var name: String { ["C", "D", "E", "F", "G", "A", "B"][rawValue] }

    public init?(character: Character) {
        guard let index = "CDEFGAB".firstIndex(of: Character(String(character).uppercased())) else { return nil }
        self = Self.allCases["CDEFGAB".distance(from: "CDEFGAB".startIndex, to: index)]
    }
}

public struct SpelledPitch: Equatable, Sendable {
    public let letter: DiatonicLetter
    public let accidental: Int
    public let octave: Int

    public init(letter: DiatonicLetter, accidental: Int, octave: Int) {
        self.letter = letter
        self.accidental = accidental
        self.octave = octave
    }

    public var staffPosition: Int { octave * 7 + letter.rawValue }
    public var chromaticPosition: Int { octave * 12 + letter.naturalSemitone + accidental }
    public var midiNote: Int { chromaticPosition + 12 }
    public var noteName: String { letter.name + (accidental > 0 ? String(repeating: "#", count: accidental) : String(repeating: "b", count: -accidental)) }
    public var displayName: String { noteName.replacingOccurrences(of: "bb", with: "♭♭").replacingOccurrences(of: "b", with: "♭").replacingOccurrences(of: "##", with: "♯♯").replacingOccurrences(of: "#", with: "♯") + String(octave) }

    public static func parse(noteName: String, octave: Int) -> SpelledPitch? {
        let normalized = noteName.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "𝄪", with: "x")
            .replacingOccurrences(of: "𝄫", with: "bb")
            .replacingOccurrences(of: "♯", with: "#")
            .replacingOccurrences(of: "♭", with: "b")
            .replacingOccurrences(of: "♮", with: "")
        guard let first = normalized.first, let letter = DiatonicLetter(character: first) else { return nil }
        var accidental = 0
        for character in normalized.dropFirst() {
            switch character {
            case "#": accidental += 1
            case "b": accidental -= 1
            case "x": accidental += 2
            default: return nil
            }
        }
        return SpelledPitch(letter: letter, accidental: accidental, octave: octave)
    }

    public static func fromMIDI(_ midi: Int) -> SpelledPitch {
        let octave = Int(floor(Double(midi) / 12)) - 1
        let pitchClass = ((midi % 12) + 12) % 12
        let spelling: (DiatonicLetter, Int) = switch pitchClass {
        case 0: (.c, 0); case 1: (.d, -1); case 2: (.d, 0); case 3: (.e, -1)
        case 4: (.e, 0); case 5: (.f, 0); case 6: (.g, -1); case 7: (.g, 0)
        case 8: (.a, -1); case 9: (.a, 0); case 10: (.b, -1); default: (.b, 0)
        }
        return SpelledPitch(letter: spelling.0, accidental: spelling.1, octave: octave)
    }

    public static func spellRelative(from: SpelledPitch, toMIDI: Int) -> SpelledPitch {
        let targetChromaticPosition = toMIDI - 12
        let difference = targetChromaticPosition - from.chromaticPosition
        let octaves = difference >= 0 ? difference / 12 : (difference - 11) / 12
        let semitones = ((difference % 12) + 12) % 12
        let diatonicDelta = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][semitones]
        let targetStaffPosition = from.staffPosition + octaves * 7 + diatonicDelta
        let letterIndex = ((targetStaffPosition % 7) + 7) % 7
        let targetOctave = Int(floor(Double(targetStaffPosition) / 7))
        let letter = DiatonicLetter.allCases[letterIndex]
        return SpelledPitch(
            letter: letter,
            accidental: targetChromaticPosition - (targetOctave * 12 + letter.naturalSemitone),
            octave: targetOctave
        )
    }
}

public enum IntervalDirection: String, Equatable, Sendable {
    case ascending
    case descending
    public var arrow: String { self == .ascending ? "↑" : "↓" }
}

public struct NamedInterval: Equatable, Sendable {
    public let number: Int
    public let quality: String
    public let direction: IntervalDirection
    public let directedSemitones: Int

    public var shorthand: String { "\(quality)\(number) \(quality == "P" && number == 1 ? "·" : direction.arrow)" }
    public var spokenName: String { "\(qualityName) \(ordinalName), \(direction.rawValue)" }

    private var qualityName: String {
        if quality == "P" { return "perfect" }
        if quality == "M" { return "major" }
        if quality == "m" { return "minor" }
        if quality.allSatisfy({ $0 == "A" }) { return Array(repeating: "augmented", count: quality.count).joined(separator: " ") }
        if quality.allSatisfy({ $0 == "d" }) { return Array(repeating: "diminished", count: quality.count).joined(separator: " ") }
        return quality
    }

    private var ordinalName: String {
        switch number {
        case 1: return "unison"
        case 2: return "second"
        case 3: return "third"
        case 4: return "fourth"
        case 5: return "fifth"
        case 6: return "sixth"
        case 7: return "seventh"
        case 8: return "octave"
        default:
            if 11...13 ~= number % 100 { return "\(number)th" }
            return "\(number)\([1: "st", 2: "nd", 3: "rd"][number % 10] ?? "th")"
        }
    }
}

public struct MeasuredInterval: Equatable, Sendable {
    public let namedInterval: NamedInterval
    public let direction: IntervalDirection?
    public let centsDeviation: Double
    public var shorthand: String { "\(namedInterval.quality)\(namedInterval.number) \(direction?.arrow ?? "·")" }
}

public enum IntervalAnalysis {
    public static func named(from: SpelledPitch, to: SpelledPitch) -> NamedInterval {
        let diatonicDelta = to.staffPosition - from.staffPosition
        let chromaticDelta = to.chromaticPosition - from.chromaticPosition
        let direction: IntervalDirection = diatonicDelta > 0 || (diatonicDelta == 0 && chromaticDelta >= 0) ? .ascending : .descending
        let number = abs(diatonicDelta) + 1
        let directedSemitones = direction == .ascending ? chromaticDelta : -chromaticDelta
        let simpleNumber = ((number - 1) % 7) + 1
        let baseline = [1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11][simpleNumber]! + (number - 1) / 7 * 12
        let deviation = directedSemitones - baseline
        let perfectFamily = [1, 4, 5].contains(simpleNumber)
        let quality: String
        if perfectFamily {
            quality = deviation == 0 ? "P" : deviation > 0 ? String(repeating: "A", count: deviation) : String(repeating: "d", count: -deviation)
        } else {
            quality = deviation == 0 ? "M" : deviation == -1 ? "m" : deviation > 0 ? String(repeating: "A", count: deviation) : String(repeating: "d", count: -deviation - 1)
        }
        return NamedInterval(number: number, quality: quality, direction: direction, directedSemitones: directedSemitones)
    }

    public static func measured(fromMIDI: Double, toMIDI: Double) -> MeasuredInterval {
        let roundedFrom = Int(fromMIDI.rounded())
        let roundedTo = Int(toMIDI.rounded())
        let from = SpelledPitch.fromMIDI(roundedFrom)
        let to = SpelledPitch.spellRelative(from: from, toMIDI: roundedTo)
        let direction: IntervalDirection? = toMIDI > fromMIDI ? .ascending : toMIDI < fromMIDI ? .descending : nil
        return MeasuredInterval(
            namedInterval: named(from: from, to: to),
            direction: direction,
            centsDeviation: ((toMIDI - fromMIDI) - Double(roundedTo - roundedFrom)) * 100
        )
    }
}
