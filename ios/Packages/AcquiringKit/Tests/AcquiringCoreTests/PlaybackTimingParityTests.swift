import XCTest
@testable import AcquiringCore

final class PlaybackTimingParityTests: XCTestCase {
    func testAudibleContentOverridesSilentMetadataTailWithoutRounding() {
        XCTAssertEqual(PlaybackTiming.endBeat(metadata: 33, audibleEnds: [23, 25]), 25)
        XCTAssertEqual(PlaybackTiming.endBeat(metadata: 13, audibleEnds: [5, 9.25, .nan]), 9.25)
        XCTAssertEqual(PlaybackTiming.endBeat(metadata: 13, audibleEnds: [17.5]), 17.5)
        XCTAssertEqual(PlaybackTiming.endBeat(metadata: 33, audibleEnds: [.nan, .infinity]), 33)
    }

    func testEventEndNormalizesLegacyZeroAndIgnoresRests() {
        XCTAssertEqual(PlaybackTiming.eventEndBeat(beat: 0, duration: 4), 5)
        let sounding = PlaybackTiming.eventEndBeat(beat: 5, duration: 4)
        let rest = PlaybackTiming.eventEndBeat(beat: 9, duration: 4, isRest: true)
        XCTAssertEqual(PlaybackTiming.endBeat(metadata: 17, audibleEnds: [sounding, rest].compactMap { $0 }), 9)
        XCTAssertNil(rest)
    }

    func testLoopingPositionPreservesExactHeadOvershootAndMultipleLoops() {
        XCTAssertEqual(PlaybackTiming.loopingPosition(tickEndBeat: 25, endBeat: 25), .init(beat: 1, looped: true))
        XCTAssertEqual(PlaybackTiming.loopingPosition(tickEndBeat: 25.25, endBeat: 25), .init(beat: 1.25, looped: true))
        XCTAssertEqual(PlaybackTiming.loopingPosition(tickEndBeat: 49.5, endBeat: 25), .init(beat: 1.5, looped: true))
        XCTAssertEqual(PlaybackTiming.loopingPosition(tickEndBeat: 12.75, endBeat: 25), .init(beat: 12.75, looped: false))
    }

    func testRemainingDurationUsesUnplayedFractionAndCurrentTempo() {
        XCTAssertEqual(PlaybackTiming.remainingMilliseconds(eventEndBeat: 5, currentBeat: 3.5, bpm: 90), 1_000)
        XCTAssertEqual(PlaybackTiming.remainingMilliseconds(eventEndBeat: 5, currentBeat: 3, bpm: 60), 2_000)
        XCTAssertEqual(PlaybackTiming.remainingMilliseconds(eventEndBeat: 5, currentBeat: 3, bpm: 120), 1_000)
        XCTAssertEqual(PlaybackTiming.remainingMilliseconds(eventEndBeat: 4.0001, currentBeat: 4, bpm: 200), 40)
        XCTAssertNil(PlaybackTiming.remainingMilliseconds(eventEndBeat: 5, currentBeat: 3, bpm: 0))
        XCTAssertNil(PlaybackTiming.remainingMilliseconds(eventEndBeat: 5, currentBeat: 5, bpm: 120))
    }

    func testKeyChangesResolveAtEventOnset() {
        let section = ExtractedSection(metadata: [
            "keys": .array([
                .object(["tonic": .string("Bb"), "scale": .string("mixolydian"), "beat": .number(1)]),
                .object(["tonic": .string("C"), "scale": .string("major"), "beat": .number(17)])
            ]),
            "endBeat": .number(32)
        ])
        XCTAssertEqual(section.key(at: 16.5), KeyInfo(tonic: "Bb", scale: "mixolydian"))
        XCTAssertEqual(section.key(at: 17), KeyInfo(tonic: "C", scale: "major"))
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "1", octave: 0, key: section.key(at: 1)), 70)
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "1", octave: 0, key: section.key(at: 17)), 60)
        let chord: [String: JSONValue] = ["root": .number(1), "type": .number(1)]
        XCTAssertEqual(ChordInterpreter.chordNotes(for: chord, key: section.key(at: 1)), [58, 62, 65])
        XCTAssertEqual(ChordInterpreter.chordNotes(for: chord, key: section.key(at: 17)), [48, 52, 55])
    }
}
