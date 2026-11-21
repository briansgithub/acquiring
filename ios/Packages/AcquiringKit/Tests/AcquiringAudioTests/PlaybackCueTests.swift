import XCTest
@testable import AcquiringAudio

final class PlaybackCueTests: XCTestCase {
    func testNativePulseCountsAndIndependentMajorReference() {
        for degree in 1...7 {
            let context = PlaybackCueContext(rootDegree: degree, fifthsFromTonic: degree - 1)
            XCTAssertEqual(context.pulseCount(cue: .rootPulses, majorLocked: false), degree == 1 ? 0 : degree)
            XCTAssertEqual(context.pulseCount(cue: .harmonicDistance, majorLocked: false), degree == 1 ? 0 : degree)
        }
        let chorus = PlaybackCueContext(rootDegree: 1, majorDegree: 1, fifthsFromTonic: 0, fifthsFromMajorTonic: 0)
        XCTAssertEqual(chorus.pulseCount(cue: .harmonicDistance, majorLocked: true), 0)
        let subtonic = PlaybackCueContext(rootDegree: 7, majorDegree: 7, majorAlteration: -1,
                                          fifthsFromTonic: 2, fifthsFromMajorTonic: 2)
        XCTAssertEqual(subtonic.pulseCount(cue: .harmonicDistance, majorLocked: true), 3)
    }

    func testPulseReplacesChordAndSuppressesArpeggioButKeepsMelody() {
        let renderer = QuizPCMRenderer(sampleRate: 24_000)
        renderer.setSoundConfiguration(.init(waveform: .sine, arpeggioOption: .four, cue: .rootPulses))
        renderer.configure(.init(durationSeconds: 2, events: [
            .init(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [220, 330, 440], waveform: .sine,
                  channel: .chord, rootFrequencyHz: 220, cueContext: .init(rootDegree: 2)),
            .init(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [660], waveform: .sine)
        ]))
        XCTAssertEqual(renderer.preparedVoiceFrequenciesForTesting, [[], [660]])
        renderer.play()
        var samples = [Float](repeating: 0, count: 22_000)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        // At 0.9 seconds the first pulse is silent, while melody is still audible.
        XCTAssertGreaterThan(samples[21_600..<21_700].map { abs($0) }.max()!, 0.001)
    }

    func testPulseTailIsSilentAndNextPulseRetriggers() {
        let renderer = QuizPCMRenderer(sampleRate: 24_000)
        renderer.setSoundConfiguration(.init(waveform: .sine, melodyChordBalance: 0, cue: .rootPulses))
        renderer.configure(.init(durationSeconds: 2, events: [
            .init(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [220, 330], waveform: .sine,
                  channel: .chord, rootFrequencyHz: 220, cueContext: .init(rootDegree: 2))
        ]))
        renderer.play()
        var samples = [Float](repeating: 0, count: 28_000)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(samples[20_000..<23_900].allSatisfy { $0 == 0 })
        XCTAssertGreaterThan(samples[26_000..<27_000].map { abs($0) }.max()!, 0.01)
        let age = renderer.preparedEventAgesForTesting
        renderer.setSoundConfiguration(.init(waveform: .sine, melodyChordBalance: 0.4, cue: .rootPulses))
        XCTAssertEqual(renderer.preparedEventAgesForTesting, age)
    }

    func testMainlineGainAndModeWindow() {
        XCTAssertEqual(QuizSoundConfiguration().voiceVolume, 0.5)
        XCTAssertEqual(QuizSoundConfiguration(voiceVolume: 9).voiceVolume, 1)
        XCTAssertEqual(PlaybackCueMath.voiceMaximumGain, 1.4)
        for sample in [-0.85, -0.4, 0, 0.4, 0.85] { XCTAssertEqual(PlaybackCueMath.softLimit(sample), sample) }
        XCTAssertEqual(PlaybackCueMath.softLimit(1), 0.85 + 0.15 * tanh(1), accuracy: 1e-14)
        XCTAssertEqual(PlaybackCueMath.softLimit(-2), -PlaybackCueMath.softLimit(2))
        XCTAssertEqual(PlaybackCueMath.modeWindow(hostStart: 1, hostEnd: 5, nextStart: 6,
                                                 sampleCount: 24_000, samplesPerBeat: 12_000), 3...5)
        XCTAssertNil(PlaybackCueMath.modeWindow(hostStart: 5, hostEnd: 5, nextStart: 6,
                                               sampleCount: 24_000, samplesPerBeat: 12_000))
        XCTAssertEqual(PlaybackCueMath.keyTonicMidi(72), 48)
        XCTAssertEqual(PlaybackCueMath.samplePitch(60), 48)
    }
}
