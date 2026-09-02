import XCTest
@testable import AcquiringCore

final class PersistentPitchPracticeTests: XCTestCase {
    func testChordToneSelectionClampsForCurrentChordWithoutLosingRequestedIndex() {
        let selection = PersistentPitchSelection.chordTone(requestedIndex: 2)
        let twoTones = [target(60), target(64)]
        let fourTones = [target(60), target(64), target(67), target(71)]

        let clamped = PersistentPitchTargets.resolve(
            selection: selection,
            simpleRoot: nil,
            chordTones: twoTones,
            melody: nil
        )
        let restored = PersistentPitchTargets.resolve(
            selection: selection,
            simpleRoot: nil,
            chordTones: fourTones,
            melody: nil
        )

        XCTAssertEqual(clamped?.position, .chordTone(displayedIndex: 1))
        XCTAssertEqual(clamped?.sourceMIDI, 64)
        XCTAssertEqual(restored?.position, .chordTone(displayedIndex: 2))
        XCTAssertEqual(restored?.sourceMIDI, 67)
        XCTAssertNil(PersistentPitchTargets.resolve(
            selection: selection,
            simpleRoot: nil,
            chordTones: [],
            melody: nil
        ))
    }

    func testRootAndMelodyResolveOnlyWhenTheirCurrentEventIsPitched() {
        XCTAssertEqual(
            PersistentPitchTargets.resolve(
                selection: .simpleRoot,
                simpleRoot: target(48),
                chordTones: [],
                melody: nil
            )?.position,
            .simpleRoot
        )
        XCTAssertEqual(
            PersistentPitchTargets.resolve(
                selection: .melody,
                simpleRoot: nil,
                chordTones: [],
                melody: target(72)
            )?.position,
            .melodyCurrent
        )
        XCTAssertNil(PersistentPitchTargets.resolve(
            selection: .melody,
            simpleRoot: nil,
            chordTones: [],
            melody: nil
        ))
    }

    func testEffectiveTargetIncludesTransposeTessituraAndContinuity() throws {
        let root = ResolvedPersistentPitchTarget(
            sourceMIDI: 60,
            label: "1\u{0302}",
            position: .simpleRoot
        )
        XCTAssertEqual(root.effectiveTargetMIDI(transpose: 5, comfortablePitchMIDI: 72), 77)
        XCTAssertEqual(root.effectiveTargetMIDI(transpose: 5, comfortablePitchMIDI: nil), 65)

        let melody = ResolvedPersistentPitchTarget(
            sourceMIDI: 72,
            label: "1\u{0302}",
            position: .melodyCurrent
        )
        XCTAssertEqual(melody.effectiveTargetMIDI(
            transpose: 0,
            comfortablePitchMIDI: 60,
            lastSourceMIDI: 71,
            lastTargetMIDI: 71
        ), 72)
    }

    func testContiguousMatchingMelodyNotesBecomeOneScoringRun() throws {
        let runs = MelodyTimelinePitchRuns.build(from: [
            visual(beat: 1, duration: 0.5, staffDegree: 0, midi: 60),
            visual(beat: 1.5, duration: 0.5, staffDegree: 0, midi: 60),
            visual(beat: 2, duration: 0.5, staffDegree: 1, midi: 62),
            visual(beat: 2.5, duration: 0.5, staffDegree: 1, midi: 63),
            visual(beat: 3.25, duration: 0.5, staffDegree: 1, midi: 63)
        ])

        XCTAssertEqual(runs.count, 4)
        XCTAssertEqual(runs[0].beat, 1)
        XCTAssertEqual(runs[0].duration, 1)
        XCTAssertEqual(runs[0].centerBeat, 1.5)
        XCTAssertEqual(MelodyTimelinePitchRuns.run(at: 1.75, in: runs), runs[0])
        XCTAssertNil(MelodyTimelinePitchRuns.run(at: 3.1, in: runs))
    }

    func testInvalidDurationsAreExcludedAndOverlappingMatchingNotesMerge() {
        let runs = MelodyTimelinePitchRuns.build(from: [
            visual(beat: 2, duration: 0, staffDegree: 0, midi: 60),
            visual(beat: 1, duration: 1, staffDegree: 2, midi: 64),
            visual(beat: 1.5, duration: 1, staffDegree: 2, midi: 64)
        ])
        XCTAssertEqual(runs, [MelodyTimelinePitchRun(
            id: 0,
            beat: 1,
            duration: 1.5,
            staffDegree: 2,
            sourceMIDI: 64
        )])
    }

