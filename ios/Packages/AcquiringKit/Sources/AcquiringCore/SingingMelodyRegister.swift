import Foundation

/// Android 3c887223: played melody C2...B4; spoken melody prefers C3...B3.
public enum SingingMelodyRegister {
    public static let lowMIDI = 36
    public static let highMIDI = 71
    private static func candidates(_ midi: Int) -> [Int] {
        (lowMIDI...highMIDI).filter { $0 % 12 == (midi % 12 + 12) % 12 }
    }
    private static func nearest(_ values: [Int], _ target: Int) -> Int {
        // Ascending candidates and strict improvement preserve Kotlin's first minimum tie rule.
        values.dropFirst().reduce(values[0]) { abs($1 - target) < abs($0 - target) ? $1 : $0 }
    }
    public static func placeSinging(_ written: Int, previousWritten: Int?, previousSung: Int?) -> Int {
        let pool = candidates(written)
        guard let previousWritten, let previousSung else { return nearest(pool, written) }
        let delta = written - previousWritten
        let ideal = min(highMIDI, max(lowMIDI, previousSung + delta))
        let directed = pool.filter { delta > 0 ? $0 > previousSung : delta < 0 ? $0 < previousSung : $0 == previousSung }
        return nearest(directed.isEmpty ? pool : directed, ideal)
    }
    public static func placeSpoken(_ sounding: Int, previousSounding: Int?, previousSpoken: Int?) -> Int {
        let pool = candidates(sounding)
        let preferred = pool.filter { (48...59).contains($0) }
        guard let previousSounding, let previousSpoken else {
            return nearest(preferred.isEmpty ? pool : preferred, sounding >= 60 ? sounding - 12 : sounding)
        }
        if sounding == previousSounding { return previousSpoken }
        let rising = sounding > previousSounding
        var directed = preferred.filter { rising ? $0 > previousSpoken : $0 < previousSpoken }
        if directed.isEmpty { directed = pool.filter { rising ? $0 > previousSpoken : $0 < previousSpoken } }
        if directed.isEmpty && rising && previousSpoken < 72 && sounding % 12 == 0 { directed = [72] }
        return nearest(directed.isEmpty ? pool : directed, previousSpoken + sounding - previousSounding)
    }
    private static func fold(_ values: [Int?], place: (Int, Int?, Int?) -> Int) -> [Int?] {
        var previous: Int?, placed: Int?
        return values.map { value in
            guard let value, value > 0 else { return nil }
            let result = place(value, previous, placed)
            previous = value; placed = result
            return result
        }
    }
    public static func singing(_ written: [Int?]) -> [Int?] { fold(written, place: placeSinging) }
    public static func spoken(_ sounding: [Int?]) -> [Int?] { fold(sounding, place: placeSpoken) }
    /// The caller chooses the effective key, including Lock/transpose, before folding.
    public static func pitches(_ melody: [MelodyNote], keyAt: (MelodyNote) -> KeyInfo) -> [SpelledPitch?] {
        let written = melody.map { note in
            note.isRest || note.duration <= 0 ? nil : MusicTheory.spelledPitch(scaleDegree: note.sd, relativeOctave: note.octave, key: keyAt(note))
        }
        return zip(written, singing(written.map { $0?.midiNote })).map { pitch, midi in
            guard let pitch, let midi else { return nil }
            return SpelledPitch(letter: pitch.letter, accidental: pitch.accidental, octave: pitch.octave + (midi - pitch.midiNote) / 12)
        }
    }
}
