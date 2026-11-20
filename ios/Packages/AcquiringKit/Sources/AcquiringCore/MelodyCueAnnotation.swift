import Foundation

/// A pure projection of timeline events. Callers retain their audio payloads and apply outputs by index.
public struct MelodyCueEvent: Equatable, Codable, Sendable {
    public enum Layer: String, Codable, Sendable { case melody = "MELODY", chord = "CHORD", other = "OTHER" }
    public var layer: Layer
    public var startBeat: Double
    public var fullMidiNotes: [Int]
    public var spokenMelodyCue: String?
    public var melodyCueMidi: Int?
    public init(layer: Layer, startBeat: Double, fullMidiNotes: [Int], spokenMelodyCue: String? = nil, melodyCueMidi: Int? = nil) {
        self.layer = layer; self.startBeat = startBeat; self.fullMidiNotes = fullMidiNotes
        self.spokenMelodyCue = spokenMelodyCue; self.melodyCueMidi = melodyCueMidi
    }
}

public enum MelodyCueAnnotation {
    private static func beat(_ value: Double) -> Double { value == 0 ? 1 : value }
    private static func pc(_ pitch: SpelledPitch) -> Int { (pitch.chromaticPosition % 12 + 12) % 12 }
    private static func orderedChords(_ section: ExtractedSection) -> [Int] {
        section.chords.indices.sorted {
            let a = beat(section.chords[$0]["beat"]?.doubleValue ?? 1)
            let b = beat(section.chords[$1]["beat"]?.doubleValue ?? 1)
            return a == b ? $0 < $1 : a < b
        }
    }
    public static func activeChordIndex(section: ExtractedSection, at time: Double) -> Int? {
        orderedChords(section).reversed().first { index in
            let chord = section.chords[index]
            let start = beat(chord["beat"]?.doubleValue ?? 1)
            return start <= time && time < start + (chord["duration"]?.doubleValue ?? 1)
        }
    }
    /// Source indices distinguish duplicate value-type notes/chords. Classification always uses source onset keys.
    public static func input(section: ExtractedSection, melody: [MelodyNote], noteIndex: Int?, chordIndex: Int?) -> MelodyFunctionInput {
        let note = noteIndex.flatMap { melody.indices.contains($0) ? melody[$0] : nil }
        let key = section.key(at: note.map { beat($0.beat) } ?? 1)
        func pitch(_ note: MelodyNote?) -> SpelledPitch? {
            guard let note, !note.isRest, note.duration > 0 else { return nil }
            return MusicTheory.spelledPitch(scaleDegree: note.sd, relativeOctave: note.octave, key: section.key(at: beat(note.beat)))
        }
        guard let note, let current = pitch(note) else {
            return .init(currentPitch: nil, scaleDegreeLabel: "", key: key, chordTones: [])
        }
        let notes = melody.indices.sorted {
            let a = beat(melody[$0].beat), b = beat(melody[$1].beat)
            return a == b ? $0 < $1 : a < b
        }
        let position = notes.firstIndex { $0 == noteIndex }!
        func neighbor(_ offset: Int) -> SpelledPitch? {
            let i = position + offset
            return notes.indices.contains(i) ? pitch(melody[notes[i]]) : nil
        }
        let chords = orderedChords(section)
        let chordPosition = chords.firstIndex { $0 == chordIndex }
        func event(_ offset: Int) -> [String: JSONValue]? {
            guard let chordPosition, chords.indices.contains(chordPosition + offset) else { return nil }
            return section.chords[chords[chordPosition + offset]]
        }
        func tones(_ chord: [String: JSONValue]?) -> [MelodyFunctionChordTone]? {
            guard let chord, chord["isRest"]?.boolValue != true, chord["rest"]?.boolValue != true else { return nil }
            let result = ChordInterpreter.interpret(chord, key: section.key(at: beat(chord["beat"]?.doubleValue ?? 1)))
            return result.midi.enumerated().map { index, midi in
                .init(pitchClass: (midi % 12 + 12) % 12, label: result.toneLabels.indices.contains(index) ? result.toneLabels[index] : "")
            }
        }
        let currentTones = tones(event(0))
        func has(_ tones: [MelodyFunctionChordTone]?, _ pitch: SpelledPitch?) -> Bool {
            guard let pitch else { return false }
            return tones?.contains { $0.pitchClass == pc(pitch) } == true
        }
        var result = MelodyFunctionInput(currentPitch: current, scaleDegreeLabel: MusicTheory.degreeLabel(for: current, key: key), key: key, chordTones: currentTones)
        result.previousPitch = neighbor(-1); result.nextPitch = neighbor(1)
        result.previousIsCurrentChordTone = has(currentTones, result.previousPitch)
        result.nextIsCurrentChordTone = has(currentTones, result.nextPitch)
        result.currentWasPreviousChordTone = has(tones(event(-1)), current)
        result.currentWillBeNextChordTone = has(tones(event(1)), current)
        let start = beat(note.beat)
        result.arrivedBeforeNextChord = event(1).map { start < beat($0["beat"]?.doubleValue ?? 1) } ?? false
        result.heldAcrossChordChange = event(0).map { start < beat($0["beat"]?.doubleValue ?? 1) } ?? false
        result.chordChangesDuringNote = section.chords.filter {
            let onset = beat($0["beat"]?.doubleValue ?? 1)
            return onset > start && onset < start + note.duration
        }.count
        return result
    }
    /// Supply chronological events after playback key transforms. MIDI is sounding; role labels remain source-based.
    public static func annotate(section: ExtractedSection, melody: [MelodyNote], events: [MelodyCueEvent]) -> [MelodyCueEvent] {
        let sounding = melody.map { note -> Int? in
            guard !note.isRest, note.duration > 0 else { return nil }
            return events.first { $0.layer == .melody && abs($0.startBeat - max(1, note.beat)) < 1e-6 }?.fullMidiNotes.first
        }
        let spoken = SingingMelodyRegister.spoken(sounding)
        var result = events
        for index in melody.indices {
            let note = melody[index]
            guard !note.isRest, note.duration > 0 else { continue }
            let start = max(1, note.beat), end = start + note.duration
            func cue(_ time: Double) -> String? {
                MelodyFunction.spokenCue(MelodyFunction.describe(input(section: section, melody: melody, noteIndex: index, chordIndex: activeChordIndex(section: section, at: time))))
            }
            var last = cue(start)
            for i in result.indices {
                let event = result[i]
                if event.layer == .melody && abs(event.startBeat - start) < 1e-6 {
                    result[i].spokenMelodyCue = last
                    result[i].melodyCueMidi = spoken[index] ?? sounding[index]
                } else if event.layer == .chord && event.startBeat > start + 1e-6 && event.startBeat < end,
                          let next = cue(event.startBeat), next != last {
                    result[i].spokenMelodyCue = next
                    result[i].melodyCueMidi = spoken[index] ?? sounding[index]
                    last = next
                }
            }
        }
        return result
    }
}
