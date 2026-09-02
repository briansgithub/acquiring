import XCTest
@testable import AcquiringCore

final class VocalTargetParityTests: XCTestCase {
    func testManualTransposeIsAppliedExactlyOnce() {
        let target = SingingTargetNote(sourceMIDI: 60, scaleDegreeLabel: "1\u{0302}")
        XCTAssertEqual(target.effectiveTargetMIDI(transpose: 1, comfortablePitchMIDI: 73), 73)
        XCTAssertEqual(target.playbackMIDIInput(transpose: 1, comfortablePitchMIDI: 73), 72)
        XCTAssertEqual(target.effectiveTargetMIDI(transpose: 2, comfortablePitchMIDI: nil), 62)
        XCTAssertEqual(target.playbackMIDIInput(transpose: 2, comfortablePitchMIDI: nil), 60)
    }

    func testContinuityAndIntervalRequestsPreserveContour() {
        let target = SingingTargetNote(sourceMIDI: 72, scaleDegreeLabel: "1\u{0302}")
        XCTAssertEqual(target.effectiveTargetMIDI(
            transpose: 0,
            comfortablePitchMIDI: 60,
            lastSourceMIDI: 71,
            lastTargetMIDI: 71
        ), 72)

        let request = SingingTargetRequest(
            first: SingingTargetNote(sourceMIDI: 67, scaleDegreeLabel: "5\u{0302}"),
            second: SingingTargetNote(sourceMIDI: 72, scaleDegreeLabel: "1\u{0302}"),
            requestID: 1
        )
        let result = SingingTargets.resolve(request: request, transpose: 0, comfortablePitchMIDI: 60)
        XCTAssertEqual(result.first, 55)
        XCTAssertEqual(result.second, 60)
    }

    func testSingleAndUntessituratedRequestsMatchAndroid() {
        let single = SingingTargetRequest(
            first: SingingTargetNote(sourceMIDI: 84, scaleDegreeLabel: "1\u{0302}"),
            second: nil,
            requestID: 1
        )
        let placed = SingingTargets.resolve(request: single, transpose: 0, comfortablePitchMIDI: 60)
        XCTAssertEqual(placed.first, 60)
        XCTAssertNil(placed.second)

        let pair = SingingTargetRequest(
            first: SingingTargetNote(sourceMIDI: 60, scaleDegreeLabel: "1\u{0302}"),
            second: SingingTargetNote(sourceMIDI: 67, scaleDegreeLabel: "5\u{0302}"),
            requestID: 2
        )
        let unplaced = SingingTargets.resolve(request: pair, transpose: 3, comfortablePitchMIDI: nil)
        XCTAssertEqual(unplaced.first, 63)
        XCTAssertEqual(unplaced.second, 70)
    }

    func testIdealIntervalPreviewUsesAssignedTargetsAndLeavesTransposeForAudio() {
        let request = SingingTargetRequest(
            first: SingingTargetNote(sourceMIDI: 60, scaleDegreeLabel: "1\u{0302}"),
            second: SingingTargetNote(sourceMIDI: 67, scaleDegreeLabel: "5\u{0302}"),
            requestID: 1
        )
        let anchored = SingingTargets.idealIntervalPlaybackMIDIs(
            request: request,
            transpose: 0,
            comfortablePitchMIDI: 72
        )
        XCTAssertEqual(anchored?.first, 72)
        XCTAssertEqual(anchored?.second, 79)
        let transposed = SingingTargets.idealIntervalPlaybackMIDIs(
            request: request,
            transpose: 2,
            comfortablePitchMIDI: 72
        )
        XCTAssertEqual(transposed?.first, 72)
        XCTAssertEqual(transposed?.second, 79)
        let sourceRegister = SingingTargets.idealIntervalPlaybackMIDIs(
            request: request,
            transpose: 4,
            comfortablePitchMIDI: nil
        )
        XCTAssertEqual(sourceRegister?.first, 60)
        XCTAssertEqual(sourceRegister?.second, 67)
        XCTAssertNil(SingingTargets.idealIntervalPlaybackMIDIs(
            request: SingingTargetRequest(first: request.first, second: nil, requestID: 2),
            transpose: 0,
            comfortablePitchMIDI: 72
        ))
    }

