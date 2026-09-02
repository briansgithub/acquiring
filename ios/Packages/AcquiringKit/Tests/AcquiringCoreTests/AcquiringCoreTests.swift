import XCTest
@testable import AcquiringCore

final class AcquiringCoreTests: XCTestCase {
    private func chord(_ root: Int, type: Int = 5, applied: Int = 0) -> [String: JSONValue] {
        var value: [String: JSONValue] = ["root": .number(Double(root)), "type": .number(Double(type))]
        if applied > 0 { value["applied"] = .number(Double(applied)) }
        return value
    }

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

    func testEverySupportedModeResolvesToItsIonianTonic() {
        let modalKeys = [
            KeyInfo(tonic: "C", scale: "major"), KeyInfo(tonic: "C", scale: "ionian"),
            KeyInfo(tonic: "D", scale: "dorian"), KeyInfo(tonic: "E", scale: "phrygian"),
            KeyInfo(tonic: "F", scale: "lydian"), KeyInfo(tonic: "G", scale: "mixolydian"),
            KeyInfo(tonic: "A", scale: "minor"), KeyInfo(tonic: "A", scale: "aeolian"),
            KeyInfo(tonic: "B", scale: "locrian"), KeyInfo(tonic: "A", scale: "harmonicMinor"),
            KeyInfo(tonic: "E", scale: "phrygianDominant")
        ]
        for source in modalKeys {
            XCTAssertEqual(RelativeIonianContext.key(for: source), KeyInfo(tonic: "C", scale: "major"), source.scale)
        }
        XCTAssertEqual(
            RelativeIonianContext.key(for: KeyInfo(tonic: "Bb", scale: "dorian")),
            KeyInfo(tonic: "Ab", scale: "major")
        )
    }

    func testRelativeIonianScaleDegreesAndStaffPositionsRotateWithoutChangingPitch() throws {
        let key = KeyInfo(tonic: "A", scale: "minor")
        let tonic = try XCTUnwrap(MusicTheory.spelledPitch(scaleDegree: "1", relativeOctave: 0, key: key))
        let mediant = try XCTUnwrap(MusicTheory.spelledPitch(scaleDegree: "3", relativeOctave: 0, key: key))
        XCTAssertEqual(RelativeIonianContext.degreeLabel(for: tonic, sourceKey: key), "6\u{0302}")
        XCTAssertEqual(RelativeIonianContext.degreeLabel(for: mediant, sourceKey: key), "1\u{0302}")
        XCTAssertEqual(RelativeIonianContext.degreeLabel(forMIDI: 70, contextKey: RelativeIonianContext.key(for: key)), "♭7\u{0302}")
        XCTAssertEqual(RelativeIonianContext.staffDegree(scaleDegree: "1", relativeOctave: 0, sourceKey: key), 6)
        XCTAssertEqual(RelativeIonianContext.staffDegree(scaleDegree: "3", relativeOctave: 0, sourceKey: key), 8)
    }

