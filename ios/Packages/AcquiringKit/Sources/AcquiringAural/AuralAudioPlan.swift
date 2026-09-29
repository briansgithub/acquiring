import AcquiringAudio
import AcquiringCore
import Foundation

public struct AuralAudioPlan: Equatable, Sendable {
    public let timeline: QuizTimeline
    public let exposureSeconds: Double
    public let durationSeconds: Double
}

public enum AuralAudioPlanner {
    public static let separatorBeats = 0.75
    public static let audiationTailBeats = 2.0
    public static let overlapSeconds = 0.020

    public static func promptEvents(_ exercise: AuralExercise) -> [AuralExerciseEvent] {
        let rest = AuralExerciseEvent(
            notes: [],
            rootMidi: 60,
            bassMidi: 60,
            degree: "",
            functionLabel: "silence",
            beats: audiationTailBeats
        )
        let separator = AuralExerciseEvent(
            notes: [],
            rootMidi: 60,
            bassMidi: 60,
            degree: "",
            functionLabel: "silence",
            beats: separatorBeats
        )
        var result = exercise.context + [separator] + exercise.events
        if exercise.referenceRequired {
            var modeled = exercise.events
            if let gap = exercise.gapIndex, modeled.indices.contains(gap) {
                let source = modeled[gap]
                modeled[gap] = AuralExerciseEvent(
                    notes: [],
                    rootMidi: source.rootMidi,
                    bassMidi: source.bassMidi,
                    degree: "",
                    functionLabel: "silence",
                    beats: source.beats
                )
            }
            result += [separator] + modeled
        }
        if [.recall, .audiate, .reproduce].contains(exercise.skill) {
            result.append(rest)
        }
        return result
    }

    public static func plan(
        exercise: AuralExercise,
        waveform: SynthWaveform,
        events: [AuralExerciseEvent]? = nil
    ) throws -> AuralAudioPlan {
        let isFullPrompt = events == nil
        let events = events ?? promptEvents(exercise)
        guard !events.isEmpty, (20...400).contains(exercise.tempo) else {
            throw AuralCatalogError.invalidSchema("invalid listening tempo or empty sequence")
        }
        let beatsPerSecond = Double(exercise.tempo) / 60
        var beat = 0.0
        var timelineEvents: [QuizEvent] = []
        for (index, event) in events.enumerated() {
            guard event.beats.isFinite, event.beats > 0,
                  event.notes.count <= 16,
                  event.notes.allSatisfy({ (1...127).contains($0) })
            else { throw AuralCatalogError.invalidSchema("invalid sounding harmony") }
            let start = beat
            beat += event.beats
            guard !event.notes.isEmpty else { continue }
            let next = events.indices.contains(index + 1) ? events[index + 1] : nil
            let overlapBeats = next?.notes.isEmpty == false
                ? min(overlapSeconds * beatsPerSecond, (next?.beats ?? 0) / 2)
                : 0
            timelineEvents.append(QuizEvent(
                onsetSeconds: start / beatsPerSecond,
                durationSeconds: (event.beats + overlapBeats) / beatsPerSecond,
                frequenciesHz: event.notes.map(frequency),
                waveform: waveform,
                gain: 0.72,
                channel: .chord,
                rootFrequencyHz: frequency(event.rootMidi)
            ))
        }
        let duration = beat / beatsPerSecond
        guard duration.isFinite, duration >= 0.001 else {
            throw AuralCatalogError.invalidSchema("invalid listening duration")
        }
        let contextBeats = isFullPrompt
            ? exercise.context.reduce(0) { $0 + $1.beats } + separatorBeats
            : 0
        return AuralAudioPlan(
            timeline: QuizTimeline(
                durationSeconds: duration,
                events: timelineEvents,
                nativeBeatsPerSecond: beatsPerSecond
            ),
            exposureSeconds: contextBeats / beatsPerSecond,
            durationSeconds: duration
        )
    }

    public static func chunk(
        _ exercise: AuralExercise,
        index: Int,
        size: Int = 4
    ) -> [AuralExerciseEvent] {
        guard size > 0 else { return exercise.events }
        let start = max(0, index * size)
        guard start < exercise.events.count else { return [] }
        return Array(exercise.events[start..<min(exercise.events.count, start + size)])
    }

    public static func waveform(_ raw: String, fallback: SynthWaveform) -> SynthWaveform {
        if let selected = SynthWaveform(rawValue: raw) { return selected }
        return switch raw.lowercased() {
        case "sine": .sine
        case "triangle": .triangle
        case "soft", "warm_organ", "warmorgan": .warmOrgan
        default: SynthWaveform.allCases.first {
            $0.rawValue.lowercased() == raw.lowercased()
        } ?? fallback
        }
    }

    private static func frequency(_ midi: Int) -> Double {
        440 * pow(2, Double(midi - 69) / 12)
    }
}
