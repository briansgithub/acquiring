import XCTest
@testable import AcquiringCore

/// Covers the title-prefix runs that break a several-thousand-song All Songs
/// heading into scannable waypoints. There is no Android counterpart; these are
/// the boundaries the iOS list depends on.
final class BrowseSubgroupingTests: XCTestCase {
    func testShortGroupsAreLeftFlat() {
        let songs = makeSongs(titles: (0..<(BrowseSubgrouping.minimumSongCount - 1)).map { "Song \($0)" })
        XCTAssertEqual(BrowseSubgrouping.subgroups(for: songs), [])
        XCTAssertEqual(BrowseSubgrouping.subgroups(for: []), [])
    }

    func testAnAlphabeticalGroupSplitsOnTheSecondCharacter() {
        // Every title starts with "S", so a first-character split would produce
        // one useless run.
        let titles = padded(
            ["Sad Song", "Sailing", "Scarborough", "Shine", "shiver", "Summer"],
            filler: "Sz Filler"
        )
        let subgroups = BrowseSubgrouping.subgroups(for: makeSongs(titles: titles))

        XCTAssertEqual(subgroups.map(\.key), ["SA", "SC", "SH", "SU", "SZ"])
        XCTAssertEqual(subgroups.map(\.label), ["Sa", "Sc", "Sh", "Su", "Sz"])
        XCTAssertEqual(subgroups.map(\.songs.count), [2, 1, 2, 1, titles.count - 6])
        // Case never opens a second run for the same prefix.
        XCTAssertEqual(
            subgroups.first { $0.key == "SH" }?.songs.map(\.title),
            ["Shine", "shiver"]
        )
    }

    func testAMixedGroupSplitsOnTheFirstCharacter() {
        let titles = padded(["Alpha", "Beta", "beehive", "Zulu"], filler: "Zz Filler")
        let subgroups = BrowseSubgrouping.subgroups(for: makeSongs(titles: titles))

        XCTAssertEqual(subgroups.map(\.key), ["A", "B", "Z"])
        XCTAssertEqual(subgroups.map(\.songs.count), [1, 2, titles.count - 3])
    }

    func testEverySongLandsInExactlyOneRunInTheOrderItArrived() {
        let titles = padded(["Alpha", "Beta", "Gamma"], filler: "Zz Filler")
        let songs = makeSongs(titles: titles)
        let subgroups = BrowseSubgrouping.subgroups(for: songs)

        XCTAssertEqual(subgroups.flatMap(\.songs).map(\.id), songs.map(\.id))
    }

    func testALongSharedPrefixIsCappedRatherThanSpellingOutTheTitle() {
        let titles = padded(
            ["Thanks", "The Long And Winding Road", "The Longest Day"],
            filler: "Thz Filler"
        )
        let subgroups = BrowseSubgrouping.subgroups(for: makeSongs(titles: titles))

        // "Th" is shared, so the split needs three characters and stops there.
        XCTAssertEqual(subgroups.map(\.key), ["THA", "THE", "THZ"])
        XCTAssertEqual(subgroups.map(\.label), ["Tha", "The", "Thz"])
        XCTAssertTrue(subgroups.allSatisfy { $0.key.count <= BrowseSubgrouping.maximumPrefixLength })
    }

    func testAGroupThatSharesTheCappedPrefixStaysFlat() {
        // Nothing distinguishes these within three characters, so runs would
        // all carry one label; the list is left alone instead.
        let songs = makeSongs(titles: padded(["The Long Road"], filler: "The Long Filler"))
        XCTAssertEqual(BrowseSubgrouping.subgroups(for: songs), [])
    }

    func testASingleRunIsReportedAsNoRunsAtAll() {
        let songs = makeSongs(titles: Array(repeating: "Same Title", count: 60))
        XCTAssertEqual(BrowseSubgrouping.subgroups(for: songs), [])
    }

    func testUntitledSongsShareTheSymbolRunWithoutFlatteningTheOthers() {
        let titles = padded(["Sad Song", "Shine"], filler: "Sz Filler")
        var songs = makeSongs(titles: titles)
        songs.append(CatalogSong(id: "blank", artist: "Artist", title: "   "))
        songs.append(CatalogSong(id: "missing", artist: "Artist", title: nil))

        let subgroups = BrowseSubgrouping.subgroups(for: songs)

        XCTAssertEqual(subgroups.map(\.key), ["SA", "SH", "SZ", "#"])
        XCTAssertEqual(subgroups.last?.label, "#")
        XCTAssertEqual(subgroups.last?.songs.map(\.id), ["blank", "missing"])
    }

