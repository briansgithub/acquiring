import XCTest
@testable import AcquiringAudio

final class AcquiringAudioTests: XCTestCase {
    func testEveryWaveformRendersFiniteBoundedSamples() throws {
        for waveform in SynthWaveform.allCases {
            let samples = try StaticPCMRenderer.render(
                request: PreviewRequest(frequenciesHz: [220, 277.18, 329.63], duration: .milliseconds(100), waveform: waveform),
                sampleRate: 48_000
            )
            XCTAssertEqual(samples.count, 4_800)
            XCTAssertTrue(samples.allSatisfy { $0.isFinite && (-1...1).contains($0) })
            XCTAssertEqual(samples.first, 0)
        }
    }

    func testArpeggioEndsOnSlotBoundary() throws {
        let samples = try StaticPCMRenderer.render(
            request: PreviewRequest(
                frequenciesHz: [220, 330, 440],
                duration: .seconds(2),
                arpeggiates: true,
                arpeggioStep: .milliseconds(100)
            ),
            sampleRate: 48_000
        )
        XCTAssertEqual(samples.count, 3 * 4_800)
    }

    func testPitchSmootherRejectsSingleOctaveSpike() {
        var smoother = PitchSmoother(targetMIDI: 69)
        XCTAssertNil(smoother.accept(midi: 69, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 69.1, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 68.9, confidence: 0.9))
        XCTAssertNotNil(smoother.accept(midi: 69, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 81, confidence: 0.9))
        XCTAssertEqual(smoother.setTarget(70)?.centsError ?? 0, -100, accuracy: 5)
    }

    func testQuizRendererHonorsOnsetPauseSeekAndLoop() {
        let renderer = QuizPCMRenderer(sampleRate: 1_000)
        renderer.configure(QuizTimeline(
            durationSeconds: 1,
            events: [QuizEvent(onsetSeconds: 0.25, durationSeconds: 0.25, frequenciesHz: [100], waveform: .sine)]
        ))
        var samples = [Float](repeating: 1, count: 1_000)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(samples.allSatisfy { $0 == 0 })
        renderer.play()
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(samples.prefix(250).allSatisfy { $0 == 0 })
        XCTAssertTrue(samples[250..<500].contains { abs($0) > 0.01 })
        XCTAssertTrue(samples.suffix(500).allSatisfy { $0 == 0 })
        XCTAssertEqual(renderer.currentFrame, 0)
        renderer.seek(progress: 0.25)
        renderer.pause()
        var paused = [Float](repeating: 1, count: 32)
        paused.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(paused.allSatisfy { $0 == 0 })
    }

    func testQuizRendererReportsTransportProgress() {
        let renderer = QuizPCMRenderer(sampleRate: 100)
        renderer.configure(QuizTimeline(
            durationSeconds: 2,
            events: [QuizEvent(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [25], waveform: .sine)]
        ))
        renderer.play()
        var samples = [Float](repeating: 0, count: 50)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.durationSeconds, 2, accuracy: 0.001)
        XCTAssertEqual(renderer.progress, 0.25, accuracy: 0.001)
    }
}
