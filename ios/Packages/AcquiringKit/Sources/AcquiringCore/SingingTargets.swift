import Foundation

public struct SingingTargetNote: Equatable, Sendable {
    public let sourceMIDI: Int
    public let scaleDegreeLabel: String

    public init(sourceMIDI: Int, scaleDegreeLabel: String) {
        self.sourceMIDI = sourceMIDI
        self.scaleDegreeLabel = scaleDegreeLabel
    }

    public func effectiveTargetMIDI(transpose: Int, octaveOffset: Int) -> Int {
        sourceMIDI + transpose + SingingOctaveOffset.semitones(octaveOffset)
    }

    public func playbackMIDIInput(transpose: Int, octaveOffset: Int) -> Int {
        effectiveTargetMIDI(transpose: transpose, octaveOffset: octaveOffset) - transpose
    }
}

public struct SingingTargetRequest: Equatable, Sendable {
    public let first: SingingTargetNote?
    public let second: SingingTargetNote?
    public let requestID: Int

    public init(first: SingingTargetNote?, second: SingingTargetNote?, requestID: Int) {
        self.first = first
        self.second = second
        self.requestID = requestID
    }
}

/// The singer's octave adjustment: one integer, applied flat to every singing target.
///
/// It replaces a per-song comfortable-pitch anchor that chose an octave per target from a
/// measured voice range. That produced targets a singer could not predict - two notes of one
/// interval could land in different octaves - and needed a microphone calibration before it
/// did anything. A number the singer sets themselves moves everything by the same amount, so
/// the interval on the card is always the interval they are asked to sing.
public enum SingingOctaveOffset {
    /// Down two octaves to up three: the range that keeps a quiz target reachable for both a
    /// low and a high voice without letting it leave audible pitch entirely.
    public static let range = -2...3

    public static func clamped(_ offset: Int) -> Int {
        min(max(offset, range.lowerBound), range.upperBound)
    }

    public static func semitones(_ offset: Int) -> Int {
        clamped(offset) * 12
    }
}

public enum SingingTargets {
    public static func resolve(
        request: SingingTargetRequest,
        transpose: Int,
        octaveOffset: Int
    ) -> (first: Int?, second: Int?) {
        let shift = transpose + SingingOctaveOffset.semitones(octaveOffset)
        return (
            request.first.map { $0.sourceMIDI + shift },
            request.second.map { $0.sourceMIDI + shift }
        )
    }

    public static func idealIntervalPlaybackMIDIs(
        request: SingingTargetRequest?,
        transpose: Int,
        octaveOffset: Int
    ) -> (first: Int, second: Int)? {
        guard let request, request.first != nil, request.second != nil else { return nil }
        let result = resolve(request: request, transpose: transpose, octaveOffset: octaveOffset)
        guard let first = result.first, let second = result.second else { return nil }
        return (first - transpose, second - transpose)
    }

    public static func recordedPitchPlaybackFrequency(rawMIDI: Double?) -> Double? {
        guard let rawMIDI, rawMIDI.isFinite else { return nil }
        return MusicTheory.frequency(midi: rawMIDI)
    }
}

public struct RootIntervalPreviewStep: Equatable, Sendable {
    public let midiNotes: [Int]
    public let durationMilliseconds: Int
    public let delayAfterMilliseconds: Int
}

public enum RootIntervalPreview {
    public static func steps(
        previousMIDI: Int,
        currentMIDI: Int,
        octaveShiftSemitones: Int,
        durationMilliseconds: Int
    ) -> [RootIntervalPreviewStep] {
        let previous = previousMIDI + octaveShiftSemitones
        let current = currentMIDI + octaveShiftSemitones
        return [
            RootIntervalPreviewStep(
                midiNotes: [previous],
                durationMilliseconds: durationMilliseconds,
                delayAfterMilliseconds: durationMilliseconds
            ),
            RootIntervalPreviewStep(
                midiNotes: [current],
                durationMilliseconds: durationMilliseconds,
                delayAfterMilliseconds: durationMilliseconds
            ),
            RootIntervalPreviewStep(
                midiNotes: previous == current ? [previous] : [previous, current],
                durationMilliseconds: durationMilliseconds,
                delayAfterMilliseconds: 0
            )
        ]
    }
}