    func testLeadingWhitespaceIsIgnoredWhenPlacingATitle() {
        let titles = padded(["  Sad Song", "Shine"], filler: "Sz Filler")
        let subgroups = BrowseSubgrouping.subgroups(for: makeSongs(titles: titles))

        XCTAssertEqual(subgroups.first?.key, "SA")
        XCTAssertEqual(subgroups.first?.songs.map(\.title), ["  Sad Song"])
    }

    func testARunIsIdentifiedByItsFirstSong() {
        let titles = padded(["Alpha", "Beta"], filler: "Zz Filler")
        let subgroups = BrowseSubgrouping.subgroups(for: makeSongs(titles: titles))

        XCTAssertEqual(subgroups.map(\.id), subgroups.map { $0.songs[0].id })
        XCTAssertEqual(Set(subgroups.map(\.id)).count, subgroups.count)
    }

    func testJumpTargetsKeepTheFirstRunOfEachKey() {
        let first = BrowseSubgroup(key: "SA", label: "Sa", songs: makeSongs(titles: ["Sad"]))
        let repeated = BrowseSubgroup(key: "SA", label: "Sa", songs: makeSongs(titles: ["Sadder"]))
        let other = BrowseSubgroup(key: "SH", label: "Sh", songs: makeSongs(titles: ["Shine"]))

        let targets = BrowseSubgrouping.jumpTargets(for: [first, repeated, other])

        XCTAssertEqual(targets.map(\.id), [first.id, other.id])
        XCTAssertEqual(BrowseSubgrouping.jumpTargets(for: []), [])
    }

    func testCondensingKeepsEveryRunWhenTheyAllFit() {
        let runs = makeSubgroups(count: 8)
        XCTAssertEqual(BrowseSubgrouping.condensed(runs, limit: 8), runs)
        XCTAssertEqual(BrowseSubgrouping.condensed(runs, limit: 20), runs)
    }

    func testCondensingSamplesEvenlyKeepingTheFirstAndLastRun() {
        let runs = makeSubgroups(count: 40)
        let sampled = BrowseSubgrouping.condensed(runs, limit: 5)

        // Four even steps across the 39-run span, not four steps of ten.
        XCTAssertEqual(sampled.map(\.key), ["K00", "K10", "K20", "K29", "K39"])
        XCTAssertEqual(sampled.first, runs.first)
        XCTAssertEqual(sampled.last, runs.last)
    }

    func testCondensingNeverRepeatsOrReordersARun() {
        let runs = makeSubgroups(count: 37)
        for limit in 2...37 {
            let sampled = BrowseSubgrouping.condensed(runs, limit: limit)
            XCTAssertEqual(sampled.count, limit, "limit \(limit)")
            XCTAssertEqual(Set(sampled.map(\.id)).count, limit, "limit \(limit) repeated a run")
            let positions = sampled.compactMap { sample in runs.firstIndex { $0.id == sample.id } }
            XCTAssertEqual(positions, positions.sorted(), "limit \(limit) reordered the runs")
        }
    }

    func testCondensingToNothingOrOneRunIsHandled() {
        let runs = makeSubgroups(count: 6)
        XCTAssertEqual(BrowseSubgrouping.condensed(runs, limit: 0), [])
        XCTAssertEqual(BrowseSubgrouping.condensed(runs, limit: -3), [])
        XCTAssertEqual(BrowseSubgrouping.condensed(runs, limit: 1), [runs[0]])
        XCTAssertEqual(BrowseSubgrouping.condensed([], limit: 5), [])
    }

    // MARK: Fixtures

    private func makeSubgroups(count: Int) -> [BrowseSubgroup] {
        (0..<count).map { index in
            let key = "K\(String(format: "%02d", index))"
            return BrowseSubgroup(
                key: key,
                label: key,
                songs: [CatalogSong(id: "run-\(index)", artist: "Artist", title: key)]
            )
        }
    }

    /// Browse queries hand the list a title-ordered group; these fixtures keep
    /// that contract so the runs stay contiguous.
    private func makeSongs(titles: [String?]) -> [CatalogSong] {
        titles.enumerated().map { index, title in
            CatalogSong(id: "song-\(index)", artist: "Artist", title: title)
        }
    }

    /// Pads a group past the minimum with filler that sorts after the cases
    /// under test, so a short fixture still exercises the real threshold.
    private func padded(_ titles: [String], filler: String) -> [String?] {
        let fillerCount = max(0, BrowseSubgrouping.minimumSongCount - titles.count)
        return titles + (0..<fillerCount).map { "\(filler) \(String(format: "%02d", $0))" }
    }
}
