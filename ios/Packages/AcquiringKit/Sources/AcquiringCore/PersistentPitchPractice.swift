import Foundation

public enum PersistentPitchSelection: Equatable, Sendable {
    case simpleRoot
    case chordTone(requestedIndex: Int)
    case melody
}

public struct QuizPitchCardTarget: Equatable, Sendable {
    public let sourceMIDI: Int
    public let label: String

    public init(sourceMIDI: Int, label: String) {
        self.sourceMIDI = sourceMIDI
        self.label = label
    }
}

public enum PersistentPitchCardPosition: Equatable, Sendable {
    case simpleRoot
    case chordTone(displayedIndex: Int)
    case melodyCurrent
}

public struct ResolvedPersistentPitchTarget: Equatable, Sendable {
    public let sourceMIDI: Int
    public let label: String
    public let position: PersistentPitchCardPosition

    public init(sourceMIDI: Int, label: String, position: PersistentPitchCardPosition) {
        self.sourceMIDI = sourceMIDI
        self.label = label
        self.position = position
    }

    public func effectiveTargetMIDI(
        transpose: Int,
        comfortablePitchMIDI: Double?,
        lastSourceMIDI: Int? = nil,
        lastTargetMIDI: Int? = nil
    ) -> Int {
        let transposedSource = sourceMIDI + transpose
        guard let comfortablePitchMIDI else { return transposedSource }
        return TessituraResolver.resolveTarget(
            sourceMIDI: transposedSource,
            anchorMIDI: comfortablePitchMIDI,
            lastSource: lastSourceMIDI,
            lastTarget: lastTargetMIDI
        )
    }
}

public enum PersistentPitchTargets {
    public static func resolve(
        selection: PersistentPitchSelection?,
        simpleRoot: QuizPitchCardTarget?,
        chordTones: [QuizPitchCardTarget],
        melody: QuizPitchCardTarget?
    ) -> ResolvedPersistentPitchTarget? {
        switch selection {
        case .simpleRoot:
            return simpleRoot.map {
                ResolvedPersistentPitchTarget(
                    sourceMIDI: $0.sourceMIDI,
                    label: $0.label,
                    position: .simpleRoot
                )
            }
        case let .chordTone(requestedIndex):
            guard let displayedIndex = clampedChordToneIndex(
                requestedIndex: requestedIndex,
                toneCount: chordTones.count
            ) else { return nil }
            let target = chordTones[displayedIndex]
            return ResolvedPersistentPitchTarget(
                sourceMIDI: target.sourceMIDI,
                label: target.label,
                position: .chordTone(displayedIndex: displayedIndex)
            )
        case .melody:
            return melody.map {
                ResolvedPersistentPitchTarget(
                    sourceMIDI: $0.sourceMIDI,
                    label: $0.label,
                    position: .melodyCurrent
                )
            }
        case nil:
            return nil
        }
    }

    public static func clampedChordToneIndex(requestedIndex: Int, toneCount: Int) -> Int? {
        guard toneCount > 0 else { return nil }
        return min(max(requestedIndex, 0), toneCount - 1)
    }
}

public struct MelodyTimelinePitchVisual: Equatable, Sendable {
    public let beat: Double
    public let duration: Double
    public let staffDegree: Int
    public let sourceMIDI: Int?

    public init(beat: Double, duration: Double, staffDegree: Int, sourceMIDI: Int?) {
        self.beat = beat
        self.duration = duration
        self.staffDegree = staffDegree
        self.sourceMIDI = sourceMIDI
    }
}

public struct MelodyTimelinePitchRun: Equatable, Identifiable, Sendable {
    public let id: Int
    public let beat: Double
    public let duration: Double
    public let staffDegree: Int
    public let sourceMIDI: Int?

    public init(id: Int, beat: Double, duration: Double, staffDegree: Int, sourceMIDI: Int?) {
        self.id = id
        self.beat = beat
        self.duration = duration
        self.staffDegree = staffDegree
        self.sourceMIDI = sourceMIDI
    }

    public var endBeat: Double { beat + duration }
    public var centerBeat: Double { beat + duration / 2 }
}

public enum MelodyTimelinePitchRuns {
    private static let continuityEpsilon = 1e-6

