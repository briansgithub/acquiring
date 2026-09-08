import XCTest
@testable import AcquiringCore

/// Expectations retained from independently captured historical Hooktheory symbols.
final class HistoricalSymbolNotationTests: XCTestCase {
    private func chord(_ source: String) throws -> [String: JSONValue] {
        try JSONDecoder().decode([String: JSONValue].self, from: Data(source.utf8))
    }

    func testAlteredFifthPreservesTheSourceSlashBass() throws {
        // Aram Khachaturian, Masquerade Waltz, Verse/61: II43(b5)(lyd), B7(b5)/F#.
        let input = try chord(#"{"root":2,"type":7,"inversion":2,"alterations":["b5"],"borrowed":"lydian"}"#)
        XCTAssertEqual(ChordInterpreter.letterName(for: input, key: .init(tonic: "A", scale: "minor")), "B7(b5)/F#")
    }

    func testAlteredExtensionsUseTheCapturedScaleAndKeepTheLowerExtension() throws {
        // Ed Helms, How Bad Can I Be, Outro/5: I13(#9)(mix), E13(#9).
        let sharpNinth = try chord(##"{"root":1,"type":13,"alterations":["#9"],"borrowed":"mixolydian"}"##)
        XCTAssertEqual(ChordInterpreter.letterName(for: sharpNinth, key: .init(tonic: "E", scale: "phrygianDominant")), "E13(#9)")
        // Hololive, Journey Like a Thousand Years, Intro/14.5: v13, g#m11(b9b13).
        let minorThirteenth = try chord(#"{"root":5,"type":13}"#)
        XCTAssertEqual(ChordInterpreter.letterName(for: minorThirteenth, key: .init(tonic: "C#", scale: "minor")), "G#m11(b9b13)")
        // Holst, Mars, Pre-Chorus/18: I△11(#9)(lyd), Cmaj7(#9#11).
        let alteredEleventh = try chord(##"{"root":1,"type":11,"alterations":["#9"],"borrowed":"lydian"}"##)
        XCTAssertEqual(ChordInterpreter.letterName(for: alteredEleventh, key: .init(tonic: "C", scale: "phrygianDominant")), "Cmaj7(#9#11)")
    }

    func testDualSuspensionsKeepTheirOwnWrittenFourth() throws {
        // Ed Helms, How Bad Can I Be, Outro/21: VII7(#11)sus2sus4(dor).
        let input = try chord(##"{"root":7,"type":7,"alterations":["#11"],"suspensions":[2,4],"borrowed":"dorian"}"##)
        XCTAssertEqual(ChordInterpreter.letterName(for: input, key: .init(tonic: "E", scale: "phrygianDominant")), "D7(#11)sus2sus4")
    }

    func testExtendedInversionIndicesDoNotInventASourceSlash() throws {
        // Glitched Hookpad Projects, Inverted 11ths and 13ths, Instrumental/10,12.25,14.5.
        for inversion in 4...6 {
            let input = try chord("{\"root\":1,\"type\":13,\"inversion\":\(inversion)}")
            XCTAssertEqual(ChordInterpreter.letterName(for: input, key: .init(tonic: "C", scale: "major")), "Cmaj13")
        }
    }

    func testAppliedSymbolsKeepTargetQualityAndSuspensionQuality() throws {
        // Barbra Streisand, Woman in Love, Chorus/19: V/III+.
        let augmentedTarget = try chord(#"{"root":3,"type":5,"applied":5}"#)
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: augmentedTarget, key: .init(tonic: "D#", scale: "harmonicMinor")), "V/III+")
        // Joni Mitchell, My Old Man, Chorus/12.5: V6(#5)sus4/V.
        let sharpSuspension = try chord(##"{"root":5,"type":5,"inversion":1,"applied":5,"alterations":["#5"],"suspensions":[4]}"##)
        let key = KeyInfo(tonic: "A", scale: "major")
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: sharpSuspension, key: key), "V6(#5)sus4/V")
        XCTAssertEqual(ChordInterpreter.letterName(for: sharpSuspension, key: key), "B(#5)sus4/E")
    }

    func testModalAppliedNumeratorsKeepTheSourceMajorTagExceptForSubstitutions() throws {
        // The aligned source observations retain the modal numerator tag, except
        // on tritone substitutions and harmonic-minor inputs.
        let input = try chord(#"{"root":5,"type":5,"applied":5}"#)
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: input, key: .init(tonic: "C", scale: "dorian")), "V(maj)/v")
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: input, key: .init(tonic: "C", scale: "lydian")), "V(maj)/V")
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: input, key: .init(tonic: "C", scale: "harmonicMinor")), "V/V")
        let substitution = try chord(#"{"root":5,"type":5,"applied":5,"substitutions":["tri"]}"#)
        XCTAssertEqual(ChordInterpreter.romanSymbol(for: substitution, key: .init(tonic: "C", scale: "dorian")), "♭II(∆-sub)/v")
    }

    func testAlteredNinthRetainsItsRoleWhenItSharesTheThirdPitchClass() throws {
        let shell = try chord(##"{"root":5,"type":11,"alterations":["#9"]}"##)
        let shellResult = ChordInterpreter.interpret(shell, key: .init(tonic: "C", scale: "minor"))
        XCTAssertEqual(shellResult.midi, [55, 60, 65, 70])
        XCTAssertEqual(shellResult.toneLabels, ["1\u{0302}", "11\u{0302}", "♭7\u{0302}", "♯9\u{0302}"])
        let explicitFifth = try chord(##"{"root":2,"type":11,"alterations":["#5","#9"]}"##)
        let fifthResult = ChordInterpreter.interpret(explicitFifth, key: .init(tonic: "C", scale: "major"))
        XCTAssertEqual(fifthResult.midi, [50, 53, 55, 58, 60, 65])
        XCTAssertEqual(fifthResult.toneLabels, ["1\u{0302}", "♭3\u{0302}", "11\u{0302}", "♯5\u{0302}", "♭7\u{0302}", "♯9\u{0302}"])
    }

    func testHistoricalVoicingPreservesTriadRegisterAndWrittenAccidentalOctaves() throws {
        let addedSixth = try chord(#"{"root":3,"type":5,"applied":7,"adds":[6]}"#)
        let sixthResult = ChordInterpreter.interpret(addedSixth, key: .init(tonic: "D", scale: "major"))
        XCTAssertEqual(sixthResult.midi, [53, 56, 59, 62])
        XCTAssertEqual(sixthResult.toneLabels, ["1\u{0302}", "♭3\u{0302}", "♭5\u{0302}", "6\u{0302}"])
        let cFlat = try chord(#"{"root":2,"type":7,"inversion":2,"applied":5,"alterations":["b9"],"suspensions":[4]}"#)
        XCTAssertEqual(ChordInterpreter.chordNotes(for: cFlat, key: .init(tonic: "Db", scale: "major")), [53, 80, 71, 82, 75])
        let bSharp = try chord(##"{"root":5,"type":7,"inversion":3,"applied":5,"alterations":["#11","#5"]}"##)
        XCTAssertEqual(ChordInterpreter.chordNotes(for: bSharp, key: .init(tonic: "E", scale: "minor")), [52, 84, 78, 82, 74])
        let doubleSharpModifier = try chord(#"{"root":1,"type":7,"inversion":3,"alterations":["x6"],"borrowed":"harmonicMinor"}"#)
        XCTAssertEqual(ChordInterpreter.letterName(for: doubleSharpModifier, key: .init(tonic: "C", scale: "minor")), "Cm(##6)/B")
    }

    func testLiveSourceOmissionsAndSuspensionsPreserveThePrevailingScale() throws {
        func pitchClasses(_ source: String, _ key: KeyInfo) throws -> [Int] {
            Set(ChordInterpreter.chordNotes(for: try chord(source), key: key).map { (($0 % 12) + 12) % 12 }).sorted()
        }
        // Dvorak, Serenade for Strings, Bridge/33: live C#–D#–F#.
        XCTAssertEqual(try pitchClasses(#"{"root":2,"type":7,"inversion":3,"omits":[5]}"#,
            .init(tonic: "C#", scale: "minor")), [1, 3, 6])
        XCTAssertEqual(ChordInterpreter.chordNotes(for: try chord(#"{"root":2,"type":7,"inversion":3,"omits":[5]}"#),
            key: .init(tonic: "C#", scale: "minor")), [61, 63, 66])
        // Junko Shiratsu, Speed of Sound, Pre-Chorus/30.5: live F#–G–E.
        XCTAssertEqual(try pitchClasses(#"{"root":4,"type":7,"omits":[5],"suspensions":[2]}"#,
            .init(tonic: "C", scale: "lydian")), [4, 6, 7])
        // They Might Be Giants, It's Not My Birthday, Chorus/35.5: C#–B–D–F#.
        XCTAssertEqual(try pitchClasses(#"{"root":7,"type":7,"omits":[5],"suspensions":[2,4]}"#,
            .init(tonic: "D", scale: "major")), [1, 2, 6, 11])
        // Gentle Giant, Peel the Paint, Pre-Chorus/8.5: live A–G–Bb–D.
        XCTAssertEqual(try pitchClasses(#"{"root":4,"type":11,"borrowed":"lydian"}"#,
            .init(tonic: "Eb", scale: "major")), [2, 7, 9, 10])
        // Explicit half-diminished symbol frames retain their established fifth.
        XCTAssertEqual(try pitchClasses(#"{"root":2,"type":7,"omits":[5],"halfDim":true}"#,
            .init(tonic: "B", scale: "minor")), [1, 4, 7, 10])
    }
}