    func testHistoricalGaugeThresholdsFormattingAndTimelineMotion() {
        XCTAssertEqual(PersistentPitchFeedback.band(centsError: 14.99), .accurate)
        XCTAssertEqual(PersistentPitchFeedback.band(centsError: -15), .close)
        XCTAssertEqual(PersistentPitchFeedback.band(centsError: 49.99), .close)
        XCTAssertEqual(PersistentPitchFeedback.band(centsError: -50), .far)
        XCTAssertEqual(PersistentPitchFeedback.formatCentsError(0.1), "0\u{00a2}")
        XCTAssertEqual(PersistentPitchFeedback.formatCentsError(12.6), "+13\u{00a2}")
        XCTAssertEqual(PersistentPitchFeedback.formatCentsError(-12.6), "-13\u{00a2}")
        XCTAssertEqual(PersistentPitchFeedback.timelineStaffSteps(centsError: 1_200), 7, accuracy: 1e-9)
        XCTAssertEqual(PersistentPitchFeedback.timelineStaffSteps(centsError: -600), -3.5, accuracy: 1e-9)
    }

    func testLivePercentagePinsAndHidesAtOneHundred() {
        XCTAssertEqual(PersistentPitchFeedback.errorPercentage(centsError: 0.1), 0)
        XCTAssertEqual(PersistentPitchFeedback.errorPercentage(centsError: -12.6), 13)
        XCTAssertEqual(PersistentPitchFeedback.errorPercentage(centsError: -245), 100)
        XCTAssertEqual(PersistentPitchFeedback.formatLiveErrorPercentage(centsError: 0), "0%")
        XCTAssertEqual(PersistentPitchFeedback.formatLiveErrorPercentage(centsError: 47.6), "+48%")
        XCTAssertEqual(PersistentPitchFeedback.formatLiveErrorPercentage(centsError: -47.6), "-48%")
        XCTAssertTrue(PersistentPitchFeedback.showsLiveErrorPercentage(centsError: 99.4))
        XCTAssertFalse(PersistentPitchFeedback.showsLiveErrorPercentage(centsError: 99.5))
        XCTAssertFalse(PersistentPitchFeedback.showsLiveErrorPercentage(centsError: -1_200))
    }

    func testRunScoreReportsMedianMagnitudeWithoutCancellingDirection() throws {
        let sharp = try XCTUnwrap(score(runID: 4, samples: Array(repeating: 20, count: 12)))
        XCTAssertEqual(sharp.errorPercentage, 20)
        XCTAssertEqual(sharp.signedCentsError, 20)
        XCTAssertEqual(sharp.centsErrorMagnitude, 20)
        XCTAssertEqual(sharp.sampleCount, 12)
        XCTAssertEqual(sharp.formatted, "+20%")

        let flat = try XCTUnwrap(score(runID: 5, samples: Array(repeating: -30, count: 12)))
        XCTAssertEqual(flat.formatted, "-30%")
    }

    func testOneWildFrameCannotFlipBadgeAndMagnitudeClampsOnlyAtDisplay() throws {
        let robust = try XCTUnwrap(score(
            runID: 9,
            samples: Array(repeating: 12, count: 30) + [-600]
        ))
        XCTAssertEqual(robust.errorPercentage, 12)
        XCTAssertEqual(robust.formatted, "+12%")
        XCTAssertEqual(PersistentPitchFeedback.band(centsError: robust.centsErrorMagnitude), .accurate)

        let far = try XCTUnwrap(score(runID: 7, samples: Array(repeating: -300, count: 10)))
        XCTAssertEqual(far.errorPercentage, 100)
        XCTAssertEqual(far.formatted, "-100%")
        XCTAssertEqual(far.centsErrorMagnitude, 300)
    }

    func testCenteredWobbleDropsDirectionButRetainsMagnitude() throws {
        let result = try XCTUnwrap(score(
            runID: 8,
            samples: [20, -20, 21, -19, 20, -21, 19, -20, 1.5, -1]
        ))
        XCTAssertTrue(result.formatted.first?.isNumber == true)
        XCTAssertLessThan(abs(result.signedCentsError), 5)
        XCTAssertGreaterThan(result.centsErrorMagnitude, 15)
    }

    func testScoreRequiresMinimumSamplesAndOnlyActiveRunCanFinish() {
        var accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runID: 1)
        for _ in 0..<(MelodyTimelinePitchScoreAccumulator.minimumScoreSamples - 1) {
            accumulator.add(runID: 1, centsError: 8)
        }
        XCTAssertEqual(accumulator.finish(runID: 1), .unscored(runID: 1))

