import Foundation
import CryptoKit

public enum AuralCatalogError: Error, Equatable, Sendable {
    case invalid(String)
    case budget(String)
    case closed
    case staleTarget
}

public struct AuralLoopReduction: Equatable, Sendable {
    public let redundant: Bool
    public let start: Int
    public let length: Int

    public static func reduce(_ tokens: [String]) -> Self {
        let n = tokens.count
        guard n >= 3 else { return Self(redundant: false, start: 0, length: n) }
        var prefix = [Int](repeating: 0, count: n)
        for i in 1..<n {
            var j = prefix[i - 1]
            while j > 0 && tokens[i] != tokens[j] { j = prefix[j - 1] }
            if tokens[i] == tokens[j] { j += 1 }
            prefix[i] = j
        }
        let period = n - prefix[n - 1]
        guard n >= 2 * period, n > period + 1 else { return Self(redundant: false, start: 0, length: n) }
        var last: [[String]: Int] = [:]
        var left = 0, start = 0, length = 1
        for edge in 0..<(n - 1) {
            let key = [tokens[edge], tokens[edge + 1]]
            left = max(left, (last[key] ?? -1) + 1)
            last[key] = edge
            if edge - left + 2 > length { start = left; length = edge - left + 2 }
        }
        return Self(redundant: true, start: start, length: length)
    }

    public static func retainedChildren(_ tokens: [String]) -> [[String]] {
        guard tokens.count > 2 else { return [] }
        var queue = [0..<(tokens.count - 1), 1..<tokens.count]
        var visited = Set<Range<Int>>(), seen = Set<[String]>()
        var result: [[String]] = [], cursor = 0
        while cursor < queue.count {
            let span = queue[cursor]; cursor += 1
            guard span.count >= 2, visited.insert(span).inserted else { continue }
            let child = Array(tokens[span])
            if !reduce(child).redundant {
                if seen.insert(child).inserted { result.append(child) }
            } else {
                queue.append(span.lowerBound..<(span.upperBound - 1))
                queue.append((span.lowerBound + 1)..<span.upperBound)
            }
        }
        return result
    }
}

public struct AuralRankEligibility: Sendable {
    private let words: [UInt64]
    private let counts: [Int]
    public init(words: [UInt64]) {
        self.words = words
        var counts = [0]
        for word in words { counts.append(counts.last! + word.nonzeroBitCount) }
        self.counts = counts
    }
    public var isEmpty: Bool { counts.last == 0 }
    public func hasAny(start: Int, end: Int) -> Bool {
        guard start >= 0, start <= end, start / 64 < words.count else { return false }
        let first = start / 64, actualLast = end / 64
        let last = min(actualLast, words.count - 1)
        let firstMask = UInt64.max << (start % 64)
        let lastMask = last < actualLast ? UInt64.max : UInt64.max >> (63 - end % 64)
        if first == last { return words[first] & firstMask & lastMask != 0 }
        return words[first] & firstMask != 0 || words[last] & lastMask != 0 || counts[last] > counts[first + 1]
    }
}

public enum AuralIdentity {
    public static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    public static func pattern(tokens: [String], view: String) -> String {
        let multipliers: [UInt32] = [16777619, 2246822519, 3266489917, 668265263]
        var hashes = [UInt32](repeating: 0, count: 4)
        for token in tokens {
            let bytes = Array(SHA256.hash(data: Data(token.utf8)))
            for i in 0..<4 {
                let at = i * 4
                let word = UInt32(bytes[at]) | UInt32(bytes[at + 1]) << 8 | UInt32(bytes[at + 2]) << 16 | UInt32(bytes[at + 3]) << 24
                hashes[i] = (hashes[i] &* multipliers[i]) &+ word
            }
        }
        return "p_\(digest("aural-normalizer-1\u{0}" + view).prefix(12))_\(tokens.count)_" + hashes.map { String(format: "%08x", $0) }.joined()
    }
}
