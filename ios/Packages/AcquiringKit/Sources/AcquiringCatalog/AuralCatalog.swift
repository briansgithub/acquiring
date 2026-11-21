import Foundation
import GRDB

/// Serialized read-only access. Each instance belongs to one immutable bundle directory.
/// Consumers must hold a store lease for the whole operation, including ranking pages.
public actor AuralCatalog {
    public nonisolated let snapshotId: String
    public nonisolated let capabilities: AuralCatalogCapabilities
    let database: DatabaseQueue
    private var closed = false
    private var runs: [Int: AuralCatalogRun] = [:]
    private var runOrder: [Int] = []
    private let suffix: [Int]
    private let runSongs: [String]
    private let runSections: [String]
    private let validSongs: Set<String>
    private let popularity: [String: (score: Double, confidence: Double)]

    public init(directory: URL) throws {
        var configuration = Configuration(); configuration.readonly = true
        let db = try DatabaseQueue(path: directory.appendingPathComponent("aural-catalog.db").path, configuration: configuration)
        let metadata = try db.read { db in Dictionary(uniqueKeysWithValues: try Row.fetchAll(db, sql: "SELECT key,value FROM metadata").map { ($0["key"] as String, $0["value"] as String) }) }
        guard let schema = metadata["schema_version"], let version = ["aural-catalog-1", "aural-catalog-2", "aural-catalog-3"].firstIndex(of: schema), let snapshot = metadata["snapshot_id"], !snapshot.isEmpty else { throw AuralCatalogError.invalid("metadata") }
        snapshotId = snapshot
        capabilities = AuralCatalogCapabilities(schemaVersion: version + 1, modeAnalysis: version > 0, startGrouping: version == 2, reducedSequences: metadata["sequence_reduction_version"] == "unique-transitions-1")
        // Limit packed suffix storage to 256 MiB. Decode in 1 MiB reads.
        suffix = try db.read { db in
            guard let size = try Int.fetchOne(db, sql: "SELECT length(data) FROM catalog_array WHERE name='suffix_locations'"), size >= 0, size % 8 == 0 else { throw AuralCatalogError.invalid("suffix array size") }
            guard size <= 256 * 1024 * 1024 else { throw AuralCatalogError.budget("suffix array") }
            var values: [Int] = []; values.reserveCapacity(size / 4)
            for offset in stride(from: 0, to: size, by: 1048576) {
                try Task.checkCancellation()
                guard let block = try Data.fetchOne(db, sql: "SELECT substr(data,?,?) FROM catalog_array WHERE name='suffix_locations'", arguments: [offset + 1, min(1048576, size - offset)]), block.count == min(1048576, size - offset) else { throw AuralCatalogError.invalid("suffix block") }
                values.append(contentsOf: try AuralBinary.integers(block))
            }
            return values
        }
        let identities = try db.read { db -> ([String], [String]) in
            var songs: [String] = [], sections: [String] = []
            while true {
                try Task.checkCancellation()
                let rows = try Row.fetchAll(db, sql: "SELECT id,song_id,section_id FROM catalog_run WHERE id>=? ORDER BY id LIMIT 2048", arguments: [songs.count])
                for row in rows {
                    guard row["id"] as Int == songs.count else { throw AuralCatalogError.invalid("noncontiguous run ids") }
                    guard songs.count < 2_000_000 else { throw AuralCatalogError.budget("run identities") }
                    songs.append(row["song_id"]); sections.append(row["section_id"])
                }
                if rows.count < 2048 { return (songs, sections) }
            }
        }
        runSongs = identities.0; runSections = identities.1
        for index in stride(from: 0, to: suffix.count, by: 2) {
            guard suffix[index] < runSongs.count, suffix[index + 1] < 4096 else { throw AuralCatalogError.invalid("suffix location") }
        }
        validSongs = try db.read { Set(try String.fetchAll($0, sql: "SELECT id FROM catalog_song")) }
        let pop = try DatabaseQueue(path: directory.appendingPathComponent("aural-popularity.db").path, configuration: configuration)
        popularity = try pop.read { db in
            var result: [String: (Double, Double)] = [:]
            let cursor = try Row.fetchCursor(db, sql: "SELECT song_id,score,confidence FROM popularity")
            while let row = try cursor.next() {
                let score: Double? = row["score"], confidence: Double? = row["confidence"]
                if let score, score.isFinite, (0...1).contains(score) { result[row["song_id"]] = (score, min(1, max(0, confidence?.isFinite == true ? confidence! : 0))) }
            }
            return result
        }
        database = db
    }

    public func close() throws { if !closed { try database.close(); runs.removeAll(); runOrder.removeAll(); closed = true } }
    func checkOpen() throws { try Task.checkCancellation(); if closed { throw AuralCatalogError.closed } }

    public func run(_ id: Int) throws -> AuralCatalogRun {
        try checkOpen()
        guard id >= 0, id < runSongs.count else { throw AuralCatalogError.invalid("run id") }
        if let cached = runs[id] { return cached }
        let source = capabilities.modeAnalysis ? "source_key_json" : "key_json"
        let result = try database.read { db -> AuralCatalogRun in
            guard let row = try Row.fetchOne(db, sql: "SELECT *,\(source) AS source_key FROM catalog_run WHERE id=?", arguments: [id]) else { throw AuralCatalogError.invalid("missing run") }
            let decoder = JSONDecoder()
            let tokens = try decoder.decode([String].self, from: AuralBinary.inflate(row["tokens"]))
            let positions = try decoder.decode([AuralCatalogPosition].self, from: AuralBinary.inflate(row["positions"]))
            guard tokens.count <= 4096, tokens.count == positions.count, tokens.allSatisfy({ $0.utf8.count <= 4096 }), positions.allSatisfy({ $0.startIndex >= 0 && $0.endIndex >= $0.startIndex && $0.startBeat.isFinite && $0.endBeat.isFinite && $0.endBeat > $0.startBeat && $0.notes.count <= 128 }) else { throw AuralCatalogError.invalid("run contents") }
            let key: String = row["key_json"], sourceKey: String = row["source_key"]
            return AuralCatalogRun(id: id, stableId: row["stable_id"], view: row["view"], song: row["song_id"], section: row["section_id"], revision: row["revision"], tokens: tokens, positions: positions, key: try decoder.decode(AuralCatalogKey.self, from: Data(key.utf8)), sourceKey: try decoder.decode(AuralCatalogKey.self, from: Data(sourceKey.utf8)))
        }
        if runOrder.count >= 64 { runs.removeValue(forKey: runOrder.removeFirst()) }
        runs[id] = result; runOrder.append(id)
        return result
    }
    public func target(start: Int, end: Int, length: Int) throws -> AuralPatternTarget {
        try checkOpen()
        guard start >= 0, end >= start, end < suffix.count / 2, (1...4096).contains(length) else { throw AuralCatalogError.invalid("target bounds") }
        let source = try run(suffix[start * 2]), offset = suffix[start * 2 + 1]
        guard offset <= source.tokens.count - length else { throw AuralCatalogError.invalid("target length") }
        let tokens = Array(source.tokens[offset..<(offset + length)])
        let labels = source.positions[offset..<(offset + length)].map { source.view.hasSuffix("harmony_bass") ? $0.roman : $0.degree }
        return AuralPatternTarget(id: AuralIdentity.pattern(tokens: tokens, view: source.view), view: source.view, tokens: tokens, labels: labels, start: start, end: end, snapshotId: snapshotId)
    }
    public func lookup(tokens: [String], view: String) throws -> AuralPatternTarget? {
        try checkOpen()
        guard !tokens.isEmpty, tokens.count <= 4096 else { throw AuralCatalogError.invalid("lookup length") }
        func compare(_ rank: Int) throws -> Int {
            let source = try run(suffix[rank * 2]), offset = suffix[rank * 2 + 1]
            if source.view != view { return source.view < view ? -1 : 1 }
            for i in tokens.indices {
                if offset + i >= source.tokens.count { return -1 }
                if source.tokens[offset + i] != tokens[i] { return source.tokens[offset + i].utf16.lexicographicallyPrecedes(tokens[i].utf16) ? -1 : 1 }
            }
            return 0
        }
        var low = 0, high = suffix.count / 2
        while low < high { let mid = (low + high) / 2; if try compare(mid) < 0 { low = mid + 1 } else { high = mid } }
        let start = low; high = suffix.count / 2
        while low < high { let mid = (low + high) / 2; if try compare(mid) <= 0 { low = mid + 1 } else { high = mid } }
        return low > start ? try target(start: start, end: low - 1, length: tokens.count) : nil
    }
    func validate(_ target: AuralPatternTarget) throws {
        guard target.snapshotId == snapshotId, try lookup(tokens: target.tokens, view: target.view) == target else { throw AuralCatalogError.staleTarget }
    }
    func eligible(_ song: String, percent: Int?) throws -> Bool {
        guard let percent else { return true }
        guard (0...100).contains(percent) else { throw AuralCatalogError.invalid("popularity cutoff") }
        return popularity[song].map { $0.score >= Double(percent) / 100 } ?? false
    }
    public func statistics(_ target: AuralPatternTarget, options: AuralRankingOptions = AuralRankingOptions()) throws -> AuralCatalogRow? {
        try validate(target)
        var allSongs = Set<String>(), grouped: [String: [(Int, Int)]] = [:], global = 0, occurrences = 0
        for rank in target.start...target.end {
            try Task.checkCancellation()
            let id = suffix[rank * 2], song = runSongs[id]
            guard validSongs.contains(song) else { continue }
            global += 1; allSongs.insert(song)
            if try eligible(song, percent: options.minimumPopularityPercent) { grouped[song, default: []].append((id, suffix[rank * 2 + 1])); occurrences += 1 }
        }
        guard !grouped.isEmpty else { return nil }
        var effective = 0, sections = Set<String>(), weight = 0.0
        for (song, matches) in grouped {
            var prior = -1, end = -1, count = 0
            for (id, start) in matches.sorted(by: { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }) {
                sections.insert(runSections[id])
                if count < 4 && (id != prior || start > end) { count += 1; prior = id; end = start + target.tokens.count - 1 }
            }
            effective += count
            let pop = popularity[song]
            var factor = options.popularity ? 1 + (pop?.confidence ?? 0) * ((pop?.score ?? 0.5) - 0.5) : 1
            if options.variety, let index = options.recentSongs.firstIndex(of: song), index < 10 { factor *= index < 3 ? 0.25 : 0.6 }
            if options.favorites && options.favoriteSongs.contains(song) { factor *= 1.5 }
            weight += factor
        }
        let score = log2(Double(target.tokens.count)) * log2(1 + Double(grouped.count)) * log2(1 + Double(effective)) * weight / Double(grouped.count)
        return AuralCatalogRow(target: target, songs: grouped.count, occurrences: occurrences, sections: sections.count, effective: effective, score: score, globalSongs: allSongs.count, globalOccurrences: global)
    }
    public func songs(_ target: AuralPatternTarget, minimumPopularityPercent: Int? = nil) throws -> [AuralPatternSong] {
        try validate(target)
        let rows = try database.read { try Row.fetchAll($0, sql: "SELECT DISTINCT song.id,song.title,song.artist FROM catalog_suffix s JOIN catalog_run r ON r.id=s.run_id JOIN catalog_song song ON song.id=r.song_id WHERE s.rank BETWEEN ? AND ?", arguments: [target.start, target.end]) }
        return try rows.compactMap { row in
            let id: String = row["id"]
            return try eligible(id, percent: minimumPopularityPercent) ? AuralPatternSong(id: id, title: row["title"], artist: row["artist"], popularityScore: popularity[id]?.score) : nil
        }.sorted { a, b in
            if a.popularityScore != b.popularityScore { return (a.popularityScore ?? -1) > (b.popularityScore ?? -1) }
            if a.title.lowercased() != b.title.lowercased() { return a.title.lowercased() < b.title.lowercased() }
            if a.artist.lowercased() != b.artist.lowercased() { return a.artist.lowercased() < b.artist.lowercased() }
            return a.id < b.id
        }
    }
    /// Bounded physical occurrence paging. Identity includes original chord indexes,
    /// never the reduced token offset or an analysis-key-derived replacement.
    public func occurrences(_ target: AuralPatternTarget, afterRank: Int? = nil, limit: Int = 100) throws -> (items: [AuralOccurrence], nextRank: Int?) {
        try validate(target)
        guard (1...2048).contains(limit) else { throw AuralCatalogError.budget("occurrence page") }
        let start = max(target.start, (afterRank ?? (target.start - 1)) + 1)
        if start > target.end { return ([], nil) }
        let end = min(target.end, start + limit - 1)
        var result: [AuralOccurrence] = []
        for rank in start...end {
            let source = try run(suffix[rank * 2]), offset = suffix[rank * 2 + 1]
            guard validSongs.contains(source.song), offset <= source.positions.count - target.tokens.count else { continue }
            let positions = Array(source.positions[offset..<(offset + target.tokens.count)])
            let identity = "\(source.song)|\(source.section)|\(positions.first!.startIndex)|\(positions.last!.endIndex)"
            result.append(AuralOccurrence(id: AuralIdentity.digest(target.id + "|" + identity), sourceIdentity: identity, run: source, offset: offset, positions: positions))
        }
        return (result, end < target.end ? end : nil)
    }
}
