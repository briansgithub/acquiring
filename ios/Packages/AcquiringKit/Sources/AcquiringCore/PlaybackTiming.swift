import Foundation

public struct LoopingPlaybackPosition: Equatable, Sendable {
    public let beat: Double
    public let looped: Bool
}

public enum PlaybackTiming {
    public static let firstBeat = 1.0
    public static let fallbackEndBeat = 32.0

    public static func normalize(beat: Double, startBeat: Double = firstBeat) -> Double {
        beat == 0 ? startBeat : beat
    }

    public static func eventEndBeat(beat: Double, duration: Double, isRest: Bool = false, startBeat: Double = firstBeat) -> Double? {
        guard !isRest, beat.isFinite, duration.isFinite, duration > 0 else { return nil }
        let end = normalize(beat: beat, startBeat: startBeat) + duration
        return end.isFinite && end > startBeat ? end : nil
    }

    public static func endBeat(metadata: Double?, audibleEnds: [Double], startBeat: Double = firstBeat) -> Double {
        audibleEnds.filter { $0.isFinite && $0 > startBeat }.max()
            ?? metadata.flatMap { $0.isFinite && $0 > startBeat ? $0 : nil }
            ?? max(fallbackEndBeat, startBeat.nextUp)
    }

    public static func loopingPosition(tickEndBeat: Double, endBeat: Double, startBeat: Double = firstBeat) -> LoopingPlaybackPosition {
        guard tickEndBeat.isFinite, endBeat.isFinite, endBeat > startBeat else {
            return LoopingPlaybackPosition(beat: startBeat, looped: false)
        }
        guard tickEndBeat >= endBeat else {
            return LoopingPlaybackPosition(beat: max(tickEndBeat, startBeat), looped: false)
        }
        return LoopingPlaybackPosition(beat: startBeat + (tickEndBeat - startBeat).truncatingRemainder(dividingBy: endBeat - startBeat), looped: true)
    }

    public static func remainingMilliseconds(eventEndBeat: Double, currentBeat: Double, bpm: Double) -> Int? {
        guard eventEndBeat.isFinite, currentBeat.isFinite, bpm.isFinite, bpm > 0, eventEndBeat > currentBeat else { return nil }
        return max(Int(((eventEndBeat - currentBeat) * 60_000 / bpm).rounded()), 40)
    }
}
