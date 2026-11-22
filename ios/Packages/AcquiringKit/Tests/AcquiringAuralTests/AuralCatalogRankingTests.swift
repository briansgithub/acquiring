@testable import AcquiringAural
import Foundation
import GRDB
import XCTest
import zlib

final class AuralCatalogRankingTests: XCTestCase {
    func testPreparedReaderReplacementWaitsForItsBrowserLease() async throws {
        let reader = try fixture(sources)
        let first = try await reader.acquireLease()
        let replacement = Task { try await reader.beginReplacement() }
        for _ in 0..<100 {
            if await reader.lifecycleState().replacementPending { break }
            await Task.yield()
        }
        let beforeRelease = await reader.lifecycleState()
        XCTAssertEqual(beforeRelease.leases, 1)
        XCTAssertTrue(beforeRelease.replacementPending)
        XCTAssertFalse(beforeRelease.replacementMayInstall)

        let next = Task { try await reader.acquireLease() }
        for _ in 0..<100 {
            if await reader.lifecycleState().waitingAcquisitions == 1 { break }
            await Task.yield()
        }
        let pending = await reader.lifecycleState()
        XCTAssertEqual(pending.waitingAcquisitions, 1)

        await first.release()
        let token = try await replacement.value
        let duringReplacement = await reader.lifecycleState()
        XCTAssertTrue(duringReplacement.replacementMayInstall)
        XCTAssertEqual(duringReplacement.leases, 0)
        await reader.endReplacement(token)
        let resumed = try await next.value
        let afterReplacement = await reader.lifecycleState()
        XCTAssertEqual(afterReplacement.leases, 1)
        await resumed.release()
    }

    private struct Source {
        let id: String
        let labels: [String]
        var score: Double? = 0.95
        var mode = "major"
        var view = "harmony"
        var roman: [String]? = nil
        var variant = ""
        var valid = true
    }

    private var sources: [Source] { [
        Source(id: "popular", labels: ["I", "V", "I", "IV"]),
        Source(id: "less-popular", labels: ["I", "V", "I", "IV"], score: 0.3),
        Source(id: "threshold", labels: ["I", "V", "I"], score: 0.8),
        Source(id: "other", labels: ["ii", "V", "I"]),
        Source(id: "missing-song", labels: ["I", "V", "I", "IV"], valid: false),
        Source(id: "zero", labels: ["IV", "I"], score: 0),
        Source(id: "unscored", labels: ["V", "IV"], score: nil),
        Source(id: "minor", labels: ["i", "iv", "V", "i"], score: 0.9, mode: "minor"),
        Source(id: "relative", labels: ["vi", "ii", "III", "vi"], mode: "minor", view: "relative_harmony"),
        Source(id: "inverted", labels: ["I", "V7", "I"], view: "harmony_bass", roman: ["I6", "V65", "I"])
    ] }

    func testFrequencyCountsStayGlobalAcrossCutoffAndPagination() async throws {
        let reader = try fixture(sources)
        try await reader.prepare()
        let query = AuralCatalogQuery(minimumPopularityPercent: 80, sortOrder: "mostSongs")
        let rows = try await allRows(reader, query: query, pageSize: 2)
        let full = try await allRows(reader, query: query, pageSize: 500)
        XCTAssertEqual(rows.map(\.id), full.map(\.id))
        XCTAssertEqual(Set(rows.map(\.id)).count, rows.count)
        let cadence = try XCTUnwrap(rows.first { $0.labels == ["V", "I"] })
        XCTAssertEqual(cadence.globalSongCount, 4)
        XCTAssertEqual(cadence.songCount, 3)
        XCTAssertEqual(cadence.globalOccurrenceCount, 4)
        XCTAssertEqual(cadence.occurrenceCount, 3)
        let globalOrder = rows.sorted {
            if $0.globalSongCount != $1.globalSongCount { return $0.globalSongCount > $1.globalSongCount }
            if $0.globalOccurrenceCount != $1.globalOccurrenceCount { return $0.globalOccurrenceCount > $1.globalOccurrenceCount }
            if $0.length != $1.length { return $0.length > $1.length }
            return $0.id < $1.id
        }
        XCTAssertEqual(rows.map(\.id), globalOrder.map(\.id))
        let atZero = try await allRows(reader, query: AuralCatalogQuery(minimumPopularityPercent: 0))
        XCTAssertTrue(atZero.contains { $0.labels == ["IV", "I"] })
        XCTAssertFalse(atZero.contains { $0.labels == ["V", "IV"] })
        for sort in ["longest", "shortest", "recommended"] {
            let paged = try await allRows(reader, query: AuralCatalogQuery(minimumPopularityPercent: 80, sortOrder: sort), pageSize: 1)
            let single = try await allRows(reader, query: AuralCatalogQuery(minimumPopularityPercent: 80, sortOrder: sort))
            XCTAssertEqual(paged.map(\.id), single.map(\.id), sort)
            for (left, right) in zip(paged, paged.dropFirst()) {
                if sort == "longest" { XCTAssertGreaterThanOrEqual(left.length, right.length) }
                if sort == "shortest" { XCTAssertLessThanOrEqual(left.length, right.length) }
                if sort == "recommended" { XCTAssertGreaterThanOrEqual(left.score, right.score) }
            }
        }
    }

