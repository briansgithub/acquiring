import AcquiringCore
import Foundation

public struct PreparedSpeech: Sendable {
    public let identity: Int
    public let onsetSeconds: Double
    public let endSeconds: Double
    public let samples: [Int16]
    public let sampleOffset: Int
    public let totalFrames: Int

    public init(identity: Int, onsetSeconds: Double, endSeconds: Double, samples: [Int16],
                sampleOffset: Int = 0, totalFrames: Int? = nil) {
        self.identity = identity; self.onsetSeconds = onsetSeconds; self.endSeconds = endSeconds
        self.samples = samples; self.sampleOffset = sampleOffset; self.totalFrames = totalFrames ?? samples.count
    }
}

struct SpeechSemantics: Equatable {
    let cue: PlaybackCue
    let transpose: Int
    let majorLocked: Bool
    let chordMode: QuizChordMode
    init(_ configuration: QuizSoundConfiguration) {
        cue = configuration.cue; transpose = configuration.transposeSemitones
        majorLocked = configuration.majorLocked; chordMode = configuration.chordMode
    }
    func sharesPhraseFamily(with other: Self) -> Bool {
        (cue.speaksRoot && other.cue.speaksRoot) || (cue.speaksMelody && other.cue.speaksMelody)
    }
}

public enum SpeechTimelinePreparation {
    /// Pin the opening window so a render block can wrap without waiting for the poller.
    /// Overlapping windows are prepared once; disjoint slices share logical phrase positions.
    public static func prepareLookahead(_ timeline: QuizTimeline, configuration: QuizSoundConfiguration,
                                        playbackRate: Double, sourceStart: Double) throws -> [PreparedSpeech] {
        guard playbackRate.isFinite, playbackRate > 0, sourceStart.isFinite,
              timeline.durationSeconds.isFinite, timeline.durationSeconds > 0 else { return [] }
        let start = min(max(0, sourceStart), timeline.durationSeconds)
        let openingEnd = min(timeline.durationSeconds, 8 * playbackRate)
        let movingEnd = min(timeline.durationSeconds, start + 8 * playbackRate)
        let windows: [ClosedRange<Double>] = start <= openingEnd
            ? [0...max(openingEnd, movingEnd)] : [0...openingEnd, start...movingEnd]
        var result: [PreparedSpeech] = []
        var retained = 0
        for window in windows {
            try Task.checkCancellation()
            let phrases = try prepare(timeline, configuration: configuration, playbackRate: playbackRate, sourceWindow: window)
            let frames = phrases.reduce(0) { $0 + $1.samples.count }
            guard frames <= SpokenCuePreparation.maximumFrames - retained else {
                throw AcquiringAudioError.invalidRequest("Opening and moving speech windows exceed the retained PCM budget.")
            }
            retained += frames
            result += phrases
        }
        return result
    }

