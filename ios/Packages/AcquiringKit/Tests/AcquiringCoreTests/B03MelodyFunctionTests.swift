import Foundation
import XCTest
@testable import AcquiringCore

final class B03MelodyFunctionTests: XCTestCase {
    private struct Corpus: Decodable {
        var authority: String
        var roles: [Role]
        var registers: [Register]
        var timelines: [Timeline]
    }
    private struct Role: Decodable {
        struct Expected: Decodable { var title: String; var cue: String?; var tone: MelodyFunctionTone }
        var id: String; var current: String?; var previous: String?; var next: String?
        var scaleDegreeLabel: String; var chordTones: [MelodyFunctionChordTone]?
        var previousIsCurrentChordTone: Bool?; var nextIsCurrentChordTone: Bool?
        var currentWasPreviousChordTone: Bool?; var currentWillBeNextChordTone: Bool?
        var arrivedBeforeNextChord: Bool?; var heldAcrossChordChange: Bool?; var chordChangesDuringNote: Int?
        var expected: Expected
    }
    private struct Register: Decodable { var id: String; var mode: String; var input: [Int?]; var expected: [Int?] }
    private struct Timeline: Decodable {
        var id: String; var section: ExtractedSection; var melody: [MelodyNote]; var expected: [MelodyCueEvent]
    }
    private func corpus() throws -> Corpus {
        var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while directory.path != "/" {
            let file = directory.appendingPathComponent("contracts/fixtures/b03-melody-function.json")
            if FileManager.default.fileExists(atPath: file.path) {
                return try JSONDecoder().decode(Corpus.self, from: Data(contentsOf: file))
            }
            directory.deleteLastPathComponent()
        }
        throw NSError(domain: "Missing B03 source fixture", code: 1)
    }
    func testFrozenRolesAndRegisters() throws {
        let data = try corpus()
        XCTAssertEqual(data.authority, "3c887223b2d06b4c3a1010d0f8a23ceaf8977d08")
        func pitch(_ name: String?) -> SpelledPitch? { name.flatMap { SpelledPitch.parse(noteName: $0, octave: 4) } }
        for c in data.roles {
            var input = MelodyFunctionInput(currentPitch: pitch(c.current), scaleDegreeLabel: c.scaleDegreeLabel,
                                            key: KeyInfo(tonic: "C", scale: "major"), chordTones: c.chordTones)
            input.previousPitch = pitch(c.previous); input.nextPitch = pitch(c.next)
            input.previousIsCurrentChordTone = c.previousIsCurrentChordTone ?? false
            input.nextIsCurrentChordTone = c.nextIsCurrentChordTone ?? false
            input.currentWasPreviousChordTone = c.currentWasPreviousChordTone ?? false
            input.currentWillBeNextChordTone = c.currentWillBeNextChordTone ?? false
            input.arrivedBeforeNextChord = c.arrivedBeforeNextChord ?? false
            input.heldAcrossChordChange = c.heldAcrossChordChange ?? false
            input.chordChangesDuringNote = c.chordChangesDuringNote ?? 0
            let actual = MelodyFunction.describe(input)
            XCTAssertEqual(actual.title, c.expected.title, c.id)
            XCTAssertEqual(actual.tone, c.expected.tone, c.id)
            XCTAssertEqual(MelodyFunction.spokenCue(actual), c.expected.cue, c.id)
            if c.id == "b03-leading-member" { XCTAssertTrue(actual.detail.contains("The next note does.")) }
        }
        for c in data.registers {
            XCTAssertEqual(c.mode == "singing" ? SingingMelodyRegister.singing(c.input) : SingingMelodyRegister.spoken(c.input), c.expected, c.id)
        }
        XCTAssertEqual(SingingMelodyRegister.placeSpoken(72, previousSounding: 71, previousSpoken: 71), 72)
        XCTAssertEqual(SingingMelodyRegister.placeSpoken(72, previousSounding: 71, previousSpoken: 59), 60)
    }
    func testFrozenNativeTimelineAnnotations() throws {
        for c in try corpus().timelines {
            let inputs = c.expected.map { MelodyCueEvent(layer: $0.layer, startBeat: $0.startBeat, fullMidiNotes: $0.fullMidiNotes) }
            XCTAssertEqual(MelodyCueAnnotation.annotate(section: c.section, melody: c.melody, events: inputs), c.expected, c.id)
            XCTAssertTrue(inputs.allSatisfy { $0.spokenMelodyCue == nil })
        }
    }
    func testRestBreaksNeighborsAndSourceKeyDoesNotFollowSoundingTranspose() {
        let chord: [String: JSONValue] = ["root": .number(1), "type": .number(5), "beat": .number(1), "duration": .number(4)]
        let section = ExtractedSection(chords: [chord])
        let melody = [MelodyNote(sd: "1", beat: 1, duration: 1), MelodyNote(sd: "1", beat: 2, duration: 1, isRest: true), MelodyNote(sd: "2", beat: 3, duration: 1)]
        let input = MelodyCueAnnotation.input(section: section, melody: melody, noteIndex: 2, chordIndex: 0)
        XCTAssertNil(input.previousPitch)
        XCTAssertFalse(input.previousIsCurrentChordTone)
        let shifted = [MelodyCueEvent(layer: .melody, startBeat: 1, fullMidiNotes: [62])]
        let output = MelodyCueAnnotation.annotate(section: section, melody: melody, events: shifted)
        XCTAssertEqual(output[0].spokenMelodyCue, "root")
        XCTAssertEqual(output[0].melodyCueMidi, 50)
        let minor = KeyInfo(tonic: "C", scale: "minor")
        let major = KeyInfo(tonic: "C", scale: "major")
        let third = [MelodyNote(sd: "3", beat: 1, duration: 1)]
        XCTAssertEqual(SingingMelodyRegister.pitches(third, keyAt: { _ in minor })[0]?.midiNote, 63)
        XCTAssertEqual(SingingMelodyRegister.pitches(third, keyAt: { _ in major })[0]?.midiNote, 64)
    }
    func testCueAliasesAndSemanticColors() {
        for (title, cue) in [("Chord octave", "root"), ("Chord tenth", "third"), ("Chromatic upper neighbor", "upper neighbor")] {
            let description = MelodyFunctionDescription(title: title, detail: "", tone: .moving)
            XCTAssertEqual(MelodyFunction.spokenCue(description), cue)
        }
        XCTAssertTrue(MelodyFunction.isSpokenChordTone("seventh"))
        XCTAssertFalse(MelodyFunction.isSpokenChordTone("one"))
        XCTAssertEqual(MelodyFunctionTone.stable.rgb, 0x4CAF50)
        XCTAssertNil(MelodyFunctionTone.neutral.rgb)
    }
}
