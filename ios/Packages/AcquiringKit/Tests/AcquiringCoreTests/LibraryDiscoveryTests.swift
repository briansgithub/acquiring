import XCTest
@testable import AcquiringCore

/// Parity tests for the Library/All Songs discovery rules. The expectations
/// mirror Android's `AllSongsGroupingTest`, extended to the boundaries that
/// test does not spell out.
final class LibraryDiscoveryTests: XCTestCase {
    private let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".map(String.init)
    private let digits = "0123456789".map(String.init)

    // MARK: Group tables

    func testAlphabeticalGroupsAreLettersThenDigitsThenTheSymbolHeading() {
        let groups = BrowseGrouping.groups(for: .alphabetical)
        XCTAssertEqual(groups.map(\.key), letters + digits + ["#"])
        XCTAssertEqual(groups.map(\.label), letters + digits + ["#"])
        XCTAssertEqual(groups.count, 37)
    }

    func testComplexityGroupsAreTenBucketsFollowedByUnrated() {
        let groups = BrowseGrouping.groups(for: .complexity)
        XCTAssertEqual(groups.map(\.key), digits + [BrowseGrouping.unratedKey])
        XCTAssertEqual(
            groups.map(\.label),
            [
                "0-10", "10-20", "20-30", "30-40", "40-50",
                "50-60", "60-70", "70-80", "80-90", "90-100",
                "Unrated"
            ]
        )
        XCTAssertEqual(BrowseGrouping.unratedKey, "unrated")
    }

    func testModeGroupsUseDiatonicOrderAndDisplayNames() {
        let groups = BrowseGrouping.groups(for: .mode)
        XCTAssertEqual(
            groups.map(\.key),
            ["ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian"]
        )
        XCTAssertEqual(
            groups.map(\.label),
            [
                "Ionian (Major)",
                "Dorian",
                "Phrygian",
                "Lydian",
                "Mixolydian",
                "Aeolian (minor)",
                "Locrian"
            ]
        )
    }

    func testGroupDescriptorIdentityIsItsKey() {
        let descriptor = BrowseGroupDescriptor(key: "unrated", label: "Unrated")
        XCTAssertEqual(descriptor.id, "unrated")
        XCTAssertEqual(descriptor, BrowseGroupDescriptor(key: "unrated", label: "Unrated"))
        XCTAssertNotEqual(descriptor, BrowseGroupDescriptor(key: "9", label: "Unrated"))
    }

    // MARK: Expansion

    func testExpansionStartsCollapsedThenReplacesThenCollapses() {
        var expanded: String?
        expanded = BrowseGrouping.toggledExpandedGroup(current: expanded, selected: "A")
        XCTAssertEqual(expanded, "A")
        expanded = BrowseGrouping.toggledExpandedGroup(current: expanded, selected: "B")
        XCTAssertEqual(expanded, "B", "selecting a different heading must replace the open one")
        expanded = BrowseGrouping.toggledExpandedGroup(current: expanded, selected: "B")
        XCTAssertNil(expanded, "selecting the open heading must collapse it")
    }

    // MARK: Alphabetical classification

