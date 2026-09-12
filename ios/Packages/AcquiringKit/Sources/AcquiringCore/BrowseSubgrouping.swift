/// Splits one expanded All Songs group into scannable runs.
///
/// A single heading can hold thousands of songs — every "S" title, or every
/// song in a 10-point complexity band — which is more than a person can
/// reasonably drag through. Alphabetical and mode groups still cut on title
/// prefixes. Rated complexity groups cut on the ones digit after the query
/// has already ordered the songs by score.

/// One contiguous run of songs inside an expanded group.
public struct BrowseSubgroup: Identifiable, Equatable, Sendable {
    /// The uppercased title prefix shared by every song in the run.
    public let key: String
    /// The prefix as it is shown to the reader, e.g. "Sa".
    public let label: String
    public let songs: [CatalogSong]

    /// The first song's slug: unique even when a later run repeats a key,
    /// which case-folding of non-ASCII titles can produce.
    public var id: String { songs.first?.id ?? key }

    public init(key: String, label: String, songs: [CatalogSong]) {
        self.key = key
        self.label = label
        self.songs = songs
    }
}

public enum BrowseSubgroupStyle: Sendable {
    case titlePrefix
    case complexityOnes
}

public enum BrowseSubgrouping {
    /// Below this a group is a few flicks from top to bottom, and splitting it
    /// would add headings that earn nothing.
    public static let minimumSongCount = 40

    /// Keeps a jump label short when a filtered group shares a long prefix.
    public static let maximumPrefixLength = 3

    /// Runs in the order the songs arrive, or none when the group is short
    /// enough to scroll directly, or when every song falls in one run.
    public static func subgroups(
        for songs: [CatalogSong],
        style: BrowseSubgroupStyle = .titlePrefix
    ) -> [BrowseSubgroup] {
        guard songs.count >= minimumSongCount else { return [] }
        let keys: [String]
        switch style {
        case .titlePrefix:
            keys = titlePrefixKeys(for: songs)
        case .complexityOnes:
            keys = songs.map { onesKey($0.complexityRating) }
        }
        return runs(songs: songs, keys: keys)
    }

    /// The first run for each key, so a repeated key contributes one jump
    /// target rather than several that look identical.
    public static func jumpTargets(for subgroups: [BrowseSubgroup]) -> [BrowseSubgroup] {
        var seen: Set<String> = []
        return subgroups.filter { seen.insert($0.key).inserted }
    }

    /// Evenly samples runs down to `limit`, keeping the first and last, for a
    /// scrub track too short to label every run. The order is preserved, so the
    /// sample still reads as a ruler over the whole group.
    public static func condensed(_ subgroups: [BrowseSubgroup], limit: Int) -> [BrowseSubgroup] {
        guard limit > 0 else { return [] }
        guard subgroups.count > limit else { return subgroups }
        guard limit > 1 else { return Array(subgroups.prefix(1)) }
        let span = Double(subgroups.count - 1)
        let steps = Double(limit - 1)
        return (0..<limit).map { subgroups[Int((Double($0) * span / steps).rounded())] }
    }

    // MARK: Keys

    private static func titlePrefixKeys(for songs: [CatalogSong]) -> [String] {
        let sortKeys = songs.map { normalized($0.title) }
        let length = min(sharedPrefixLength(of: sortKeys) + 1, maximumPrefixLength)
        return sortKeys.map { bucketKey($0, length: length) }
    }

    private static func onesKey(_ rating: Double?) -> String {
        guard let digit = BrowseGrouping.complexityOnesDigit(for: rating) else { return "#" }
        return String(digit)
    }

    private static func runs(songs: [CatalogSong], keys: [String]) -> [BrowseSubgroup] {
        var runs: [BrowseSubgroup] = []
        var openKey: String?
        var openSongs: [CatalogSong] = []
        for (song, key) in zip(songs, keys) {
            if key != openKey {
                if let openKey, !openSongs.isEmpty {
                    runs.append(BrowseSubgroup(key: openKey, label: label(for: openKey), songs: openSongs))
                }
                openKey = key
                openSongs = []
            }
            openSongs.append(song)
        }
        if let openKey, !openSongs.isEmpty {
            runs.append(BrowseSubgroup(key: openKey, label: label(for: openKey), songs: openSongs))
        }
        return runs.count > 1 ? runs : []
    }

    /// Untitled songs sort last as one run under the symbol heading.
    private static func bucketKey(_ sortKey: String, length: Int) -> String {
        guard !sortKey.isEmpty else { return "#" }
        return String(sortKey.prefix(length))
    }

    /// Measured over titled songs only: one untitled song would otherwise
    /// collapse every group to single-character runs.
    private static func sharedPrefixLength(of sortKeys: [String]) -> Int {
        var shared: [Character]?
        for sortKey in sortKeys where !sortKey.isEmpty {
            guard let current = shared else {
                shared = Array(sortKey)
                continue
            }
            var length = 0
            for (lhs, rhs) in zip(current, sortKey) {
                guard lhs == rhs else { break }
                length += 1
            }
            if length == 0 { return 0 }
            shared = Array(current.prefix(length))
        }
        return shared?.count ?? 0
    }

    private static func normalized(_ title: String?) -> String {
        trimmed(title ?? "").uppercased()
    }

    /// "SA" reads as shouting in a row of jump buttons; "Sa" matches a title.
    private static func label(for key: String) -> String {
        let text = trimmed(key)
        guard let first = text.first else { return "#" }
        return String(first) + text.dropFirst().lowercased()
    }

    private static func trimmed(_ value: String) -> String {
        let leading = value.drop(while: \.isWhitespace)
        return String(leading.reversed().drop(while: \.isWhitespace).reversed())
    }
}
