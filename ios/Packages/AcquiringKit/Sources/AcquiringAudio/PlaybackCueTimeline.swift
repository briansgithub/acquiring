import AcquiringCore
import Foundation

/// Metadata projection only; source roles and sounding MIDI have separate paths.
public enum PlaybackCueTimeline {
    public static func annotate(_ timeline: QuizTimeline, section: ExtractedSection,
                                songOpeningKey: KeyInfo? = nil) -> QuizTimeline {
        let major = RelativeIonianContext.key(for: songOpeningKey ?? section.key(at: 1))
        let bps = timeline.nativeBeatsPerSecond
        let source = section.melodyNotes
        let written = source.map { note -> Int? in
            guard !note.isRest, note.duration > 0 else { return nil }
            return MusicTheory.midiNote(scaleDegree: note.sd, octave: note.octave, key: section.key(at: max(note.beat, 1)))
        }
        let sounding = SingingMelodyRegister.singing(written)
        let ordered = timeline.events.enumerated().sorted {
            $0.element.onsetSeconds == $1.element.onsetSeconds ? $0.offset < $1.offset : $0.element.onsetSeconds < $1.element.onsetSeconds
        }.map(\.element)
        let projections = ordered.map { event -> MelodyCueEvent in
            let beat = event.onsetSeconds * bps + 1
            let index = source.firstIndex { abs(max($0.beat, 1) - beat) < 1e-6 && !$0.isRest }
            let midi = index.flatMap { sounding[$0] }
            return MelodyCueEvent(layer: event.channel == .melody ? .melody : .chord, startBeat: beat,
                                  fullMidiNotes: event.channel == .melody ? midi.map { [$0] } ?? [] : [])
        }
        let annotations = MelodyCueAnnotation.annotate(section: section, melody: source, events: projections)
        let events = ordered.enumerated().map { index, event -> QuizEvent in
            let beat = event.onsetSeconds * bps + 1
            let key = section.key(at: beat)
            var context = PlaybackCueContext(melodyWords: annotations[index].spokenMelodyCue,
                                             melodyMidi: annotations[index].melodyCueMidi)
            if event.channel == .chord,
               let chord = section.chords.first(where: { abs(max($0["beat"]?.doubleValue ?? 1, 1) - beat) < 1e-6 }) {
                let root = ChordInterpreter.resolvedRoot(for: chord, key: key)
                let interpreted = ChordInterpreter.interpret(chord, key: key)
                let degree = root.flatMap { RelativeIonianContext.degree(for: $0.pitch, in: key) }
                let majorDegree = root.flatMap { RelativeIonianContext.degree(for: $0.pitch, in: major) }
                context.rootDegree = degree?.degree; context.alteration = degree?.alteration ?? 0
                context.majorDegree = majorDegree?.degree; context.majorAlteration = majorDegree?.alteration ?? 0
                context.rootMidi = root?.simpleModePitch.midiNote
                context.fullChordRootMidi = interpreted.toneLabels.firstIndex { $0.filter(\.isNumber) == "1" }.flatMap {
                    interpreted.midi.indices.contains($0) ? interpreted.midi[$0] : nil
                } ?? interpreted.rootMidi
                context.suffix = suffix(chord, interpreted: interpreted)
                context.keyScale = key.scale
                context.keyTonicMidi = MusicTheory.midiNote(scaleDegree: "1", octave: 0, key: key)
                if let midi = context.rootMidi {
                    context.fifthsFromTonic = fifths(midi - MusicTheory.pitchClass(note: key.tonic))
                    context.fifthsFromMajorTonic = fifths(midi - MusicTheory.pitchClass(note: major.tonic))
                }
            }
            let frequencies = event.channel == .melody
                ? projections[index].fullMidiNotes.map { MusicTheory.frequency(midi: Double($0)) } : event.frequenciesHz
            return QuizEvent(onsetSeconds: event.onsetSeconds, durationSeconds: event.durationSeconds,
                             frequenciesHz: frequencies, waveform: event.waveform, gain: event.gain,
                             channel: event.channel, rootFrequencyHz: event.rootFrequencyHz, cueContext: context)
        }
        return QuizTimeline(durationSeconds: timeline.durationSeconds, events: events, nativeBeatsPerSecond: bps)
    }

    private static func fifths(_ semitones: Int) -> Int {
        let distance = ((semitones * 7) % 12 + 12) % 12
        return min(distance, 12 - distance)
    }

    /// Resource stems preserve the native full spoken suffix names.
    static func suffix(_ chord: [String: JSONValue], interpreted: ChordInterpretation) -> String? {
        let symbol = String(interpreted.roman.split(separator: "/", omittingEmptySubsequences: false).first ?? "")
        let base = symbol.range(of: "^[♭♯]*([IViv]+)", options: .regularExpression)
        let tail = base.map { String(symbol[$0.upperBound...]).replacingOccurrences(of: "\\([^)]*\\)", with: "", options: .regularExpression) } ?? ""
        let letter = chord["_letterQuality"]?.stringValue
        let minor = base.map { symbol[$0].contains(where: { $0.isLowercase }) } ?? (letter == "minor")
        let omits = chord["omits"]?.arrayValue?.compactMap(\.intValue) ?? []
        let seventh = chord["type"]?.intValue == 7 && !omits.contains(7)
        var suspensions = chord["suspensions"]?.arrayValue?.compactMap(\.intValue).filter { $0 == 2 || $0 == 4 } ?? []
        if suspensions.isEmpty {
            if tail.contains("sus2") { suspensions.append(2) }
            if tail.contains("sus4") { suspensions.append(4) }
        }
        if !suspensions.isEmpty {
            let ending = suspensions.contains(2) && suspensions.contains(4) ? "two_four" : suspensions.contains(2) ? "two" : "four"
            return "root_suffix_" + (seventh ? "seventh_sus_" : "sus_") + ending
        }
        let seventhIndex = interpreted.toneLabels.firstIndex { $0.contains("7") }
        let interval = seventhIndex.flatMap { i -> Int? in
            guard let root = interpreted.rootMidi, interpreted.midi.indices.contains(i) else { return nil }
            return ((interpreted.midi[i] - root) % 12 + 12) % 12
        }
        let majorSeventh = interval.map { $0 == 11 } ?? tail.contains("△")
        let stem: String?
        if tail.contains("ø") { stem = seventh ? "half_dim" : "dim" }
        else if tail.contains("°") || letter == "diminished" { stem = !seventh ? "dim" : interval == 10 ? "half_dim" : "dim_sev" }
        else if tail.contains("+") || letter == "augmented" { stem = "aug" }
        else if seventh && majorSeventh && minor { stem = "min_sev_maj" }
        else if seventh && majorSeventh { stem = "sev_maj" }
        else if seventh && minor { stem = "sev_min" }
        else if seventh { stem = "seven" }
        else { stem = minor ? "min" : nil }
        return stem.map { "root_suffix_" + $0 }
    }
}
