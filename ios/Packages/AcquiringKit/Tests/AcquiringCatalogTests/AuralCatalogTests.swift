import XCTest
import GRDB
@testable import AcquiringCatalog

final class AuralCatalogTests: XCTestCase, @unchecked Sendable {
    private func fixtures(_ version: Int) -> URL {
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("contracts").path), root.path != "/" { root.deleteLastPathComponent() }
        return root.appendingPathComponent("contracts/aural-corpus/ios-b07/v\(version)")
    }
    private func unpack(_ version: Int) throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for name in ["aural-catalog.db", "aural-evidence.db", "aural-popularity.db"] {
            try AuralBinary.inflate(Data(contentsOf: fixtures(version).appendingPathComponent(name + ".gz"))).write(to: directory.appendingPathComponent(name))
        }
        return directory
    }
    func testSchemaKeysPhysicalIdentityAndFilteredRanks() async throws {
        for version in 1...3 {
            let directory = try unpack(version)
            defer { try? FileManager.default.removeItem(at: directory) }
            let reader = try AuralCatalog(directory: directory)
            XCTAssertEqual(reader.capabilities.schemaVersion, version)
            let run = try await reader.run(0)
            XCTAssertEqual(run.key.tonic, "C")
            XCTAssertEqual(run.sourceKey.tonic, version == 1 ? "C" : "D")
            let target = try await reader.lookup(tokens: ["I", "V"], view: "harmony")
            let resolved = try XCTUnwrap(target)
            let stats = try await reader.statistics(resolved)
            XCTAssertEqual(stats?.occurrences, 2)
            XCTAssertEqual(stats?.songs, 1)
            XCTAssertEqual(stats?.effective, 2)
            let occurrences = try await reader.occurrences(resolved, limit: 1)
            XCTAssertEqual(occurrences.items.count, 1)
            let item = try XCTUnwrap(occurrences.items.first)
            XCTAssertEqual(item.id, AuralIdentity.digest(resolved.id + "|" + item.sourceIdentity))
            let next = try await reader.occurrences(resolved, afterRank: occurrences.nextRank, limit: 1)
            XCTAssertNotEqual(next.items.first?.id, item.id)
            var options = AuralRankingOptions(); options.minimumPopularityPercent = 80
            let vi = try await reader.lookup(tokens: ["V", "I"], view: "harmony")
            let filtered = try await reader.statistics(XCTUnwrap(vi), options: options)
            XCTAssertEqual(filtered?.songs, 1)
            XCTAssertEqual(filtered?.globalSongs, 2)
            XCTAssertEqual(filtered?.occurrences, 2)
            XCTAssertEqual(filtered?.globalOccurrences, 3)
            options.query = try AuralProgressionQuery(chords: [AuralChordConstraint(degree: 5), AuralChordConstraint(degree: 1)])
            let page = try await reader.ranking(options: options, limit: 1)
            XCTAssertEqual(page.rows.count, 1)
            if let continuation = page.continuation {
                let second = try await reader.ranking(after: continuation, limit: 1)
                XCTAssertNotEqual(page.rows.first?.target.id, second.rows.first?.target.id)
            }
            try await reader.close()
            do { _ = try await reader.run(0); XCTFail("closed reader accepted work") } catch AuralCatalogError.closed {} 
        }
    }
    func testLeaseDrainCancellationAndRetry() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try AuralCatalogStore(directory: root)
        let fixture = fixtures(3)
        let manifest = try JSONDecoder().decode(AuralBundleManifest.self, from: Data(contentsOf: fixture.appendingPathComponent("manifest.json")))
        let fetch: AuralCatalogStore.Fetch = { url in
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.copyItem(at: fixture.appendingPathComponent(url.lastPathComponent), to: copy)
            return copy
        }
        try await store.install(manifest, fetch: fetch)
        let entered = AuralTestGate(), release = AuralTestGate()
        let lease = Task {
            try await store.withCatalog { reader in
                await entered.open()
                await release.wait()
                return try await reader.run(0).sourceKey.tonic
            }
        }
        await entered.wait()
        let oldPointer = try Data(contentsOf: root.appendingPathComponent("current.json"))
        let replacement = Task { try await store.install(manifest, fetch: fetch) }
        await store.waitForActivation()
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("current.json")), oldPointer)
        do { _ = try await store.withCatalog { $0.snapshotId }; XCTFail("acquired while draining") } catch AuralCatalogStore.StateError.busy {}
        replacement.cancel()
        do { try await replacement.value; XCTFail("cancelled replacement published") } catch is CancellationError {}
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("current.json")), oldPointer)
        let stillReady = try await store.withCatalog { $0.snapshotId }
        XCTAssertEqual(stillReady, "b07-v3")
        await release.open()
        let source = try await lease.value
        XCTAssertEqual(source, "D")
        try await store.install(manifest, fetch: fetch)
        XCTAssertNotEqual(try Data(contentsOf: root.appendingPathComponent("current.json")), oldPointer)
    }

    func testBinaryCorruptionAndMixedBundle() throws {
        XCTAssertThrowsError(try AuralBinary.integers(Data([1,2,3])))
        XCTAssertThrowsError(try AuralBinary.integers(Data([255,255,255,255])))
        XCTAssertEqual(try AuralBinary.integers(Data([4,3,2,1])), [0x01020304])
        let gzip = try Data(contentsOf: fixtures(3).appendingPathComponent("aural-catalog.db.gz"))
        XCTAssertThrowsError(try AuralBinary.inflate(gzip.dropLast(4)))
        XCTAssertThrowsError(try AuralBinary.inflate(gzip, limit: 64))
        let directory = try unpack(3)
        defer { try? FileManager.default.removeItem(at: directory) }
        try AuralCatalogStore.validate(directory: directory, snapshot: "b07-v3", schema: 3)
        let db = try DatabaseQueue(path: directory.appendingPathComponent("aural-evidence.db").path)
        try db.write { try $0.execute(sql: "UPDATE metadata SET value='mixed'") }
        try db.close()
        XCTAssertThrowsError(try AuralCatalogStore.validate(directory: directory, snapshot: "b07-v3", schema: 3))
    }
    func testRealInstallFailureReopenAndDowngrade() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try AuralCatalogStore(directory: root)
        let fixture = fixtures(3)
        let manifest = try JSONDecoder().decode(AuralBundleManifest.self, from: Data(contentsOf: fixture.appendingPathComponent("manifest.json")))
        let fetch: AuralCatalogStore.Fetch = { url in
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.copyItem(at: fixture.appendingPathComponent(url.lastPathComponent), to: copy)
            return copy
        }
        try await store.install(manifest, fetch: fetch)
        let snapshot = try await store.withCatalog { $0.snapshotId }
        XCTAssertEqual(snapshot, "b07-v3")
        do {
            try await store.install(manifest, fetch: { _ in throw AuralCatalogError.invalid("network failure") })
            XCTFail("fetch failure accepted")
        } catch {}
        let retained = try await store.withCatalog { $0.snapshotId }
        XCTAssertEqual(retained, snapshot)
        let reopened = try AuralCatalogStore(directory: root)
        let restored = try await reopened.withCatalog { $0.snapshotId }
        XCTAssertEqual(restored, snapshot)
        let old = try JSONDecoder().decode(AuralBundleManifest.self, from: Data(contentsOf: fixtures(1).appendingPathComponent("manifest.json")))
        do { try await store.install(old, fetch: fetch); XCTFail("downgrade accepted") } catch AuralCatalogStore.StateError.downgrade {}
    }
}

private actor AuralTestGate {
    private var opened = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    func wait() async {
        if opened { return }
        await withCheckedContinuation { waiters.append($0) }
    }
    func open() {
        opened = true
        let pending = waiters; waiters.removeAll()
        for waiter in pending { waiter.resume() }
    }
}
