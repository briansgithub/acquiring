import AcquiringAural
import Foundation
import XCTest

final class AuralProgressionQueryTests: XCTestCase {
    func testConsecutiveWholeChordMatching() {
        let query=AuralProgressionQuery(chords:[AuralChordConstraint(degree:5),AuralChordConstraint(degree:1,family:"minor")])
        XCTAssertTrue(query.matches(["ii","V7","i9","IV"]))
        XCTAssertFalse(query.matches(["V7","IV","i9"]))
        XCTAssertFalse(query.matches(["V/V","i9"]))
        XCTAssertFalse(query.matches(["IV","i9"]))
        XCTAssertTrue(AuralProgressionQuery().matches([]))
    }

    func testAccidentalsFamiliesAndExactForms() {
        XCTAssertTrue(AuralChordConstraint(degree:7,accidental:"♭").matches("bVII13sus4"))
        XCTAssertFalse(AuralChordConstraint(degree:7).matches("♭VII13sus4"))
        XCTAssertTrue(AuralChordConstraint(degree:5,family:"7").matches("V9"))
        XCTAssertFalse(AuralChordConstraint(degree:5,family:"7").matches("V△7"))
        XCTAssertTrue(AuralChordConstraint(degree:5,exact:"V7/V").matches("V7/V"))
        XCTAssertFalse(AuralChordConstraint(degree:5,exact:"V7/V").matches("V7"))
        XCTAssertTrue(AuralChordConstraint(degree:2,exact:"iiø7").matches("iiø7"))
    }

    func testVersionedQueryRoundTrips() throws {
        let query=AuralProgressionQuery(chords:[AuralChordConstraint(degree:4,accidental:"♯",exact:"♯IV+")])
        XCTAssertEqual(try JSONDecoder().decode(AuralProgressionQuery.self,from:JSONEncoder().encode(query)),query)
    }

    func testExactRootAndOptionalInversion() {
        let root=AuralChordConstraint(degree:5,exact:"V7")
        XCTAssertTrue(root.matches("V65",rootLabel:"V7"))
        XCTAssertFalse(root.matches("V65",rootLabel:"V△7"))
        let inversion=AuralChordConstraint(degree:5,exact:"V7",inversion:"V65")
        XCTAssertTrue(inversion.matches("V65",rootLabel:"V7"))
        XCTAssertFalse(inversion.matches("V43",rootLabel:"V7"))
        XCTAssertTrue(AuralProgressionQuery(chords:[inversion]).matches(["V65"],rootLabels:["V7"]))
    }
}
