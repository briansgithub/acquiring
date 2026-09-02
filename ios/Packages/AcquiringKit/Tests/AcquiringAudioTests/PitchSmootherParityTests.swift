import XCTest
@testable import AcquiringAudio

final class PitchSmootherParityTests: XCTestCase {
    func testPublishedCentsAlwaysMatchesPublishedMIDIAndTarget() {
        var smoother = PitchSmoother(targetMIDI: 60)
        let published = accept(
            [60, 60.2, 59.8, 60.1, 60.4, 60.3, 59.9, 60.05, 61.2, 60.7, 60, 59.6],
            into: &smoother
        )
        XCTAssertFalse(published.isEmpty)
        for value in published {
            XCTAssertEqual(value.centsError, 100 * (value.midi - 60), accuracy: 1e-9)
        }
    }

    func testStandardProfileWarmsUpAndRejectsMedianOutlier() {
        var smoother = PitchSmoother(targetMIDI: 60)
        XCTAssertNil(smoother.accept(midi: 60, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 60, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 60, confidence: 0.9))
        XCTAssertNotNil(smoother.accept(midi: 60, confidence: 0.9))
        let afterOutlier = accept([63, 60], into: &smoother)
        XCTAssertTrue(afterOutlier.allSatisfy { abs($0.midi - 60) < 0.5 })
    }

    func testOctaveSpikeIsDroppedButSustainedJumpReseeds() {
        var smoother = PitchSmoother(targetMIDI: 60)
        _ = accept([60, 60, 60, 60], into: &smoother)
        XCTAssertNil(smoother.accept(midi: 72, confidence: 0.9))
        XCTAssertEqual(smoother.accept(midi: 60, confidence: 0.9)?.midi ?? 0, 60, accuracy: 0.1)
        let moved = accept([72, 72, 72, 72, 72, 72, 72, 72], into: &smoother)
        XCTAssertEqual(moved.last?.midi ?? 0, 72, accuracy: 0.1)
    }

    func testResetAndRetargetRequireFreshWarmup() {
        var smoother = PitchSmoother(targetMIDI: 60)
        _ = accept([60, 60, 60, 60], into: &smoother)
        smoother.reset()
        XCTAssertNil(smoother.accept(midi: 64, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 64, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 64, confidence: 0.9))
        XCTAssertEqual(smoother.accept(midi: 64, confidence: 0.9)?.midi, 64)
        smoother.retarget(67)
        XCTAssertNil(smoother.setTarget(69))
        let fresh = accept([69, 69, 69, 69], into: &smoother)
        XCTAssertEqual(fresh.last?.centsError, 0)
    }

    func testSetTargetRescoresLastMeasuredPitchAndKeepsConfidenceAndHistory() {
        var smoother = PitchSmoother(targetMIDI: 60)
        _ = accept([60, 60, 60, 60, 60], into: &smoother)
        XCTAssertNotNil(smoother.accept(midi: 60, confidence: 0.42))
        let retargeted = smoother.setTarget(64)
        XCTAssertEqual(retargeted?.midi, 60)
        XCTAssertEqual(retargeted?.centsError, -400)
        XCTAssertEqual(retargeted?.confidence, 0.42)
        _ = smoother.setTarget(72)
        let held = accept([60, 60, 60, 60], into: &smoother)
        XCTAssertFalse(held.isEmpty)
        XCTAssertTrue(held.allSatisfy { $0.midi == 60 && $0.centsError == -1_200 })
    }

    func testFastProfilePublishesImmediatelyAndRecoversAfterOneOctaveFrame() {
        var smoother = PitchSmoother(targetMIDI: 60, configuration: .melodyFast)
        XCTAssertEqual(smoother.accept(midi: 60.25, confidence: 0.9)?.midi, 60.25)
        XCTAssertEqual(smoother.accept(midi: 60.75, confidence: 0.9)?.midi, 60.75)
        XCTAssertNil(smoother.accept(midi: 72, confidence: 0.9))
        XCTAssertEqual(smoother.accept(midi: 72, confidence: 0.9)?.midi, 72)
    }

    private func accept(_ values: [Double], into smoother: inout PitchSmoother) -> [SmoothedPitch] {
        values.compactMap { smoother.accept(midi: $0, confidence: 0.9) }
    }
}
