import XCTest
@testable import AcquiringCore

final class NotationModelsTests: XCTestCase {
    func testSecondaryDominantSlashStaysOnBaseRow() {
        XCTAssertEqual(
            RomanNumeralTokenizer.tokenize("V7/vi"),
            [base("V"), superscript("7"), base("/"), base("vi")]
        )
        XCTAssertEqual(
            RomanNumeralTokenizer.tokenize("vii°7/V"),
            [base("vii"), superscript("°7"), base("/"), base("V")]
        )
    }

    func testAdjacentInversionPairsBecomeFiguredBassStacks() {
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("I64"), [base("I"), superscript("6"), subscriptPart("4")])
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("I46"), [base("I"), superscript("6"), subscriptPart("4")])
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("ii65"), [base("ii"), superscript("6"), subscriptPart("5")])
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("V43"), [base("V"), superscript("4"), subscriptPart("3")])
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("V42"), [base("V"), superscript("4"), subscriptPart("2")])
    }

    func testQualitySuffixAndSuspensionSemanticsMatchAndroid() {
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("viiø65"), [base("vii"), superscript("ø6"), subscriptPart("5")])
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("I△42"), [base("I"), superscript("△"), superscript("4"), subscriptPart("2")])
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("Isus4"), [base("I"), subscriptPart("sus4")])
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("V7(b9)"), [base("V"), superscript("7"), suffix("(b9)")])
        XCTAssertEqual(
            RomanNumeralTokenizer.tokenize("I△9(no3)(no5)"),
            [base("I"), superscript("△9"), suffix("(no3)"), suffix("(no5)")]
        )
    }

    func testLegacyUnicodeDigitsNormalizeBeforeLayout() {
        XCTAssertEqual(RomanNumeralTokenizer.normalizeDigits("I⁶₄"), "I64")
        XCTAssertEqual(RomanNumeralTokenizer.tokenize("I⁶₄"), [base("I"), superscript("6"), subscriptPart("4")])
    }

    func testBorrowedModeLabelsSeparateFromRomanSymbol() {
        XCTAssertEqual(
            RomanNumeralDisplay(symbol: "♭VII(mix)", borrowed: .string("mixolydian")),
            RomanNumeralDisplay(symbol: "♭VII", borrowedLabel: "(mix)")
        )
        XCTAssertEqual(
            RomanNumeralDisplay(symbol: "♭ii7/V(∆-sub)", borrowed: nil),
            RomanNumeralDisplay(symbol: "♭ii7/V(∆-sub)")
        )
        XCTAssertEqual(
            RomanNumeralDisplay(symbol: "♭VI(bor)", borrowed: .array([])),
            RomanNumeralDisplay(symbol: "♭VI", borrowedLabel: "(bor)")
        )
    }

    func testStackSpansKeepInversionsIndependentFromAppliedChords() {
        let parts = RomanNumeralTokenizer.tokenize("V43/ii")
        XCTAssertEqual(parts, [base("V"), superscript("4"), subscriptPart("3"), base("/"), base("ii")])
        XCTAssertEqual(RomanNumeralTokenizer.stackSpan(in: parts, at: 1), 2)
        XCTAssertEqual(RomanNumeralTokenizer.stackSpan(in: parts, at: 3), 0)
    }

    func testScaleDegreeParsingAndAccessibilitySpelling() {
        XCTAssertEqual(
            ScaleDegreeLabel.parse("♭7\u{0302}"),
            ScaleDegreeLabel(source: "♭7\u{0302}", prefix: "♭", degree: "7", suffix: "")
        )
        XCTAssertEqual(
            ScaleDegreeLabel.parse("♯♯4\u{0302}"),
            ScaleDegreeLabel(source: "♯♯4\u{0302}", prefix: "♯♯", degree: "4", suffix: "")
        )
        XCTAssertEqual(ScaleDegreeLabel.parse("♭7\u{0302}").spokenText, "flat 7")
        XCTAssertEqual(ScaleDegreeLabel.parse("♯♯4\u{0302}").spokenText, "sharp sharp 4")
    }

    private func base(_ text: String) -> RomanNumeralPart { .init(kind: .base, text: text) }
    private func superscript(_ text: String) -> RomanNumeralPart { .init(kind: .superscript, text: text) }
    private func subscriptPart(_ text: String) -> RomanNumeralPart { .init(kind: .subscriptPart, text: text) }
    private func suffix(_ text: String) -> RomanNumeralPart { .init(kind: .suffix, text: text) }
}
