import Foundation

// Source authority: Android 3c887223, MelodyFunction.kt. UI maps these semantic tones to colors.
public enum MelodyFunctionTone: String, Codable, Sendable {
    case neutral = "NEUTRAL", stable = "STABLE", leaning = "LEANING", moving = "MOVING", outside = "OUTSIDE"
    public var rgb: UInt32? {
        switch self {
        case .neutral: nil // Theme onSurfaceVariant
        case .stable: 0x4CAF50
        case .leaning: 0x4FC3F7
        case .moving: 0xFFB74D
        case .outside: 0xFF8A80
        }
    }
}

public struct MelodyFunctionChordTone: Equatable, Codable, Sendable {
    public let pitchClass: Int
    public let label: String
    public init(pitchClass: Int, label: String) { self.pitchClass = pitchClass; self.label = label }
}

public struct MelodyFunctionInput: Sendable {
    public var currentPitch: SpelledPitch?
    public var scaleDegreeLabel: String
    public var key: KeyInfo
    public var chordTones: [MelodyFunctionChordTone]?
    public var previousPitch: SpelledPitch?
    public var nextPitch: SpelledPitch?
    public var previousIsCurrentChordTone = false
    public var nextIsCurrentChordTone = false
    public var currentWasPreviousChordTone = false
    public var currentWillBeNextChordTone = false
    public var arrivedBeforeNextChord = false
    public var heldAcrossChordChange = false
    public var chordChangesDuringNote = 0

    public init(currentPitch: SpelledPitch?, scaleDegreeLabel: String, key: KeyInfo,
                chordTones: [MelodyFunctionChordTone]?) {
        self.currentPitch = currentPitch; self.scaleDegreeLabel = scaleDegreeLabel
        self.key = key; self.chordTones = chordTones
    }
}

public struct MelodyFunctionDescription: Equatable, Sendable {
    public let title: String
    public let detail: String
    public let tone: MelodyFunctionTone
    public init(title: String, detail: String, tone: MelodyFunctionTone) {
        self.title = title; self.detail = detail; self.tone = tone
    }
}

