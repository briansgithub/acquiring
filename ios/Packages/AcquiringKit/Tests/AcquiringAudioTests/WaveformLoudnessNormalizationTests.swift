import XCTest
@testable import AcquiringAudio

final class WaveformLoudnessNormalizationTests: XCTestCase {
    private let sampleRate = 48_000.0
    private let referenceMIDI = [48, 55, 60, 64, 69, 72]
    private let extendedChordMIDI = [48, 52, 55, 58, 62, 65, 69]

    func testEveryNormalizedWaveformHasComparableAWeightedLoudness() throws {
        for waveform in SynthWaveform.allCases {
            let durationMilliseconds = referenceDurationMilliseconds(for: waveform)
            let referenceLevel = try referenceLevelDB(
                for: .sine,
                durationMilliseconds: durationMilliseconds
            )
            let difference = try referenceLevelDB(
                for: waveform,
                durationMilliseconds: durationMilliseconds
            ) - referenceLevel
            XCTAssertEqual(
                difference,
                0,
                accuracy: 1.5,
                "\(waveform) differs from sine by \(difference) dB"
            )
        }
    }

    func testEveryNormalizedWaveformHasHeadroomInStaticAndStreamingRenderers() throws {
        for transposition in [-12, 0, 12] {
            let frequencies = extendedChordMIDI.map { midiFrequency($0 + transposition) }
            for waveform in SynthWaveform.allCases {
                let block = try StaticPCMRenderer.render(
                    request: PreviewRequest(
                        frequenciesHz: frequencies,
                        duration: .milliseconds(450),
                        waveform: waveform
                    ),
                    sampleRate: sampleRate
                )
                assertFiniteHeadroom(
                    block,
                    waveform: waveform,
                    mode: "static block at \(transposition) semitones"
                )

                let arpeggio = try StaticPCMRenderer.render(
                    request: PreviewRequest(
                        frequenciesHz: frequencies,
                        duration: .milliseconds(450),
                        arpeggiates: true,
                        arpeggioStep: .milliseconds(160),
                        waveform: waveform
                    ),
                    sampleRate: sampleRate
                )
                assertFiniteHeadroom(
                    arpeggio,
                    waveform: waveform,
                    mode: "static arpeggio at \(transposition) semitones"
                )

                let renderer = QuizPCMRenderer(sampleRate: sampleRate)
                renderer.configure(QuizTimeline(
                    durationSeconds: 0.45,
                    events: [QuizEvent(
                        onsetSeconds: 0,
                        durationSeconds: 0.45,
                        frequenciesHz: frequencies,
                        waveform: waveform,
                        channel: .chord
                    )]
                ))
                renderer.play()
                var streamed = [Float](repeating: 0, count: Int(sampleRate * 0.45))
                streamed.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
                assertFiniteHeadroom(
                    streamed,
                    waveform: waveform,
                    mode: "streaming block at \(transposition) semitones"
                )
            }
        }
    }

    private func referenceDurationMilliseconds(for waveform: SynthWaveform) -> Int64 {
        switch waveform {
        case .strings, .marimba: 100
        default: 300
        }
    }

    private func referenceLevelDB(
        for waveform: SynthWaveform,
        durationMilliseconds: Int64
    ) throws -> Double {
        let logLevels = try referenceMIDI.map { midi -> Double in
            let samples = try StaticPCMRenderer.render(
                request: PreviewRequest(
                    frequenciesHz: [midiFrequency(midi)],
                    duration: .milliseconds(durationMilliseconds),
                    waveform: waveform
                ),
                sampleRate: sampleRate
            )
            return log(max(aWeightedRMS(samples), .leastNonzeroMagnitude))
        }
        let geometricMeanRMS = exp(logLevels.reduce(0, +) / Double(logLevels.count))
        return 20 * log10(geometricMeanRMS)
    }

    private func aWeightedRMS(_ samples: [Float]) -> Double {
        let coefficients: [(b0: Double, b1: Double, b2: Double, a1: Double, a2: Double)] = [
            (0.23430179229951348, 0.46860358459902696, 0.23430179229951348, -0.22455845805977914, 0.012606625271546396),
            (1, -2, 1, -1.8938704947230707, 0.8951597690946617),
            (1, -2, 1, -1.9946144559930215, 0.9946217070140843)
        ]
        var states = Array(repeating: (x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0), count: coefficients.count)
        var sumSquares = 0.0
        for sample in samples {
            var value = Double(sample)
            for index in coefficients.indices {
                let coefficient = coefficients[index]
                let state = states[index]
                let output = coefficient.b0 * value + coefficient.b1 * state.x1
                    + coefficient.b2 * state.x2 - coefficient.a1 * state.y1
                    - coefficient.a2 * state.y2
                states[index] = (value, state.x1, output, state.y1)
                value = output
            }
            sumSquares += value * value
        }
        return sqrt(sumSquares / Double(samples.count))
    }

    private func assertFiniteHeadroom(
        _ samples: [Float],
        waveform: SynthWaveform,
        mode: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(
            samples.allSatisfy(\.isFinite),
            "\(waveform) produced non-finite \(mode) PCM",
            file: file,
            line: line
        )
        XCTAssertLessThan(
            samples.lazy.map { abs($0) }.max() ?? 0,
            1,
            "\(waveform) clipped in \(mode)",
            file: file,
            line: line
        )
    }

    private func midiFrequency(_ midi: Int) -> Double {
        440 * pow(2, (Double(midi) - 69) / 12)
    }
}
