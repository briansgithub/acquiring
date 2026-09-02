import XCTest
@testable import AcquiringCore

final class TessituraParityTests: XCTestCase {
    private let anchor = 60.0

    func testClosestOctavePicksNearestRegisterAndBreaksTritoneTieUpward() {
        XCTAssertEqual(TessituraResolver.closestOctave(sourceMIDI: 60, anchorMIDI: anchor), 60)
        XCTAssertEqual(TessituraResolver.closestOctave(sourceMIDI: 36, anchorMIDI: anchor), 60)
        XCTAssertEqual(TessituraResolver.closestOctave(sourceMIDI: 84, anchorMIDI: anchor), 60)
        XCTAssertEqual(TessituraResolver.closestOctave(sourceMIDI: 71, anchorMIDI: anchor), 59)
        XCTAssertEqual(TessituraResolver.closestOctave(sourceMIDI: 48, anchorMIDI: 54), 60)
        XCTAssertEqual(TessituraResolver.closestOctave(sourceMIDI: 72, anchorMIDI: 66), 72)
    }

    func testClosestOctaveIsAlwaysWithinSixSemitones() {
        for source in 0...127 {
            let resolved = TessituraResolver.closestOctave(sourceMIDI: source, anchorMIDI: anchor)
            XCTAssertLessThanOrEqual(abs(Double(resolved) - anchor), 6, "source \(source) resolved to \(resolved)")
        }
    }

    func testComfortableWindowIsAsymmetricAndUsesFractionalAnchor() {
        XCTAssertTrue(TessituraResolver.isInsideWindow(midi: 72, anchorMIDI: anchor))
        XCTAssertFalse(TessituraResolver.isInsideWindow(midi: 73, anchorMIDI: anchor))
        XCTAssertTrue(TessituraResolver.isInsideWindow(midi: 52, anchorMIDI: anchor))
        XCTAssertFalse(TessituraResolver.isInsideWindow(midi: 51, anchorMIDI: anchor))
        XCTAssertTrue(TessituraResolver.isInsideWindow(midi: 72, anchorMIDI: 60.4))
        XCTAssertFalse(TessituraResolver.isInsideWindow(midi: 52, anchorMIDI: 60.4))
    }

    func testSingleTargetsPreserveDirectionAndRepeatedRegister() {
        XCTAssertEqual(TessituraResolver.resolveTarget(sourceMIDI: 84, anchorMIDI: anchor), 60)
        XCTAssertEqual(TessituraResolver.resolveTarget(sourceMIDI: 72, anchorMIDI: anchor, lastSource: 71, lastTarget: 71), 72)
        XCTAssertEqual(TessituraResolver.resolveTarget(sourceMIDI: 71, anchorMIDI: anchor, lastSource: 72, lastTarget: 60), 59)
        XCTAssertEqual(TessituraResolver.resolveTarget(sourceMIDI: 60, anchorMIDI: anchor, lastSource: 60, lastTarget: 72), 72)

        var lastSource = 60
        var lastTarget = TessituraResolver.resolveTarget(sourceMIDI: 60, anchorMIDI: anchor)
        for source in [64, 67, 71] {
            let target = TessituraResolver.resolveTarget(
                sourceMIDI: source,
                anchorMIDI: anchor,
                lastSource: lastSource,
                lastTarget: lastTarget
            )
            XCTAssertGreaterThan(target, lastTarget)
            lastSource = source
            lastTarget = target
        }
        XCTAssertEqual(lastTarget, 71)
    }

    func testTargetsRecenterAtWindowAndContinueFromNewRegister() {
        XCTAssertEqual(TessituraResolver.resolveTarget(sourceMIDI: 74, anchorMIDI: anchor, lastSource: 72, lastTarget: 72), 62)
        XCTAssertEqual(TessituraResolver.resolveTarget(sourceMIDI: 44, anchorMIDI: anchor, lastSource: 52, lastTarget: 52), 56)
        let recentered = TessituraResolver.resolveTarget(sourceMIDI: 74, anchorMIDI: anchor, lastSource: 72, lastTarget: 72)
        XCTAssertEqual(TessituraResolver.resolveTarget(sourceMIDI: 76, anchorMIDI: anchor, lastSource: 74, lastTarget: recentered), 64)
        for source in 0...127 {
            XCTAssertTrue(TessituraResolver.isInsideWindow(
                midi: TessituraResolver.closestOctave(sourceMIDI: source, anchorMIDI: anchor),
                anchorMIDI: anchor
            ))
        }
    }

    func testIntervalsMoveAsOneUnitWithoutChangingDirectionOrSize() {
        let rising = TessituraResolver.resolveInterval(first: 67, second: 72, anchorMIDI: anchor)
        XCTAssertEqual(rising.0, 55)
        XCTAssertEqual(rising.1, 60)
        XCTAssertEqual(rising.1 - rising.0, 5)
        let falling = TessituraResolver.resolveInterval(first: 84, second: 77, anchorMIDI: anchor)
        XCTAssertEqual(falling.1 - falling.0, -7)
        let wide = TessituraResolver.resolveInterval(first: 48, second: 79, anchorMIDI: anchor)
        XCTAssertEqual(wide.1 - wide.0, 31)
        XCTAssertTrue(
            !TessituraResolver.isInsideWindow(midi: wide.0, anchorMIDI: anchor)
                || !TessituraResolver.isInsideWindow(midi: wide.1, anchorMIDI: anchor)
        )
        let unison = TessituraResolver.resolveInterval(first: 84, second: 84, anchorMIDI: anchor)
        XCTAssertEqual(unison.0, unison.1)
        XCTAssertEqual(unison.0, 60)
    }

    func testSessionRetainsAnchorButScopesContinuity() {
        var state = TessituraSession()
        state.enter("song-a:verse")
        state.updateComfortablePitch(57)
        state.updateContinuity(source: 60, target: 48)
        state.enter("song-a:verse")
        XCTAssertEqual(state.comfortablePitchMIDI, 57)
        XCTAssertEqual(state.lastSourceMIDI, 60)
        XCTAssertEqual(state.lastTargetMIDI, 48)

        state.enter("song-a:chorus")
        XCTAssertEqual(state.comfortablePitchMIDI, 57)
        XCTAssertNil(state.lastSourceMIDI)
        XCTAssertNil(state.lastTargetMIDI)
        state.updateContinuity(source: 60, target: 48)
        state.updateComfortablePitch(64)
        XCTAssertEqual(state.comfortablePitchMIDI, 64)
        XCTAssertNil(state.lastSourceMIDI)
        XCTAssertNil(state.lastTargetMIDI)
    }

    func testSessionClearAdjustmentAndClearSessionHaveDistinctLifetimes() {
        var state = TessituraSession()
        state.updateComfortablePitch(57)
        XCTAssertNil(state.sessionKey)
        state.enter("song-a:verse")
        state.updateContinuity(source: 60, target: 48)
        state.clearAdjustment()
        XCTAssertNil(state.comfortablePitchMIDI)
        XCTAssertNil(state.lastSourceMIDI)
        XCTAssertEqual(state.sessionKey, "song-a:verse")
        state.updateComfortablePitch(57)
        state.clearSession()
        XCTAssertNil(state.sessionKey)
        XCTAssertNil(state.comfortablePitchMIDI)
        XCTAssertNil(state.lastTargetMIDI)
    }
}
