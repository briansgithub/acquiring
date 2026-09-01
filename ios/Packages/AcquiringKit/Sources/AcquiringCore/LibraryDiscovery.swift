/// Pure grouping, filtering and mode-classification rules behind the Library
/// and All Songs discovery screens.
///
/// This is a direct port of Android's `AllSongsGrouping` in `SongBrowse.kt`.
/// Android is the behavioral reference, so the boundaries encoded here are
/// deliberately its boundaries, quirks included. Everything is deterministic,
/// side-effect free and independent of Foundation.

/// One selectable heading in a browse list.
public struct BrowseGroupDescriptor: Identifiable, Hashable, Sendable {
    public let key: String
    public let label: String

    public var id: String { key }

    public init(key: String, label: String) {
        self.key = key
        self.label = label
    }
}

public enum BrowseGrouping {
    /// Heading for songs that carry no usable complexity rating.
    public static let unratedKey = "unrated"

    // MARK: Group tables

    /// Letters, then digits, then the catch-all symbol heading.
    private static let alphabeticalGroups: [BrowseGroupDescriptor] = {
        let letters = (UInt8(ascii: "A")...UInt8(ascii: "Z")).map { String(UnicodeScalar($0)) }
        let digits = (UInt8(ascii: "0")...UInt8(ascii: "9")).map { String(UnicodeScalar($0)) }
        return (letters + digits + ["#"]).map { BrowseGroupDescriptor(key: $0, label: $0) }
    }()

    /// Ten evenly spaced buckets, then the unrated catch-all. Labels overlap at
    /// their edges ("0-10", "10-20", ...) exactly as Android renders them.
    private static let complexityGroups: [BrowseGroupDescriptor] = {
        let buckets = (0...9).map { bucket in
            let lower = bucket * 10
            return BrowseGroupDescriptor(key: String(bucket), label: "\(lower)-\(lower + 10)")
        }
        return buckets + [BrowseGroupDescriptor(key: unratedKey, label: "Unrated")]
    }()

    private static let modeGroups: [BrowseGroupDescriptor] = DiatonicMode.allCases.map {
        BrowseGroupDescriptor(key: $0.rawValue, label: $0.displayName)
    }

    public static func groups(for mode: BrowseMode) -> [BrowseGroupDescriptor] {
        switch mode {
        case .alphabetical: alphabeticalGroups
        case .complexity: complexityGroups
        case .mode: modeGroups
        }
    }

    // MARK: Expansion

    /// A single nullable key makes it impossible for two headings to be open at
    /// once: picking a new heading replaces the old one, picking the open
    /// heading closes it.
    public static func toggledExpandedGroup(current: String?, selected: String) -> String? {
        current == selected ? nil : selected
    }

    // MARK: Alphabetical classification

    public static func alphabeticalGroup(for title: String?) -> String {
        guard let first = title?.drop(while: \.isWhitespace).first else { return "#" }
        // Mirrors Kotlin's `uppercaseChar()`, which is a single-character
        // mapping: where uppercasing would produce more than one character
        // (for example "ß" becoming "SS") the original is kept, and so lands
        // in the symbol group along with every other non-ASCII value.
        let uppercased = String(first).uppercased()
        let candidate = uppercased.count == 1 ? Character(uppercased) : first
        guard let ascii = candidate.asciiValue else { return "#" }
        switch ascii {
        case UInt8(ascii: "A")...UInt8(ascii: "Z"), UInt8(ascii: "0")...UInt8(ascii: "9"):
            return String(candidate)
        default:
            return "#"
        }
    }

    // MARK: Fuzzy search

    /// Lowercases and drops the separators people type inconsistently. Note
    /// that only spaces, hyphens and underscores are removed, matching Android;
    /// other whitespace survives and therefore still has to match.
    public static func normalizedSearchText(_ value: String?) -> String {
        guard let value else { return "" }
        return value.lowercased().filter { $0 != " " && $0 != "-" && $0 != "_" }
    }

    /// Case-insensitive substring matching against title or artist. A query
    /// that normalizes to nothing matches every song.
    public static func matches(song: CatalogSong, filterText: String) -> Bool {
        let query = normalizedSearchText(filterText)
        guard !query.isEmpty else { return true }
        return normalizedSearchText(song.title).contains(query)
            || normalizedSearchText(song.artist).contains(query)
    }

    // MARK: Complexity

    /// Returns 0...9 for ratings in 0...100, placing an exact 100 in the final
    /// bucket rather than letting it spill into a tenth one. Anything missing,
    /// non-finite or outside the range is unclassified.
    public static func complexityBucket(for rating: Double?) -> Int? {
        guard let rating, rating.isFinite, rating >= 0, rating <= 100 else { return nil }
        return rating == 100 ? 9 : Int(rating / 10)
    }

    // MARK: Modes

    /// Resolves a raw scale name to a diatonic mode, tolerating case and the
    /// separators exports use inconsistently. Non-diatonic scales such as
    /// harmonic minor deliberately resolve to nil.
    public static func canonicalMode(_ rawScale: String?) -> DiatonicMode? {
        guard let rawScale else { return nil }
        let normalized = trimmingWhitespace(rawScale)
            .lowercased()
            .filter { $0 != "-" && $0 != "_" && $0 != " " }
        switch normalized {
        case "major", "ionian": return .ionian
        case "dorian": return .dorian
        case "phrygian": return .phrygian
        case "lydian": return .lydian
        case "mixolydian": return .mixolydian
        case "minor", "aeolian", "naturalminor": return .aeolian
        case "locrian": return .locrian
        default: return nil
        }
    }

    public static func canonicalModes<S: Sequence>(_ rawScales: S) -> Set<DiatonicMode>
    where S.Element == String? {
        Set(rawScales.compactMap(canonicalMode))
    }

    /// Every mode a song touches, read from every key event in every section
    /// rather than just each section's first key, because a song belongs to
    /// each mode it modulates through.
    ///
    /// This reads `metadata["keys"]` directly instead of `ExtractedSection.keys`
    /// on purpose: that property substitutes a default C major when a section
    /// carries no keys, which would grant an Ionian membership Android never
    /// grants. Sections with missing or malformed metadata contribute nothing.
    public static func modes<S: Sequence>(inSections sections: S) -> Set<DiatonicMode>
    where S.Element == ExtractedSection {
        canonicalModes(sections.flatMap(scaleNames(in:)))
    }

    private static func scaleNames(in section: ExtractedSection) -> [String?] {
        guard let keys = section.metadata?["keys"]?.arrayValue else { return [] }
        return keys.map { $0.objectValue?["scale"]?.stringValue }
    }

    // MARK: Helpers

    /// Trims both ends only, matching Kotlin's `trim()`. Interior whitespace is
    /// left for the caller's own filtering to deal with.
    private static func trimmingWhitespace(_ value: String) -> String {
        guard let start = value.firstIndex(where: { !$0.isWhitespace }),
              let end = value.lastIndex(where: { !$0.isWhitespace })
        else { return "" }
        return String(value[start...end])
    }
}
