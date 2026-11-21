import AcquiringAural
import Foundation
import XCTest

final class AuralLoopReductionTests: XCTestCase {
    private struct Fixture: Decodable {
        let tokens: [String]
        let redundant: Bool
        let start: Int
        let length: Int
    }
    func testCommonFixtures() throws {
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while root.path != "/" && !FileManager.default.fileExists(atPath: root.appendingPathComponent("tooling/aural-corpus/fixtures/loop-reduction.json").path) {
            root.deleteLastPathComponent()
        }
        let data = try Data(contentsOf: root.appendingPathComponent("tooling/aural-corpus/fixtures/loop-reduction.json"))
        for fixture in try JSONDecoder().decode([Fixture].self, from: data) {
            let actual = AuralLoopReduction.analyze(fixture.tokens)
            XCTAssertEqual(actual.redundant, fixture.redundant, fixture.tokens.description)
            XCTAssertEqual(actual.start, fixture.start, fixture.tokens.description)
            XCTAssertEqual(actual.length, fixture.length, fixture.tokens.description)
        }
    }
    func testHiddenChildrenPromoteBothBranches() {
        XCTAssertEqual(AuralLoopReduction.retainedChildren(["X","I","V","I","V"]),
                       [["X","I","V","I"],["I","V","I"],["V","I","V"]])
    }
}
