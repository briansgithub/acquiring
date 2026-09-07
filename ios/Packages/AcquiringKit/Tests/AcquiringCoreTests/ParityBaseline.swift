import XCTest

/// Reads `contracts/fixtures/parity_baseline.json` — the ratchet that lets the
/// chord-parity corpora report a real number instead of being all-or-nothing.
/// A channel fails when it diverges from the web reference *more* than the
/// baseline allows, and nags to be lowered when it diverges less.
enum ParityBaseline {
    static func repositoryRoot(from filePath: String = #filePath) -> URL {
        URL(fileURLWithPath: filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    static func limits(corpus: String) throws -> [String: Int] {
        let url = repositoryRoot().appending(path: "contracts/fixtures/parity_baseline.json")
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let section = root?[corpus] as? [String: Any] ?? [:]
        return section.compactMapValues { $0 as? Int }
    }

    static func assertWithinBaseline(
        corpus: String,
        counts: [String: Int],
        total: Int,
        samples: [String],
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws {
        let limits = try limits(corpus: corpus)
        var regressions: [String] = []
        var improvements: [String] = []

        print("=== \(corpus): iOS vs web reference over \(total) cases ===")
        for channel in ["roman", "letter", "pcs", "midi", "rootMidi", "toneLabels"] {
            let actual = counts[channel] ?? 0
            let allowed = limits[channel] ?? 0
            let matching = total - actual
            print(String(
                format: "  %-11@ %6d/%6d (%5.1f%%) diverging %5d, baseline %5d",
                channel as NSString, matching, total,
                Double(matching) * 100 / Double(total), actual, allowed
            ))
            if actual > allowed {
                regressions.append("\(channel): \(actual) diverging, baseline allows \(allowed)")
            } else if actual < allowed {
                improvements.append("\(channel): \(actual) < \(allowed)")
            }
        }

        if !improvements.isEmpty {
            print("""
                Parity improved — lower these in contracts/fixtures/parity_baseline.json \
                under "\(corpus)": \(improvements.joined(separator: ", "))
                """)
        }
        XCTAssertTrue(
            regressions.isEmpty,
            "\(corpus) parity regressed:\n" + regressions.joined(separator: "\n")
                + "\n\nFirst 25 diverging cases:\n" + samples.prefix(25).joined(separator: "\n"),
            file: file, line: line
        )
    }
}