public enum MelodyFunction {
    private static func pc(_ pitch: SpelledPitch) -> Int { (pitch.chromaticPosition % 12 + 12) % 12 }
    private static func digits(_ label: String) -> String {
        // Kotlin Char.isDigit sees the digit separately from the combining degree hat.
        // Swift Character groups "5̂" into one grapheme, whose isNumber is false.
        String(String.UnicodeScalarView(label.unicodeScalars.filter { CharacterSet.decimalDigits.contains($0) }))
    }
    private static func degree(_ label: String) -> Int? { Int(digits(label)) }
    private static func scalePC(_ key: KeyInfo, _ degree: Int) -> Int? {
        MusicTheory.spelledPitch(scaleDegree: String(degree), relativeOctave: 0, key: key).map(pc)
    }
    private static func inKey(_ pitch: Int, _ key: KeyInfo) -> Bool { (1...7).contains { scalePC(key, $0) == pitch } }
    private static func movement(_ from: SpelledPitch, _ to: SpelledPitch) -> (direction: Int, step: Bool, leap: Bool) {
        let distance = abs(to.staffPosition - from.staffPosition)
        return ((to.chromaticPosition - from.chromaticPosition).signum(), distance == 1, distance >= 2)
    }
    public static func describe(_ input: MelodyFunctionInput) -> MelodyFunctionDescription {
        guard let current = input.currentPitch else {
            return .init(title: "Rest", detail: "No melody note right now.", tone: .neutral)
        }
        let currentPC = pc(current)
        guard let tones = input.chordTones else {
            let number = digits(input.scaleDegreeLabel)
            let label = number.isEmpty ? input.scaleDegreeLabel : number
            let d = degree(label) ?? 0
            return .init(title: "Scale degree \(label)", detail: "No chord under this note. It is scale degree \(label) in the key.",
                         tone: [1, 3, 5].contains(d) ? .stable : [2, 4, 6, 7].contains(d) ? .moving : .neutral)
        }
        if let member = tones.first(where: { $0.pitchClass == currentPC }) {
            let d = degree(member.label) ?? 0
            let names = [1: "root", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "octave", 9: "ninth", 10: "tenth", 11: "eleventh", 13: "thirteenth"]
            let tonic = SpelledPitch.parse(noteName: input.key.tonic, octave: 4).map(pc)
            let next = input.nextPitch.map(pc)
            var advice = ""
            if let tonic, (tonic - currentPC + 12) % 12 == 1 {
                advice = " This is also the leading tone of the key. Let it rise a half step to 1." + (next == tonic ? " The next note does." : "")
            } else if degree(input.scaleDegreeLabel) == 4 && inKey(currentPC, input.key) {
                advice = " This is 4 in the key. It wants to fall to 3." + (next == scalePC(input.key, 3) ? " The next note does." : "")
            } else if [1, 3, 5].contains(degree(input.scaleDegreeLabel) ?? 0) && inKey(currentPC, input.key) {
                advice = " It is home in the chord and in the key."
            }
            let action = [1, 3, 5].contains(d) ? "Sit on this." : d == 4 ? "Lean on this. It belongs to the chord and wants to fall to the third." : [7, 9, 11, 13].contains(d) ? "Lean on this. It belongs to the chord and wants to move." : "This note belongs to the chord."
            let tone: MelodyFunctionTone = advice.contains("leading tone") || advice.contains("wants to fall to 3") ? .moving : [1, 3, 5].contains(d) ? .stable : .leaning
            return .init(title: "Chord \(names[d] ?? "tone")", detail: action + advice, tone: tone)
        }
        let chromatic = !inKey(currentPC, input.key)
        func role(_ title: String, _ detail: String, _ tone: MelodyFunctionTone = .moving) -> MelodyFunctionDescription {
            .init(title: chromatic ? "Chromatic " + title.prefix(1).lowercased() + title.dropFirst() : title, detail: detail, tone: tone)
        }
        let before = input.previousPitch.map { movement($0, current) }
        let after = input.nextPitch.map { movement(current, $0) }
        if input.currentWillBeNextChordTone && input.arrivedBeforeNextChord {
            return role("Anticipation", "You are early. This note belongs to the next chord.")
        }
        if input.currentWasPreviousChordTone && input.heldAcrossChordChange {
            if let after, after.step {
                return after.direction < 0 ? role("Suspension", "This note was in the previous chord. Let it fall by step.") : role("Retardation", "This note was in the previous chord. Let it rise by step.")
            }
            return role("Held over", "The chord changed under a note you are still holding.")
        }
        if let previous = input.previousPitch, let next = input.nextPitch,
           pc(previous) == pc(next), let before, before.step, after?.step == true {
            return role(before.direction > 0 ? "Upper neighbor" : "Lower neighbor", "Step away and come back. Do not settle here.")
        }
        if let before, let after, before.step && after.step && before.direction == after.direction,
           input.previousIsCurrentChordTone && input.nextIsCurrentChordTone {
            return role("Passing tone", "Keep moving \(after.direction > 0 ? "upward" : "downward"). This note connects the chord tones on either side.")
        }
        if let before, let after, before.leap && after.step && before.direction != after.direction && input.nextIsCurrentChordTone {
            return role("Appoggiatura", "You leapt onto a tension. Step off it onto the chord tone.")
        }
        if let before, let after, before.step && after.leap && before.direction != after.direction && input.previousIsCurrentChordTone {
            return role("Escape tone", "A short step off the chord, then a leap onward.")
        }
        if let next = input.nextPitch, next.chromaticPosition - current.chromaticPosition == 1 && input.nextIsCurrentChordTone {
            return role("Leading tone", "A half step under the next note. Let it rise.")
        }
        if input.chordChangesDuringNote > 1 { return role("Pedal tone", "The melody holds still while the chords move.") }
        return role("Color tone", "This note is outside the chord. Hear it against the root, then follow the melody.", .outside)
    }

    public static func spokenCue(_ description: MelodyFunctionDescription) -> String? {
        guard description.title != "Rest" else { return nil }
        let chromatic = description.title.hasPrefix("Chromatic ")
        let role = (chromatic ? String(description.title.dropFirst(10)) : description.title).lowercased()
        let words: String?
        switch role {
        case "passing tone": words = chromatic ? "chromatic passing" : "passing"
        case "color tone": words = chromatic ? "chromatic color" : "color"
        case "escape tone": words = "escape"
        case "leading tone": words = "leading"
        case "pedal tone": words = "pedal"
        case "chord octave": words = "root"
        case "chord tenth": words = "third"
        default:
            if role.hasPrefix("chord ") { words = String(role.dropFirst(6)) }
            else if role.hasPrefix("scale degree ") {
                words = ["1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven"][String(role.dropFirst(13))]
            } else { words = role }
        }
        guard let words, !words.isEmpty, words.split(separator: " ").count <= 2 else { return nil }
        return words
    }
    public static func isSpokenChordTone(_ cue: String) -> Bool {
        ["root", "second", "third", "fourth", "fifth", "sixth", "seventh", "ninth", "eleventh", "thirteenth"].contains(cue)
    }
    public static func cardText(_ description: MelodyFunctionDescription) -> String {
        guard let words = spokenCue(description) else { return "Rest" }
        return words.prefix(1).uppercased() + words.dropFirst()
    }
}
