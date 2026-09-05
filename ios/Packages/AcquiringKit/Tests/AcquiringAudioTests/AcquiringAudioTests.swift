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

    func testQuizRendererTempoRatePreservesPositionAndAdvancesFractionally() {
        let renderer = QuizPCMRenderer(sampleRate: 1_000)
        renderer.configure(QuizTimeline(
            durationSeconds: 2,
            events: [QuizEvent(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [100], waveform: .sine)]
        ))
        renderer.play()
        var samples = [Float](repeating: 0, count: 100)

        renderer.setPlaybackRate(0.755)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.progress, 75.5 / 2_000, accuracy: 1e-12)
        XCTAssertEqual(renderer.durationSeconds, 2.0 / 0.755, accuracy: 1e-12)

        let progressBeforeChange = renderer.progress
        renderer.setPlaybackRate(1.25)
        XCTAssertEqual(renderer.progress, progressBeforeChange, accuracy: 1e-12)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.progress, 200.5 / 2_000, accuracy: 1e-12)
        XCTAssertEqual(renderer.durationSeconds, 2.0 / 1.25, accuracy: 1e-12)
    }

    func testQuizRendererTempoChangePreservesSustainedVoiceAgeAndPhase() {
        let timeline = QuizTimeline(
            durationSeconds: 2,
            events: [QuizEvent(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [137], waveform: .marimba)]
        )
        let changed = QuizPCMRenderer(sampleRate: 1_000)
        let reference = QuizPCMRenderer(sampleRate: 1_000)
        changed.configure(timeline)
        reference.configure(timeline)
        changed.play()
        reference.play()
        var leadIn = [Float](repeating: 0, count: 100)
        leadIn.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        leadIn.withUnsafeMutableBufferPointer { reference.render(into: $0) }

        changed.setPlaybackRate(2)
        var changedSamples = [Float](repeating: 0, count: 128)
        var referenceSamples = [Float](repeating: 0, count: 128)
        changedSamples.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        referenceSamples.withUnsafeMutableBufferPointer { reference.render(into: $0) }

        for (changedSample, referenceSample) in zip(changedSamples, referenceSamples) {
            XCTAssertEqual(changedSample, referenceSample, accuracy: 1e-7)
        }
        XCTAssertEqual(changed.currentFrame, 356)
        XCTAssertEqual(reference.currentFrame, 228)
    }

    func testQuizRendererZeroAndPausedRateChangesDoNotMoveTransport() {
        let renderer = QuizPCMRenderer(sampleRate: 1_000)
        renderer.configure(QuizTimeline(
            durationSeconds: 1,
            events: [QuizEvent(onsetSeconds: 0, durationSeconds: 1, frequenciesHz: [100], waveform: .sine)]
        ))
        renderer.seek(progress: 0.25)
        renderer.setPlaybackRate(1.5)
        var samples = [Float](repeating: 1, count: 20)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.phase, .paused)
        XCTAssertEqual(renderer.progress, 0.25, accuracy: 1e-12)
        XCTAssertTrue(samples.allSatisfy { $0 == 0 })

        renderer.play()
        renderer.setPlaybackRate(0)
        samples = [Float](repeating: 1, count: 20)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.progress, 0.25, accuracy: 1e-12)
        XCTAssertTrue(samples.allSatisfy { $0 == 0 })

        renderer.pause()
        renderer.setPlaybackRate(0.5)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.phase, .paused)
        XCTAssertEqual(renderer.progress, 0.25, accuracy: 1e-12)
    }
}
