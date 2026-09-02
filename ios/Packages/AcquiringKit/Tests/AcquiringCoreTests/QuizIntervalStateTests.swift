import XCTest
@testable import AcquiringCore

final class QuizIntervalStateTests: XCTestCase {
    private func chord(root: Int, beat: Double, duration: Double = 1, rest: Bool = false) -> [String: JSONValue] {
        var result: [String: JSONValue] = [
            "root": .number(Double(root)),
            "beat": .number(beat),
            "duration": .number(duration)
        ]
        if rest { result["isRest"] = .bool(true) }
        return result
    }

    func testChordTransitionUsesSpelledRootsAndSkipsRests() throws {
        let section = ExtractedSection(chords: [
            chord(root: 1, beat: 1),
            chord(root: 0, beat: 2, rest: true),
            chord(root: 5, beat: 3)
        ])
        let state = try XCTUnwrap(QuizIntervals.resolveChordRootState(section: section, currentBeat: 3.25))
        XCTAssertEqual(state.previous?.pitch.noteName, "C")
        XCTAssertEqual(state.current.pitch.noteName, "G")
        XCTAssertEqual(state.interval?.shorthand, "P5 ↑")
        XCTAssertEqual(state.previousDegreeLabel, "1\u{0302}")
        XCTAssertEqual(state.currentDegreeLabel, "5\u{0302}")
    }

    func testRootIntervalsFollowTheSimplePlaybackRegisterWhenTheRootFalls() throws {
        let section = ExtractedSection(
            chords: [chord(root: 2, beat: 1), chord(root: 4, beat: 2)],
            metadata: ["keys": .array([.object([
                "tonic": .string("Ab"), "scale": .string("major"), "beat": .number(1)
            ])])]
        )
        let state = try XCTUnwrap(QuizIntervals.resolveChordRootState(section: section, currentBeat: 2.25))
        XCTAssertEqual(state.previousIntervalPitch?.noteName, "Bb")
        XCTAssertEqual(state.currentIntervalPitch.noteName, "Db")
        XCTAssertEqual(state.previousIntervalPitch?.octave, 3)
        XCTAssertEqual(state.currentIntervalPitch.octave, 3)
        XCTAssertEqual(state.interval?.shorthand, "M6 ↓")
    }

    func testFirstChordHasCurrentRootButNoInterval() throws {
        let state = try XCTUnwrap(QuizIntervals.resolveChordRootState(
            section: ExtractedSection(chords: [chord(root: 1, beat: 1)]),
            currentBeat: 1.25
        ))
        XCTAssertEqual(state.current.pitch.noteName, "C")
        XCTAssertNil(state.previous)
        XCTAssertNil(state.interval)
    }

    func testMelodyTransitionPreservesEnharmonicQuantity() throws {
        let melody = [
            MelodyNote(sd: "#1", beat: 1, duration: 1),
            MelodyNote(sd: "5", beat: 2, duration: 1)
        ]
        let state = try XCTUnwrap(QuizIntervals.resolveMelodyState(
            melody: melody,
            currentBeat: 2.25,
            keyAtBeat: { _ in KeyInfo(tonic: "C", scale: "major") }
        ))
        XCTAssertEqual(state.previous.noteName, "C#")
        XCTAssertEqual(state.current.noteName, "G")
        XCTAssertEqual(state.interval.shorthand, "d5 ↑")
        XCTAssertEqual(state.previousDegreeLabel, "♯1\u{0302}")
        XCTAssertEqual(state.currentDegreeLabel, "5\u{0302}")
    }

    func testMelodyPitchCardsUseTargetLabelsAndFollowContour() throws {
        let c4 = try XCTUnwrap(SpelledPitch.parse(noteName: "C", octave: 4))
        let e4 = try XCTUnwrap(SpelledPitch.parse(noteName: "E", octave: 4))
        let ascending = MelodyIntervalState(
            previous: c4,
            current: e4,
            interval: IntervalAnalysis.named(from: c4, to: e4),
            previousDegreeLabel: "1\u{0302}",
            currentDegreeLabel: "3\u{0302}"
        )
        let descending = MelodyIntervalState(
            previous: e4,
            current: c4,
            interval: IntervalAnalysis.named(from: e4, to: c4),
            previousDegreeLabel: "3\u{0302}",
            currentDegreeLabel: "1\u{0302}"
        )
        let risingCards = QuizIntervals.melodyPitchCards(
            for: ascending,
            previousLabel: "6\u{0302}",
            currentLabel: "1\u{0302}"
        )
        let fallingCards = QuizIntervals.melodyPitchCards(for: descending)
        XCTAssertEqual(risingCards.map(\.role), [.previous, .current])
        XCTAssertEqual(risingCards.map(\.scaleDegreeLabel), ["6\u{0302}", "1\u{0302}"])
        XCTAssertEqual(risingCards.map(\.verticalPosition), [.bottom, .top])
        XCTAssertEqual(fallingCards.map(\.verticalPosition), [.top, .bottom])
    }

    func testMelodyPitchCardDisplayCollapsesRepeatedOrUnpairedNotes() throws {
        let c4 = try XCTUnwrap(SpelledPitch.parse(noteName: "C", octave: 4))
        let d4 = try XCTUnwrap(SpelledPitch.parse(noteName: "D", octave: 4))
        let repeated = MelodyIntervalState(
            previous: c4, current: c4,
            interval: IntervalAnalysis.named(from: c4, to: c4),
            previousDegreeLabel: "1\u{0302}", currentDegreeLabel: "1\u{0302}"
        )
        let changing = MelodyIntervalState(
            previous: c4, current: d4,
            interval: IntervalAnalysis.named(from: c4, to: d4),
            previousDegreeLabel: "1\u{0302}", currentDegreeLabel: "2\u{0302}"
        )
        XCTAssertEqual(QuizIntervals.melodyPitchCardDisplayMode(currentPitch: c4, intervalState: nil), .single)
        XCTAssertEqual(QuizIntervals.melodyPitchCardDisplayMode(currentPitch: c4, intervalState: repeated), .single)
        XCTAssertEqual(QuizIntervals.melodyPitchCardDisplayMode(currentPitch: d4, intervalState: changing), .interval)
        XCTAssertEqual(QuizIntervals.melodyPitchCardDisplayMode(currentPitch: nil, intervalState: nil), .hidden)
    }

