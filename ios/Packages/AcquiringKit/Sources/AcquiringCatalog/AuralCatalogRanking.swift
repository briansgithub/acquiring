import Foundation
import GRDB

public struct AuralRankingPage: Sendable {
    public let rows: [AuralCatalogRow]
    public let continuation: AuralRankingContinuation?
}
/// Captures settings and the last total-order key. Valid only for this snapshot.
public struct AuralRankingContinuation: Sendable {
    let snapshot: String
    let options: AuralRankingOptions
    let last: AuralCatalogRow
}

extension AuralCatalog {
    static func precedes(_ a: AuralCatalogRow, _ b: AuralCatalogRow, sort: String) -> Bool {
        var left: [Double], right: [Double]
        switch sort {
        case "longest", "shortest":
            let sign = sort == "shortest" ? -1.0 : 1.0
            left = [sign * Double(a.target.tokens.count), Double(a.globalSongs), Double(a.globalOccurrences)]
            right = [sign * Double(b.target.tokens.count), Double(b.globalSongs), Double(b.globalOccurrences)]
        case "recommended":
            left = [a.score, Double(a.songs), Double(a.target.tokens.count)]
            right = [b.score, Double(b.songs), Double(b.target.tokens.count)]
        default:
            left = [Double(a.globalSongs), Double(a.globalOccurrences), Double(a.target.tokens.count)]
            right = [Double(b.globalSongs), Double(b.globalOccurrences), Double(b.target.tokens.count)]
        }
        return left == right ? a.target.id < b.target.id : right.lexicographicallyPrecedes(left)
    }

    private func scan(options: AuralRankingOptions, visit: (AuralCatalogRow) throws -> Void) throws {
        try checkOpen()
        guard options.minimumLength >= 2, options.maximumLength <= 4096, options.minimumLength <= options.maximumLength,
              ["harmony", "harmony_bass", "relative_harmony", "relative_harmony_bass"].contains(options.view) else { throw AuralCatalogError.invalid("ranking options") }
        if let percent = options.minimumPopularityPercent, !(0...100).contains(percent) { throw AuralCatalogError.invalid("popularity cutoff") }
        let view = capabilities.modeAnalysis ? options.view : options.view.replacingOccurrences(of: "relative_", with: "")
        var last: Int64 = -1
        while true {
            try Task.checkCancellation()
            let ranges = try database.read { db in
                try Row.fetchAll(db, sql: "SELECT * FROM catalog_range WHERE id>? AND view=? AND max_length>=? AND min_length<=? ORDER BY id LIMIT 256", arguments: [last, view, options.minimumLength, options.maximumLength])
            }
            for range in ranges {
                last = range["id"]
                if capabilities.modeAnalysis, let mode = options.mode, (range["mode"] as String?) != mode { continue }
                if capabilities.startGrouping, let group = options.startGroup, (range["start_group"] as String?) != group { continue }
                let lower = max(options.minimumLength, range["min_length"] as Int), upper = min(options.maximumLength, range["max_length"] as Int)
                guard lower <= upper else { continue }
                for length in lower...upper {
                    try Task.checkCancellation()
                    let target = try target(start: range["start"], end: range["end"], length: length)
                    if AuralLoopReduction.reduce(target.tokens).redundant { continue }
                    if !capabilities.startGrouping, let group = options.startGroup, AuralStartGroup.parse(target.labels.first ?? "")?.id != group { continue }
                    var roots = target.labels
                    if view.hasSuffix("harmony_bass"), options.query.chords.contains(where: { $0.exact != nil }) {
                        roots = try database.read { db in try target.tokens.map { try String.fetchOne(db, sql: "SELECT label FROM catalog_token WHERE token=?", arguments: [$0]) ?? "" } }
                    }
                    if !options.query.matches(labels: target.labels, rootLabels: roots) { continue }
                    if let row = try statistics(target, options: options) { try visit(row) }
                }
            }
            if ranges.count < 256 { return }
        }
    }

    /// Memory stays bounded to one SQL page and limit+1 candidates. Each page
    /// rescans compact precomputed ranges; this trades CPU for a fixed frontier.
    /// Cancellation throws and leaves the continuation reusable.
    public func ranking(options: AuralRankingOptions = AuralRankingOptions(), after: AuralRankingContinuation? = nil, limit: Int = 30) throws -> AuralRankingPage {
        guard (1...100).contains(limit) else { throw AuralCatalogError.budget("ranking page") }
        if let after, after.snapshot != snapshotId { throw AuralCatalogError.staleTarget }
        let settings = after?.options ?? options
        var best: [AuralCatalogRow] = []
        try scan(options: settings) { row in
            if let after, !Self.precedes(after.last, row, sort: settings.sort) { return }
            if best.contains(where: { $0.target.id == row.target.id }) { return }
            best.append(row); best.sort { Self.precedes($0, $1, sort: settings.sort) }
            if best.count > limit + 1 { best.removeLast() }
        }
        let more = best.count > limit
        if more { best.removeLast() }
        return AuralRankingPage(rows: best, continuation: more ? AuralRankingContinuation(snapshot: snapshotId, options: settings, last: best.last!) : nil)
    }
    public func matchingBuckets(options: AuralRankingOptions = AuralRankingOptions()) throws -> [Int: [AuralStartGroup]] {
        var groups: [Int: Set<AuralStartGroup>] = [:]
        try scan(options: options) { row in
            let group = capabilities.startGrouping ? AuralStartGroup.parse(row.target.labels.first ?? "") : AuralStartGroup(id: "", label: "All starting chords", degree: 0, accidental: "", quality: "major", seventhQuality: "none")
            if let group { groups[row.target.tokens.count, default: []].insert(group) }
        }
        return groups.mapValues { $0.sorted(by: AuralStartGroup.ordered) }
    }
    public func children(_ target: AuralPatternTarget, options: AuralRankingOptions = AuralRankingOptions()) throws -> [AuralCatalogRow] {
        try validate(target)
        return try AuralLoopReduction.retainedChildren(target.tokens).compactMap { tokens in
            guard let child = try lookup(tokens: tokens, view: target.view) else { return nil }
            return try statistics(child, options: options)
        }.sorted { Self.precedes($0, $1, sort: options.sort) }
    }
}
