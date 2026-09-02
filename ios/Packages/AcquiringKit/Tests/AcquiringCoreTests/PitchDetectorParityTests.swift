import XCTest
@testable import AcquiringCore

final class PitchDetectorParityTests: XCTestCase {
    private let sampleRate = 16_000
    private let length = 2_048

    func testReferenceLowAndHighTonesAreWithinFiveCents() {
        for frequency in [82.41, 440.0] {
            assertDetection(sine(frequency), expected: frequency, toleranceCents: 5)
        }
    }

    func testFastWindowDetectsRepresentativeVocalTones() {
        for frequency in [82.41, 110, 220, 440, 587.33] {
            assertDetection(sine(frequency, length: 1_024), expected: frequency, toleranceCents: 8)
            assertDetection(harmonic(frequency, partials: 6, length: 1_024), expected: frequency, toleranceCents: 8)
        }
    }

    func testPureSineSweepAcrossVocalRange() {
        for frequency in stride(from: 80.0, through: 600, by: 20) {
            for phase in [0.0, 1.1, 2.4] {
                assertDetection(sine(frequency, phase: phase), expected: frequency, toleranceCents: 5)
            }
        }
    }

    func testHarmonicRichTonesAvoidOctaveErrors() {
        for frequency in [80, 110, 165, 220, 330, 440, 587.33] {
            for partials in [4, 8] {
                for phase in [0.0, 1.1] {
                    assertDetection(
                        harmonic(frequency, partials: partials, phase: phase),
                        expected: frequency,
                        toleranceCents: 5
                    )
                }
            }
        }
    }

    func testSilenceAndDeterministicWhiteNoiseFailConfidenceGate() {
        let silence = PitchDetector.estimate(samples: [Int16](repeating: 0, count: length), sampleRate: sampleRate)
        XCTAssertEqual(silence.rms, 0, accuracy: 1e-9)
        XCTAssertLessThan(silence.confidence, 0.4)

        var generator = DeterministicNoise(seed: 20_240_811)
        for _ in 0..<12 {
            let noise = (0..<length).map { _ in
                Int16(clamping: Int(generator.gaussian() * 3_000))
            }
            let estimate = PitchDetector.estimate(samples: noise, sampleRate: sampleRate)
            XCTAssertLessThan(estimate.confidence, 0.4)
        }
    }

    func testSignalReportsRMSAndInvalidInputReturnsNoDetection() {
        XCTAssertGreaterThan(PitchDetector.estimate(samples: sine(220), sampleRate: sampleRate).rms, 0.5)
        XCTAssertEqual(PitchDetector.estimate(samples: [], sampleRate: sampleRate), .init(frequencyHz: 0, confidence: 0, rms: 0))
        XCTAssertEqual(PitchDetector.estimate(samples: [1, 2, 3, 4], sampleRate: 0), .init(frequencyHz: 0, confidence: 0, rms: 0))
    }

    func testComfortablePitchCaptureMatchesCountdownDropoutAndFinalWindowRules() {
        var silent = ComfortablePitchCapture()
        for _ in 0..<20 { _ = silent.observe(elapsedMilliseconds: 100, midi: nil) }
        XCTAssertEqual(silent.progress.remainingMilliseconds, 3_000)
        XCTAssertFalse(silent.progress.hasSignal)
        XCTAssertNil(silent.averageMIDI)

        var successful = ComfortablePitchCapture()
        _ = successful.observe(elapsedMilliseconds: 500, midi: 50)
        _ = successful.observe(elapsedMilliseconds: 500, midi: 52)
        _ = successful.observe(elapsedMilliseconds: 1_000, midi: 60)
        let completed = successful.observe(elapsedMilliseconds: 1_000, midi: 64)
        XCTAssertTrue(completed.isComplete)
        XCTAssertEqual(successful.averageMIDI ?? 0, (52 + 60 + 64) / 3, accuracy: 0.0001)

        var dropout = ComfortablePitchCapture()
        _ = dropout.observe(elapsedMilliseconds: 500, midi: 60)
        XCTAssertEqual(dropout.observe(elapsedMilliseconds: 500, midi: nil).remainingMilliseconds, 2_500)
        XCTAssertEqual(dropout.observe(elapsedMilliseconds: 500, midi: 61).remainingMilliseconds, 2_000)
        _ = dropout.observe(elapsedMilliseconds: 1_001, midi: nil)
        XCTAssertEqual(dropout.progress.remainingMilliseconds, 3_000)
        XCTAssertFalse(dropout.progress.hasSignal)
        XCTAssertNil(dropout.averageMIDI)
    }

    private func assertDetection(
        _ signal: [Int16],
        expected: Double,
        toleranceCents: Double,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let estimate = PitchDetector.estimate(samples: signal, sampleRate: sampleRate)
        XCTAssertGreaterThan(estimate.frequencyHz, 0, file: file, line: line)
        let error = abs(1_200 * log2(estimate.frequencyHz / expected))
        XCTAssertLessThanOrEqual(
            error,
            toleranceCents,
            "\(expected) Hz detected as \(estimate.frequencyHz) Hz (\(error) cents)",
            file: file,
            line: line
        )
        XCTAssertLessThan(error, 600, "octave error", file: file, line: line)
    }

    private func sine(_ frequency: Double, phase: Double = 0, length requestedLength: Int? = nil) -> [Int16] {
        let count = requestedLength ?? length
        return (0..<count).map { index in
            Int16(sin(2 * Double.pi * frequency * Double(index) / Double(sampleRate) + phase) * Double(Int16.max))
        }
    }

    private func harmonic(
        _ frequency: Double,
        partials: Int,
        phase: Double = 0,
        length requestedLength: Int? = nil
    ) -> [Int16] {
        let count = requestedLength ?? length
        let raw = (0..<count).map { index -> Double in
            var sample = 0.0
            for partial in 1...partials where Double(partial) * frequency < Double(sampleRate) / 2 {
                sample += (1 / Double(partial)) * sin(
                    2 * Double.pi * Double(partial) * frequency * Double(index) / Double(sampleRate)
                        + phase * Double(partial) * 0.7
                )
            }
            return sample
        }
        let peak = raw.map(abs).max() ?? 1
        return raw.map { Int16($0 / peak * 26_000) }
    }
}

private struct DeterministicNoise {
    private var state: UInt64
    private var spare: Double?

    init(seed: UInt64) { state = seed }

    mutating func gaussian() -> Double {
        if let spare {
            self.spare = nil
            return spare
        }
        let first = max(unit(), Double.leastNonzeroMagnitude)
        let second = unit()
        let magnitude = sqrt(-2 * log(first))
        spare = magnitude * sin(2 * Double.pi * second)
        return magnitude * cos(2 * Double.pi * second)
    }

    private mutating func unit() -> Double {
        state = state &* 6_364_136_223_846_793_005 &+ 1
        return Double(state >> 11) / Double(UInt64.max >> 11)
    }
}