    func testMelodyRestGapCompoundAndBoundaries() {
        let key = { (_: Double) in KeyInfo(tonic: "C", scale: "major") }
        let withRest = [
            MelodyNote(sd: "1", beat: 1, duration: 1),
            MelodyNote(sd: "1", beat: 2, duration: 1, isRest: true),
            MelodyNote(sd: "3", beat: 3, duration: 1)
        ]
        XCTAssertNil(QuizIntervals.resolveMelodyState(melody: withRest, currentBeat: 2.25, keyAtBeat: key))
        XCTAssertNil(QuizIntervals.resolveMelodyState(melody: withRest, currentBeat: 3.25, keyAtBeat: key))

        let compound = [
            MelodyNote(sd: "1", beat: 1, duration: 1),
            MelodyNote(sd: "b2", beat: 2, duration: 1, octave: 1)
        ]
        XCTAssertEqual(QuizIntervals.resolveMelodyState(melody: compound, currentBeat: 2.25, keyAtBeat: key)?.interval.shorthand, "m9 ↑")

        let gap = [
            MelodyNote(sd: "1", beat: 1, duration: 1),
            MelodyNote(sd: "2", beat: 3, duration: 1)
        ]
        XCTAssertNil(QuizIntervals.resolveMelodyState(melody: gap, currentBeat: 2.5, keyAtBeat: key))
        XCTAssertEqual(QuizIntervals.resolveMelodyState(melody: gap, currentBeat: 3, keyAtBeat: key)?.interval.shorthand, "M2 ↑")
    }

    func testNewestOverlappingEventsWinAndRestSuppressesMelody() {
        let key = { (_: Double) in KeyInfo(tonic: "C", scale: "major") }
        let melody = [
            MelodyNote(sd: "1", beat: 1, duration: 3),
            MelodyNote(sd: "3", beat: 2, duration: 1),
            MelodyNote(sd: "1", beat: 2.5, duration: 0.5, isRest: true)
        ]
        XCTAssertEqual(QuizIntervals.resolveMelodyState(melody: melody, currentBeat: 2.25, keyAtBeat: key)?.interval.shorthand, "M3 ↑")
        XCTAssertNil(QuizIntervals.resolveMelodyState(melody: melody, currentBeat: 2.75, keyAtBeat: key))
        XCTAssertEqual(QuizIntervals.activeMelodyNote(melody, at: 2.75)?.isRest, true)

        let section = ExtractedSection(chords: [
            chord(root: 1, beat: 1, duration: 3),
            chord(root: 5, beat: 2, duration: 1)
        ])
        XCTAssertEqual(QuizIntervals.resolveChordRootState(section: section, currentBeat: 2.25)?.current.pitch.noteName, "G")
        XCTAssertEqual(QuizIntervals.activeChord(section: section, at: 2.25)?["root"]?.intValue, 5)
    }

    func testEachMelodyNoteKeepsItsOnsetKeyAndFlatMetadata() {
        let changedKey = [
            MelodyNote(sd: "1", beat: 1, duration: 1),
            MelodyNote(sd: "1", beat: 2, duration: 2)
        ]
        let state = QuizIntervals.resolveMelodyState(
            melody: changedKey,
            currentBeat: 3,
            keyAtBeat: { $0 < 2 ? KeyInfo(tonic: "C", scale: "major") : KeyInfo(tonic: "D", scale: "major") }
        )
        XCTAssertEqual(state?.interval.shorthand, "M2 ↑")
        XCTAssertEqual(state?.previousDegreeLabel, "1\u{0302}")
        XCTAssertEqual(state?.currentDegreeLabel, "1\u{0302}")

        let altered = [
            MelodyNote(sd: "b2", beat: 1, duration: 1),
            MelodyNote(sd: "3", beat: 2, duration: 1)
        ]
        let flatState = QuizIntervals.resolveMelodyState(
            melody: altered,
            currentBeat: 2.25,
            keyAtBeat: { _ in KeyInfo(tonic: "C", scale: "major") }
        )
        XCTAssertEqual(flatState?.previousDegreeLabel, "♭2\u{0302}")
        XCTAssertEqual(flatState?.currentDegreeLabel, "3\u{0302}")
    }

    func testCachedActiveEventIndexPreservesOverlapAndBoundaryBehavior() {
        let section = ExtractedSection(chords: [
            chord(root: 5, beat: 2, duration: 1),
            chord(root: 1, beat: 1, duration: 3)
        ])
        let melody = [
            MelodyNote(sd: "3", beat: 2, duration: 1),
            MelodyNote(sd: "1", beat: 1, duration: 3)
        ]
        let index = ActiveEventIndex(section: section, melody: melody)
        XCTAssertEqual(index.chord(at: 2.25)?["root"]?.intValue, 5)
        XCTAssertEqual(index.melodyNote(at: 2.25)?.sd, "3")
        XCTAssertEqual(index.chord(at: 3)?["root"]?.intValue, 1)
        XCTAssertEqual(index.melodyNote(at: 3)?.sd, "1")
        XCTAssertNil(index.chord(at: 4))
        XCTAssertNil(index.melodyNote(at: 4))
    }
}