    func testNaturalMinorChordsUseTheirRelativeMajorNumerals() {
        let key = KeyInfo(tonic: "A", scale: "minor")
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: chord(1), key: key), "vi")
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: chord(3), key: key), "I")
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: chord(4), key: key), "ii")
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: chord(5), key: key), "iii")
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: chord(5, applied: 5), key: key), "V/iii")
    }

    func testAlteredModalQualitySurvivesRelativeIonianContextChange() {
        let key = KeyInfo(tonic: "A", scale: "harmonicMinor")
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: chord(5), key: key), "III")
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: chord(7), key: key), "♯v°")
    }

    func testRelativeIonianLabelDoesNotMutatePlaybackInputs() {
        let key = KeyInfo(tonic: "A", scale: "minor")
        let sourceChord = chord(1, type: 7)
        let notesBefore = ChordInterpreter.chordNotes(for: sourceChord, key: key)
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: sourceChord, key: key), "vi7")
        XCTAssertEqual(ChordInterpreter.chordNotes(for: sourceChord, key: key), notesBefore)
        XCTAssertEqual(sourceChord["root"]?.intValue, 1)
        XCTAssertEqual(key, KeyInfo(tonic: "A", scale: "minor"))
    }

    func testFixedIonianContextDoesNotRebaseAtKeyChanges() throws {
        let contextKey = RelativeIonianContext.key(for: KeyInfo(tonic: "D", scale: "major"))
        let dPhrygian = KeyInfo(tonic: "D", scale: "phrygian")
        let fPhrygian = KeyInfo(tonic: "F", scale: "phrygian")
        let tonicChord = chord(1)
        let dRoot = try XCTUnwrap(ChordInterpreter.resolvedRoot(for: tonicChord, key: dPhrygian))
        let fRoot = try XCTUnwrap(ChordInterpreter.resolvedRoot(for: tonicChord, key: fPhrygian))

        XCTAssertEqual(RelativeIonianContext.degreeLabel(for: dRoot.pitch, sourceKey: dPhrygian), "3\u{0302}")
        XCTAssertEqual(RelativeIonianContext.degreeLabel(for: fRoot.pitch, sourceKey: fPhrygian), "3\u{0302}")
        XCTAssertEqual(RelativeIonianContext.degreeLabel(for: dRoot.pitch, contextKey: contextKey), "1\u{0302}")
        XCTAssertEqual(RelativeIonianContext.degreeLabel(for: fRoot.pitch, contextKey: contextKey), "♭3\u{0302}")
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: tonicChord, key: dPhrygian, contextKey: contextKey), "i")
        XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: tonicChord, key: fPhrygian, contextKey: contextKey), "♭iii")
        XCTAssertEqual(RelativeIonianContext.staffDegree(scaleDegree: "1", relativeOctave: 0, sourceKey: dPhrygian, contextKey: contextKey), 1)
        XCTAssertEqual(RelativeIonianContext.staffDegree(scaleDegree: "1", relativeOctave: 0, sourceKey: fPhrygian, contextKey: contextKey), 3)

        let lowC = try XCTUnwrap(SpelledPitch.parse(noteName: "C", octave: 3))
        let highC = try XCTUnwrap(SpelledPitch.parse(noteName: "C", octave: 4))
        XCTAssertEqual(RelativeIonianContext.degreeLabel(for: lowC, contextKey: contextKey), "♭7\u{0302}")
        XCTAssertEqual(RelativeIonianContext.degreeLabel(for: highC, contextKey: contextKey), "♭7\u{0302}")
        XCTAssertEqual(RelativeIonianContext.previewMIDI(for: lowC, contextKey: contextKey), 60)
        XCTAssertEqual(RelativeIonianContext.previewMIDI(for: highC, contextKey: contextKey), 60)
        XCTAssertEqual(RelativeIonianContext.previewMIDI(forMIDI: 48, contextKey: contextKey), 60)
        XCTAssertEqual(RelativeIonianContext.previewMIDI(forMIDI: 72, contextKey: contextKey), 60)
    }

    func testSecondaryDominantChordTonesPreserveTheirRootRelativeSpelling() throws {
        let key = KeyInfo(tonic: "A", scale: "minor")
        let contextKey = RelativeIonianContext.key(for: key)
        let sourceChord = chord(5, applied: 5)
        let root = try XCTUnwrap(ChordInterpreter.resolvedRoot(for: sourceChord, key: key))
        let notes = ChordInterpreter.chordNotes(for: sourceChord, key: key)
        let third = try XCTUnwrap(notes.first { (($0 - root.pitch.midiNote) % 12 + 12) % 12 == 4 })
        XCTAssertEqual(RelativeIonianContext.degreeLabel(forMIDI: third, rootPitch: root.pitch, contextKey: contextKey), "♯2\u{0302}")
        XCTAssertEqual(RelativeIonianContext.degreeLabel(forMIDI: third, contextKey: contextKey), "♭3\u{0302}")
    }
}