    public static func build(from visuals: [MelodyTimelinePitchVisual]) -> [MelodyTimelinePitchRun] {
        let sorted = visuals.enumerated()
            .filter { $0.element.duration > 0 }
            .sorted {
                $0.element.beat == $1.element.beat
                    ? $0.offset < $1.offset
                    : $0.element.beat < $1.element.beat
            }
            .map(\.element)
        guard var first = sorted.first else { return [] }

        var runs: [MelodyTimelinePitchRun] = []
        var endBeat = first.beat + first.duration

        func finishedRun() -> MelodyTimelinePitchRun {
            MelodyTimelinePitchRun(
                id: runs.count,
                beat: first.beat,
                duration: endBeat - first.beat,
                staffDegree: first.staffDegree,
                sourceMIDI: first.sourceMIDI
            )
        }

        for visual in sorted.dropFirst() {
            let touchesCurrentRun = visual.beat <= endBeat + continuityEpsilon
            let isSamePitch = visual.staffDegree == first.staffDegree
                && visual.sourceMIDI == first.sourceMIDI
            if touchesCurrentRun && isSamePitch {
                endBeat = max(endBeat, visual.beat + visual.duration)
            } else {
                runs.append(finishedRun())
                first = visual
                endBeat = visual.beat + visual.duration
            }
        }
        runs.append(finishedRun())
        return runs
    }

    public static func run(at beat: Double, in runs: [MelodyTimelinePitchRun]) -> MelodyTimelinePitchRun? {
        runs.reversed().first { beat >= $0.beat && beat < $0.endBeat }
    }
}

public enum PitchFeedbackBand: Equatable, Sendable {
    case accurate
    case close
    case far
}

public enum PersistentPitchFeedback {
    public static func band(centsError: Double) -> PitchFeedbackBand {
        switch abs(centsError) {
        case ..<15: .accurate
        case ..<50: .close
        default: .far
        }
    }

    public static func timelineStaffSteps(centsError: Double) -> Double {
        centsError * 7 / 1_200
    }

    public static func errorPercentage(centsError: Double) -> Int {
        min(max(kotlinRoundToInt(abs(centsError)), 0), 100)
    }

    public static func showsLiveErrorPercentage(centsError: Double) -> Bool {
        errorPercentage(centsError: centsError) < 100
    }

    public static func formatLiveErrorPercentage(centsError: Double) -> String {
        let prefix = centsError > 0 ? "+" : centsError < 0 ? "-" : ""
        return "\(prefix)\(errorPercentage(centsError: centsError))%"
    }

    public static func formatCentsError(_ centsError: Double) -> String {
        let rounded = kotlinRoundToInt(centsError)
        return "\(rounded > 0 ? "+" : "")\(rounded)\u{00a2}"
    }
}

public struct MelodyTimelinePitchScore: Equatable, Sendable {
    public let errorPercentage: Int
    public let signedCentsError: Double
    public let centsErrorMagnitude: Double
    public let sampleCount: Int

    public init(
        errorPercentage: Int,
        signedCentsError: Double,
        centsErrorMagnitude: Double,
        sampleCount: Int
    ) {
        self.errorPercentage = errorPercentage
        self.signedCentsError = signedCentsError
        self.centsErrorMagnitude = centsErrorMagnitude
        self.sampleCount = sampleCount
    }

    public var formatted: String {
        let prefix = signedCentsError <= -5 ? "-" : signedCentsError >= 5 ? "+" : ""
        return "\(prefix)\(errorPercentage)%"
    }
}

public enum MelodyRunScoreOutcome: Equatable, Sendable {
    case scored(runID: Int, score: MelodyTimelinePitchScore)
    case unscored(runID: Int)

    public var runID: Int {
        switch self {
        case let .scored(runID, _), let .unscored(runID): runID
        }
    }
}

public struct MelodyTimelinePitchScoreAccumulator: Sendable {
    public static let minimumScoreSamples = 8
    public static let maximumScoreSamples = 512

    private var activeRunID: Int?
    private var samples: [Double] = []

    public init() {
        samples.reserveCapacity(Self.maximumScoreSamples)
    }

    public mutating func begin(runID: Int) {
        clear()
        activeRunID = runID
    }

    public mutating func add(runID: Int, centsError: Double) {
        guard runID == activeRunID, centsError.isFinite,
              samples.count < Self.maximumScoreSamples else { return }
        samples.append(centsError)
    }

    public mutating func finish(runID: Int) -> MelodyRunScoreOutcome? {
        guard runID == activeRunID else { return nil }
        let outcome: MelodyRunScoreOutcome
        if samples.count < Self.minimumScoreSamples {
            outcome = .unscored(runID: runID)
        } else {
            let signed = samples.sorted()[samples.count / 2]
            let magnitude = samples.map(abs).sorted()[samples.count / 2]
            outcome = .scored(
                runID: runID,
                score: MelodyTimelinePitchScore(
                    errorPercentage: min(max(kotlinRoundToInt(magnitude), 0), 100),
                    signedCentsError: signed,
                    centsErrorMagnitude: magnitude,
                    sampleCount: samples.count
                )
            )
        }
        clear()
        return outcome
    }

