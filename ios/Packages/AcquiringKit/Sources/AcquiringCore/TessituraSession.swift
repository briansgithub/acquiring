import Foundation

public struct TessituraSession: Equatable, Sendable {
    public private(set) var sessionKey: String?
    public private(set) var comfortablePitchMIDI: Double?
    public private(set) var lastSourceMIDI: Int?
    public private(set) var lastTargetMIDI: Int?

    public init() {}

    public mutating func enter(_ key: String) {
        guard sessionKey != key else { return }
        sessionKey = key
        resetContinuity()
    }

    public mutating func updateComfortablePitch(_ midi: Double) {
        comfortablePitchMIDI = midi
        resetContinuity()
    }

    public mutating func updateContinuity(source: Int, target: Int) {
        lastSourceMIDI = source
        lastTargetMIDI = target
    }

    public mutating func resetContinuity() {
        lastSourceMIDI = nil
        lastTargetMIDI = nil
    }

    public mutating func clearAdjustment() {
        comfortablePitchMIDI = nil
        resetContinuity()
    }

    public mutating func clearSession() {
        sessionKey = nil
        comfortablePitchMIDI = nil
        resetContinuity()
    }
}
