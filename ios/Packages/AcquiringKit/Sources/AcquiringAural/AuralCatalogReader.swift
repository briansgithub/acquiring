import AcquiringCore
import Foundation
import GRDB
import zlib

public final class AuralCatalogLease: @unchecked Sendable {
    private let onRelease: @Sendable () async -> Void
    private let lock = NSLock()
    private var didRelease = false

    fileprivate init(onRelease: @escaping @Sendable () async -> Void) {
        self.onRelease = onRelease
    }

    private func claimRelease() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if didRelease { return false }
        didRelease = true
        return true
    }

    public func release() async {
        guard claimRelease() else { return }
        await onRelease()
    }

    deinit {
        guard claimRelease() else { return }
        let release = onRelease
        Task { await release() }
    }
}

public actor AuralCatalogReader {
    public typealias RankingID = UUID

    private struct Position: Decodable, Sendable {
        let startIndex: Int
        let endIndex: Int
        let startBeat: Double
        let endBeat: Double
        let degree: String
        let roman: String
        let notes: [Int]
        let rootMidi: Int
        let bassMidi: Int
        let varyingBass: Bool?
    }

    private struct Run: Sendable {
        let id: Int
        let stableId: String
        let view: String
        let songId: String
        let sectionId: String
        let revision: String
        let tokens: [String]
        let positions: [Position]
        let keyTonic: String
        let keyMode: String?
    }

    private struct Popularity: Sendable {
        let score: Double?
        let confidence: Double
        let providerURL: URL?
        let measuredAt: Date?
    }

    private struct PreparedCatalog {
        let catalog: DatabaseQueue
        let evidence: DatabaseQueue
        let snapshotId: String
        let metadata: [String: String]
        let popularityMetadata: [String: String]
        let suffix: [Int32]
        let songByRun: [String]
        let sectionByRun: [String]
        let validSongIds: Set<String>
        let popularity: [String: Popularity]
    }

    private struct BucketKey: Equatable {
        let view: String
        let progression: AuralProgressionQuery
        let minimumLength: Int
        let maximumLength: Int?
        let minimumPopularityPercent: Int?
        let sourceMode: String?
        let startingChord: String?

        init(_ query: AuralCatalogQuery) {
            view = query.view
            progression = query.progression
            minimumLength = query.minimumLength
            maximumLength = query.maximumLength
            minimumPopularityPercent = query.minimumPopularityPercent
            sourceMode = query.sourceMode
            startingChord = query.startingChord
        }
    }

    private struct RangeRecord: Sendable {
        let id: Int
        let start: Int
        let end: Int
        let minimumLength: Int
        let maximumLength: Int
        let songs: Int
        let upperScore: Double
    }

    private struct HeapEntry: Sendable {
        let start: Int
        let end: Int
        let low: Int
        let high: Int
        let songs: Int
        let bound: Double
        let row: AuralCatalogRow?
        let sortOrder: String
    }

    private struct RankingState: Sendable {
        let query: AuralCatalogQuery
        let multiplier: Double
        let eligiblePrefix: [Int32]?
        var heap = MaxHeap()
        var rangeOffset = 0
        var rangeBatch: [RangeRecord] = []
        var rangeIndex = 0
        var exhaustedRanges = false
        var emitted = 0
    }

    private struct MaxHeap: Sendable {
        var entries: [HeapEntry] = []

        mutating func push(_ value: HeapEntry) {
            var index = entries.count
            entries.append(value)
            while index > 0 {
                let parent = (index - 1) / 2
                guard Self.before(value, entries[parent]) else { break }
                entries[index] = entries[parent]
                index = parent
            }
            entries[index] = value
        }

        mutating func pop() -> HeapEntry? {
            guard !entries.isEmpty else { return nil }
            let head = entries[0]
            guard let last = entries.popLast(), !entries.isEmpty else { return head }
            var index = 0
            while index * 2 + 1 < entries.count {
                var child = index * 2 + 1
                if child + 1 < entries.count, Self.before(entries[child + 1], entries[child]) {
                    child += 1
                }
                guard Self.before(entries[child], last) else { break }
                entries[index] = entries[child]
                index = child
            }
            entries[index] = last
            return head
        }

        var first: HeapEntry? { entries.first }

        static func before(_ lhs: HeapEntry, _ rhs: HeapEntry) -> Bool {
            if lhs.sortOrder == "recommended" {
                if lhs.bound != rhs.bound { return lhs.bound > rhs.bound }
            } else {
                let left = AuralCatalogReader.rankKey(lhs)
                let right = AuralCatalogReader.rankKey(rhs)
                if left != right { return right.lexicographicallyPrecedes(left) }
            }
            switch (lhs.row, rhs.row) {
            case (nil, .some): return true
            case (.some, nil): return false
            case let (.some(left), .some(right)): return AuralCatalogReader.rowBefore(left, right, sortOrder: lhs.sortOrder)
            case (nil, nil): return lhs.low > rhs.low
            }
        }
    }

    private let configuration: AuralBundleConfiguration
    private var catalog: DatabaseQueue?
    private var evidence: DatabaseQueue?
    private var snapshotId = ""
    private var metadata: [String: String] = [:]
    private var popularityMetadata: [String: String] = [:]
    private var suffix: [Int32] = []
    private var songByRun: [String] = []
    private var sectionByRun: [String] = []
    private var validSongIds: Set<String> = []
    private var popularity: [String: Popularity] = [:]
    private var eligiblePrefixCache: (percent: Int?, counts: [Int32])?
    private var runCache: [Int: Run] = [:]
    private var runCacheOrder: [Int] = []
    private var rankings: [RankingID: RankingState] = [:]
    private var chordVariantCache: [String: [AuralChordVariant]] = [:]
    private var rootLabelsByToken: [String: String]?
    private var bucketCache: (key: BucketKey, value: [AuralCatalogBucket])?
    private var leases: Set<UUID> = []
    private var replacementOwner: UUID?
    private var replacementWaiters: [(UUID, CheckedContinuation<Void, Never>)] = []
    private var leaseWaiters: [CheckedContinuation<Void, Never>] = []
    private var acquisitionWaiters: [CheckedContinuation<Void, Never>] = []
    private var replacementMayInstall = false

    func lifecycleState() -> (leases: Int, waitingAcquisitions: Int, replacementPending: Bool, replacementMayInstall: Bool) {
        (leases.count, acquisitionWaiters.count, replacementOwner != nil, replacementMayInstall)
    }

    public init(configuration: AuralBundleConfiguration) {
        self.configuration = configuration
    }

    public func acquireLease() async throws -> AuralCatalogLease {
        while replacementOwner != nil {
            await withCheckedContinuation { acquisitionWaiters.append($0) }
            try Task.checkCancellation()
        }
        try prepare()
        let id = UUID()
        leases.insert(id)
        return AuralCatalogLease { [self] in await releaseLease(id) }
    }

    private func releaseLease(_ id: UUID) {
        guard leases.remove(id) != nil else { return }
        if leases.isEmpty {
            let waiting = leaseWaiters
            leaseWaiters.removeAll()
            waiting.forEach { $0.resume() }
        }
    }

    public func beginReplacement() async throws -> UUID {
        let id = UUID()
        while replacementOwner != nil && replacementOwner != id {
            await withCheckedContinuation { replacementWaiters.append((id, $0)) }
            do { try Task.checkCancellation() }
            catch {
                if replacementOwner == id { endReplacement(id) }
                throw error
            }
        }
        replacementOwner = id
        do {
            if !leases.isEmpty {
                await withCheckedContinuation { leaseWaiters.append($0) }
            }
            try Task.checkCancellation()
            replacementMayInstall = true
            return id
        } catch {
            endReplacement(id)
            throw error
        }
    }

    public func endReplacement(_ id: UUID) {
        guard replacementOwner == id else { return }
        replacementMayInstall = false
        if replacementWaiters.isEmpty {
            replacementOwner = nil
            let waiting = acquisitionWaiters
            acquisitionWaiters.removeAll()
            waiting.forEach { $0.resume() }
        } else {
            let (next, continuation) = replacementWaiters.removeFirst()
            replacementOwner = next
            continuation.resume()
        }
    }

    public func prepare() throws {
        guard catalog == nil else { return }
        apply(try loadPrepared())
    }

    private func loadPrepared() throws -> PreparedCatalog {
        let catalogURL = configuration.fileURL("aural-catalog.db")
        guard FileManager.default.fileExists(atPath: catalogURL.path) else {
            throw AuralCatalogError.unavailable
        }
        let openedCatalog = try Self.openReadOnly(catalogURL)
        let catalogMetadata = try Self.metadata(openedCatalog)
        guard AuralBundleConfiguration.supportedSchemas.contains(catalogMetadata["schema_version"] ?? ""),
              let installedSnapshot = catalogMetadata["snapshot_id"], installedSnapshot.count == 64
        else { throw AuralCatalogError.invalidSchema("catalog metadata mismatch") }

        let evidenceURL = configuration.fileURL("aural-evidence.db")
        let openedEvidence = try Self.openReadOnly(evidenceURL)
        guard try Self.metadata(openedEvidence)["catalog_snapshot"] == installedSnapshot else {
            throw AuralCatalogError.invalidSchema("evidence belongs to another catalog")
        }
        let popularityURL = configuration.fileURL("aural-popularity.db")
        let openedPopularity = try Self.openReadOnly(popularityURL)

        let packed: Data = try openedCatalog.read { db in
            guard let data = try Data.fetchOne(
                db,
                sql: "SELECT data FROM catalog_array WHERE name='suffix_locations'"
            ), data.count.isMultiple(of: 8) else {
                throw AuralCatalogError.invalidSchema("suffix array is missing or malformed")
            }
            return data
        }
        let decodedSuffix = Self.decodeLittleEndianInt32(packed)
        let identities: [(Int, String, String)] = try openedCatalog.read { db in
            try Row.fetchAll(
                db,
                sql: "SELECT id, song_id, section_id FROM catalog_run ORDER BY id"
            ).map { row in
                (row["id"], row["song_id"], row["section_id"])
            }
        }
        for (expected, value) in identities.enumerated() where value.0 != expected {
            throw AuralCatalogError.invalidSchema("catalog run identities are not contiguous")
        }
        let validSongIds = try openedCatalog.read { db in
            Set(try String.fetchAll(db, sql: "SELECT id FROM catalog_song"))
        }
        let popularity = try openedPopularity.read { db in
            var result: [String: Popularity] = [:]
            for row in try Row.fetchAll(
                db,
                sql: "SELECT song_id, score, confidence, provider_url, measured_at FROM popularity"
            ) {
                let id: String = row["song_id"]
                let provider: String? = row["provider_url"]
                let measured: String? = row["measured_at"]
                result[id] = Popularity(
                    score: row["score"],
                    confidence: row["confidence"] ?? 0,
                    providerURL: provider.flatMap(URL.init(string:)),
                    measuredAt: measured.flatMap(Self.parseDate)
                )
            }
            return result
        }
        try Task.checkCancellation()
        return PreparedCatalog(
            catalog: openedCatalog, evidence: openedEvidence, snapshotId: installedSnapshot,
            metadata: catalogMetadata, popularityMetadata: try Self.metadata(openedPopularity),
            suffix: decodedSuffix, songByRun: identities.map(\.1), sectionByRun: identities.map(\.2),
            validSongIds: validSongIds, popularity: popularity
        )
    }

    public func reload() throws {
        apply(try loadPrepared())
    }

    private func apply(_ prepared: PreparedCatalog) {
        catalog = prepared.catalog
        evidence = prepared.evidence
        snapshotId = prepared.snapshotId
        metadata = prepared.metadata
        popularityMetadata = prepared.popularityMetadata
        suffix = prepared.suffix
        songByRun = prepared.songByRun
        sectionByRun = prepared.sectionByRun
        validSongIds = prepared.validSongIds
        popularity = prepared.popularity
        eligiblePrefixCache = nil
        runCache = [:]
        runCacheOrder = []
        rankings = [:]
        chordVariantCache = [:]
        rootLabelsByToken = nil
        bucketCache = nil
    }

    public func warm(_ query: AuralCatalogQuery) throws {
        try prepare()
        _ = try buckets(query)
        try prepare()
    }

    public func info() throws -> AuralCatalogInfo {
        try requirePrepared()
        guard let catalog else { throw AuralCatalogError.unavailable }
        let counts = try catalog.read { db in
            (
                try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM catalog_song") ?? 0,
                try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM catalog_section") ?? 0
            )
        }
        let scored = popularity.values.lazy.filter { value in
            value.score.map { $0.isFinite && (0...1).contains($0) } ?? false
        }.count
        let newest = popularity.values.compactMap(\.measuredAt).max()
        return AuralCatalogInfo(
            schemaVersion: metadata["schema_version"] ?? "",
            snapshotId: snapshotId,
            normalizationVersion: metadata["normalization_version"],
            sequenceCount: Int64(metadata["sequence_count"] ?? "") ?? 0,
            songCount: counts.0,
            sectionCount: counts.1,
            scoredSongCount: scored,
            popularitySongCount: popularity.count,
            popularitySnapshotId: popularityMetadata["snapshotId"],
            provider: popularityMetadata["provider"],
            attribution: popularityMetadata["attribution"],
            measuredAt: newest ?? popularityMetadata["collectedAt"].flatMap(Self.parseDate),
            scoringVersion: popularityMetadata["scoringVersion"]
        )
    }

    public func buckets(_ query: AuralCatalogQuery) throws -> [AuralCatalogBucket] {
        try requirePrepared()
        try validateQuery(query)
        let key = BucketKey(query)
        if let bucketCache, bucketCache.key == key { return bucketCache.value }
        guard let catalog else { throw AuralCatalogError.unavailable }
        let grouped = metadata["schema_version"] == "aural-catalog-3"
        let reduced = metadata["sequence_reduction_version"] == AuralLoopReduction.version
        let eligible = eligibleRankPrefix(query.minimumPopularityPercent)
        guard (eligible.last ?? 0) > 0 else {
            bucketCache = (key, [])
            return []
        }
        let columns = grouped ? "start_group, start_group_label" : "'' AS start_group, 'All starting chords' AS start_group_label"
        var filters = ""
        var arguments: [DatabaseValue] = [query.view.databaseValue, query.minimumLength.databaseValue,
                                          (query.maximumLength ?? Int.max).databaseValue]
        if let mode = query.sourceMode { filters += " AND mode=?"; arguments.append(mode.databaseValue) }
        if let start = query.startingChord { filters += " AND start_group=?"; arguments.append(start.databaseValue) }
        var result: Set<AuralCatalogBucket> = []
        var matchEnds: [Int: [Int]] = [:]
        var lastID = -1
        while true {
            try Task.checkCancellation()
            let rows = try catalog.read { db in
                try Row.fetchAll(db, sql: """
                    SELECT id,start,end,min_length,max_length,\(columns) FROM catalog_range
                    WHERE view=? AND max_length>=? AND min_length<=? \(filters) AND id>?
                    ORDER BY id LIMIT 2048
                    """, arguments: StatementArguments(arguments + [lastID.databaseValue]))
            }
            for row in rows {
                try Task.checkCancellation()
                lastID = row["id"]
                let start: Int = row["start"], end: Int = row["end"]
                guard start >= 0, end >= start, end + 1 < eligible.count else {
                    throw AuralCatalogError.invalidSchema("group range exceeds the suffix index")
                }
                guard eligible[end + 1] > eligible[start] else { continue }
                let minimum: Int = row["min_length"], maximum: Int = row["max_length"]
                var low = max(query.minimumLength, minimum)
                let high = min(query.maximumLength ?? .max, maximum)
                let group: String = row["start_group"], label: String = row["start_group_label"]
                guard low <= high else { continue }
                if (low...high).allSatisfy({ result.contains(.init(length: $0, startingChord: group, label: label)) }) { continue }
                let runID = Int(suffix[start * 2]), offset = Int(suffix[start * 2 + 1])
                if !query.progression.chords.isEmpty {
                    if matchEnds[runID] == nil {
                        let source = try run(runID)
                        let labels = source.positions.map { query.view.hasSuffix("harmony_bass") ? $0.roman : $0.degree }
                        let roots = query.view.hasSuffix("harmony_bass") && query.progression.chords.contains(where: { $0.exact != nil })
                            ? try rootLabels(for: source.tokens) : labels
                        var ends = Array(repeating: Int.max, count: labels.count)
                        var next = Int.max
                        for index in labels.indices.reversed() {
                            if index + query.progression.chords.count <= labels.count,
                               query.progression.chords.indices.allSatisfy({
                                   query.progression.chords[$0].matches(labels[index + $0], rootLabel: roots[index + $0])
                               }) { next = index + query.progression.chords.count }
                            ends[index] = next
                        }
                        matchEnds[runID] = ends
                    }
                    guard let ends = matchEnds[runID], ends.indices.contains(offset), ends[offset] != .max else { continue }
                    low = max(low, ends[offset] - offset)
                }
                guard low <= high else { continue }
                let tokens = reduced ? [] : try run(runID).tokens
                for length in low...high {
                    let bucket = AuralCatalogBucket(length: length, startingChord: group, label: label)
                    if result.contains(bucket) { continue }
                    if !reduced {
                        guard offset >= 0, offset + length <= tokens.count else {
                            throw AuralCatalogError.invalidSchema("group range exceeds its run")
                        }
                        if AuralLoopReduction.analyze(Array(tokens[offset..<(offset + length)])).redundant { continue }
                    }
                    result.insert(bucket)
                }
            }
            if rows.count < 2048 { break }
        }
        let sorted = result.sorted { lhs, rhs in lhs.length == rhs.length ? AuralCatalogBucket.startingChordBefore(lhs,rhs) : lhs.length < rhs.length }
        bucketCache = (key, sorted)
        return sorted
    }

    public func chordVariants(query: AuralCatalogQuery, degree: Int, accidental: String) throws -> [AuralChordVariant] {
        try requirePrepared()
        guard let catalog else { throw AuralCatalogError.unavailable }
        let relative = query.view.hasPrefix("relative_")
        let column = query.view.hasSuffix("harmony_bass") ? "inversion_label" : "label"
        let cacheKey = "\(snapshotId)|\(query.view)|\(query.sourceMode ?? "")|\(degree)|\(accidental)"
        if let cached = chordVariantCache[cacheKey] { return cached }
        let found = try catalog.read { db in
            let cursor = try Row.fetchCursor(db, sql: "SELECT label,inversion_label,token FROM catalog_token")
            var labels: Set<AuralChordVariant> = []
            while let row = try cursor.next() {
                let token: String = row["token"]
                guard let payload = (try? JSONSerialization.jsonObject(with: Data(token.utf8))) as? [String: Any],
                      (payload["version"] as? String == "aural-relative-1") == relative else { continue }
                if let sourceMode = query.sourceMode, payload["mode"] as? String != sourceMode { continue }
                let label: String = row[column]
                guard let parsed = AuralChordConstraint.degreeAndAccidental(label),
                      parsed.0 == degree, parsed.1 == accidental else { continue }
                let root: String = row["label"]
                labels.insert(.init(label: AuralChordConstraint.canonical(label), root: AuralChordConstraint.canonical(root)))
            }
            return labels.sorted { $0.label.count == $1.label.count ? $0.label < $1.label : $0.label.count < $1.label.count }
        }
        chordVariantCache[cacheKey] = found
        return found
    }

    private func rootLabels(for tokens: [String]) throws -> [String] {
        if rootLabelsByToken == nil {
            guard let catalog else { throw AuralCatalogError.unavailable }
            rootLabelsByToken = try catalog.read { db in
                var labels: [String: String] = [:]
                let cursor = try Row.fetchCursor(db, sql: "SELECT token,label FROM catalog_token")
                while let row = try cursor.next() {
                    let token: String = row["token"]
                    labels[token] = row["label"]
                }
                return labels
            }
        }
        return tokens.map { rootLabelsByToken?[$0] ?? "" }
    }

    private func eligibleRankPrefix(_ percent: Int?) -> [Int32] {
        if let cached = eligiblePrefixCache, cached.percent == percent { return cached.counts }
        var counts = Array(repeating: Int32(0), count: suffix.count / 2 + 1)
        for rank in 0..<(suffix.count / 2) {
            let run = Int(suffix[rank * 2])
            let eligible = songByRun.indices.contains(run)
                && validSongIds.contains(songByRun[run])
                && AuralPopularityFilter.includes(popularity[songByRun[run]]?.score, minimumPercent: percent)
            counts[rank + 1] = counts[rank] + (eligible ? 1 : 0)
        }
        eligiblePrefixCache = (percent, counts)
        return counts
    }

    public func beginRanking(_ query: AuralCatalogQuery) throws -> RankingID {
        try requirePrepared()
        try validateQuery(query)
        let maximumPopularity = query.preferPopular
            ? popularity.values.compactMap { value -> Double? in
                guard let score = value.score, score.isFinite else { return nil }
                return 1 + min(1, max(0, value.confidence)) * (min(1, max(0, score)) - 0.5)
            }.max() ?? 1
            : 1
        let id = RankingID()
        let eligiblePrefix = eligibleRankPrefix(query.minimumPopularityPercent)
        rankings[id] = RankingState(
            query: query,
            multiplier: max(1, maximumPopularity)
                * (query.favorFavorites && !query.favoriteSongIds.isEmpty ? 1.5 : 1),
            eligiblePrefix: eligiblePrefix,
            exhaustedRanges: (eligiblePrefix.last ?? 0) == 0
        )
        return id
    }

    private func validateQuery(_ query: AuralCatalogQuery) throws {
        guard ["harmony", "harmony_bass", "relative_harmony", "relative_harmony_bass"].contains(query.view),
              query.progression.isValid,
              query.minimumLength >= 2,
              query.maximumLength.map({ $0 >= query.minimumLength }) ?? true,
              query.minimumPopularityPercent.map({ (0...100).contains($0) }) ?? true,
              ["mostSongs", "recommended", "longest", "shortest"].contains(query.sortOrder)
        else { throw AuralCatalogError.invalidSchema("invalid catalog query") }
        if query.sourceMode != nil, metadata["schema_version"] == "aural-catalog-1" {
            throw AuralCatalogError.invalidSchema("mode analysis needs a catalog update")
        }
        if query.startingChord != nil, metadata["schema_version"] != "aural-catalog-3" {
            throw AuralCatalogError.invalidSchema("starting-chord grouping needs a catalog update")
        }
    }

    public func page(_ id: RankingID, limit: Int = 30) throws -> AuralCatalogPage {
        try requirePrepared()
        guard (1...500).contains(limit), var state = rankings[id] else {
            throw AuralCatalogError.invalidSchema("ranking session is unavailable")
        }
        var rows: [AuralCatalogRow] = []
        while rows.count < limit {
            try Task.checkCancellation()
            try refineFrontier(&state)
            guard let entry = state.heap.pop() else { break }
            if let row = entry.row {
                rows.append(row)
                state.emitted += 1
            } else if entry.low != entry.high {
                let middle = (entry.low + entry.high) / 2
                add(
                    start: entry.start, end: entry.end, low: entry.low, high: middle,
                    songs: entry.songs, multiplier: state.multiplier, sortOrder: state.query.sortOrder, to: &state.heap
                )
                add(
                    start: entry.start, end: entry.end, low: middle + 1, high: entry.high,
                    songs: entry.songs, multiplier: state.multiplier, sortOrder: state.query.sortOrder, to: &state.heap
                )
            } else {
                let pattern = try target(start: entry.start, end: entry.end, length: entry.low)
                if AuralLoopReduction.analyze(pattern.tokens).redundant { continue }
                let roots = state.query.progression.chords.contains(where: { $0.exact != nil }) && state.query.view.hasSuffix("harmony_bass")
                    ? try rootLabels(for: pattern.tokens) : pattern.labels
                if !state.query.progression.matches(pattern.labels, rootLabels: roots) { continue }
                guard let row = try stats(pattern, query: state.query) else { continue }
                state.heap.push(HeapEntry(
                    start: entry.start,
                    end: entry.end,
                    low: entry.low,
                    high: entry.high,
                    songs: entry.songs,
                    bound: row.score,
                    row: row,
                    sortOrder: state.query.sortOrder
                ))
            }
        }
        let hasMore = state.rangeIndex < state.rangeBatch.count
            || !state.exhaustedRanges || !state.heap.entries.isEmpty
        rankings[id] = state
        return AuralCatalogPage(rows: rows, hasMore: hasMore, nextOffset: state.emitted)
    }

    public func closeRanking(_ id: RankingID) {
        rankings[id] = nil
    }

    public func children(
        of pattern: AuralPattern,
        query: AuralCatalogQuery
    ) throws -> [AuralCatalogRow] {
        try requireCompatible(pattern)
        guard pattern.tokens.count > 2 else { return [] }
        var seen: Set<String> = []
        var rows: [AuralCatalogRow] = []
        for tokens in AuralLoopReduction.retainedChildren(pattern.tokens) {
            guard let target = try lookup(tokens: tokens, view: pattern.view),
                  seen.insert(target.id).inserted else { continue }
            if let row = try stats(target, query: query) { rows.append(row) }
        }
        return rows.sorted { Self.rowBefore($0, $1, sortOrder: query.sortOrder) }
    }

    public func songs(for pattern: AuralPattern, minimumPopularityPercent: Int? = nil) throws -> [AuralPatternSong] {
        try requireCompatible(pattern)
        guard let catalog else { throw AuralCatalogError.unavailable }
        let rows = try catalog.read { db in
            try Row.fetchAll(db, sql: """
                SELECT DISTINCT song.id, song.title, song.artist
                FROM catalog_suffix suffix
                JOIN catalog_run run ON run.id = suffix.run_id
                JOIN catalog_song song ON song.id = run.song_id
                WHERE suffix.rank BETWEEN ? AND ?
                """, arguments: [pattern.start, pattern.end])
        }
        return rows.map { row in
            let id: String = row["id"]
            let popularity = popularity[id]
            return AuralPatternSong(
                id: id,
                title: (row["title"] as String?) ?? "Untitled",
                artist: (row["artist"] as String?) ?? "Unknown artist",
                popularity: popularity?.score.flatMap {
                    $0.isFinite && (0...1).contains($0) ? $0 : nil
                },
                confidence: popularity?.confidence ?? 0,
                providerURL: popularity?.providerURL,
                measuredAt: popularity?.measuredAt
            )
        }.filter { AuralPopularityFilter.includes($0.popularity, minimumPercent: minimumPopularityPercent) }.sorted {
            switch ($0.popularity, $1.popularity) {
            case let (left?, right?) where left != right: return left > right
            case (.some, nil): return true
            case (nil, .some): return false
            default:
                let title = $0.title.localizedCaseInsensitiveCompare($1.title)
                if title != .orderedSame { return title == .orderedAscending }
                let artist = $0.artist.localizedCaseInsensitiveCompare($1.artist)
                if artist != .orderedSame { return artist == .orderedAscending }
                return $0.id < $1.id
            }
        }
    }

    public func passage(
        for pattern: AuralPattern,
        settings: AuralSettings,
        context: AuralSelectionContext,
        seed: UInt64,
        songId: String? = nil,
        minimumPopularityPercent: Int? = nil
    ) throws -> AuralPassage {
        try requireCompatible(pattern)
        guard let catalog else { throw AuralCatalogError.unavailable }
        let rows = try catalog.read { db in
            try Row.fetchAll(db, sql: """
                SELECT start.run_id, start.offset, start.start_index, ending.end_index
                FROM catalog_suffix start
                JOIN catalog_suffix ending
                  ON ending.run_id = start.run_id
                 AND ending.offset = start.offset + ?
                WHERE start.rank BETWEEN ? AND ?
                """, arguments: [pattern.tokens.count - 1, pattern.start, pattern.end])
        }
        var references: [AuralOccurrence] = []
        var locations: [String: (run: Int, offset: Int, start: Int, end: Int)] = [:]
        for row in rows {
            let runId: Int = row["run_id"]
            guard songByRun.indices.contains(runId), sectionByRun.indices.contains(runId) else {
                throw AuralCatalogError.invalidSchema("occurrence references an unknown run")
            }
            let supportingSong = songByRun[runId]
            guard validSongIds.contains(supportingSong) else { continue }
            if let songId, supportingSong != songId { continue }
            if !AuralPopularityFilter.includes(popularity[supportingSong]?.score, minimumPercent: minimumPopularityPercent) { continue }
            let sectionId = sectionByRun[runId]
            let startIndex: Int = row["start_index"]
            let endIndex: Int = row["end_index"]
            let sourceId = "\(supportingSong)|\(sectionId)|\(startIndex)|\(endIndex)"
            let occurrenceId = AuralIdentity.digest("\(pattern.id)|\(sourceId)")
            references.append(AuralOccurrence(
                id: occurrenceId,
                songId: supportingSong,
                sectionId: sectionId,
                sourceId: sourceId
            ))
            locations[occurrenceId] = (
                run: runId,
                offset: row["offset"],
                start: startIndex,
                end: endIndex
            )
        }
        let songPopularity = Dictionary(uniqueKeysWithValues: popularity.map { id, value in
            (id, AuralPopularity(score: value.score, confidence: value.confidence))
        })
        guard let selected = AuralSelector.select(
            references,
            songs: songPopularity,
            settings: settings,
            context: context,
            seed: seed
        ), let location = locations[selected.id] else {
            throw AuralCatalogError.missingSource(pattern.id)
        }
        let run = try run(location.run)
        guard location.offset >= 0,
              location.offset + pattern.tokens.count <= run.positions.count else {
            throw AuralCatalogError.invalidSchema("source position is outside its run")
        }
        let positions = Array(
            run.positions[location.offset..<(location.offset + pattern.tokens.count)]
        )
        let songAndSection: (String, String, String) = try catalog.read { db in
            guard let row = try Row.fetchOne(db, sql: """
                SELECT song.title, song.artist, section.name
                FROM catalog_song song
                JOIN catalog_section section ON section.song_id = song.id
                WHERE song.id = ? AND section.id = ?
                """, arguments: [run.songId, run.sectionId]) else {
                throw AuralCatalogError.missingSource(selected.sourceId)
            }
            return (
                (row["title"] as String?) ?? "Untitled",
                (row["artist"] as String?) ?? "Unknown artist",
                (row["name"] as String?) ?? "Section"
            )
        }
        let events = positions.enumerated().map { index, position in
            AuralEvent(
                notes: position.notes.sorted(),
                rootMidi: position.rootMidi,
                bassMidi: position.bassMidi,
                degree: pattern.labels[index],
                beats: position.endBeat - position.startBeat
            )
        }
        let tonicRoot = 48 + Self.pitchClass(run.keyTonic)
        let tonicIntervals: [Int] = switch run.keyMode?.lowercased() {
        case "major", "ionian", "lydian", "mixolydian": [0, 4, 7]
        case "locrian": [0, 3, 6]
        default: [0, 3, 7]
        }
        let contextEvent = AuralEvent(
            notes: tonicIntervals.map { tonicRoot + $0 },
            rootMidi: tonicRoot,
            bassMidi: tonicRoot,
            degree: "I",
            beats: 2
        )
        return AuralPassage(
            occurrenceId: selected.id,
            patternId: pattern.id,
            songId: run.songId,
            title: songAndSection.0,
            artist: songAndSection.1,
            sectionId: run.sectionId,
            sectionName: songAndSection.2,
            sourceRevision: run.revision,
            startIndex: location.start,
            endIndex: location.end,
            view: run.view,
            keyTonic: run.keyTonic,
            keyScale: run.keyMode ?? "major",
            events: events,
            context: [contextEvent],
            startBeat: positions.first?.startBeat ?? 0,
            endBeat: positions.last?.endBeat ?? 0
        )
    }

    public func sourceSectionJSON(for passage: AuralPassage) throws -> Data {
        try requirePrepared()
        guard let catalog else { throw AuralCatalogError.unavailable }
        return try catalog.read { db in
            guard let row = try Row.fetchOne(db, sql: """
                SELECT source, revision
                FROM catalog_section
                WHERE id = ? AND song_id = ?
                """, arguments: [passage.sectionId, passage.songId]) else {
                throw AuralCatalogError.missingSource(passage.sourceId)
            }
            let revision: String = row["revision"]
            guard revision == passage.sourceRevision else {
                throw AuralCatalogError.missingSource(passage.sourceId)
            }
            let source: Data = row["source"]
            return try Self.inflate(source)
        }
    }

    public func evidenceText(for pattern: AuralPattern) throws -> String {
        try requireCompatible(pattern)
        if let evidence, let blob: Data = try evidence.read({ db in
            try Data.fetchOne(db, sql: "SELECT stats FROM evidence WHERE pattern_id = ?", arguments: [pattern.id])
        }) {
            let data = try Self.inflate(blob)
            if let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let transitions = object["totalTransitions"] ?? 0
                let additional = object["additionalTransitions"] ?? 0
                let overlapping = object["overlappingTransitions"] ?? 0
                let coverage = (object["cumulativeObservedCoverage"] as? Double)
                    ?? (object["cumulativeCoverage"] as? Double)
                var text = "Curriculum selection order\nTransitions: \(transitions)\nAdditional: \(additional)\nOverlapping: \(overlapping)"
                if let coverage { text += "\nCumulative corpus coverage: \((coverage * 100).formatted(.number.precision(.fractionLength(2))))%" }
                text += "\nPhysical-transition coverage is a union."
                if let windows = object["sequenceCoverage"] as? [String: Any], !windows.isEmpty {
                    text += "\nLonger windows (total / additional / corpus):"
                    for key in windows.keys.sorted(by: {
                        (Int($0) ?? .max) < (Int($1) ?? .max)
                    }) {
                        guard let values = windows[key] as? [String: Any] else { continue }
                        text += "\n\(key) chords: \(values["total"] ?? 0) / \(values["additional"] ?? 0) / \(values["denominator"] ?? 0)"
                    }
                } else {
                    text += "\nLonger sequence-window coverage is unavailable for this pattern."
                }
                return text
            }
        }
        let physical = try nonOverlappingWindows(pattern, length: 2)
        let rawTransitions = (pattern.end - pattern.start + 1) * max(0, pattern.tokens.count - 1)
        return """
            Not in the selected curriculum ordering.
            Transitions covered: \(physical)
            Repeated transition visits: \(max(0, rawTransitions - physical))
            Physical-transition coverage is a union; the 80% curriculum target does not limit catalog discovery.
            """
    }

    public func target(start: Int, end: Int, length: Int) throws -> AuralPattern {
        guard start >= 0, end >= start, length >= 2, end * 2 + 1 < suffix.count else {
            throw AuralCatalogError.missingPattern("\(start):\(end):\(length)")
        }
        let runId = Int(suffix[start * 2])
        let offset = Int(suffix[start * 2 + 1])
        let run = try run(runId)
        guard offset >= 0, offset + length <= run.tokens.count,
              offset + length <= run.positions.count else {
            throw AuralCatalogError.invalidSchema("pattern range exceeds its run")
        }
        let tokens = Array(run.tokens[offset..<(offset + length)])
        let positions = run.positions[offset..<(offset + length)]
        let labels = positions.map { run.view.hasSuffix("harmony_bass") ? $0.roman : $0.degree }
        return AuralPattern(
            id: AuralIdentity.pattern(tokens: tokens, view: run.view),
            view: run.view,
            tokens: tokens,
            labels: labels,
            start: start,
            end: end,
            snapshotId: snapshotId
        )
    }

    public func lookup(tokens: [String], view: String) throws -> AuralPattern? {
        guard !tokens.isEmpty else { return nil }
        func compare(_ rank: Int) throws -> ComparisonResult {
            let run = try run(Int(suffix[rank * 2]))
            let offset = Int(suffix[rank * 2 + 1])
            if run.view != view { return run.view < view ? .orderedAscending : .orderedDescending }
            for (index, token) in tokens.enumerated() {
                guard offset + index < run.tokens.count else { return .orderedAscending }
                let candidate = run.tokens[offset + index]
                if candidate != token {
                    return candidate < token ? .orderedAscending : .orderedDescending
                }
            }
            return .orderedSame
        }
        var low = 0
        var high = suffix.count / 2
        while low < high {
            let middle = (low + high) / 2
            if try compare(middle) == .orderedAscending { low = middle + 1 } else { high = middle }
        }
        let start = low
        high = suffix.count / 2
        while low < high {
            let middle = (low + high) / 2
            if try compare(middle) != .orderedDescending { low = middle + 1 } else { high = middle }
        }
        return low > start ? try target(start: start, end: low - 1, length: tokens.count) : nil
    }

    private func refineFrontier(_ state: inout RankingState) throws {
        while true {
            try Task.checkCancellation()
            if state.rangeIndex >= state.rangeBatch.count, !state.exhaustedRanges {
                state.rangeBatch = try fetchRanges(state.query, offset: state.rangeOffset)
                state.rangeIndex = 0
                state.rangeOffset += state.rangeBatch.count
                state.exhaustedRanges = state.rangeBatch.count < 256
            }
            guard state.rangeIndex < state.rangeBatch.count else { return }
            let range = state.rangeBatch[state.rangeIndex]
            let low = max(range.minimumLength, state.query.minimumLength)
            let high = min(range.maximumLength, state.query.maximumLength ?? .max)
            let candidate = HeapEntry(start: range.start, end: range.end, low: low, high: high,
                                      songs: range.songs, bound: range.upperScore * state.multiplier,
                                      row: nil, sortOrder: state.query.sortOrder)
            let competitive = state.heap.first.map { MaxHeap.before(candidate, $0) } ?? true
            guard competitive else { return }
            state.rangeIndex += 1
            if let prefix = state.eligiblePrefix,
               prefix[range.end + 1] == prefix[range.start] { continue }
            if low <= high {
                add(
                    start: range.start, end: range.end, low: low, high: high,
                    songs: range.songs, multiplier: state.multiplier,
                    sortOrder: state.query.sortOrder, to: &state.heap
                )
            }
        }
    }

    private func fetchRanges(_ query: AuralCatalogQuery, offset: Int) throws -> [RangeRecord] {
        guard let catalog else { throw AuralCatalogError.unavailable }
        var filters = ""
        var arguments: [DatabaseValue] = [query.view.databaseValue, query.minimumLength.databaseValue, (query.maximumLength ?? Int.max).databaseValue]
        if let mode = query.sourceMode {
            guard metadata["schema_version"] != "aural-catalog-1" else { throw AuralCatalogError.invalidSchema("mode analysis needs a catalog update") }
            filters += " AND mode = ?"; arguments.append(mode.databaseValue)
        }
        if let start = query.startingChord {
            guard metadata["schema_version"] == "aural-catalog-3" else { throw AuralCatalogError.invalidSchema("starting-chord grouping needs a catalog update") }
            filters += " AND start_group = ?"; arguments.append(start.databaseValue)
        }
        arguments.append(offset.databaseValue)
        let highOrder = query.maximumLength.map { "MIN(max_length, \($0))" } ?? "max_length"
        let lowOrder = query.minimumLength <= 2 ? "min_length" : "MAX(min_length, \(query.minimumLength))"
        let order: String
        switch query.sortOrder {
        case "recommended": order = "upper_score DESC, id"
        case "longest": order = "\(highOrder) DESC, songs DESC, (end-start+1) DESC, id"
        case "shortest": order = "\(lowOrder) ASC, songs DESC, (end-start+1) DESC, id"
        default: order = "songs DESC, (end-start+1) DESC, \(highOrder) DESC, id"
        }
        return try catalog.read { db in
            try Row.fetchAll(db, sql: """
                SELECT id, start, end, min_length, max_length, songs, upper_score
                FROM catalog_range
                WHERE view = ? AND max_length >= ? AND min_length <= ? \(filters)
                ORDER BY \(order)
                LIMIT 256 OFFSET ?
                """, arguments: StatementArguments(arguments)).map { row in
                    RangeRecord(
                        id: row["id"],
                        start: row["start"],
                        end: row["end"],
                        minimumLength: row["min_length"],
                        maximumLength: row["max_length"],
                        songs: row["songs"],
                        upperScore: row["upper_score"]
                    )
                }
        }
    }

    private func add(
        start: Int,
        end: Int,
        low: Int,
        high: Int,
        songs: Int,
        multiplier: Double,
        sortOrder: String,
        to heap: inout MaxHeap
    ) {
        heap.push(HeapEntry(
            start: start,
            end: end,
            low: low,
            high: high,
            songs: songs,
            bound: Self.baseScore(
                length: high,
                songs: songs,
                effective: min(end - start + 1, songs * 4)
            ) * multiplier,
            row: nil,
            sortOrder: sortOrder
        ))
    }

    private func stats(_ pattern: AuralPattern, query: AuralCatalogQuery) throws -> AuralCatalogRow? {
        var grouped: [String: [(run: Int, offset: Int)]] = [:]
        var allSongs: Set<String> = []
        var globalOccurrences = 0
        var sections: Set<String> = []
        var occurrences = 0
        for rank in pattern.start...pattern.end {
            let run = Int(suffix[rank * 2])
            let offset = Int(suffix[rank * 2 + 1])
            guard songByRun.indices.contains(run), sectionByRun.indices.contains(run) else {
                throw AuralCatalogError.invalidSchema("suffix references an unknown run")
            }
            let song = songByRun[run]
            guard validSongIds.contains(song) else { continue }
            globalOccurrences += 1
            allSongs.insert(song)
            guard AuralPopularityFilter.includes(popularity[song]?.score, minimumPercent: query.minimumPopularityPercent) else { continue }
            grouped[song, default: []].append((run, offset))
            sections.insert(sectionByRun[run])
            occurrences += 1
        }
        guard !grouped.isEmpty else { return nil }
        var effective = 0
        var factorTotal = 0.0
        for (song, var matches) in grouped {
            matches.sort { $0.run == $1.run ? $0.offset < $1.offset : $0.run < $1.run }
            var previousRun = -1
            var previousEnd = -1
            var count = 0
            for match in matches where count < 4 {
                if match.run != previousRun || match.offset > previousEnd {
                    count += 1
                    previousRun = match.run
                    previousEnd = match.offset + pattern.tokens.count - 1
                }
            }
            effective += count
            factorTotal += songFactor(song, query: query)
        }
        let songCount = grouped.count
        let score = songCount == 0 ? 0 : Self.baseScore(
            length: pattern.tokens.count,
            songs: songCount,
            effective: effective
        ) * factorTotal / Double(songCount)
        return AuralCatalogRow(
            id: pattern.id,
            view: pattern.view,
            tokens: pattern.tokens,
            labels: pattern.labels,
            start: pattern.start,
            end: pattern.end,
            snapshotId: pattern.snapshotId,
            occurrenceCount: occurrences,
            songCount: songCount,
            sectionCount: sections.count,
            effectiveOccurrenceCount: effective,
            score: score,
            mode: try run(Int(suffix[pattern.start * 2])).keyMode,
            globalOccurrenceCount: globalOccurrences,
            globalSongCount: allSongs.count
        )
    }

    private func songFactor(_ id: String, query: AuralCatalogQuery) -> Double {
        let popularityFactor: Double
        if query.preferPopular, let value = popularity[id], let score = value.score, score.isFinite {
            popularityFactor = 1
                + min(1, max(0, value.confidence)) * (min(1, max(0, score)) - 0.5)
        } else {
            popularityFactor = 1
        }
        let recent = query.recentSongIds.firstIndex(of: id)
        let variety = query.keepVaried && recent.map({ $0 < 10 }) == true
            ? (recent! < 3 ? 0.25 : 0.6)
            : 1
        let favorite = query.favorFavorites && query.favoriteSongIds.contains(id) ? 1.5 : 1
        return popularityFactor * variety * favorite
    }

    private func run(_ id: Int) throws -> Run {
        if let cached = runCache[id] { return cached }
        guard let catalog else { throw AuralCatalogError.unavailable }
        let loaded: Run = try catalog.read { db in
            guard let row = try Row.fetchOne(db, sql: """
                SELECT stable_id, view, song_id, section_id, revision, tokens, positions, key_json
                FROM catalog_run WHERE id = ?
                """, arguments: [id]) else {
                throw AuralCatalogError.invalidSchema("run \(id) is missing")
            }
            let tokenBlob: Data = row["tokens"]
            let positionBlob: Data = row["positions"]
            let keyJSON: String = row["key_json"]
            let keyObject = try JSONSerialization.jsonObject(with: Data(keyJSON.utf8)) as? [String: Any]
            return Run(
                id: id,
                stableId: row["stable_id"],
                view: row["view"],
                songId: row["song_id"],
                sectionId: row["section_id"],
                revision: row["revision"],
                tokens: try JSONDecoder().decode([String].self, from: Self.inflate(tokenBlob)),
                positions: try JSONDecoder().decode([Position].self, from: Self.inflate(positionBlob)),
                keyTonic: keyObject?["tonic"] as? String ?? "C",
                keyMode: keyObject?["scale"] as? String
            )
        }
        if runCache.count >= 64, let oldest = runCacheOrder.first {
            runCache[oldest] = nil
            runCacheOrder.removeFirst()
        }
        runCache[id] = loaded
        runCacheOrder.append(id)
        return loaded
    }

    private func nonOverlappingWindows(_ pattern: AuralPattern, length: Int) throws -> Int {
        guard length >= 2, length <= pattern.tokens.count else { return 0 }
        var startsByRun: [Int: [Int]] = [:]
        for rank in pattern.start...pattern.end {
            startsByRun[Int(suffix[rank * 2]), default: []].append(Int(suffix[rank * 2 + 1]))
        }
        var total = 0
        for var starts in startsByRun.values {
            starts.sort()
            var priorEnd = -1
            for start in starts {
                let lastStart = start + pattern.tokens.count - length
                if lastStart >= max(start, priorEnd + 1) {
                    total += lastStart - max(start, priorEnd + 1) + 1
                }
                priorEnd = max(priorEnd, lastStart)
            }
        }
        return total
    }

    private func requirePrepared() throws {
        guard catalog != nil, !suffix.isEmpty, !snapshotId.isEmpty else {
            throw AuralCatalogError.unavailable
        }
    }

    private func requireCompatible(_ pattern: AuralPattern) throws {
        try requirePrepared()
        guard pattern.snapshotId == snapshotId,
              try lookup(tokens: pattern.tokens, view: pattern.view) == pattern
        else { throw AuralCatalogError.missingPattern(pattern.id) }
    }

    private static func openReadOnly(_ url: URL) throws -> DatabaseQueue {
        var configuration = Configuration()
        configuration.readonly = true
        return try DatabaseQueue(path: url.path, configuration: configuration)
    }

    private static func metadata(_ queue: DatabaseQueue) throws -> [String: String] {
        try queue.read { db in
            Dictionary(uniqueKeysWithValues: try Row.fetchAll(
                db,
                sql: "SELECT key, value FROM metadata"
            ).map { row -> (String, String) in (row["key"], row["value"]) })
        }
    }

    private static func decodeLittleEndianInt32(_ data: Data) -> [Int32] {
        stride(from: 0, to: data.count, by: 4).map { offset in
            let value = UInt32(data[offset])
                | UInt32(data[offset + 1]) << 8
                | UInt32(data[offset + 2]) << 16
                | UInt32(data[offset + 3]) << 24
            return Int32(bitPattern: value)
        }
    }

    private static func inflate(_ data: Data) throws -> Data {
        guard data.starts(with: [0x1f, 0x8b]) else { return data }
        var stream = z_stream()
        let status = inflateInit2_(
            &stream,
            MAX_WBITS + 16,
            ZLIB_VERSION,
            Int32(MemoryLayout<z_stream>.size)
        )
        guard status == Z_OK else { throw AuralCatalogError.decompression("zlib initialization failed") }
        defer { inflateEnd(&stream) }
        return try data.withUnsafeBytes { source in
            guard let base = source.bindMemory(to: Bytef.self).baseAddress else { return Data() }
            stream.next_in = UnsafeMutablePointer(mutating: base)
            stream.avail_in = uInt(data.count)
            var output = Data()
            var buffer = [UInt8](repeating: 0, count: 64 * 1024)
            while true {
                let count = buffer.count
                let result = buffer.withUnsafeMutableBytes { bytes -> Int32 in
                    stream.next_out = bytes.bindMemory(to: Bytef.self).baseAddress
                    stream.avail_out = uInt(count)
                    return zlib.inflate(&stream, Z_NO_FLUSH)
                }
                output.append(contentsOf: buffer.prefix(count - Int(stream.avail_out)))
                if result == Z_STREAM_END { return output }
                guard result == Z_OK else {
                    throw AuralCatalogError.decompression("zlib error \(result)")
                }
            }
        }
    }

    private static func baseScore(length: Int, songs: Int, effective: Int) -> Double {
        log2(Double(length)) * log2(1 + Double(songs)) * log2(1 + Double(effective))
    }

    private static func rankKey(_ entry: HeapEntry) -> [Int] {
        let songs = entry.row?.globalSongCount ?? entry.songs
        let occurrences = entry.row?.globalOccurrenceCount ?? entry.end - entry.start + 1
        let length = entry.row?.length ?? (entry.sortOrder == "shortest" ? entry.low : entry.high)
        switch entry.sortOrder {
        case "longest": return [length, songs, occurrences]
        case "shortest": return [-length, songs, occurrences]
        default: return [songs, occurrences, length]
        }
    }

    private static func rowBefore(_ lhs: AuralCatalogRow, _ rhs: AuralCatalogRow, sortOrder: String) -> Bool {
        switch sortOrder {
        case "mostSongs":
            if lhs.globalSongCount != rhs.globalSongCount { return lhs.globalSongCount > rhs.globalSongCount }
            if lhs.globalOccurrenceCount != rhs.globalOccurrenceCount { return lhs.globalOccurrenceCount > rhs.globalOccurrenceCount }
            if lhs.length != rhs.length { return lhs.length > rhs.length }
        case "longest", "shortest":
            if lhs.length != rhs.length { return sortOrder == "longest" ? lhs.length > rhs.length : lhs.length < rhs.length }
            if lhs.globalSongCount != rhs.globalSongCount { return lhs.globalSongCount > rhs.globalSongCount }
            if lhs.globalOccurrenceCount != rhs.globalOccurrenceCount { return lhs.globalOccurrenceCount > rhs.globalOccurrenceCount }
        default:
            if lhs.score != rhs.score { return lhs.score > rhs.score }
            if lhs.songCount != rhs.songCount { return lhs.songCount > rhs.songCount }
            if lhs.length != rhs.length { return lhs.length > rhs.length }
        }
        return lhs.id < rhs.id
    }

    private static func parseDate(_ value: String) -> Date? {
        ISO8601DateFormatter().date(from: value)
    }

    private static func pitchClass(_ tonic: String) -> Int {
        [
            "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
            "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
            "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11
        ][tonic] ?? 0
    }
}
