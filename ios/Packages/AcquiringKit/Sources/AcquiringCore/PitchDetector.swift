import Foundation

public struct PitchEstimate: Equatable, Sendable {
    public let frequencyHz: Double
    public let confidence: Double
    public let rms: Double

    public init(frequencyHz: Double, confidence: Double, rms: Double) {
        self.frequencyHz = frequencyHz
        self.confidence = confidence
        self.rms = rms
    }
}

public enum PitchDetector {
    public static func estimate(
        samples: [Int16],
        sampleRate: Int,
        threshold: Double = 0.15,
        minimumFrequency: Double = 65,
        maximumFrequency: Double = 1_000
    ) -> PitchEstimate {
        guard samples.count >= 4, sampleRate > 0 else {
            return PitchEstimate(frequencyHz: 0, confidence: 0, rms: 0)
        }
        let windowSize = samples.count / 2
        let normalized = samples.map { Double($0) / 32_768 }
        let rms = sqrt(normalized.reduce(0) { $0 + $1 * $1 } / Double(normalized.count))
        let maximumTau = min(Int(Double(sampleRate) / minimumFrequency), windowSize - 2)
        let minimumTau = max(Int(Double(sampleRate) / maximumFrequency), 1)
        guard maximumTau >= minimumTau else {
            return PitchEstimate(frequencyHz: 0, confidence: 0, rms: rms)
        }
        let searchLimit = maximumTau + 1
        var yin = Array(repeating: 0.0, count: windowSize)
        for tau in 0...searchLimit {
            var difference = 0.0
            for index in 0..<windowSize {
                let delta = normalized[index] - normalized[index + tau]
                difference += delta * delta
            }
            yin[tau] = difference
        }
        yin[0] = 1
        var runningSum = 0.0
        for tau in 1...searchLimit {
            runningSum += yin[tau]
            // Android's zero-energy YIN buffer never selects a lag. Return that
            // same explicit no-detection result instead of a zero-confidence
            // in-range frequency chosen only because every normalized value tied.
            guard runningSum > 0 else {
                return PitchEstimate(frequencyHz: 0, confidence: 0, rms: rms)
            }
            yin[tau] = yin[tau] * Double(tau) / runningSum
        }

        var bestTau: Int?
        for tau in minimumTau...maximumTau where yin[tau] < threshold {
            var candidate = tau
            while candidate + 1 <= maximumTau && yin[candidate + 1] < yin[candidate] {
                candidate += 1
            }
            bestTau = candidate
            break
        }
        if bestTau == nil {
            bestTau = (minimumTau...maximumTau).min(by: { yin[$0] < yin[$1] })
        }
        guard let bestTau else { return PitchEstimate(frequencyHz: 0, confidence: 0, rms: rms) }

        var refinedTau = Double(bestTau)
        if bestTau > 0, bestTau < searchLimit {
            let previous = yin[bestTau - 1]
            let current = yin[bestTau]
            let next = yin[bestTau + 1]
            let denominator = next - 2 * current + previous
            if denominator > 1e-6 {
                refinedTau += (previous - next) / (2 * denominator)
            }
        }
        let frequency = Double(sampleRate) / refinedTau
        return PitchEstimate(
            frequencyHz: (minimumFrequency...maximumFrequency).contains(frequency) ? frequency : 0,
            confidence: 1 - min(max(yin[bestTau], 0), 1),
            rms: rms
        )
    }
}
