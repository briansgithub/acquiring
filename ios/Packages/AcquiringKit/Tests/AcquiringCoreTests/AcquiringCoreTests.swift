import XCTest
@testable import AcquiringCore

final class AcquiringCoreTests: XCTestCase {
    func testYINFindsConcertA() {
        let sampleRate = 16_000
        let samples = (0..<2_048).map { index in
            Int16(sin(2 * Double.pi * 440 * Double(index) / Double(sampleRate)) * Double(Int16.max) * 0.5)
        }
        let estimate = PitchDetector.estimate(samples: samples, sampleRate: sampleRate)
        XCTAssertEqual(estimate.frequencyHz, 440, accuracy: 1)
        XCTAssertGreaterThan(estimate.confidence, 0.9)
    }

    func testTessituraMovesAnIntervalAsAUnit() {
        let result = TessituraResolver.resolveInterval(first: 48, second: 67, anchorMIDI: 60)
        XCTAssertEqual(result.1 - result.0, 19)
        XCTAssertEqual(result.0, 48)
    }

    func testSectionOrderingUsesExplicitIndexesAndDeduplicatesTypes() {
        let sections = [
            "chorus-old": ExtractedSection(sectionName: "Chorus", sectionIndex: 3),
            "verse": ExtractedSection(sectionName: "Verse 1", sectionIndex: 1),
            "chorus": ExtractedSection(sectionName: "Chorus", sectionIndex: 2)
        ]
        XCTAssertEqual(SectionOrdering.ordered(sections).map(\.key), ["verse", "chorus"])
    }

    func testMusicTheoryIgnoresNonDegreeCharactersLikeAndroid() {
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "degree-1", octave: 0, key: KeyInfo(tonic: "C", scale: "major")), 60)
    }

    func testSpelledIntervalsPreserveGenericDistanceAndMeasuredDirection() throws {
        let c4 = try XCTUnwrap(SpelledPitch.parse(noteName: "C", octave: 4))
        let sharpF4 = try XCTUnwrap(SpelledPitch.parse(noteName: "F#", octave: 4))
        XCTAssertEqual(IntervalAnalysis.named(from: c4, to: sharpF4).shorthand, "A4 ↑")
        XCTAssertEqual(IntervalAnalysis.measured(fromMIDI: 60.1, toMIDI: 66.2).shorthand, "d5 ↑")
        XCTAssertEqual(IntervalAnalysis.measured(fromMIDI: 72, toMIDI: 60).shorthand, "P8 ↓")
    }

    func testPlaybackTimingUsesAudibleEndAndWrapsOvershoot() {
        XCTAssertEqual(PlaybackTiming.endBeat(metadata: 40, audibleEnds: [5, 9]), 9)
        XCTAssertEqual(PlaybackTiming.loopingPosition(tickEndBeat: 9.25, endBeat: 9), .init(beat: 1.25, looped: true))
        XCTAssertEqual(PlaybackTiming.remainingMilliseconds(eventEndBeat: 2, currentBeat: 1.5, bpm: 120), 250)
    }

    func testComfortablePitchCapturePausesThenRestartsAfterDropout() {
        var capture = ComfortablePitchCapture(captureMilliseconds: 300, sampleWindowMilliseconds: 200, dropoutGraceMilliseconds: 100)
        XCTAssertFalse(capture.observe(elapsedMilliseconds: 100, midi: 60).isComplete)
        _ = capture.observe(elapsedMilliseconds: 50, midi: nil)
        XCTAssertTrue(capture.progress.hasSignal)
        _ = capture.observe(elapsedMilliseconds: 100, midi: nil)
        XCTAssertFalse(capture.progress.hasSignal)
        _ = capture.observe(elapsedMilliseconds: 100, midi: 62)
        _ = capture.observe(elapsedMilliseconds: 100, midi: 62)
        XCTAssertTrue(capture.observe(elapsedMilliseconds: 100, midi: 62).isComplete)
        XCTAssertEqual(capture.averageMIDI, 62)
    }

    func testSectionDecodesArrayAndNamedMelodyPayloads() {
        let note: JSONValue = .object([
            "sd": .string("#4"),
            "beat": .number(2),
            "duration": .number(0.5),
            "octave": .number(1),
            "rest": .bool(false)
        ])
        let direct = ExtractedSection(notes: .array([note]))
        let named = ExtractedSection(notes: .object(["melody1": .array([note])]))
        XCTAssertEqual(direct.melodyNotes, named.melodyNotes)
        XCTAssertEqual(direct.melodyNotes.first, MelodyNote(sd: "#4", beat: 2, duration: 0.5, octave: 1))
    }
}
