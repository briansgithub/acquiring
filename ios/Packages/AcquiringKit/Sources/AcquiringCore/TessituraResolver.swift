import Foundation

public enum TessituraResolver {
    public static let windowBelowAnchor = 8
    public static let windowAboveAnchor = 12

    public static func closestOctave(sourceMIDI: Int, anchorMIDI: Double) -> Int {
        sourceMIDI + roundedOctaveShift((anchorMIDI - Double(sourceMIDI)) / 12) * 12
    }

    public static func isInsideWindow(midi: Int, anchorMIDI: Double) -> Bool {
        let offset = Double(midi) - anchorMIDI
        return offset >= -Double(windowBelowAnchor) && offset <= Double(windowAboveAnchor)
    }

    public static func resolveTarget(
        sourceMIDI: Int,
        anchorMIDI: Double,
        lastSource: Int? = nil,
        lastTarget: Int? = nil
    ) -> Int {
        let recentered = closestOctave(sourceMIDI: sourceMIDI, anchorMIDI: anchorMIDI)
        guard let lastSource, let lastTarget else { return recentered }
        if sourceMIDI == lastSource { return lastTarget }
        let direction = sourceMIDI > lastSource ? 1 : -1
        var candidate = recentered
        while (candidate - lastTarget) * direction <= 0 { candidate += direction * 12 }
        return isInsideWindow(midi: candidate, anchorMIDI: anchorMIDI) ? candidate : recentered
    }

    public static func resolveInterval(first: Int, second: Int, anchorMIDI: Double) -> (Int, Int) {
        let midpoint = Double(first + second) / 2
        let shift = roundedOctaveShift((anchorMIDI - midpoint) / 12) * 12
        return (first + shift, second + shift)
    }

    // Kotlin's roundToInt resolves an exact half toward positive infinity.
    private static func roundedOctaveShift(_ value: Double) -> Int {
        Int(floor(value + 0.5))
    }
}