        accumulator.begin(runID: 3)
        for _ in 0..<MelodyTimelinePitchScoreAccumulator.minimumScoreSamples {
            accumulator.add(runID: 3, centsError: 5)
        }
        XCTAssertNil(accumulator.finish(runID: 4))
        guard case let .scored(_, score) = accumulator.finish(runID: 3) else {
            return XCTFail("Expected active run to score")
        }
        XCTAssertEqual(score.sampleCount, MelodyTimelinePitchScoreAccumulator.minimumScoreSamples)
    }

    func testBeginningRunAgainDropsSamplesAgainstOldTarget() throws {
        var accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runID: 11)
        for _ in 0..<12 { accumulator.add(runID: 11, centsError: 90) }
        accumulator.begin(runID: 11)
        for _ in 0..<12 { accumulator.add(runID: 11, centsError: 6) }
        guard case let .scored(_, result) = accumulator.finish(runID: 11) else {
            return XCTFail("Expected score")
        }
        XCTAssertEqual(result.sampleCount, 12)
        XCTAssertEqual(result.centsErrorMagnitude, 6)
    }

    func testCleanAttackSettlesAfterFloorAndBeforeCap() throws {
        let openedAt = try XCTUnwrap(firstSettle { 10 + Double($0 % 5) * 0.5 })
        XCTAssertGreaterThanOrEqual(openedAt, MelodyRunSettleDetector.defaultFloorMilliseconds)
        XCTAssertLessThan(openedAt, MelodyRunSettleDetector.defaultFloorMilliseconds + 64)
    }

    func testScoopDelaysScoringUntilPitchStopsMoving() throws {
        let openedAt = try XCTUnwrap(firstSettle { elapsed in
            elapsed < 300 ? -250 + Double(elapsed) * 250 / 300 : 3 + Double(elapsed % 3)
        })
        XCTAssertGreaterThanOrEqual(openedAt, 300)
        XCTAssertLessThan(openedAt, MelodyRunSettleDetector.defaultCapMilliseconds)
    }

    func testHardCapOpensMovingOrFrozenPitch() throws {
        let moving = try XCTUnwrap(firstSettle { -600 + Double($0) })
        let frozen = try XCTUnwrap(firstSettle { _ in -180 })
        XCTAssertGreaterThanOrEqual(moving, MelodyRunSettleDetector.defaultCapMilliseconds)
        XCTAssertGreaterThanOrEqual(frozen, MelodyRunSettleDetector.defaultCapMilliseconds)
        XCTAssertLessThan(moving, MelodyRunSettleDetector.defaultCapMilliseconds + 32)
    }

    func testDropoutClearsPartialSettleWindow() throws {
        let withDropout = try XCTUnwrap(firstSettle { elapsed in
            elapsed == 160 ? nil : 9 + Double(elapsed % 3)
        })
        let uninterrupted = try XCTUnwrap(firstSettle { 9 + Double($0 % 3) })
        XCTAssertGreaterThan(withDropout, uninterrupted)
    }

    func testScoringSessionIgnoresAttackAndScoresShortCleanRun() {
        var session = MelodyRunScoringSession()
        session.begin(runID: 7, targetMIDI: 60)
        for frame in 0..<50 {
            let elapsed = frame * MelodyRunScoringSession.sampleIntervalMilliseconds
            let cents = elapsed < 300
                ? -250 + Double(elapsed) * 250 / 300
                : 4 + Double(elapsed % 3)
            session.add(measuredMIDI: 60 + cents / 100)
        }
        guard case let .scored(_, result) = session.finish(runID: 7) else {
            return XCTFail("Expected run score")
        }
        XCTAssertLessThan(result.centsErrorMagnitude, 10)

        session.begin(runID: 3, targetMIDI: 60)
        for frame in 0..<19 {
            let elapsed = frame * MelodyRunScoringSession.sampleIntervalMilliseconds
            session.add(measuredMIDI: 60 + (25 + Double(elapsed % 3)) / 100)
        }
        guard case let .scored(_, shortResult) = session.finish(runID: 3) else {
            return XCTFail("Expected short clean run score")
        }
        XCTAssertGreaterThanOrEqual(
            shortResult.sampleCount,
            MelodyTimelinePitchScoreAccumulator.minimumScoreSamples
        )
    }

    private func target(_ midi: Int) -> QuizPitchCardTarget {
        QuizPitchCardTarget(sourceMIDI: midi, label: String(midi))
    }

    private func visual(beat: Double, duration: Double, staffDegree: Int, midi: Int) -> MelodyTimelinePitchVisual {
        MelodyTimelinePitchVisual(
            beat: beat,
            duration: duration,
            staffDegree: staffDegree,
            sourceMIDI: midi
        )
    }

    private func score(runID: Int, samples: [Double]) -> MelodyTimelinePitchScore? {
        var accumulator = MelodyTimelinePitchScoreAccumulator()
        accumulator.begin(runID: runID)
        for sample in samples { accumulator.add(runID: runID, centsError: sample) }
        guard case let .scored(_, result) = accumulator.finish(runID: runID) else { return nil }
        return result
    }

    private func firstSettle(
        untilMilliseconds: Int = 900,
        centsAt: (Int) -> Double?
    ) -> Int? {
        var detector = MelodyRunSettleDetector()
        var elapsed = 0
        while elapsed <= untilMilliseconds {
            if detector.observe(elapsedMilliseconds: elapsed, centsError: centsAt(elapsed)) {
                return elapsed
            }
            elapsed += MelodyRunScoringSession.sampleIntervalMilliseconds
        }
        return nil
    }
}
