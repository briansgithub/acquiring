import XCTest
@testable import AcquiringAudio

final class AudioParityTests: XCTestCase {
    private let sampleRate = 44_100.0

    func testStaticBlockAndArpeggioBeginAndEndNearSilence() throws {
        let frequencies = [60, 64, 67].map(midiFrequency)
        let block = try StaticPCMRenderer.render(
            request: PreviewRequest(frequenciesHz: frequencies, duration: .milliseconds(450), waveform: .sine),
            sampleRate: sampleRate
        )
        XCTAssertLessThan(abs(block.first ?? 1), 0.01)
        XCTAssertLessThan(abs(block.last ?? 1), 0.01)

        let arpeggio = try StaticPCMRenderer.render(
            request: PreviewRequest(
                frequenciesHz: frequencies,
                duration: .milliseconds(450),
                arpeggiates: true,
                arpeggioStep: .milliseconds(70),
                waveform: .sine
            ),
            sampleRate: sampleRate
        )
        let stepSamples = Int(sampleRate * 0.07)
        XCTAssertEqual(arpeggio.count % stepSamples, 0)
        XCTAssertLessThan(abs(arpeggio.last ?? 1), 0.01)
        XCTAssertLessThan(maximumSlew(arpeggio), 0.15)
    }

    func testStaticPreviewHasHeadroomForExtendedDefaultChord() throws {
        for noteCount in 1...7 {
            let midi = Array([48, 52, 55, 58, 62, 65, 69].prefix(noteCount))
            let samples = try StaticPCMRenderer.render(
                request: PreviewRequest(
                    frequenciesHz: midi.map(midiFrequency),
                    duration: .milliseconds(450),
                    waveform: .sawtooth
                ),
                sampleRate: sampleRate
            )
            XCTAssertFalse(samples.contains { abs($0) >= 1 }, "\(noteCount)-note chord clipped")
        }
    }

    func testStaticGainIsRenderedIntoSamples() throws {
        let frequencies = [60, 64, 67].map(midiFrequency)
        func peak(_ gain: Float) throws -> Float {
            let samples = try StaticPCMRenderer.render(
                request: PreviewRequest(
                    frequenciesHz: frequencies,
                    duration: .milliseconds(450),
                    waveform: .sine,
                    gain: gain
                ),
                sampleRate: sampleRate
            )
            return samples.map { abs($0) }.max() ?? 0
        }
        let full = try peak(1)
        XCTAssertGreaterThan(full, 0.03)
        XCTAssertEqual(try peak(0.5), full / 2, accuracy: 0.0001)
        XCTAssertEqual(try peak(0), 0)
    }

    func testStaticPreviewCapsHugeDurationsAndRejectsInvalidOutputRates() throws {
        let samples = try StaticPCMRenderer.render(
            request: PreviewRequest(frequenciesHz: [440], duration: .seconds(1_000_000_000_000_000)),
            sampleRate: 8_000
        )
        XCTAssertEqual(samples.count, 8_000 * 30)
        XCTAssertThrowsError(try StaticPCMRenderer.render(
            request: PreviewRequest(frequenciesHz: [440]),
            sampleRate: .infinity
        ))
        XCTAssertThrowsError(try StaticPCMRenderer.render(
            request: PreviewRequest(frequenciesHz: [440]),
            sampleRate: 1_000_000
        ))
    }

    func testStaticPreviewHonorsCancellationBeforeSynthesis() {
        XCTAssertThrowsError(try StaticPCMRenderer.render(
            request: PreviewRequest(frequenciesHz: [440], duration: .seconds(1)),
            sampleRate: sampleRate,
            shouldCancel: { true }
        )) { error in
            XCTAssertTrue(error is CancellationError)
        }
    }

    func testLoopSeamAndBalanceHaveHeadroom() {
        for balance in stride(from: Float(0), through: 1, by: 0.25) {
            let renderer = QuizPCMRenderer(sampleRate: sampleRate)
            renderer.configure(QuizTimeline(
                durationSeconds: 1,
                events: [
                    QuizEvent(
                        onsetSeconds: 0,
                        durationSeconds: 1,
                        frequenciesHz: [midiFrequency(72)],
                        waveform: .sine,
                        gain: balance
                    ),
                    QuizEvent(
                        onsetSeconds: 0,
                        durationSeconds: 1,
                        frequenciesHz: [48, 52, 55, 58, 62].map(midiFrequency),
                        waveform: .sine,
                        gain: 1 - balance
                    )
                ]
            ))
            renderer.play()
            var samples = [Float](repeating: 0, count: Int(sampleRate * 1.1))
            samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
            XCTAssertFalse(samples.contains { abs($0) >= 1 }, "balance \(balance) clipped")
            let seam = Array(samples[(Int(sampleRate) - 512)..<(Int(sampleRate) + 512)])
            XCTAssertLessThan(maximumSlew(seam), 0.15)
        }
    }

    func testRendererSeekToEndStaysAtEndUntilPlaybackResumes() {
        let renderer = QuizPCMRenderer(sampleRate: 1_000)
        renderer.configure(QuizTimeline(
            durationSeconds: 3,
            events: [QuizEvent(onsetSeconds: 0, durationSeconds: 3, frequenciesHz: [100], waveform: .sine)]
        ))
        renderer.seek(progress: 1)
        XCTAssertEqual(renderer.progress, 1)
        var paused = [Float](repeating: 1, count: 4)
        paused.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.progress, 1)
        XCTAssertTrue(paused.allSatisfy { $0 == 0 })
        renderer.play()
        var resumed = [Float](repeating: 0, count: 1)
        resumed.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.currentFrame, 1)
    }

    func testRendererEmitsDenseAndSimultaneousOnsetsAtTheirFrames() {
        let renderer = QuizPCMRenderer(sampleRate: 1_000)
        renderer.configure(QuizTimeline(
            durationSeconds: 1,
            events: [
                QuizEvent(onsetSeconds: 0.1, durationSeconds: 0.2, frequenciesHz: [100], waveform: .sine),
                QuizEvent(onsetSeconds: 0.1, durationSeconds: 0.4, frequenciesHz: [125], waveform: .sine),
                QuizEvent(onsetSeconds: 0.25, durationSeconds: 0.1, frequenciesHz: [150], waveform: .sine)
            ]
        ))
        renderer.play()
        var samples = [Float](repeating: 0, count: 400)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(samples[..<100].allSatisfy { $0 == 0 })
        XCTAssertTrue(samples[101..<250].contains { abs($0) > 0.01 })
        XCTAssertTrue(samples[251..<350].contains { abs($0) > 0.01 })
        XCTAssertTrue(samples[350...].contains { abs($0) > 0.01 })
    }

    private func maximumSlew(_ samples: [Float]) -> Float {
        zip(samples, samples.dropFirst()).map { abs($1 - $0) }.max() ?? 0
    }

    private func midiFrequency(_ midi: Int) -> Double {
        440 * pow(2, (Double(midi) - 69) / 12)
    }
}