    /// Bounded, cancellable preparation on the caller's background executor.
    public static func prepare(_ timeline: QuizTimeline, configuration: QuizSoundConfiguration,
                               playbackRate: Double, sourceWindow: ClosedRange<Double>? = nil) throws -> [PreparedSpeech] {
        guard configuration.cue.speaksRoot || configuration.cue.speaksMelody,
              playbackRate > 0 else { return [] }
        guard playbackRate.isFinite,
              sourceWindow.map({ $0.lowerBound.isFinite && $0.upperBound.isFinite }) ?? true else {
            throw AcquiringAudioError.invalidRequest("Invalid speech preparation window.")
        }
        let clips = BundledVoiceClips()
        var result: [PreparedSpeech] = [], total = 0
        func add(_ identity: Int, _ start: Double, _ end: Double, _ samples: [Int16]) throws {
            let from = sourceWindow.map { max(0, ($0.lowerBound - start) / playbackRate * 24000) } ?? 0
            let through = sourceWindow.map { max(0, ($0.upperBound - start) / playbackRate * 24000) } ?? Double(samples.count)
            let lower = Int(min(Double(samples.count), from.rounded(.down)))
            let upper = Int(min(Double(samples.count), through.rounded(.up), max(0, (end - start) / playbackRate * 24000).rounded(.up)))
            guard upper > lower, end > start else { return }
            guard upper - lower <= SpokenCuePreparation.maximumFrames - total else {
                throw AcquiringAudioError.invalidRequest("Speech window exceeds the 48-second retained PCM budget.")
            }
            guard !samples.isEmpty, end > start else { return }
            total += upper - lower
            result.append(.init(identity: identity, onsetSeconds: start, endSeconds: end,
                                samples: Array(samples[lower..<upper]), sampleOffset: lower, totalFrames: samples.count))
        }
        let chords = timeline.events.indices.filter { timeline.events[$0].channel == .chord }
        for (index, event) in timeline.events.enumerated() {
            try Task.checkCancellation()
            let context = event.cueContext
            if let window = sourceWindow,
               event.onsetSeconds >= window.upperBound || event.onsetSeconds + event.durationSeconds <= window.lowerBound { continue }
            let followingVoice = timeline.events.dropFirst(index + 1).first { next in
                if configuration.cue.speaksRoot { return next.channel == .chord }
                guard let words = next.cueContext.melodyWords else { return false }
                return configuration.cue != .melodyChordTone || MelodyFunction.isSpokenChordTone(words)
            }
            let voiceEnd = min(event.onsetSeconds + event.durationSeconds, followingVoice?.onsetSeconds ?? .infinity)
            let duration = event.durationSeconds / playbackRate
            if configuration.cue.speaksMelody, let words = context.melodyWords, let midi = context.melodyMidi,
               configuration.cue != .melodyChordTone || MelodyFunction.isSpokenChordTone(words) {
                let pitch = midi + configuration.transposeSemitones
                let clip = try clips.clip(stem: "melody_fn_" + words.replacingOccurrences(of: " ", with: "_"), midi: pitch)
                let samples = try SpokenCuePreparation.phrase([clip], midi: pitch, durationSeconds: duration)
                try add(index * 2, event.onsetSeconds, voiceEnd, samples)
            } else if configuration.cue.speaksRoot, event.channel == .chord {
                let degree = configuration.majorLocked ? context.majorDegree : context.rootDegree
                let alteration = configuration.majorLocked ? context.majorAlteration : context.alteration
                let root = configuration.chordMode == .full ? context.fullChordRootMidi ?? context.rootMidi : context.rootMidi
                if let degree, (1...7).contains(degree), let root {
                    let pitch = root + configuration.transposeSemitones - 12
                    let words = ["one", "two", "three", "four", "five", "six", "seven"]
                    var parts: [[Int16]] = []
                    if alteration != 0 {
                        guard (-4...4).contains(alteration) else { throw AcquiringAudioError.invalidRequest("Unsupported repeated accidental.") }
                        let accidental = try clips.clip(stem: alteration < 0 ? "root_accidental_flat" : "root_accidental_sharp", midi: pitch)
                        parts += Array(repeating: accidental, count: abs(alteration))
                    }
                    parts.append(try clips.clip(stem: "root_degree_" + words[degree - 1], midi: pitch))
                    if configuration.cue == .sungNumberWithDetails, let suffix = context.suffix {
                        parts.append(try clips.clip(stem: suffix, midi: pitch))
                    }
                    try add(index * 2, event.onsetSeconds, voiceEnd,
                            SpokenCuePreparation.phrase(parts, midi: pitch, durationSeconds: duration))
                }
                if !configuration.majorLocked, chords.count > 1, let position = chords.firstIndex(of: index) {
                    let next = timeline.events[chords[(position + 1) % chords.count]]
                    if let old = context.keyScale, let scale = next.cueContext.keyScale, scale != old,
                       let tonic = next.cueContext.keyTonicMidi {
                        let name = scale.replacingOccurrences(of: "([a-z])([A-Z])", with: "$1_$2", options: .regularExpression).lowercased()
                        guard ["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian",
                               "ionian", "aeolian", "harmonic_minor", "phrygian_dominant"].contains(name) else { continue }
                        let raw = try clips.clip(stem: "mode_" + name)
                        let samples = try SpokenCuePreparation.mode(raw, tonicMidi: tonic + configuration.transposeSemitones)
                        let end = min(event.onsetSeconds + event.durationSeconds,
                                      next.onsetSeconds <= event.onsetSeconds ? event.onsetSeconds + event.durationSeconds : next.onsetSeconds)
                        let start = max(event.onsetSeconds, end - Double(samples.count) / 24000 * playbackRate)
                        try add(index * 2 + 1, start, end, samples)
                    }
                }
            }
        }
        return result
    }
}

/// Owned by the transport executor. Both seeking and settings preparation invalidate older work.
public struct SpeechPreparationRevision: Sendable {
    public private(set) var current: UInt64 = 0
    public init() {}
    public mutating func invalidate() { current &+= 1 }
    public func accepts(_ candidate: UInt64) -> Bool { candidate == current }
}