    func testRecordedPitchPlaybackPreservesFractionalMIDIAndRejectsInvalidCapture() throws {
        let frequency = try XCTUnwrap(SingingTargets.recordedPitchPlaybackFrequency(rawMIDI: 69.37))
        XCTAssertEqual(frequency, 440 * pow(2, 0.37 / 12), accuracy: 1e-9)
        XCTAssertNotEqual(frequency, 440, accuracy: 1e-6)
        XCTAssertNil(SingingTargets.recordedPitchPlaybackFrequency(rawMIDI: nil))
        XCTAssertNil(SingingTargets.recordedPitchPlaybackFrequency(rawMIDI: .nan))
        XCTAssertNil(SingingTargets.recordedPitchPlaybackFrequency(rawMIDI: .infinity))
    }

    func testRootIntervalPreviewPlaysPreviousCurrentThenBoth() {
        let steps = RootIntervalPreview.steps(
            previousMIDI: 55,
            currentMIDI: 60,
            octaveShiftSemitones: 12,
            durationMilliseconds: 450
        )
        XCTAssertEqual(steps.map(\.midiNotes), [[67], [72], [67, 72]])
        XCTAssertEqual(steps.map(\.delayAfterMilliseconds), [450, 450, 0])
        XCTAssertEqual(steps.map(\.durationMilliseconds), [450, 450, 450])
        XCTAssertEqual(
            RootIntervalPreview.steps(
                previousMIDI: 60,
                currentMIDI: 60,
                octaveShiftSemitones: 0,
                durationMilliseconds: 450
            ).last?.midiNotes,
            [60]
        )
    }

    func testSpelledAndMeasuredIntervalRegressionCases() throws {
        func pitch(_ name: String, _ octave: Int) throws -> SpelledPitch {
            try XCTUnwrap(SpelledPitch.parse(noteName: name, octave: octave))
        }
        XCTAssertEqual(IntervalAnalysis.named(from: try pitch("C#", 4), to: try pitch("G", 4)).shorthand, "d5 ↑")
        XCTAssertEqual(IntervalAnalysis.named(from: try pitch("C#", 4), to: try pitch("F##", 4)).shorthand, "A4 ↑")
        XCTAssertEqual(IntervalAnalysis.named(from: try pitch("C", 4), to: try pitch("Gb", 4)).shorthand, "d5 ↑")
        XCTAssertEqual(IntervalAnalysis.named(from: try pitch("C", 4), to: try pitch("Db", 5)).shorthand, "m9 ↑")
        XCTAssertEqual(IntervalAnalysis.named(from: try pitch("C", 4), to: try pitch("C", 6)).shorthand, "P15 ↑")
        XCTAssertEqual(IntervalAnalysis.named(from: try pitch("C#", 4), to: try pitch("Db", 4)).shorthand, "d2 ↑")
        XCTAssertEqual(IntervalAnalysis.named(from: try pitch("C", 4), to: try pitch("F##", 4)).shorthand, "AA4 ↑")
        XCTAssertEqual(IntervalAnalysis.named(from: try pitch("C", 4), to: try pitch("Gbb", 4)).shorthand, "dd5 ↑")

        let ascending = IntervalAnalysis.measured(fromMIDI: 60.1, toMIDI: 64.1)
        let descending = IntervalAnalysis.measured(fromMIDI: 67.2, toMIDI: 60.2)
        XCTAssertEqual(ascending.namedInterval.quality, "M")
        XCTAssertEqual(ascending.namedInterval.number, 3)
        XCTAssertEqual(ascending.direction, .ascending)
        XCTAssertEqual(descending.namedInterval.quality, "P")
        XCTAssertEqual(descending.namedInterval.number, 5)
        XCTAssertEqual(descending.direction, .descending)
        XCTAssertEqual(IntervalAnalysis.measured(fromMIDI: 60.1, toMIDI: 60.4).direction, .ascending)
        XCTAssertEqual(IntervalAnalysis.measured(fromMIDI: 60.4, toMIDI: 60.1).direction, .descending)
        XCTAssertNil(IntervalAnalysis.measured(fromMIDI: 60.25, toMIDI: 60.25).direction)
    }
}
