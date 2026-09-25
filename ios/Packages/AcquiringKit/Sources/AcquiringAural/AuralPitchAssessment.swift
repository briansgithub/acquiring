import AcquiringAudio
import Foundation

public struct AuralPitchFrame: Equatable, Sendable {
    public let timeMilliseconds: Int64
    public let midi: Double?
    public let confidence: Double
    public let isHeld: Bool
    public let error: String?

    public init(
        timeMilliseconds: Int64,
        midi: Double?,
        confidence: Double = 0,
        isHeld: Bool = false,
        error: String? = nil
    ) {
        self.timeMilliseconds = timeMilliseconds
        self.midi = midi
        self.confidence = confidence
        self.isHeld = isHeld
        self.error = error
    }

    public init(timeMilliseconds: Int64, reading: PitchReading) {
        self.init(
            timeMilliseconds: timeMilliseconds,
            midi: reading.midi,
            confidence: reading.confidence,
            isHeld: false
        )
    }
}

public enum AuralPitchStatus: String, Equatable, Sendable {
    case correct
    case incorrect
    case uncertain
}

public struct AuralPitchAssessment: Equatable, Sendable {
    public let status: AuralPitchStatus
    public let reason: String
    public let cents: [Double]

    public init(status: AuralPitchStatus, reason: String, cents: [Double] = []) {
        self.status = status
        self.reason = reason
        self.cents = cents
    }
}

public enum AuralPitchAssessor {
    public static func assess(
        frames: [AuralPitchFrame],
        targetMidis: [Int],
        toleranceCents: Double = 45,
        minimumConfidence: Double = 0.85,
        minimumStableMilliseconds: Int64 = 250,
        minimumCoverage: Double = 0.25,
        octaveEquivalent: Bool = true
    ) -> AuralPitchAssessment {
        func uncertain(_ reason: String) -> AuralPitchAssessment {
            AuralPitchAssessment(status: .uncertain, reason: reason)
        }
        guard !targetMidis.isEmpty, targetMidis.allSatisfy({ (1...127).contains($0) }) else {
            return uncertain("The exercise pitch target is unavailable.")
        }
        if let error = frames.first(where: { $0.error != nil })?.error {
            return uncertain(error)
        }
        let ordered = frames.filter { $0.timeMilliseconds >= 0 }
            .sorted { $0.timeMilliseconds < $1.timeMilliseconds }
        guard ordered.count >= 4 else {
            return uncertain("Too little microphone data was captured. Try again.")
        }
        let intervals = zip(ordered, ordered.dropFirst()).compactMap { left, right -> Double? in
            let interval = Double(right.timeMilliseconds - left.timeMilliseconds)
            return (1...100).contains(interval) ? interval : nil
        }
        let frameMilliseconds = intervals.isEmpty ? 40 : median(intervals)
        let voiced = ordered.filter { frame in
            guard let midi = frame.midi else { return false }
            return midi.isFinite && (35...96).contains(midi)
                && frame.confidence.isFinite && frame.confidence >= minimumConfidence
                && !frame.isHeld
        }
        guard Double(voiced.count) / Double(ordered.count) >= minimumCoverage else {
            return uncertain("The voice signal was too faint or unclear. Try a quieter space.")
        }
        func distance(_ midi: Double, _ target: Double) -> Double {
            octaveEquivalent ? octaveDifference(midi, target) : (midi - target) * 100
        }
        struct Group {
            let start: Int64
            var end: Int64
            let anchor: Double
            var notes: [Double]
        }
        var groups: [Group] = []
        for frame in voiced {
            let midi = frame.midi!
            if let last = groups.last,
               Double(frame.timeMilliseconds - last.end) <= max(100, 2.1 * frameMilliseconds),
               abs(distance(midi, last.anchor)) <= 85 {
                groups[groups.count - 1].end = frame.timeMilliseconds
                groups[groups.count - 1].notes.append(
                    octaveEquivalent
                        ? last.anchor + octaveDifference(midi, last.anchor) / 100
                        : midi
                )
            } else {
                groups.append(Group(
                    start: frame.timeMilliseconds,
                    end: frame.timeMilliseconds,
                    anchor: midi,
                    notes: [midi]
                ))
            }
        }
        let stable = groups.filter { group in
            let center = median(group.notes)
            let inliers = group.notes.filter { abs(($0 - center) * 100) <= 45 }.count
            return Double(group.end - group.start) + frameMilliseconds >= Double(minimumStableMilliseconds)
                && group.notes.count >= 4
                && Double(inliers) / Double(group.notes.count) >= 0.8
        }
        guard stable.count == targetMidis.count else {
            return uncertain(
                targetMidis.count > 1
                    ? "Could not separate every sustained note. Leave a breath between repeated notes."
                    : "Hold one steady note for a little longer, then try again."
            )
        }
        let stableFrameCount = stable.reduce(0) { $0 + $1.notes.count }
        guard Double(stableFrameCount) / Double(max(1, voiced.count)) >= 0.75 else {
            return uncertain("Pitch was not steady enough to grade reliably.")
        }
        let cents = stable.enumerated().map {
            abs(distance(median($0.element.notes), Double(targetMidis[$0.offset])))
        }
        let correct = cents.allSatisfy { $0 <= toleranceCents }
        return AuralPitchAssessment(
            status: correct ? .correct : .incorrect,
            reason: correct
                ? "Stable pitches matched the target."
                : "A clear sustained pitch differed from the target.",
            cents: cents
        )
    }

    private static func octaveDifference(_ midi: Double, _ target: Double) -> Double {
        ((100 * (midi - target) + 600).truncatingRemainder(dividingBy: 1_200) + 1_200)
            .truncatingRemainder(dividingBy: 1_200) - 600
    }

    private static func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        let middle = sorted.count / 2
        return sorted.count.isMultiple(of: 2)
            ? (sorted[middle - 1] + sorted[middle]) / 2
            : sorted[middle]
    }
}
