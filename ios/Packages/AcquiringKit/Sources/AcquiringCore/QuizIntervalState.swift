import Foundation

public struct ChordRootIntervalState: Equatable, Sendable {
    public let previous: ResolvedChordRoot?
    public let current: ResolvedChordRoot
    public let previousIntervalPitch: SpelledPitch?
    public let currentIntervalPitch: SpelledPitch
    public let interval: NamedInterval?
    public let previousDegreeLabel: String?
    public let currentDegreeLabel: String
}

public struct MelodyIntervalState: Equatable, Sendable {
    public let previous: SpelledPitch
    public let current: SpelledPitch
    public let interval: NamedInterval
    public let previousDegreeLabel: String
    public let currentDegreeLabel: String

    public var accessibilityLabel: String {
        "Play melody interval \(previous.displayName) to \(current.displayName), \(interval.spokenName)"
    }
}

public enum MelodyPitchCardRole: Sendable {
    case previous
    case current
}

public enum MelodyPitchCardVerticalPosition: Sendable {
    case top
    case bottom
}

public enum MelodyPitchCardDisplayMode: Sendable {
    case hidden
    case single
    case interval
}

public struct MelodyPitchCard: Equatable, Sendable {
    public let role: MelodyPitchCardRole
    public let pitch: SpelledPitch
    public let scaleDegreeLabel: String
    public let verticalPosition: MelodyPitchCardVerticalPosition
}

public enum QuizIntervals {
    public static func melodyPitchCards(
        for state: MelodyIntervalState,
        previousLabel: String? = nil,
        currentLabel: String? = nil
    ) -> [MelodyPitchCard] {
        let ascending = state.interval.direction == .ascending
        return [
            MelodyPitchCard(
                role: .previous,
                pitch: state.previous,
                scaleDegreeLabel: previousLabel ?? state.previousDegreeLabel,
                verticalPosition: ascending ? .bottom : .top
            ),
            MelodyPitchCard(
                role: .current,
                pitch: state.current,
                scaleDegreeLabel: currentLabel ?? state.currentDegreeLabel,
                verticalPosition: ascending ? .top : .bottom
            )
        ]
    }

    public static func melodyPitchCardDisplayMode(
        currentPitch: SpelledPitch?,
        intervalState: MelodyIntervalState?
    ) -> MelodyPitchCardDisplayMode {
        guard currentPitch != nil else { return .hidden }
        guard let intervalState, intervalState.previous != intervalState.current else { return .single }
        return .interval
    }

    public static func resolveChordRootState(
        section: ExtractedSection,
        currentBeat: Double
    ) -> ChordRootIntervalState? {
        let events = timedChords(section)
        guard let activeIndex = events.lastIndex(where: {
            currentBeat >= $0.onset && currentBeat < $0.onset + $0.duration
        }) else { return nil }
        let active = events[activeIndex]
        guard active.duration > 0, !isRest(active.chord),
              let currentRoot = ChordInterpreter.resolvedRoot(
                for: active.chord,
                key: section.key(at: active.onset)
              ) else { return nil }

        let previousRoot = events[..<activeIndex].reversed().lazy.compactMap { event -> ResolvedChordRoot? in
            guard event.onset < active.onset, event.duration > 0, !isRest(event.chord) else { return nil }
            return ChordInterpreter.resolvedRoot(for: event.chord, key: section.key(at: event.onset))
        }.first

        return ChordRootIntervalState(
            previous: previousRoot,
            current: currentRoot,
            previousIntervalPitch: previousRoot?.simpleModePitch,
            currentIntervalPitch: currentRoot.simpleModePitch,
            interval: previousRoot.map { IntervalAnalysis.named(from: $0.simpleModePitch, to: currentRoot.simpleModePitch) },
            previousDegreeLabel: previousRoot.map { MusicTheory.degreeLabel(for: $0.pitch, key: $0.sourceKey) },
            currentDegreeLabel: MusicTheory.degreeLabel(for: currentRoot.pitch, key: currentRoot.sourceKey)
        )
    }

