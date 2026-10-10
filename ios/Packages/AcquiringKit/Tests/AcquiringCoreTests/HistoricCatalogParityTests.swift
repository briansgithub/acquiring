import XCTest
@testable import AcquiringCore

final class HistoricCatalogParityTests: XCTestCase {
    func testEveryHistoricalChordMatchesTheSharedContract() throws {
        let fixtures = try JSONDecoder().decode([ChordParityTests.CorpusFixture].self,
            from: Data(contentsOf: ChordContractFixtures.url("historic_catalog_parity.json")))
        XCTAssertEqual(fixtures.count, 21_464, "Keep the complete historical input signature coverage")
        XCTAssertEqual(Set(fixtures.map(\.id)).count, fixtures.count, "Historical fixture IDs must be unique")

        var counts: [String: Int] = [:]
        var examples: [String] = []
        func record(_ channel: String, _ id: String, _ expected: Any, _ actual: Any) {
            counts[channel, default: 0] += 1
            if examples.count < 40 { examples.append("\(channel) [\(id)] expected \(expected), got \(actual)") }
        }
        for fixture in fixtures {
            let chord = try JSONDecoder().decode([String: JSONValue].self, from: Data(fixture.json.utf8))
            let result = ChordInterpreter.interpret(chord, key: fixture.key)
            let pitchClasses = Set(result.midi.map { (($0 % 12) + 12) % 12 }).sorted()
            if result.roman != fixture.expectedRoman { record("roman", fixture.id, fixture.expectedRoman, result.roman) }
            if result.letter != fixture.expectedLetter { record("letter", fixture.id, fixture.expectedLetter, result.letter) }
            if pitchClasses != fixture.expectedPcs.sorted() { record("pcs", fixture.id, fixture.expectedPcs, pitchClasses) }
            if result.midi != fixture.expectedMidi { record("midi", fixture.id, fixture.expectedMidi, result.midi) }
            if result.rootMidi != fixture.expectedRootMidi {
                record("rootMidi", fixture.id, String(describing: fixture.expectedRootMidi), String(describing: result.rootMidi))
            }
            if result.toneLabels != fixture.expectedToneLabels { record("toneLabels", fixture.id, fixture.expectedToneLabels, result.toneLabels) }
            if result.midi.count != result.toneLabels.count { record("toneCount", fixture.id, result.midi.count, result.toneLabels.count) }
        }
        XCTAssertTrue(counts.isEmpty,
            "Historical chord contract mismatches: \(counts)\n" + examples.joined(separator: "\n"))
    }
}
