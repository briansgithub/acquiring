import Foundation

public struct RelativeIonianDegree: Equatable, Sendable {
    public let degree: Int
    public let alteration: Int

    public var accidentalPrefix: String {
        if alteration > 0 { return String(repeating: "♯", count: alteration) }
        if alteration < 0 { return String(repeating: "♭", count: -alteration) }
        return ""
    }

    public var label: String { "\(accidentalPrefix)\(degree)\u{0302}" }
}

public enum RelativeIonianContext {
    public static func tonicDegree(for scale: String) -> Int {
        switch scale {
        case "major", "ionian": 1
        case "dorian": 7
        case "phrygian", "phrygianDominant": 6
        case "lydian": 5
        case "mixolydian": 4
        case "minor", "aeolian", "harmonicMinor": 3
        case "locrian": 2
        default: 1
        }
    }

    public static func canonicalScaleName(_ scale: String) -> String {
        switch scale {
        case "ionian": "major"
        case "aeolian": "minor"
        default: scale
        }
    }

    public static func key(for sourceKey: KeyInfo) -> KeyInfo {
        KeyInfo(
            tonic: MusicTheory.noteLabel(
                degree: tonicDegree(for: sourceKey.scale),
                tonic: sourceKey.tonic,
                scale: canonicalScaleName(sourceKey.scale)
            ),
            scale: "major"
        )
    }

    public static func degree(for pitch: SpelledPitch, in key: KeyInfo) -> RelativeIonianDegree? {
        guard let tonic = SpelledPitch.parse(noteName: key.tonic, octave: pitch.octave) else { return nil }
        let degree = floorMod(pitch.letter.rawValue - tonic.letter.rawValue, 7) + 1
        guard let expected = MusicTheory.spelledPitch(
            scaleDegree: String(degree),
            relativeOctave: 0,
            key: KeyInfo(tonic: key.tonic, scale: canonicalScaleName(key.scale)),
            baseOctave: pitch.octave
        ) else { return nil }
        return RelativeIonianDegree(degree: degree, alteration: pitch.accidental - expected.accidental)
    }

    public static func degreeLabel(for pitch: SpelledPitch, contextKey: KeyInfo) -> String {
        degree(for: pitch, in: KeyInfo(tonic: contextKey.tonic, scale: "major"))?.label ?? ""
    }

    public static func degreeLabel(for pitch: SpelledPitch, sourceKey: KeyInfo) -> String {
        degreeLabel(for: pitch, contextKey: key(for: sourceKey))
    }

    public static func degreeLabel(forMIDI midi: Int, contextKey: KeyInfo) -> String {
        let displayKey = KeyInfo(tonic: contextKey.tonic, scale: "major")
        let tonicMIDI = MusicTheory.midiNote(scaleDegree: "1", octave: 0, key: displayKey)
        return MusicTheory.relativeMajorDegreeLabel(midi: midi, rootMIDI: tonicMIDI)
    }

    public static func degreeLabel(forMIDI midi: Int, rootPitch: SpelledPitch, contextKey: KeyInfo) -> String {
        degreeLabel(for: .spellRelative(from: rootPitch, toMIDI: midi), contextKey: contextKey)
    }

    public static func previewMIDI(for pitch: SpelledPitch, contextKey: KeyInfo, referenceOctave: Int = 3) -> Int? {
        guard let degree = degree(for: pitch, in: KeyInfo(tonic: contextKey.tonic, scale: "major")),
              let resolved = MusicTheory.spelledPitch(
                scaleDegree: degree.accidentalPrefix + String(degree.degree),
                relativeOctave: 0,
                key: KeyInfo(tonic: contextKey.tonic, scale: "major"),
                baseOctave: referenceOctave
              ) else { return nil }
        return resolved.midiNote
    }

    public static func previewMIDI(forMIDI midi: Int, contextKey: KeyInfo, referenceOctave: Int = 3) -> Int? {
        let label = degreeLabel(forMIDI: midi, contextKey: contextKey).replacingOccurrences(of: "\u{0302}", with: "")
        return MusicTheory.spelledPitch(
            scaleDegree: label,
            relativeOctave: 0,
            key: KeyInfo(tonic: contextKey.tonic, scale: "major"),
            baseOctave: referenceOctave
        )?.midiNote
    }

    public static func staffDegree(
        scaleDegree: String,
        relativeOctave: Int,
        sourceKey: KeyInfo,
        contextKey: KeyInfo? = nil
    ) -> Int? {
        let source = KeyInfo(tonic: sourceKey.tonic, scale: canonicalScaleName(sourceKey.scale))
        guard let pitch = MusicTheory.spelledPitch(scaleDegree: scaleDegree, relativeOctave: relativeOctave, key: source),
              let displayTonic = SpelledPitch.parse(noteName: (contextKey ?? key(for: sourceKey)).tonic, octave: 4)
        else { return nil }
        return pitch.staffPosition - displayTonic.staffPosition + 1
    }

    private static func floorMod(_ value: Int, _ divisor: Int) -> Int {
        let remainder = value % divisor
        return remainder >= 0 ? remainder : remainder + divisor
    }
}
