import XCTest
@testable import AcquiringAudio

final class ArpeggioTimingTests: XCTestCase {
    func testEveryKnobRateCompletesAllTonesBeforeWrapping() {
        for option in QuizArpeggioOption.allCases where option != .off {
            for toneCount in 2...7 {
                let slotsPerBeat = Double(toneCount) * option.cyclesPerBeat
                for slot in 1...(toneCount * 4) {
                    let beat = Double(slot) / slotsPerBeat
                    let before = QuizPCMRenderer.arpeggioPosition(
                        elapsedBeats: beat - 1e-9, toneCount: toneCount, option: option
                    )
                    let boundary = QuizPCMRenderer.arpeggioPosition(
                        elapsedBeats: beat, toneCount: toneCount, option: option
                    )
                    let after = QuizPCMRenderer.arpeggioPosition(
                        elapsedBeats: beat + 1e-9, toneCount: toneCount, option: option
                    )
                    let context = "\(option), \(toneCount) tones, slot \(slot)"
                    XCTAssertEqual(before.toneIndex, (slot - 1) % toneCount, context)
                    XCTAssertEqual(boundary.toneIndex, slot % toneCount, context)
                    XCTAssertEqual(boundary.progress, 0, accuracy: 1e-12, context)
                    XCTAssertEqual(after.toneIndex, slot % toneCount, context)
                }
            }
        }
    }

    func testCycleBoundaryAfterNonzeroOnsetUsesFirstTone() {
        // At native 150 BPM, a chord starting at 0.8 s completes its first
        // one-beat cycle at 1.2 s. Seconds subtraction rounds below one beat.
        let elapsedBeats = (1.2 - 0.8) * 2.5
        let position = QuizPCMRenderer.arpeggioPosition(
            elapsedBeats: elapsedBeats, toneCount: 3, option: .one
        )
        XCTAssertEqual(position.toneIndex, 0)
        XCTAssertEqual(position.progress, 0, accuracy: 1e-12)
    }
    func testRenderedAudioCompletesEveryToneAtEveryKnobRateAndTempo() {
        let sampleRate = 12_000.0
        for option in QuizArpeggioOption.allCases where option != .off {
            for toneCount in 2...4 {
                for rate in [0.75, 1.0, 1.5] {
                    let frequencies = (0..<toneCount).map { 180.0 * pow(2, Double($0)) }
                    let cycleSeconds = 1 / option.cyclesPerBeat
                    let onset = 0.2
                    let renderer = QuizPCMRenderer(sampleRate: sampleRate)
                    renderer.setSoundConfiguration(QuizSoundConfiguration(
                        waveform: .sine, melodyChordBalance: 0, arpeggioOption: option
                    ))
                    renderer.configure(QuizTimeline(
                        durationSeconds: onset + 2 * cycleSeconds,
                        events: [QuizEvent(
                            onsetSeconds: onset, durationSeconds: 2 * cycleSeconds,
                            frequenciesHz: frequencies, waveform: .sine, channel: .chord
                        )],
                        nativeBeatsPerSecond: 1
                    ))
                    renderer.setPlaybackRate(rate)
                    renderer.play()
                    // Include another cycle after the section loops.
                    let seconds = (2 * onset + 3 * cycleSeconds) / rate
                    var samples = [Float](repeating: 0, count: Int(seconds * sampleRate))
                    samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
                    for cycle in 0..<3 {
                        let cycleStart = (cycle == 2 ? 2 * onset : onset)
                            + Double(cycle) * cycleSeconds
                        for tone in 0..<toneCount {
                            let slotSeconds = cycleSeconds / Double(toneCount)
                            let start = (cycleStart + (Double(tone) + 0.2) * slotSeconds) / rate
                            let end = (cycleStart + (Double(tone) + 0.8) * slotSeconds) / rate
                            let lower = Int(ceil(start * sampleRate))
                            let upper = Int(floor(end * sampleRate))
                            let crossings = (lower + 1..<upper).filter {
                                samples[$0 - 1] <= 0 && samples[$0] > 0
                            }.count
                            let expected = Double(upper - lower) / sampleRate * frequencies[tone]
                            XCTAssertEqual(Double(crossings), expected, accuracy: 1.1,
                                "\(option), \(toneCount) tones, rate \(rate), cycle \(cycle), tone \(tone)")
                        }
                    }
                }
            }
        }
    }

}
