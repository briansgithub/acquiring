import XCTest
@testable import AcquiringCore

final class ChordInterpretationTests: XCTestCase {
    private let cMajor = KeyInfo(tonic: "C", scale: "major")

    private func chord(_ source: String) throws -> [String: JSONValue] {
        try JSONDecoder().decode([String: JSONValue].self, from: Data(source.utf8))
    }

    func testIndependentMusicalRoleContract() throws {
        struct Fixture: Decodable {
            struct DisplayContext: Decodable { let tonic: String }
            let id: String
            let chord: [String: JSONValue]
            let key: KeyInfo
            let expectedRootMidi: Int?
            let expectedToneLabels: [String]
            let displayContext: DisplayContext?
            let expectedRelativeIonianRoman: String?
        }
        let fixtures = try JSONDecoder().decode([Fixture].self,
            from: Data(contentsOf: ChordContractFixtures.url("chord_role_contract.json")))
        XCTAssertFalse(fixtures.isEmpty)
        XCTAssertEqual(Set(fixtures.map(\.id)).count, fixtures.count)
        for fixture in fixtures {
            let result = ChordInterpreter.interpret(fixture.chord, key: fixture.key)
            XCTAssertEqual(result.rootMidi, fixture.expectedRootMidi, fixture.id)
            XCTAssertEqual(result.toneLabels, fixture.expectedToneLabels, fixture.id)
            XCTAssertEqual(result.midi.count, result.toneLabels.count, fixture.id)
            if let expected = fixture.expectedRelativeIonianRoman {
                let context = fixture.displayContext.map { KeyInfo(tonic: $0.tonic, scale: "major") }
                XCTAssertEqual(ChordInterpreter.relativeIonianRomanSymbol(for: fixture.chord, key: fixture.key, contextKey: context), expected, fixture.id)
            }
        }
    }

    func testRestAndInvalidInputsHaveNoInterpretation() throws {
        for source in ["{}", #"{"root":1,"isRest":true}"#, #"{"root":5,"rest":true}"#,
                       #"{"root":8}"#, #"{"root":-1}"#,
                       #"{"root":8,"_letterRootName":"C"}"#, #"{"root":0,"_letterRootName":"invalid"}"#] {
            let result = ChordInterpreter.interpret(try chord(source), key: cMajor)
            XCTAssertEqual(result.roman, "", source)
            XCTAssertEqual(result.letter, "", source)
            XCTAssertEqual(result.midi, [], source)
            XCTAssertNil(result.rootMidi, source)
            XCTAssertEqual(result.toneLabels, [], source)
        }
    }

    func testRootMetadataSurvivesInversion() throws {
        for inversion in 0...2 {
            let value = try chord("{\"root\":1,\"inversion\":\(inversion)}")
            let result = ChordInterpreter.interpret(value, key: cMajor)
            XCTAssertEqual(result.rootMidi, 48)
            XCTAssertTrue(result.toneLabels.contains("1\u{0302}"))
            XCTAssertEqual(result.midi.count, result.toneLabels.count)
        }
    }

    func testDiminishedSeventhAndSuspensionKeepTheirMusicalRoles() throws {
        let diminished = ChordInterpreter.interpret(try chord(#"{"root":7,"type":7}"#), key: cMajor)
        XCTAssertTrue(diminished.toneLabels.contains("♭♭7\u{0302}"))
        XCTAssertFalse(diminished.toneLabels.contains("6\u{0302}"))
        let suspension = ChordInterpreter.interpret(try chord(#"{"root":1,"suspensions":[4],"inversion":1}"#), key: cMajor)
        XCTAssertTrue(suspension.toneLabels.contains("4\u{0302}"))
        XCTAssertFalse(suspension.toneLabels.contains("3\u{0302}"))
        let extended = ChordInterpreter.interpret(try chord(#"{"root":5,"type":13}"#), key: cMajor)
        for degree in ["9\u{0302}", "11\u{0302}", "13\u{0302}"] {
            XCTAssertTrue(extended.toneLabels.contains(degree), degree)
        }
    }

    func testMatchingMajorContextPreservesCompleteCanonicalSymbols() throws {
        for source in [
            #"{"root":1,"type":7,"borrowed":[0,2,3,5,7,8,10]}"#,
            #"{"root":5,"type":7,"inversion":3,"alterations":["b9"]}"#,
            #"{"root":1,"inversion":2,"suspensions":[4],"adds":[9]}"#
        ] {
            let value = try chord(source)
            XCTAssertEqual(
                ChordInterpreter.relativeIonianRomanSymbol(for: value, key: cMajor, contextKey: cMajor),
                ChordInterpreter.romanSymbol(for: value, key: cMajor), source
            )
        }
    }

    func testPhrygianDominantSupertonicSuspensionPreservesSourcePitchesAndRoles() throws {
        let value = try chord(#"{"root":2,"type":7,"inversion":3,"suspensions":[2]}"#)
        let result = ChordInterpreter.interpret(value, key: .init(tonic: "C", scale: "phrygianDominant"))
        XCTAssertEqual(result.midi, [60, 61, 64, 68])
        XCTAssertEqual(result.rootMidi, 49)
        XCTAssertEqual(result.toneLabels, ["7\u{0302}", "1\u{0302}", "♯2\u{0302}", "5\u{0302}"])
    }

    func testFiguredBassRetainsAlterationsAndDoesNotDuplicateAdds() throws {
        let altered = try chord(#"{"root":5,"type":7,"inversion":3,"alterations":["b9"]}"#)
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: altered, key: cMajor), "V4(b9)2")
        let halfDiminished = try chord(##"{"root":2,"type":7,"inversion":3,"alterations":["b5","#9"]}"##)
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: halfDiminished, key: cMajor), "iiø4(b5)(#9)2")
        let appliedSuspension = try chord(#"{"root":5,"applied":5,"inversion":2,"suspensions":[4]}"#)
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: appliedSuspension, key: cMajor), "V64sus4/V")
        let suspended = try chord(#"{"root":1,"inversion":2,"suspensions":[4],"adds":[9]}"#)
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: suspended, key: cMajor), "I6(add9)4sus4")
    }
}