    func testGroupsRespectSearchCutoffModeAndCoreLengthButChildrenCanBeShorter() async throws {
        let reader = try fixture(sources)
        try await reader.prepare()
        var query = AuralCatalogQuery(
            progression: AuralProgressionQuery(chords: [AuralChordConstraint(degree: 5), AuralChordConstraint(degree: 1)]),
            minimumLength: 3, minimumPopularityPercent: 90, sourceMode: "major"
        )
        let groups = try await reader.buckets(query)
        XCTAssertEqual(Set(groups.map(\.id)), ["3|I", "4|I", "3|V", "3|ii"])
        query.maximumLength = 3
        let bounded = try await reader.buckets(query)
        XCTAssertTrue(bounded.allSatisfy { $0.length == 3 })
        query.progression = AuralProgressionQuery(chords: [AuralChordConstraint(degree: 7)])
        let emptySearch = try await reader.buckets(query)
        XCTAssertTrue(emptySearch.isEmpty)
        query.progression = AuralProgressionQuery()
        query.minimumPopularityPercent = 100
        let emptyCutoff = try await reader.buckets(query)
        XCTAssertTrue(emptyCutoff.isEmpty)
        let core = AuralCatalogQuery(minimumLength: 4, minimumPopularityPercent: 80, sourceMode: "major")
        let rows = try await allRows(reader, query: core)
        XCTAssertTrue(rows.allSatisfy { $0.length >= 4 })
        let parent = try XCTUnwrap(rows.first)
        let children = try await reader.children(of: parent.pattern, query: core)
        XCTAssertEqual(Set(children.map(\.labels)), Set([["I", "V", "I"], ["V", "I", "IV"]]))
    }

    func testAnalysisViewsAndExactInversionSearch() async throws {
        let reader = try fixture(sources)
        try await reader.prepare()
        let minor = try await allRows(reader, query: AuralCatalogQuery(sourceMode: "minor"))
        XCTAssertFalse(minor.isEmpty)
        XCTAssertTrue(minor.allSatisfy { $0.mode == "minor" && $0.view == "harmony" })
        let relative = try await allRows(reader, query: AuralCatalogQuery(view: "relative_harmony"))
        XCTAssertTrue(relative.contains { $0.labels == ["vi", "ii", "III", "vi"] })
        let exact = AuralProgressionQuery(chords: [AuralChordConstraint(degree: 5, exact: "V7", inversion: "V65")])
        let inverted = try await allRows(reader, query: AuralCatalogQuery(view: "harmony_bass", progression: exact))
        XCTAssertFalse(inverted.isEmpty)
        XCTAssertTrue(inverted.allSatisfy { $0.labels.contains("V65") })
        let groups = try await reader.buckets(AuralCatalogQuery(view: "harmony_bass", progression: exact))
        XCTAssertEqual(Set(groups.map(\.id)), ["2|I6", "3|I6", "2|V65"])
    }

    func testEntireIneligibleRangeBatchDoesNotEndPagination() async throws {
        var source = (0..<270).map { Source(id: "low\($0)", labels: ["I", "V"], score: 0, variant: "\($0)") }
        source.append(Source(id: "eligible", labels: ["ii", "V"], variant: "eligible"))
        let reader = try fixture(source, inflatedLowBounds: true)
        try await reader.prepare()
        let rows = try await allRows(reader, query: AuralCatalogQuery(minimumPopularityPercent: 90, sortOrder: "recommended"), pageSize: 1)
        XCTAssertEqual(rows.map(\.labels), [["ii", "V"]])
    }

