import XCTest
@testable import AcquiringCatalog

final class AuralAlgorithmsTests: XCTestCase {
    func testNativeLoopFixtures() throws {
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("contracts").path), root.path != "/" { root.deleteLastPathComponent() }
        struct Case: Decodable { let tokens: [String]; let redundant: Bool; let start: Int; let length: Int }
        let cases = try JSONDecoder().decode([Case].self, from: Data(contentsOf: root.appendingPathComponent("contracts/aural-corpus/ios-b07/loop-reduction.json")))
        for c in cases {
            let actual = AuralLoopReduction.reduce(c.tokens)
            XCTAssertEqual(actual.redundant, c.redundant)
            XCTAssertEqual(actual.start, c.start)
            XCTAssertEqual(actual.length, c.length)
        }
        XCTAssertEqual(AuralLoopReduction.retainedChildren(["X", "I", "V", "I", "V"]), [["X", "I", "V", "I"], ["I", "V", "I"], ["V", "I", "V"]])
    }
    func testNativeQuerySemanticsAndDecodeValidation() throws {
        let query = try AuralProgressionQuery(chords: [AuralChordConstraint(degree: 5), AuralChordConstraint(degree: 1, family: "minor")])
        XCTAssertTrue(query.matches(labels: ["ii", "V7", "i9", "IV"]))
        XCTAssertFalse(query.matches(labels: ["V7", "IV", "i9"]))
        XCTAssertFalse(query.matches(labels: ["V/V", "i9"]))
        XCTAssertTrue(try AuralChordConstraint(degree: 7, accidental: "♭").matches("bVII13sus4"))
        XCTAssertTrue(try AuralChordConstraint(degree: 5, family: "7").matches("V9"))
        XCTAssertFalse(try AuralChordConstraint(degree: 5, family: "7").matches("V△7"))
        let exact = try AuralChordConstraint(degree: 5, exact: "V7", inversion: "V65")
        XCTAssertTrue(exact.matches("V65", rootLabel: "V7"))
        XCTAssertFalse(exact.matches("V43", rootLabel: "V7"))
        XCTAssertThrowsError(try JSONDecoder().decode(AuralProgressionQuery.self, from: Data("{\"version\":2}".utf8)))
        XCTAssertThrowsError(try JSONDecoder().decode(AuralChordConstraint.self, from: Data("{\"degree\":8}".utf8)))
    }
    func testCapturedNativeIdentitiesAndGrouping() throws {
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("contracts").path), root.path != "/" { root.deleteLastPathComponent() }
        struct Case: Decodable { let tokens: [String]; let view: String; let expected: String }
        struct Fixture: Decodable { let cases: [Case] }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: root.appendingPathComponent("contracts/aural-corpus/ios-b07/identity.json")))
        for c in fixture.cases { XCTAssertEqual(AuralIdentity.pattern(tokens: c.tokens, view: c.view), c.expected) }
        for label in ["V65", "V43", "V42", "V9/ii", "V11", "V13sus4"] {
            XCTAssertEqual(AuralStartGroup.parse(label), AuralStartGroup.parse("V7"))
        }
        XCTAssertEqual(AuralStartGroup.parse("bVII9(mix)"), AuralStartGroup.parse("♭VII7"))
        XCTAssertEqual(AuralStartGroup.parse("Iadd9sus4"), AuralStartGroup.parse("I"))
        XCTAssertEqual(AuralStartGroup.parse("iV")?.label, "iv")
        let labels = ["I", "i", "I7", "I△7", "ii°", "iiø7", "III+"]
        XCTAssertEqual(Set(labels.compactMap { AuralStartGroup.parse($0)?.id }).count, labels.count)
        XCTAssertEqual(["I△7", "i", "I7", "I"].compactMap(AuralStartGroup.parse).sorted(by: AuralStartGroup.ordered).map(\.label), ["I", "I7", "I△7", "i"])
    }

    func testEligibilityWordBoundariesAndEmptySuffix() {
        let bits = AuralRankEligibility(words: [1 << 63, 0, 1, 0])
        XCTAssertTrue(bits.hasAny(start: 63, end: 63))
        XCTAssertFalse(bits.hasAny(start: 64, end: 127))
        XCTAssertTrue(bits.hasAny(start: 64, end: 128))
        XCTAssertFalse(bits.hasAny(start: 129, end: Int.max))
        XCTAssertFalse(bits.hasAny(start: -1, end: 128))
        XCTAssertTrue(AuralRankEligibility(words: [0]).isEmpty)
    }
}