    public mutating func clear() {
        activeRunID = nil
        samples.removeAll(keepingCapacity: true)
    }
}

public struct MelodyRunSettleDetector: Sendable {
    public static let defaultWindowMilliseconds = 96
    public static let defaultToleranceCents = 40.0
    public static let defaultFloorMilliseconds = 150
    public static let defaultCapMilliseconds = 500

    private let settleWindowMilliseconds: Int
    private let toleranceCents: Double
    private let floorMilliseconds: Int
    private let capMilliseconds: Int
    private var window: [(cents: Double, elapsedMilliseconds: Int)] = []
    private var settled = false

    public init(
        settleWindowMilliseconds: Int = Self.defaultWindowMilliseconds,
        toleranceCents: Double = Self.defaultToleranceCents,
        floorMilliseconds: Int = Self.defaultFloorMilliseconds,
        capMilliseconds: Int = Self.defaultCapMilliseconds
    ) {
        precondition(settleWindowMilliseconds > 0)
        precondition(toleranceCents > 0)
        precondition(floorMilliseconds >= 0)
        precondition(capMilliseconds >= floorMilliseconds)
        self.settleWindowMilliseconds = settleWindowMilliseconds
        self.toleranceCents = toleranceCents
        self.floorMilliseconds = floorMilliseconds
        self.capMilliseconds = capMilliseconds
    }

    public mutating func observe(elapsedMilliseconds: Int, centsError: Double?) -> Bool {
        if settled { return true }
        if elapsedMilliseconds >= capMilliseconds {
            settled = true
            return true
        }
        guard let centsError, centsError.isFinite else {
            window.removeAll(keepingCapacity: true)
            return false
        }

        window.append((centsError, elapsedMilliseconds))
        while window.count > 1,
              let first = window.first,
              elapsedMilliseconds - first.elapsedMilliseconds > settleWindowMilliseconds {
            window.removeFirst()
        }
        guard elapsedMilliseconds >= floorMilliseconds,
              let first = window.first,
              elapsedMilliseconds - first.elapsedMilliseconds >= settleWindowMilliseconds,
              let firstCents = window.first?.cents,
              window.contains(where: { $0.cents != firstCents })
        else { return false }

        let cents = window.map(\.cents)
        guard let minimum = cents.min(), let maximum = cents.max(),
              maximum - minimum <= toleranceCents else { return false }
        settled = true
        return true
    }
}

/// Stateful bridge used by the UI to bank one sample at a time without putting clocks or
/// microphone types into the portable parity domain.
public struct MelodyRunScoringSession: Sendable {
    public static let sampleIntervalMilliseconds = 16

    private var activeRunID: Int?
    private var targetMIDI: Int?
    private var elapsedMilliseconds = 0
    private var settleDetector = MelodyRunSettleDetector()
    private var accumulator = MelodyTimelinePitchScoreAccumulator()

    public init() {}

    public mutating func begin(runID: Int, targetMIDI: Int) {
        activeRunID = runID
        self.targetMIDI = targetMIDI
        elapsedMilliseconds = 0
        settleDetector = MelodyRunSettleDetector()
        accumulator.begin(runID: runID)
    }

    public mutating func add(measuredMIDI: Double?) {
        guard let runID = activeRunID, let targetMIDI else { return }
        let centsError = measuredMIDI.map { ($0 - Double(targetMIDI)) * 100 }
        if settleDetector.observe(
            elapsedMilliseconds: elapsedMilliseconds,
            centsError: centsError
        ), let centsError {
            accumulator.add(runID: runID, centsError: centsError)
        }
        elapsedMilliseconds += Self.sampleIntervalMilliseconds
    }

    public mutating func finish(runID: Int) -> MelodyRunScoreOutcome? {
        guard runID == activeRunID else { return nil }
        let result = accumulator.finish(runID: runID)
        activeRunID = nil
        targetMIDI = nil
        return result
    }

    public mutating func clear() {
        activeRunID = nil
        targetMIDI = nil
        elapsedMilliseconds = 0
        accumulator.clear()
    }
}

private func kotlinRoundToInt(_ value: Double) -> Int {
    guard value.isFinite else { return 0 }
    return Int(floor(value + 0.5))
}
