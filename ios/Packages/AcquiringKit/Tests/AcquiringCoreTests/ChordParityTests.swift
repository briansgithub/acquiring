import XCTest
@testable import AcquiringCore

final class ChordParityTests: XCTestCase {
    private let cMajor = KeyInfo(tonic: "C", scale: "major")
    private let abMajor = KeyInfo(tonic: "Ab", scale: "major")

    func testSharedChordCorpusMatchesAfterVoicingPort() throws {
        struct Fixture: Decodable {
            let id: String
            let json: String
            let key: KeyInfo
            let expectedRoman: String
            let expectedLetter: String
            let expectedPcs: [Int]
        }

        let repositoryRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let fixtureURL = repositoryRoot.appending(path: "contracts/fixtures/corpus_parity.json")
        let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: fixtureURL))
        XCTAssertEqual(fixtures.count, 45)
        for fixture in fixtures {
            let value = try decode(fixture.json)
            XCTAssertEqual(ChordInterpreter.romanSymbol(for: value, key: fixture.key), fixture.expectedRoman, fixture.id)
            XCTAssertEqual(ChordInterpreter.letterName(for: value, key: fixture.key), fixture.expectedLetter, fixture.id)
            XCTAssertEqual(Set(ChordInterpreter.chordNotes(for: value, key: fixture.key).map(pitchClass)).sorted(), fixture.expectedPcs, fixture.id)
        }
    }

    func testBlankAndRestChordsDoNotProduceTheoryOrAudio() throws {
        for source in [
            "{}",
            #"{"rest":true}"#,
            #"{"root":0}"#,
            #"{"root":null}"#,
            #"{"root":-1}"#,
            #"{"root":"0"}"#,
            #"{"root":"invalid"}"#
        ] {
            let value = try decode(source)
            XCTAssertTrue(["Rest", ""].contains(ChordInterpreter.romanSymbol(for: value, key: cMajor)), source)
            XCTAssertEqual(ChordInterpreter.letterName(for: value, key: cMajor), "", source)
            XCTAssertEqual(ChordInterpreter.chordNotes(for: value, key: cMajor), [], source)
        }
    }

    func testAndroidChordRegressionCases() throws {
        let cases: [(String, String, Set<Int>)] = [
            (#"{"root":5,"applied":7,"type":7}"#, "vii°7/V", [6, 9, 0, 3]),
            (#"{"root":1,"type":7,"inversion":3}"#, "I△42", [0, 4, 7, 11]),
            (#"{"root":5,"type":11}"#, "V11", [7, 11, 2, 5, 9, 0]),
            (#"{"root":1,"suspensions":[4]}"#, "Isus4", [0, 5, 7]),
            (##"{"root":1,"omits":[3],"alterations":["#5"],"adds":[9]}"##, "I+(add9)(no3)(#5)", [0, 8, 2])
        ]
        for (source, symbol, pitchClasses) in cases {
            let value = try decode(source)
            XCTAssertEqual(ChordInterpreter.romanSymbol(for: value, key: cMajor), symbol, source)
            XCTAssertEqual(Set(ChordInterpreter.chordNotes(for: value, key: cMajor).map(pitchClass)), pitchClasses, source)
        }
    }

    func testMelodyMIDIMatchesAndroidRegisterAndModifiers() {
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "1", octave: 0, key: cMajor), 60)
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "3", octave: 0, key: cMajor), 64)
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "8", octave: 0, key: cMajor), 72)
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "1", octave: 1, key: cMajor), 72)
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "4", octave: 0, key: .init(tonic: "G", scale: "major")), 72)
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "2", octave: 0, key: .init(tonic: "B", scale: "major")), 73)
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "#1", octave: 0, key: cMajor), 61)
        XCTAssertEqual(MusicTheory.midiNote(scaleDegree: "b3", octave: 0, key: cMajor), 63)
    }

    func testEnharmonicScaleAndChordLabels() {
        let abMinor = KeyInfo(tonic: "Ab", scale: "minor")
        XCTAssertEqual((1...7).map { MusicTheory.noteLabel(degree: $0, tonic: "Ab", scale: "minor") }, ["Ab", "Bb", "Cb", "Db", "Eb", "Fb", "Gb"])
        XCTAssertEqual(ChordInterpreter.letterName(for: chord(root: 1), key: abMinor), "Abm")
        XCTAssertEqual(ChordInterpreter.letterName(for: chord(root: 3), key: abMinor), "Cb")
        XCTAssertEqual(ChordInterpreter.letterName(for: chord(root: 6), key: abMinor), "Fb")

        let sharpMajor = KeyInfo(tonic: "C#", scale: "major")
        XCTAssertEqual(MusicTheory.noteLabel(degree: 3, tonic: "C#", scale: "major"), "E#")
        XCTAssertEqual(MusicTheory.noteLabel(degree: 7, tonic: "C#", scale: "major"), "B#")
        XCTAssertEqual(ChordInterpreter.letterName(for: chord(root: 3), key: sharpMajor), "E#m")
        XCTAssertEqual(ChordInterpreter.letterName(for: chord(root: 7), key: sharpMajor), "B#°")
        XCTAssertEqual(MusicTheory.noteLabel(degree: 4, tonic: "Gb", scale: "major"), "Cb")
        XCTAssertEqual(ChordInterpreter.letterName(for: chord(root: 4), key: .init(tonic: "Gb", scale: "major")), "Cb")
        XCTAssertEqual(ChordInterpreter.letterName(for: chord(root: 1, inversion: 1), key: abMinor), "Abm/Cb")
    }

    func testDiatonicInversionsUseCompactRotation() {
        XCTAssertEqual(ChordInterpreter.chordNotes(for: chord(root: 1), key: cMajor), [48, 52, 55])
        XCTAssertEqual(ChordInterpreter.chordNotes(for: chord(root: 1, inversion: 1), key: cMajor), [52, 55, 60])
        XCTAssertEqual(ChordInterpreter.chordNotes(for: chord(root: 1, inversion: 2), key: cMajor), [55, 60, 64])
        XCTAssertEqual(ChordInterpreter.chordNotes(for: chord(root: 5, type: 7, inversion: 3), key: cMajor), [65, 67, 71, 74])
    }

    func testAppliedInversionsUseAndroidWideVoicing() {
        XCTAssertEqual(
            ChordInterpreter.chordNotes(for: chord(root: 6, type: 7, inversion: 1, applied: 5), key: abMajor),
            [40, 55, 58, 48]
        )
        XCTAssertEqual(
            ChordInterpreter.chordNotes(for: chord(root: 4, type: 7, inversion: 3, applied: 5), key: abMajor),
            [54, 68, 60, 63]
        )
        XCTAssertEqual(
            ChordInterpreter.chordNotes(for: chord(root: 5, type: 7, applied: 7), key: abMajor),
            [50, 59, 65, 68]
        )

        let applied = chord(root: 2, type: 7, inversion: 1, applied: 5)
        XCTAssertEqual(ChordInterpreter.chordNotes(for: applied, key: cMajor), [49, 64, 67, 69])
        XCTAssertEqual(ChordInterpreter.rootPositionChordNotes(for: applied, key: cMajor), [57, 61, 64, 67])
    }

    func testCustomBorrowedSecondInversionMatchesAndroid() {
        var value = chord(root: 2, inversion: 2)
        value["borrowed"] = .array([1, 3, 4, 6, 8, 9, 11].map { .number(Double($0)) })
        XCTAssertEqual(ChordInterpreter.chordNotes(for: value, key: abMajor), [65, 71, 74])
    }

    func testAppliedBorrowedTargetsAndSpecialCases() {
        var flatSix = chord(root: 6, type: 7, applied: 5)
        flatSix["borrowed"] = .string("minor")
        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: flatSix, key: cMajor)?.pitch.noteName, "Eb")
        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: flatSix, key: cMajor)?.context, .borrowedApplied)
        XCTAssertEqual(Set(ChordInterpreter.chordNotes(for: flatSix, key: cMajor).map(pitchClass)), [3, 7, 10, 1])
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: flatSix, key: cMajor), "V7/vi(maj)")
        XCTAssertEqual(ChordInterpreter.letterName(for: flatSix, key: cMajor), "E7")

        var flatSeven = chord(root: 7, type: 7, applied: 5)
        flatSeven["borrowed"] = .string("minor")
        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: flatSeven, key: cMajor)?.pitch.noteName, "F")
        XCTAssertEqual(Set(ChordInterpreter.chordNotes(for: flatSeven, key: cMajor).map(pitchClass)), [5, 9, 0, 3])
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: flatSeven, key: cMajor), "V7/vii°")
        XCTAssertEqual(ChordInterpreter.letterName(for: flatSeven, key: cMajor), "F#7")
    }

    func testAppliedBorrowedLocrianTriSubAndRaisedFifthCases() {
        var locrian = chord(root: 1, applied: 1)
        locrian["borrowed"] = .string("locrian")
        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: locrian, key: cMajor)?.chordQuality, "minor")
        XCTAssertEqual(Set(ChordInterpreter.chordNotes(for: locrian, key: cMajor).map(pitchClass)), [0, 3, 7])

        var tritone = chord(root: 6, applied: 5)
        tritone["borrowed"] = .string("minor")
        tritone["substitutions"] = .array([.string("tri")])
        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: tritone, key: cMajor)?.pitch.noteName, "Bbb")
        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: tritone, key: cMajor)?.context, .tritoneSubstitution)
        XCTAssertEqual(Set(ChordInterpreter.chordNotes(for: tritone, key: cMajor).map(pitchClass)), [9, 1, 4])

        var raisedFifth = chord(root: 4, applied: 7)
        raisedFifth["borrowed"] = .string("minor")
        raisedFifth["alterations"] = .array([.string("#5")])
        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: raisedFifth, key: cMajor)?.pitch.noteName, "E")
        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: raisedFifth, key: cMajor)?.chordQuality, "minor")
        XCTAssertEqual(Set(ChordInterpreter.chordNotes(for: raisedFifth, key: cMajor).map(pitchClass)), [0, 4, 7])
    }

    func testCustomBorrowedAppliedInversionIgnoresTonicization() {
        var value = chord(root: 5, inversion: 1, applied: 5)
        value["borrowed"] = .array([0, 2, 3, 5, 7, 8, 10].map { .number(Double($0)) })
        let root = ChordInterpreter.resolvedRoot(for: value, key: cMajor)
        XCTAssertEqual(root?.pitch.noteName, "G")
        XCTAssertEqual(root?.context, .borrowedApplied)
        XCTAssertEqual(root?.chordQuality, "major")
        XCTAssertEqual(Set(ChordInterpreter.chordNotes(for: value, key: cMajor).map(pitchClass)), [7, 11, 2])
    }

    func testStructuredRootSpellingAndRegister() throws {
        XCTAssertEqual(
            try XCTUnwrap(MusicTheory.spelledPitch(scaleDegree: "b3", relativeOctave: 0, key: .init(tonic: "C#", scale: "major"))).noteName,
            "E"
        )
        XCTAssertNil(MusicTheory.spelledPitch(scaleDegree: "degree3", relativeOctave: 0, key: cMajor))
        XCTAssertEqual(
            MusicTheory.spelledPitch(scaleDegree: "8", relativeOctave: 0, key: cMajor),
            MusicTheory.spelledPitch(scaleDegree: "1", relativeOctave: 1, key: cMajor)
        )

        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: chord(root: 3), key: .init(tonic: "C#", scale: "major"))?.pitch.noteName, "E#")
        var borrowed = chord(root: 6)
        borrowed["borrowed"] = .string("minor")
        XCTAssertEqual(ChordInterpreter.resolvedRoot(for: borrowed, key: cMajor)?.pitch.noteName, "Ab")

        let dominantOfDominant = chord(root: 5, applied: 5)
        let root = try XCTUnwrap(ChordInterpreter.resolvedRoot(for: dominantOfDominant, key: cMajor))
        XCTAssertEqual(root.pitch.noteName, "D")
        XCTAssertEqual(root.pitch.octave, 3)
        XCTAssertEqual(root.context, .applied)
        XCTAssertEqual(root.genericStepsFromTonic, 1)
        XCTAssertEqual(root.specificSemitonesFromTonic, 2)
    }

    private func chord(
        root: Int,
        type: Int = 5,
        inversion: Int = 0,
        applied: Int = 0
    ) -> [String: JSONValue] {
        [
            "root": .number(Double(root)),
            "type": .number(Double(type)),
            "inversion": .number(Double(inversion)),
            "applied": .number(Double(applied))
        ]
    }

    private func decode(_ source: String) throws -> [String: JSONValue] {
        try JSONDecoder().decode([String: JSONValue].self, from: Data(source.utf8))
    }

    private func pitchClass(_ midi: Int) -> Int { ((midi % 12) + 12) % 12 }
}
