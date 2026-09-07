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

    // The projection behind the melody timeline's playhead and behind persistent practice's
    // choice of which note to score. Both read these, so a disagreement here would put the
    // marker on one note while the score was banked against another.

    func testWrappedBeatFoldsBothOvershootAndUnderrunIntoOnePass() {
        // One pass of a 16-beat section starting at beat 1 spans [1, 17).
        XCTAssertEqual(PlaybackTiming.wrappedBeat(1, span: 16), 1)
        XCTAssertEqual(PlaybackTiming.wrappedBeat(16.5, span: 16), 16.5)
        // A beat past the end lands the same distance past the start, not at the end.
        XCTAssertEqual(PlaybackTiming.wrappedBeat(17, span: 16), 1)
        XCTAssertEqual(PlaybackTiming.wrappedBeat(20, span: 16), 4)
        // Two full loops of overshoot still resolve inside one pass.
        XCTAssertEqual(PlaybackTiming.wrappedBeat(36, span: 16), 4)
        // Scrubbing backwards past the start wraps to the tail rather than clamping.
        XCTAssertEqual(PlaybackTiming.wrappedBeat(-3, span: 16), 13)
    }

    func testWrappedBeatFallsBackToTheStartWhenThereIsNoPassToFoldInto() {
        XCTAssertEqual(PlaybackTiming.wrappedBeat(9, span: 0), PlaybackTiming.firstBeat)
        XCTAssertEqual(PlaybackTiming.wrappedBeat(9, span: -4), PlaybackTiming.firstBeat)
        XCTAssertEqual(PlaybackTiming.wrappedBeat(.nan, span: 16), PlaybackTiming.firstBeat)
        XCTAssertEqual(PlaybackTiming.wrappedBeat(.infinity, span: 16), PlaybackTiming.firstBeat)
    }

    func testCircularDeltaTakesTheShorterWayRoundTheLoop() {
        XCTAssertEqual(PlaybackTiming.circularDelta(from: 4, to: 6, span: 16), 2)
        XCTAssertEqual(PlaybackTiming.circularDelta(from: 6, to: 4, span: 16), -2)
        // A projection that has just run past the end is barely ahead of a sample taken just
        // after the wrap - not a whole section behind it, which would read as a huge drift
        // and snap the playhead every time a section looped.
        XCTAssertEqual(PlaybackTiming.circularDelta(from: 16.5, to: 1.5, span: 16), 1)
        XCTAssertEqual(PlaybackTiming.circularDelta(from: 1.5, to: 16.5, span: 16), -1)
        // Exactly half a loop apart resolves forward rather than oscillating.
        XCTAssertEqual(PlaybackTiming.circularDelta(from: 1, to: 9, span: 16), 8)
    }

    func testCircularDeltaIsAPlainDifferenceWithoutALoop() {
        XCTAssertEqual(PlaybackTiming.circularDelta(from: 4, to: 9, span: 0), 5)
    }
}
