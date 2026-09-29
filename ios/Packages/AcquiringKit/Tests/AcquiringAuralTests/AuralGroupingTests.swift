import AcquiringAural
import AcquiringCore
import Foundation
import XCTest

final class AuralGroupingTests: XCTestCase {
    func testMinimumPopularityIncludesBoundaryAndExcludesMissingScores() {
        XCTAssertTrue(AuralPopularityFilter.includes(0.8, minimumPercent: 80))
        XCTAssertFalse(AuralPopularityFilter.includes(0.7999, minimumPercent: 80))
        XCTAssertFalse(AuralPopularityFilter.includes(nil, minimumPercent: 80))
        XCTAssertFalse(AuralPopularityFilter.includes(Double.nan, minimumPercent: 80))
        XCTAssertFalse(AuralPopularityFilter.includes(1.1, minimumPercent: 80))
        XCTAssertTrue(AuralPopularityFilter.includes(0, minimumPercent: 0))
        XCTAssertFalse(AuralPopularityFilter.includes(nil, minimumPercent: 0))
        XCTAssertTrue(AuralPopularityFilter.includes(nil, minimumPercent: nil))
    }
    func testCatalogDefaultsToGlobalSongFrequency() {
        XCTAssertEqual(AuralCatalogQuery().sortOrder, "mostSongs")
        let row = AuralCatalogRow(id: "example", view: "harmony", tokens: ["I", "V"], labels: ["I", "V"],
                                  start: 0, end: 2, snapshotId: "snapshot", occurrenceCount: 3,
                                  songCount: 1, sectionCount: 1, effectiveOccurrenceCount: 1, score: 10,
                                  globalOccurrenceCount: 12, globalSongCount: 5)
        XCTAssertEqual(row.songCount, 1)
        XCTAssertEqual(row.globalSongCount, 5)
    }
    func testDefaultAndLegacySettingsUseRelativeMajor() throws {
        XCTAssertEqual(AuralSettings().view, "relative_harmony")
        let legacy = try JSONDecoder().decode(AuralSettings.self, from: Data(#"{"popularity":true,"variety":true,"favorites":false,"distinguishInversions":false,"flatList":false}"#.utf8))
        XCTAssertEqual(legacy.analysis, "relativeMajor")
        var settings = legacy
        settings.analysis = "allModes"
        XCTAssertEqual(settings.view, "harmony")
        settings.analysis = "filterMode"
        settings.modeFilter = "dorian"
        settings.distinguishInversions = true
        XCTAssertEqual(settings.view, "harmony_bass")
        XCTAssertEqual(settings.modeFilter, "dorian")
    }

    func testStartingChordOrderPreservesQualityAndAccidentals() {
        let labels = ["♯I", "i", "I7", "I△7", "♭I", "ii°", "iiø7", "III+"]
        let ids = ["♯:1:upper:major:none", "natural:1:lower:minor:none", "natural:1:upper:major:minor",
                   "natural:1:upper:major:major", "♭:1:upper:major:none", "natural:2:lower:diminished:none",
                   "natural:2:lower:halfDiminished:minor", "natural:3:upper:augmented:none"]
        let buckets = zip(ids, labels).map { AuralCatalogBucket(length: 3, startingChord: $0.0, label: $0.1) }
        XCTAssertEqual(Set(buckets.map(\.id)).count, labels.count)
        XCTAssertEqual(buckets.sorted(by: AuralCatalogBucket.startingChordBefore).map(\.label),
                       ["♭I", "I7", "I△7", "i", "♯I", "ii°", "iiø7", "III+"])
    }

    func testRelativeTokensReportMajorMode() throws {
        let relative = AuralPattern(id:"one",view:"relative_harmony",tokens:[#"{"version":"aural-relative-1","rootPc":0,"intervals":[0,4,7]}"#],labels:["I"],start:0,end:0,snapshotId:"snapshot")
        XCTAssertEqual(relative.mode,"major")
    }
}
