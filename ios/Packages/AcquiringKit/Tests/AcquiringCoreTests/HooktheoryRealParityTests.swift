import XCTest
@testable import AcquiringCore

/// Scores the iOS chord engine against the chord shapes that actually occur in
/// the scraped Hooktheory corpus (197 songs), rather than against a synthetic
/// sweep. Each case carries both the web engine's output (the cross-platform
/// contract) and Hooktheory's own rendered ground truth (the accuracy ceiling).
final class HooktheoryRealParityTests: XCTestCase {
    struct RealFixture: Decodable {
        let id: String
        let occurrences: Int
        let json: String
        let key: KeyInfo
        let expectedRoman: String
        let expectedLetter: String
        let expectedPcs: [Int]
        let expectedMidi: [Int]
        let expectedRootMidi: Int?
        let expectedToneLabels: [String]
        let truthRoman: String
        let truthLetter: String
        let truthPcs: [Int]
    }

    func testRealSongParity() throws {
        let url = ChordContractFixtures.url("hooktheory_parity.json")
        let fixtures = try JSONDecoder().decode([RealFixture].self, from: Data(contentsOf: url))

        XCTAssertEqual(Set(fixtures.map(\.id)).count, fixtures.count, "Source fixture IDs must be unique")
        var channels: [String: (shapes: Int, plays: Int)] = [:]
        var totalPlays = 0
        var lines: [String] = []
        for fixture in fixtures {
            totalPlays += fixture.occurrences
            let chord = try JSONDecoder().decode([String: JSONValue].self, from: Data(fixture.json.utf8))
            let roman = ChordInterpreter.romanSymbol(for: chord, key: fixture.key)
            let letter = ChordInterpreter.letterName(for: chord, key: fixture.key)
            let notes = ChordInterpreter.chordNotes(for: chord, key: fixture.key)
            let rootMIDI = ChordInterpreter.resolvedRootMIDI(for: chord, key: fixture.key)
            let pcs = Set(notes.map { (($0 % 12) + 12) % 12 }).sorted()
            let labels = ChordInterpreter.chordToneLabels(for: chord, key: fixture.key)

            func check(_ name: String, _ ok: Bool, _ detail: @autoclosure () -> String) {
                guard !ok else { return }
                channels[name, default: (0, 0)].shapes += 1
                channels[name]!.plays += fixture.occurrences
                lines.append("\(name) [\(fixture.id)] ×\(fixture.occurrences) \(detail())")
            }
            check("roman", roman == fixture.expectedRoman, "expected \(fixture.expectedRoman), got \(roman)")
            check("letter", letter == fixture.expectedLetter, "expected \(fixture.expectedLetter), got \(letter)")
            check("pcs", pcs == fixture.expectedPcs.sorted(), "expected \(fixture.expectedPcs), got \(pcs)")
            check("midi", notes == fixture.expectedMidi, "expected \(fixture.expectedMidi), got \(notes)")
            check("rootMidi", rootMIDI == fixture.expectedRootMidi, "expected \(fixture.expectedRootMidi), got \(String(describing: rootMIDI))")
            check("toneLabels", labels == fixture.expectedToneLabels, "expected \(fixture.expectedToneLabels), got \(String(describing: labels))")
        }

        print("=== iOS vs web on \(fixtures.count) real chord shapes (\(totalPlays) occurrences) ===")
        for name in ["roman", "letter", "pcs", "midi", "rootMidi", "toneLabels"] {
            let bad = channels[name] ?? (0, 0)
            print(String(
                format: "  %-11@ shapes %5d/%5d (%5.1f%%)   weighted %6d/%6d (%5.1f%%)",
                name as NSString,
                fixtures.count - bad.shapes, fixtures.count,
                Double(fixtures.count - bad.shapes) * 100 / Double(fixtures.count),
                totalPlays - bad.plays, totalPlays,
                Double(totalPlays - bad.plays) * 100 / Double(totalPlays)
            ))
        }
        if let dump = ProcessInfo.processInfo.environment["ACQUIRING_REAL_DUMP"] {
            try? lines.joined(separator: "\n").write(toFile: dump, atomically: true, encoding: .utf8)
        }

        XCTAssertFalse(fixtures.isEmpty, "The Hooktheory contract must not be empty")
        XCTAssertTrue(channels.values.allSatisfy { $0.shapes == 0 },
            "Hooktheory contract mismatches: \(channels)\n" + lines.prefix(40).joined(separator: "\n"))
    }
}