    func testLegacyLoopRangesAreReducedInRowsAndGroups() async throws {
        let reader = try fixture([Source(id: "loop", labels: ["I", "V", "I", "V", "I"])])
        try await reader.prepare()
        let rows = try await allRows(reader, query: AuralCatalogQuery())
        XCTAssertTrue(rows.allSatisfy { !AuralLoopReduction.analyze($0.tokens).redundant })
        let groups = try await reader.buckets(AuralCatalogQuery())
        XCTAssertEqual(Set(groups.map(\.length)), [2, 3])
    }

    private func allRows(_ reader: AuralCatalogReader, query: AuralCatalogQuery, pageSize: Int = 500) async throws -> [AuralCatalogRow] {
        let id = try await reader.beginRanking(query)
        var rows: [AuralCatalogRow] = []
        for _ in 0..<1000 {
            let page = try await reader.page(id, limit: pageSize)
            rows += page.rows
            if !page.hasMore { await reader.closeRanking(id); return rows }
        }
        await reader.closeRanking(id)
        XCTFail("Ranking did not finish")
        return rows
    }

    private func fixture(_ sources: [Source], inflatedLowBounds: Bool = false) throws -> AuralCatalogReader {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("aural-ranking-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let configuration = AuralBundleConfiguration(directoryURL: directory, manifestURL: URL(string: "https://fixture.invalid/manifest.json")!)
        let snapshot = String(repeating: "a", count: 64)
        func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
        let tokens: [[String]] = try sources.map { source in
            try source.labels.indices.map { index in
                String(decoding: try json([
                    "version": source.view.hasPrefix("relative_") ? "aural-relative-1" : "fixture-modal-1",
                    "mode": source.mode, "label": source.roman?[index] ?? source.labels[index], "variant": source.variant
                ]), as: UTF8.self)
            }
        }
        var suffix: [(run: Int, offset: Int)] = sources.indices.flatMap { run in tokens[run].indices.map { (run, $0) } }
        suffix.sort { lhs, rhs in
            if sources[lhs.run].view != sources[rhs.run].view { return sources[lhs.run].view < sources[rhs.run].view }
            return tokens[lhs.run][lhs.offset...].lexicographicallyPrecedes(tokens[rhs.run][rhs.offset...])
        }
        var packed = Data()
        for entry in suffix {
            for number in [entry.run, entry.offset] {
                var value = Int32(number).littleEndian
                withUnsafeBytes(of: &value) { packed.append(contentsOf: $0) }
            }
        }
        let catalog = try DatabaseQueue(path: configuration.fileURL("aural-catalog.db").path)
        try catalog.write { db in
            try db.execute(sql: "CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT); INSERT INTO metadata VALUES ('schema_version','aural-catalog-3'),('sequence_count','1')")
            try db.execute(sql: "INSERT INTO metadata VALUES ('snapshot_id',?)", arguments: [snapshot])
            try db.execute(sql: "CREATE TABLE catalog_array(name TEXT,data BLOB)")
            try db.execute(sql: "INSERT INTO catalog_array VALUES ('suffix_locations',?)", arguments: [packed])
            try db.execute(sql: "CREATE TABLE catalog_song(id TEXT PRIMARY KEY,title TEXT,artist TEXT,url TEXT); CREATE TABLE catalog_section(id TEXT)")
            try db.execute(sql: "CREATE TABLE catalog_run(id INTEGER PRIMARY KEY,stable_id TEXT,view TEXT,song_id TEXT,section_id TEXT,revision TEXT,tokens BLOB,positions BLOB,key_json TEXT)")
            try db.execute(sql: "CREATE TABLE catalog_token(token TEXT PRIMARY KEY,label TEXT,inversion_label TEXT)")
            try db.execute(sql: "CREATE TABLE catalog_range(id INTEGER PRIMARY KEY,view TEXT,mode TEXT,start_group TEXT,start_group_label TEXT,start INTEGER,end INTEGER,min_length INTEGER,max_length INTEGER,songs INTEGER,upper_score REAL)")
            for (run, source) in sources.enumerated() {
                if source.valid { try db.execute(sql: "INSERT INTO catalog_song VALUES (?,?,?,?)", arguments: [source.id, source.id, "Fixture", ""]) }
                try db.execute(sql: "INSERT INTO catalog_section VALUES (?)", arguments: [source.id])
                let positions: [[String: Any]] = source.labels.enumerated().map { index, label in
                    ["startIndex": index, "endIndex": index, "startBeat": Double(index * 2), "endBeat": Double(index * 2 + 2),
                     "degree": label, "roman": source.roman?[index] ?? label, "notes": [60, 64, 67], "rootMidi": 60, "bassMidi": 60]
                }
                try db.execute(sql: "INSERT INTO catalog_run VALUES (?,?,?,?,?,?,?,?,?)", arguments: [
                    run, "run\(run)", source.view, source.id, source.id, "1", try compressed(json(tokens[run])),
                    try compressed(json(positions)), String(decoding: try json(["tonic": "C", "scale": source.mode]), as: UTF8.self)
                ])
                for index in source.labels.indices {
                    try db.execute(sql: "INSERT OR IGNORE INTO catalog_token VALUES (?,?,?)", arguments: [tokens[run][index], source.labels[index], source.roman?[index] ?? source.labels[index]])
                }
            }
            var seen: Set<String> = []
            var rangeID = 0
            for entry in suffix where tokens[entry.run].count - entry.offset >= 2 {
                for length in 2...(tokens[entry.run].count - entry.offset) {
                    let pattern = Array(tokens[entry.run][entry.offset..<(entry.offset + length)])
                    let view = sources[entry.run].view
                    let identity = view + pattern.joined(separator: "|")
                    guard seen.insert(identity).inserted else { continue }
                    let ranks = suffix.indices.filter { rank in
                        let candidate = suffix[rank]
                        return sources[candidate.run].view == view && Array(tokens[candidate.run].dropFirst(candidate.offset).prefix(length)) == pattern
                    }
                    let songs = Set(ranks.map { sources[suffix[$0].run].id }).count
                    let label = sources[entry.run].roman?[entry.offset] ?? sources[entry.run].labels[entry.offset]
                    let upper = inflatedLowBounds && sources[entry.run].id.hasPrefix("low") ? 1_000_000.0 : 1000.0
                    try db.execute(sql: "INSERT INTO catalog_range VALUES (?,?,?,?,?,?,?,?,?,?,?)", arguments: [rangeID, view, sources[entry.run].mode, label, label, ranks.first!, ranks.last!, length, length, songs, upper])
                    rangeID += 1
                }
            }
        }
        let evidence = try DatabaseQueue(path: configuration.fileURL("aural-evidence.db").path)
        try evidence.write { db in
            try db.execute(sql: "CREATE TABLE metadata(key TEXT,value TEXT)")
            try db.execute(sql: "INSERT INTO metadata VALUES ('catalog_snapshot',?)", arguments: [snapshot])
        }
        let popularity = try DatabaseQueue(path: configuration.fileURL("aural-popularity.db").path)
        try popularity.write { db in
            try db.execute(sql: "CREATE TABLE metadata(key TEXT,value TEXT); CREATE TABLE popularity(song_id TEXT,score REAL,confidence REAL,provider_url TEXT,measured_at TEXT)")
            for source in sources {
                try db.execute(sql: "INSERT INTO popularity VALUES (?,?,1,NULL,NULL)", arguments: [source.id, source.score])
            }
        }
        return AuralCatalogReader(configuration: configuration)
    }

    private func compressed(_ data: Data) throws -> Data {
        var stream = z_stream()
        let initialized = deflateInit2_(&stream, Z_BEST_SPEED, Z_DEFLATED, MAX_WBITS + 16, 8,
                                       Z_DEFAULT_STRATEGY, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size))
        guard initialized == Z_OK else { throw NSError(domain: "fixture.compression", code: Int(initialized)) }
        defer { deflateEnd(&stream) }
        var output = Data(count: Int(deflateBound(&stream, uLong(data.count))))
        let code = output.withUnsafeMutableBytes { destination in
            data.withUnsafeBytes { source in
                stream.next_in = UnsafeMutablePointer(mutating: source.bindMemory(to: Bytef.self).baseAddress!)
                stream.avail_in = uInt(data.count)
                stream.next_out = destination.bindMemory(to: Bytef.self).baseAddress!
                stream.avail_out = uInt(destination.count)
                return deflate(&stream, Z_FINISH)
            }
        }
        guard code == Z_STREAM_END else { throw NSError(domain: "fixture.compression", code: Int(code)) }
        output.count = Int(stream.total_out)
        return output
    }
}