    public static func resolveMelodyState(
        melody: [MelodyNote],
        currentBeat: Double,
        keyAtBeat: (Double) -> KeyInfo
    ) -> MelodyIntervalState? {
        let events = timedNotes(melody)
        guard let activeIndex = events.lastIndex(where: {
            currentBeat >= $0.onset && currentBeat < $0.onset + $0.note.duration
        }) else { return nil }
        let active = events[activeIndex]
        guard active.note.duration > 0, !active.note.isRest,
              let currentPitch = MusicTheory.spelledPitch(
                scaleDegree: active.note.sd,
                relativeOctave: active.note.octave,
                key: keyAtBeat(active.onset)
              ), activeIndex > 0 else { return nil }

        let previous = events[activeIndex - 1]
        guard previous.note.duration > 0, !previous.note.isRest,
              let previousPitch = MusicTheory.spelledPitch(
                scaleDegree: previous.note.sd,
                relativeOctave: previous.note.octave,
                key: keyAtBeat(previous.onset)
              ) else { return nil }

        return MelodyIntervalState(
            previous: previousPitch,
            current: currentPitch,
            interval: IntervalAnalysis.named(from: previousPitch, to: currentPitch),
            previousDegreeLabel: MusicTheory.degreeLabel(for: previousPitch, key: keyAtBeat(previous.onset)),
            currentDegreeLabel: MusicTheory.degreeLabel(for: currentPitch, key: keyAtBeat(active.onset))
        )
    }

    public static func activeChord(section: ExtractedSection, at beat: Double) -> [String: JSONValue]? {
        ActiveEventIndex(section: section, melody: []).chord(at: beat)
    }

    public static func activeMelodyNote(_ melody: [MelodyNote], at beat: Double) -> MelodyNote? {
        ActiveEventIndex(section: ExtractedSection(), melody: melody).melodyNote(at: beat)
    }

    fileprivate struct TimedChord: Sendable {
        let sourceIndex: Int
        let onset: Double
        let duration: Double
        let chord: [String: JSONValue]
    }

    fileprivate struct TimedNote: Sendable {
        let sourceIndex: Int
        let onset: Double
        let note: MelodyNote
    }

    fileprivate static func timedChords(_ section: ExtractedSection) -> [TimedChord] {
        section.chords.enumerated().map {
            TimedChord(
                sourceIndex: $0.offset,
                onset: PlaybackTiming.normalize(beat: $0.element["beat"]?.doubleValue ?? 1),
                duration: $0.element["duration"]?.doubleValue ?? 1,
                chord: $0.element
            )
        }.sorted { $0.onset == $1.onset ? $0.sourceIndex < $1.sourceIndex : $0.onset < $1.onset }
    }

    fileprivate static func timedNotes(_ melody: [MelodyNote]) -> [TimedNote] {
        melody.enumerated().map {
            TimedNote(sourceIndex: $0.offset, onset: PlaybackTiming.normalize(beat: $0.element.beat), note: $0.element)
        }.sorted { $0.onset == $1.onset ? $0.sourceIndex < $1.sourceIndex : $0.onset < $1.onset }
    }

    private static func isRest(_ chord: [String: JSONValue]) -> Bool {
        chord["isRest"]?.boolValue == true || chord["rest"]?.boolValue == true
    }
}

public struct ActiveEventIndex: Sendable {
    private let chords: [QuizIntervals.TimedChord]
    private let notes: [QuizIntervals.TimedNote]

    public init(section: ExtractedSection, melody: [MelodyNote]) {
        chords = QuizIntervals.timedChords(section)
        notes = QuizIntervals.timedNotes(melody)
    }

    public func chord(at beat: Double) -> [String: JSONValue]? {
        guard var index = lastChordOnset(atOrBefore: beat) else { return nil }
        while index >= 0 {
            let event = chords[index]
            if beat < event.onset + event.duration { return event.chord }
            index -= 1
        }
        return nil
    }

    public func melodyNote(at beat: Double) -> MelodyNote? {
        guard var index = lastNoteOnset(atOrBefore: beat) else { return nil }
        while index >= 0 {
            let event = notes[index]
            if beat < event.onset + event.note.duration { return event.note }
            index -= 1
        }
        return nil
    }

    private func lastChordOnset(atOrBefore beat: Double) -> Int? {
        var low = 0
        var high = chords.count - 1
        var result: Int?
        while low <= high {
            let middle = (low + high) >> 1
            if chords[middle].onset <= beat {
                result = middle
                low = middle + 1
            } else {
                high = middle - 1
            }
        }
        return result
    }

    private func lastNoteOnset(atOrBefore beat: Double) -> Int? {
        var low = 0
        var high = notes.count - 1
        var result: Int?
        while low <= high {
            let middle = (low + high) >> 1
            if notes[middle].onset <= beat {
                result = middle
                low = middle + 1
            } else {
                high = middle - 1
            }
        }
        return result
    }
}
