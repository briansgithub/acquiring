import Foundation

public struct SmoothedPitch: Equatable, Sendable {
    public let midi: Double
    public let centsError: Double
    public let confidence: Double
}

public struct PitchSmoothingConfiguration: Equatable, Sendable {
    public let medianWindow: Int
    public let minimumFramesBeforePublishing: Int
    public let emaAdmission: Double
    public let octaveRejectSemitones: Double
    public let octaveRejectMaximumFrames: Int

    public static let standard = PitchSmoothingConfiguration(
        medianWindow: 3,
        minimumFramesBeforePublishing: 2,
        emaAdmission: 0.3,
        octaveRejectSemitones: 6,
        octaveRejectMaximumFrames: 3
    )

    public static let melodyFast = PitchSmoothingConfiguration(
        medianWindow: 1,
        minimumFramesBeforePublishing: 1,
        emaAdmission: 1,
        octaveRejectSemitones: 6,
        octaveRejectMaximumFrames: 1
    )
}

public struct PitchSmoother: Sendable {
    public private(set) var targetMIDI: Int
    private let configuration: PitchSmoothingConfiguration
    private var recent: [Double] = []
    private var smoothedMIDI = 0.0
    private var validFrames = 0
    private var rejectedFrames = 0
    private var lastConfidence = 0.0

    public init(targetMIDI: Int, configuration: PitchSmoothingConfiguration = .standard) {
        precondition(configuration.medianWindow > 0 && configuration.medianWindow.isMultiple(of: 2) == false)
        self.targetMIDI = targetMIDI
        self.configuration = configuration
    }

    public mutating func accept(midi: Double, confidence: Double) -> SmoothedPitch? {
        if validFrames > 0, abs(midi - smoothedMIDI) > configuration.octaveRejectSemitones {
            rejectedFrames += 1
            if rejectedFrames >= configuration.octaveRejectMaximumFrames { reset() }
            return nil
        }
        rejectedFrames = 0
        recent.append(midi)
        if recent.count > configuration.medianWindow { recent.removeFirst() }
        guard recent.count >= configuration.medianWindow else { return nil }

        let median = recent.sorted()[configuration.medianWindow / 2]
        smoothedMIDI = validFrames == 0
            ? median
            : smoothedMIDI * (1 - configuration.emaAdmission) + median * configuration.emaAdmission
        validFrames += 1
        lastConfidence = confidence
        guard validFrames >= configuration.minimumFramesBeforePublishing else { return nil }
        return result(confidence: confidence)
    }

    public mutating func setTarget(_ newTarget: Int) -> SmoothedPitch? {
        targetMIDI = newTarget
        guard validFrames >= configuration.minimumFramesBeforePublishing else { return nil }
        return result(confidence: lastConfidence)
    }

    public mutating func retarget(_ newTarget: Int) {
        targetMIDI = newTarget
        reset()
    }

    public mutating func reset() {
        recent.removeAll(keepingCapacity: true)
        smoothedMIDI = 0
        validFrames = 0
        rejectedFrames = 0
        lastConfidence = 0
    }

    private func result(confidence: Double) -> SmoothedPitch {
        SmoothedPitch(midi: smoothedMIDI, centsError: 100 * (smoothedMIDI - Double(targetMIDI)), confidence: confidence)
    }
}
