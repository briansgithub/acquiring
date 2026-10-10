import Foundation

/// Shared input location for native parity tests. No mismatch allowance is applied.
/// The environment override lets sibling worktrees validate the integration contract.
enum ChordContractFixtures {
    static func url(_ name: String, from filePath: String = #filePath) -> URL {
        if let directory = ProcessInfo.processInfo.environment["PARITY_FIXTURES_DIR"], !directory.isEmpty {
            return URL(fileURLWithPath: directory).appendingPathComponent(name)
        }
        var root = URL(fileURLWithPath: filePath)
        for _ in 0..<6 { root.deleteLastPathComponent() }
        return root.appendingPathComponent("contracts/fixtures").appendingPathComponent(name)
    }
}
