import Foundation

/// Raw values match persisted Android cue names. UI grouping belongs to B06.
public enum PlaybackCue: String, Codable, CaseIterable, Sendable {
    case off = "OFF", rootPulses = "ROOT_PULSES", harmonicDistance = "HARMONIC_DISTANCE"
    case spokenNumber = "SPOKEN_NUMBER", sungNumberWithDetails = "SUNG_NUMBER_WITH_DETAILS"
    case melodyFunction = "MELODY_FUNCTION", melodyChordTone = "MELODY_CHORD_TONE"

    public var pulsesRoots: Bool { self == .rootPulses || self == .harmonicDistance }
    public var speaksRoot: Bool { self == .spokenNumber || self == .sungNumberWithDetails }
    public var speaksMelody: Bool { self == .melodyFunction || self == .melodyChordTone }
}

/// Context is prepared from source harmony, independently of sounding transposition.
/// The major fields must use the opening reference of the whole song when available.
public struct PlaybackCueContext: Equatable, Sendable {
    public var rootDegree: Int?
    public var alteration: Int
    public var majorDegree: Int?
    public var majorAlteration: Int
    public var fifthsFromTonic: Int
    public var fifthsFromMajorTonic: Int
    public var rootMidi: Int?
    public var fullChordRootMidi: Int?
    public var suffix: String?
    public var melodyWords: String?
    public var melodyMidi: Int?
    public var keyScale: String?
    public var keyTonicMidi: Int?

    public init(rootDegree: Int? = nil, alteration: Int = 0, majorDegree: Int? = nil,
                majorAlteration: Int = 0, fifthsFromTonic: Int = 0, fifthsFromMajorTonic: Int = 0,
                rootMidi: Int? = nil, fullChordRootMidi: Int? = nil, suffix: String? = nil,
                melodyWords: String? = nil, melodyMidi: Int? = nil, keyScale: String? = nil,
                keyTonicMidi: Int? = nil) {
        self.rootDegree = rootDegree; self.alteration = alteration
        self.majorDegree = majorDegree; self.majorAlteration = majorAlteration
        self.fifthsFromTonic = fifthsFromTonic; self.fifthsFromMajorTonic = fifthsFromMajorTonic
        self.rootMidi = rootMidi; self.fullChordRootMidi = fullChordRootMidi; self.suffix = suffix
        self.melodyWords = melodyWords; self.melodyMidi = melodyMidi
        self.keyScale = keyScale; self.keyTonicMidi = keyTonicMidi
    }

    /// Zero means a held root. Root Pulses counts the source degree, as Android does.
    public func pulseCount(cue: PlaybackCue, majorLocked: Bool) -> Int {
        switch cue {
        case .rootPulses:
            let degree = rootDegree ?? 0
            return (2...7).contains(degree) ? degree : 0
        case .harmonicDistance:
            let distance = majorLocked ? fifthsFromMajorTonic : fifthsFromTonic
            return distance > 0 ? min(distance, 6) + 1 : 0
        default: return 0
        }
    }
}

public enum PlaybackCueMath {
    public static let voiceMaximumGain = 1.4
    public static let defaultVoiceVolume = 0.5

    public static func softLimit(_ sample: Double) -> Double {
        let magnitude = abs(sample)
        guard magnitude > 0.85 else { return sample }
        let limited = 0.85 + 0.15 * tanh((magnitude - 0.85) / 0.15)
        return sample < 0 ? -limited : limited
    }

    public static func modeWindow(hostStart: Double, hostEnd: Double, nextStart: Double,
                                  sampleCount: Int, samplesPerBeat: Double) -> ClosedRange<Double>? {
        guard sampleCount > 0, samplesPerBeat > 0 else { return nil }
        let end = min(hostEnd, nextStart)
        guard end > hostStart else { return nil }
        return max(hostStart, end - Double(sampleCount) / samplesPerBeat)...end
    }

    public static func keyTonicMidi(_ midi: Int) -> Int { 48 + ((midi % 12) + 12) % 12 }
    public static func samplePitch(_ midi: Int) -> Int {
        if midi < 36 { return 36 + ((midi - 36) % 12 + 12) % 12 }
        if midi > 59 { return 59 - ((59 - midi) % 12 + 12) % 12 }
        return midi
    }
}
