import Foundation

public struct ComfortablePitchCaptureProgress: Equatable, Sendable {
    public let remainingMilliseconds: Int
    public let hasSignal: Bool
    public let isComplete: Bool
}

public struct ComfortablePitchCapture: Sendable {
    private let captureMilliseconds: Int
    private let sampleWindowMilliseconds: Int
    private let dropoutGraceMilliseconds: Int
    private var remainingMilliseconds: Int
    private var remainingDropoutGraceMilliseconds = 0
    private var hasStarted = false
    private var samples: [Double] = []

    public init(captureMilliseconds: Int = 3_000, sampleWindowMilliseconds: Int = 2_000, dropoutGraceMilliseconds: Int = 1_000) {
        self.captureMilliseconds = captureMilliseconds
        self.sampleWindowMilliseconds = sampleWindowMilliseconds
        self.dropoutGraceMilliseconds = dropoutGraceMilliseconds
        remainingMilliseconds = captureMilliseconds
    }

    public mutating func observe(elapsedMilliseconds: Int, midi: Double?) -> ComfortablePitchCaptureProgress {
        let elapsed = max(elapsedMilliseconds, 0)
        if let midi {
            hasStarted = true
            remainingDropoutGraceMilliseconds = dropoutGraceMilliseconds
            remainingMilliseconds = max(remainingMilliseconds - elapsed, 0)
            if remainingMilliseconds <= sampleWindowMilliseconds { samples.append(midi) }
        } else if hasStarted {
            if elapsed < remainingDropoutGraceMilliseconds {
                remainingDropoutGraceMilliseconds = max(remainingDropoutGraceMilliseconds - elapsed, 0)
            } else {
                restart()
            }
        }
        return progress
    }

    public var progress: ComfortablePitchCaptureProgress {
        ComfortablePitchCaptureProgress(
            remainingMilliseconds: remainingMilliseconds,
            hasSignal: hasStarted,
            isComplete: remainingMilliseconds == 0 && !samples.isEmpty
        )
    }

    public var averageMIDI: Double? { progress.isComplete ? samples.reduce(0, +) / Double(samples.count) : nil }

    public mutating func restart() {
        remainingMilliseconds = captureMilliseconds
        remainingDropoutGraceMilliseconds = 0
        hasStarted = false
        samples.removeAll(keepingCapacity: true)
    }
}
