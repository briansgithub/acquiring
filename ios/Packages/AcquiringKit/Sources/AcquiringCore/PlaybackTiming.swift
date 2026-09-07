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

    /// Folds `beat` back into one pass of a looping section.
    ///
    /// Shared by the timeline's display-link projection and by persistent practice's own
    /// projection, so a marker and the run being scored under it can never disagree about
    /// where the playhead is after a loop.
    public static func wrappedBeat(_ beat: Double, span: Double, startBeat: Double = firstBeat) -> Double {
        guard span > 0, beat.isFinite else { return startBeat }
        var phase = (beat - startBeat).truncatingRemainder(dividingBy: span)
        if phase < 0 { phase += span }
        return startBeat + phase
    }

    /// The shorter way round a loop from `from` to `to`, signed.
    ///
    /// A projection that has run past the end of the section is barely ahead of a sample
    /// taken just after the wrap, not a whole section behind it.
    public static func circularDelta(from: Double, to: Double, span: Double) -> Double {
        guard span > 0 else { return to - from }
        var delta = (to - from).truncatingRemainder(dividingBy: span)
        if delta > span / 2 { delta -= span }
        if delta < -span / 2 { delta += span }
        return delta
    }

    public static func remainingMilliseconds(eventEndBeat: Double, currentBeat: Double, bpm: Double) -> Int? {
        guard eventEndBeat.isFinite, currentBeat.isFinite, bpm.isFinite, bpm > 0, eventEndBeat > currentBeat else { return nil }
        return max(Int(((eventEndBeat - currentBeat) * 60_000 / bpm).rounded()), 40)
    }
}