    func testAlphabeticalClassificationUppercasesAndTrimsLeadingWhitespace() {
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "  autumn leaves"), "A")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "beta"), "B")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "Zebra"), "Z")
    }

    func testAlphabeticalClassificationKeepsDigitsInTheirOwnGroups() {
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "007 Theme"), "0")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "7 Nation Army"), "7")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "99 Luftballons"), "9")
    }

    func testAlphabeticalClassificationSendsSymbolsBlanksAndNonASCIIToTheSymbolGroup() {
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "!Song"), "#")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "  "), "#")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: ""), "#")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: nil), "#")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "édith piaf"), "#")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "Ñandú"), "#")
        XCTAssertEqual(BrowseGrouping.alphabeticalGroup(for: "日本語"), "#")
    }

    // MARK: Fuzzy search

    func testFuzzyFilterMatchesOnTitle() {
        XCTAssertTrue(BrowseGrouping.matches(song: whiteStripes, filterText: "ETA_so"))
        XCTAssertTrue(BrowseGrouping.matches(song: whiteStripes, filterText: "beta song"))
    }

    func testFuzzyFilterMatchesOnArtist() {
        XCTAssertTrue(BrowseGrouping.matches(song: whiteStripes, filterText: "white stripes"))
        XCTAssertTrue(BrowseGrouping.matches(song: whiteStripes, filterText: "whitestripes"))
    }

    func testFuzzyFilterTreatsCaseSpacesHyphensAndUnderscoresAsEquivalent() {
        for query in ["WHITE_STRIPES", "white-stripes", "White Stripes", "wHiTe_-  StRiPeS"] {
            XCTAssertTrue(
                BrowseGrouping.matches(song: whiteStripes, filterText: query),
                "\(query) should be equivalent to whitestripes"
            )
        }
    }

    func testBlankQueryMatchesEverythingAndAnUnrelatedQueryMatchesNothing() {
        XCTAssertTrue(BrowseGrouping.matches(song: whiteStripes, filterText: ""))
        XCTAssertTrue(BrowseGrouping.matches(song: whiteStripes, filterText: "   "))
        XCTAssertTrue(BrowseGrouping.matches(song: whiteStripes, filterText: "-_-"))
        XCTAssertFalse(BrowseGrouping.matches(song: whiteStripes, filterText: "bravo"))
    }

    func testFuzzyFilterToleratesSongsWithNoTitleOrArtist() {
        let empty = CatalogSong(id: "empty", artist: nil, title: nil)
        XCTAssertTrue(BrowseGrouping.matches(song: empty, filterText: ""))
        XCTAssertFalse(BrowseGrouping.matches(song: empty, filterText: "anything"))
    }

    func testNormalizedSearchTextLowercasesAndDropsSeparators() {
        XCTAssertEqual(BrowseGrouping.normalizedSearchText("The White-Stripes"), "thewhitestripes")
        XCTAssertEqual(BrowseGrouping.normalizedSearchText(nil), "")
        XCTAssertEqual(BrowseGrouping.normalizedSearchText("  "), "")
    }

    // MARK: Complexity

    func testComplexityBucketBoundariesUseTenPointBuckets() {
        XCTAssertEqual(BrowseGrouping.complexityBucket(for: 0), 0)
        XCTAssertEqual(BrowseGrouping.complexityBucket(for: 9.999), 0)
        XCTAssertEqual(BrowseGrouping.complexityBucket(for: 10), 1)
        XCTAssertEqual(BrowseGrouping.complexityBucket(for: 19.999), 1)
        XCTAssertEqual(BrowseGrouping.complexityBucket(for: 90), 9)
        XCTAssertEqual(BrowseGrouping.complexityBucket(for: 99.999), 9)
    }

    func testComplexityBucketPutsAnExactHundredInTheFinalBucket() {
        XCTAssertEqual(
            BrowseGrouping.complexityBucket(for: 100),
            9,
            "an exact 100 must not spill into a tenth bucket"
        )
    }

    func testComplexityBucketRejectsMissingOutOfRangeAndNonFiniteRatings() {
        XCTAssertNil(BrowseGrouping.complexityBucket(for: nil))
        XCTAssertNil(BrowseGrouping.complexityBucket(for: -0.1))
        XCTAssertNil(BrowseGrouping.complexityBucket(for: -1))
        XCTAssertNil(BrowseGrouping.complexityBucket(for: 100.1))
        XCTAssertNil(BrowseGrouping.complexityBucket(for: Double.nan))
        XCTAssertNil(BrowseGrouping.complexityBucket(for: Double.infinity))
        XCTAssertNil(BrowseGrouping.complexityBucket(for: -Double.infinity))
    }

    func testEveryValidRatingLandsInADeclaredComplexityGroup() {
        let declared = Set(BrowseGrouping.groups(for: .complexity).map(\.key))
        for rating in stride(from: 0.0, through: 100.0, by: 0.5) {
            guard let bucket = BrowseGrouping.complexityBucket(for: rating) else {
                return XCTFail("\(rating) is in range and must classify")
            }
            XCTAssertTrue(
                declared.contains(String(bucket)),
                "bucket \(bucket) for rating \(rating) has no heading"
            )
        }
    }

    // MARK: Modes

    func testCanonicalModeAcceptsEveryDiatonicNameAndAlias() {
        XCTAssertEqual(BrowseGrouping.canonicalMode("major"), .ionian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("Ionian"), .ionian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("dorian"), .dorian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("PHRYGIAN"), .phrygian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("Lydian"), .lydian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("mixolydian"), .mixolydian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("minor"), .aeolian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("aeolian"), .aeolian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("natural_minor"), .aeolian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("Natural Minor"), .aeolian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("natural-minor"), .aeolian)
        XCTAssertEqual(BrowseGrouping.canonicalMode("  locrian  "), .locrian)
    }

    func testCanonicalModeRejectsNonDiatonicUnknownAndEmptyScales() {
        XCTAssertNil(BrowseGrouping.canonicalMode("harmonicMinor"))
        XCTAssertNil(BrowseGrouping.canonicalMode("harmonic minor"))
        XCTAssertNil(BrowseGrouping.canonicalMode("phrygianDominant"))
        XCTAssertNil(BrowseGrouping.canonicalMode("melodic_minor"))
        XCTAssertNil(BrowseGrouping.canonicalMode("blues"))
        XCTAssertNil(BrowseGrouping.canonicalMode(""))
        XCTAssertNil(BrowseGrouping.canonicalMode("   "))
        XCTAssertNil(BrowseGrouping.canonicalMode(nil))
    }

    func testEveryDiatonicModeRoundTripsThroughItsOwnRawValue() {
        for mode in DiatonicMode.allCases {
            XCTAssertEqual(
                BrowseGrouping.canonicalMode(mode.rawValue),
                mode,
                "\(mode.rawValue) must resolve back to itself"
            )
        }
    }

    func testCanonicalModesDeduplicatesAndDropsUnknownScales() {
        let scales: [String?] = ["major", "MAJOR", "ionian", "dorian", "harmonicMinor", nil, ""]
        XCTAssertEqual(
            BrowseGrouping.canonicalModes(scales),
            Set([DiatonicMode.ionian, .dorian])
        )
        XCTAssertEqual(BrowseGrouping.canonicalModes([String?]()), Set<DiatonicMode>())
    }

    func testModesInSectionsReadEveryKeyEventAcrossEverySection() {
        let sections = [
            section(scales: "major", "dorian", "dorian"),
            section(scales: "minor", "major")
        ]
        XCTAssertEqual(
            BrowseGrouping.modes(inSections: sections),
            Set([DiatonicMode.ionian, .dorian, .aeolian]),
            "a song belongs to every mode it modulates through, without duplicates"
        )
    }

    func testModesInSectionsIgnoreMalformedAndMissingMetadata() {
        let sections = [
            ExtractedSection(),
            ExtractedSection(metadata: [:]),
            ExtractedSection(metadata: ["tempos": .array([])]),
            ExtractedSection(metadata: ["keys": .string("dorian")]),
            ExtractedSection(metadata: ["keys": .array([.string("dorian")])]),
            ExtractedSection(metadata: ["keys": .array([.object(["tonic": .string("C")])])]),
            ExtractedSection(metadata: ["keys": .array([.object(["scale": .null])])]),
            section(scales: "lydian")
        ]
        XCTAssertEqual(
            BrowseGrouping.modes(inSections: sections),
            Set([DiatonicMode.lydian]),
            "only well-formed key events contribute a mode"
        )
    }

    func testSectionWithoutKeysContributesNoModeRatherThanADefaultMajor() {
        // ExtractedSection.keys substitutes a default C major; mode collection
        // must not inherit that, or every keyless song would look Ionian.
        let keyless = ExtractedSection()
        XCTAssertEqual(keyless.keys.first?.key.scale, "major", "precondition: the model defaults to major")
        XCTAssertEqual(BrowseGrouping.modes(inSections: [keyless]), Set<DiatonicMode>())
    }

    func testModesInSectionsAcceptNonStringScalePrimitivesWithoutClassifyingThem() {
        let sections = [ExtractedSection(metadata: ["keys": .array([.object(["scale": .number(5)])])])]
        XCTAssertEqual(BrowseGrouping.modes(inSections: sections), Set<DiatonicMode>())
    }

    // MARK: Fixtures

    private let whiteStripes = CatalogSong(
        id: "beta",
        artist: "The White-Stripes",
        title: "Beta Song"
    )

    private func section(scales: String...) -> ExtractedSection {
        ExtractedSection(
            metadata: ["keys": .array(scales.map { .object(["scale": .string($0)]) })]
        )
    }
}
