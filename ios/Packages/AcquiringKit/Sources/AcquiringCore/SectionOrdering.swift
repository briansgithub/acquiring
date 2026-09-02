import Foundation

public enum SectionOrdering {
    private static let unknownRank = 100_000

    public static func ordered(_ sections: [String: ExtractedSection]) -> [(key: String, section: ExtractedSection)] {
        struct Candidate {
            let key: String
            let section: ExtractedSection
            let sourcePosition: Int
            let explicitIndex: Int?
            let canonicalRank: Int
        }

        var byType: [String: Candidate] = [:]
        var typeOrder: [String] = []
        for (sourcePosition, pair) in sections.enumerated() {
            let normalized = sectionTypeKey(pair.value.safeSectionName)
            let typeKey = normalized.isEmpty ? "\0\(sourcePosition)" : normalized
            let candidate = Candidate(
                key: pair.key,
                section: pair.value,
                sourcePosition: sourcePosition,
                explicitIndex: pair.value.sectionIndex.flatMap { $0 >= 0 ? $0 : nil },
                canonicalRank: canonicalRank(pair.value.safeSectionName)
            )
            if byType[typeKey] == nil { typeOrder.append(typeKey) }
            if let current = byType[typeKey] {
                if let index = candidate.explicitIndex,
                   current.explicitIndex == nil || index < current.explicitIndex! {
                    byType[typeKey] = candidate
                }
            } else {
                byType[typeKey] = candidate
            }
        }

        let candidates = typeOrder.compactMap { byType[$0] }
        let hasExplicitOrder = candidates.contains { $0.explicitIndex != nil }
        return candidates.sorted { lhs, rhs in
            if hasExplicitOrder {
                switch (lhs.explicitIndex, rhs.explicitIndex) {
                case let (.some(a), .some(b)) where a != b: return a < b
                case (.some, .none): return true
                case (.none, .some): return false
                default: break
                }
            }
            if lhs.canonicalRank != rhs.canonicalRank { return lhs.canonicalRank < rhs.canonicalRank }
            return lhs.sourcePosition < rhs.sourcePosition
        }.map { ($0.key, $0.section) }
    }

    public static func sectionTypeKey(_ name: String?) -> String {
        normalize(name)
            .replacingOccurrences(of: "[-_\\s]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    public static func canonicalRank(_ name: String?) -> Int {
        let words = sectionTypeKey(name)
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        guard !words.isEmpty else { return unknownRank }
        let ordinal = trailingOrdinal(words)

        if words.contains("intro and verse") { return 1_000 + ordinal }
        if words.contains("verse and pre chorus") { return 3_000 + ordinal }
        if words.contains("pre chorus and chorus") { return 5_000 + ordinal }
        if words.contains("chorus lead out") { return 7_000 + ordinal }
        if words.contains("bridge and outro") { return 11_500 + ordinal }
        if words.contains("pre outro") { return 11_000 + ordinal }
        if containsWord("intro", in: words) { return ordinal }
        if containsWord("verse", in: words) { return 2_000 + ordinal }
        if words.range(of: "\\bpre chorus\\b", options: .regularExpression) != nil { return 4_000 + ordinal }
        if containsWord("chorus", in: words) { return 6_000 + ordinal }
        if containsWord("bridge", in: words) { return 8_000 + ordinal }
        if containsWord("solo", in: words) { return 9_000 + ordinal }
        if containsWord("instrumental", in: words) { return 10_000 + ordinal }
        if containsWord("outro", in: words) { return 12_000 + ordinal }
        return unknownRank
    }

    private static func normalize(_ name: String?) -> String {
        name.orEmpty
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "[\\u{2010}-\\u{2014}]", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    }

    private static func trailingOrdinal(_ words: String) -> Int {
        guard let range = words.range(of: "\\b(\\d+)$", options: .regularExpression) else { return 0 }
        return min(Int(words[range].split(separator: " ").last ?? "0") ?? 0, 999)
    }

    private static func containsWord(_ word: String, in words: String) -> Bool {
        words.range(of: "\\b\(word)\\b", options: .regularExpression) != nil
    }
}

private extension Optional where Wrapped == String {
    var orEmpty: String { self ?? "" }
}
