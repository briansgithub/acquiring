import Foundation

public struct SingingTargetNote: Equatable, Sendable {
    public let sourceMIDI: Int
    public let scaleDegreeLabel: String

    public init(sourceMIDI: Int, scaleDegreeLabel: String) {
        self.sourceMIDI = sourceMIDI
        self.scaleDegreeLabel = scaleDegreeLabel
    }

    public func effectiveTargetMIDI(
        transpose: Int,
        comfortablePitchMIDI: Double?,
        lastSourceMIDI: Int? = nil,
        lastTargetMIDI: Int? = nil
    ) -> Int {
        let source = sourceMIDI + transpose
        guard let comfortablePitchMIDI else { return source }
        return TessituraResolver.resolveTarget(
            sourceMIDI: source,
            anchorMIDI: comfortablePitchMIDI,
            lastSource: lastSourceMIDI,
            lastTarget: lastTargetMIDI
        )
    }

    public func playbackMIDIInput(
        transpose: Int,
        comfortablePitchMIDI: Double?,
        lastSourceMIDI: Int? = nil,
        lastTargetMIDI: Int? = nil
    ) -> Int {
        effectiveTargetMIDI(
            transpose: transpose,
            comfortablePitchMIDI: comfortablePitchMIDI,
            lastSourceMIDI: lastSourceMIDI,
            lastTargetMIDI: lastTargetMIDI
        ) - transpose
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

public enum SingingTargets {
    public static func resolve(
        request: SingingTargetRequest,
        transpose: Int,
        comfortablePitchMIDI: Double?
    ) -> (first: Int?, second: Int?) {
        let first = request.first.map { $0.sourceMIDI + transpose }
        let second = request.second.map { $0.sourceMIDI + transpose }
        guard let comfortablePitchMIDI else { return (first, second) }
        switch (first, second) {
        case let (.some(first), .some(second)):
            return TessituraResolver.resolveInterval(first: first, second: second, anchorMIDI: comfortablePitchMIDI)
        case let (.some(first), nil):
            return (TessituraResolver.resolveTarget(sourceMIDI: first, anchorMIDI: comfortablePitchMIDI), nil)
        case let (nil, .some(second)):
            return (nil, TessituraResolver.resolveTarget(sourceMIDI: second, anchorMIDI: comfortablePitchMIDI))
        case (nil, nil):
            return (nil, nil)
        }
    }

    public static func idealIntervalPlaybackMIDIs(
        request: SingingTargetRequest?,
        transpose: Int,
        comfortablePitchMIDI: Double?
    ) -> (first: Int, second: Int)? {
        guard let request, request.first != nil, request.second != nil else { return nil }
        let result = resolve(request: request, transpose: transpose, comfortablePitchMIDI: comfortablePitchMIDI)
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
