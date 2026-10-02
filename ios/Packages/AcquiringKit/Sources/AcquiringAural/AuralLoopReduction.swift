import Foundation

public struct AuralLoopReduction: Equatable, Sendable {
    public static let version = "unique-transitions-1"
    public let redundant: Bool
    public let start: Int
    public let length: Int

    public static func analyze(_ tokens: [String]) -> Self {
        let n = tokens.count
        guard n >= 3 else { return Self(redundant: false, start: 0, length: n) }
        var prefix = Array(repeating: 0, count: n)
        for i in 1..<n {
            var j = prefix[i - 1]
            while j > 0 && tokens[i] != tokens[j] { j = prefix[j - 1] }
            if tokens[i] == tokens[j] { j += 1 }
            prefix[i] = j
        }
        let period = n - prefix[n - 1]
        guard n >= 2 * period, n > period + 1 else { return Self(redundant: false, start: 0, length: n) }
        var last: [[String]: Int] = [:]
        var left = 0, bestStart = 0, bestLength = 1
        for edge in 0..<(n - 1) {
            let key = [tokens[edge], tokens[edge + 1]]
            left = max(left, (last[key] ?? -1) + 1)
            last[key] = edge
            let length = edge - left + 2
            if length > bestLength { bestStart = left; bestLength = length }
        }
        return Self(redundant: true, start: bestStart, length: bestLength)
    }

    public static func retainedChildren(_ tokens: [String]) -> [[String]] {
        guard tokens.count > 2 else { return [] }
        var queue = [0..<(tokens.count - 1), 1..<tokens.count]
        var visited: Set<Range<Int>> = []
        var seen: Set<[String]> = []
        var result: [[String]] = []
        var cursor = 0
        while cursor < queue.count {
            let span = queue[cursor]
            cursor += 1
            guard span.count >= 2, visited.insert(span).inserted else { continue }
            let child = Array(tokens[span])
            if !analyze(child).redundant {
                if seen.insert(child).inserted { result.append(child) }
            } else {
                queue.append(span.lowerBound..<(span.upperBound - 1))
                queue.append((span.lowerBound + 1)..<span.upperBound)
            }
        }
        return result
    }
}
