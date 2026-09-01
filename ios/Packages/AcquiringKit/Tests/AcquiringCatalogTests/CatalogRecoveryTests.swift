import Foundation
import XCTest
@testable import AcquiringCatalog
import GRDB

// MARK: - Fault injection

private enum TestFault: Error {
    case move
    case poolOpen
}

/// Wraps the real file system and fails the one move a test cares about.
private struct FaultyFileSystem: CatalogFileSystem {
    let failMove: @Sendable (URL, URL) -> Bool

    private var base: LiveCatalogFileSystem { LiveCatalogFileSystem() }

    func fileExists(at url: URL) -> Bool { base.fileExists(at: url) }

    func createDirectory(at url: URL) throws { try base.createDirectory(at: url) }

    func moveItem(at source: URL, to destination: URL) throws {
        if failMove(source, destination) { throw TestFault.move }
        try base.moveItem(at: source, to: destination)
    }

    func removeItem(at url: URL) throws { try base.removeItem(at: url) }

    func contentsOfDirectory(at url: URL) -> [URL] { base.contentsOfDirectory(at: url) }
}

/// A pool opener that can be armed to fail a bounded number of opens, and that
/// records whether the backup was still on disk at the moment of each open.
/// That recording is what proves ordering: a backup deleted before the reopen
/// is a backup that cannot rescue a failed reopen.
private final class ScriptedPoolOpener: @unchecked Sendable {
    private let lock = NSLock()
    private var failuresRemaining = 0
    private var observations: [Bool] = []
    private let backupURL: URL

    init(backupURL: URL) { self.backupURL = backupURL }

    func arm(failures: Int) {
        lock.lock()
        failuresRemaining = failures
        lock.unlock()
    }

    var backupPresentAtEachOpen: [Bool] {
        lock.lock()
        defer { lock.unlock() }
        return observations
    }

    var openCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return observations.count
    }

    var opener: CatalogPoolOpener {
        { [self] url in
            lock.lock()
            observations.append(FileManager.default.fileExists(atPath: backupURL.path))
            let shouldFail = failuresRemaining > 0
            if shouldFail { failuresRemaining -= 1 }
            lock.unlock()
            if shouldFail { throw TestFault.poolOpen }
            return try CatalogCoordinator.openPool(at: url)
        }
    }
}

// MARK: - Offline URL stub

/// Opened by the test to release a parked fetch. Lets cancellation land at a
/// known point instead of racing the download.
private final class Gate: @unchecked Sendable {
    private let lock = NSLock()
    private var opened = false
    private var entered = false

    func open() {
        lock.lock()
        opened = true
        lock.unlock()
    }

    func markEntered() {
        lock.lock()
        entered = true
        lock.unlock()
    }

    var isOpen: Bool {
        lock.lock()
        defer { lock.unlock() }
        return opened
    }

    var wasEntered: Bool {
        lock.lock()
        defer { lock.unlock() }
        return entered
    }
}

/// Serves a local file as though it had been downloaded. Avoids URLSession
/// entirely, so the install pipeline is exercised on every platform and the
/// timing of cancellation is controlled by the test rather than the network.
private func fileArchiveFetch(payloadURL: URL, gate: Gate? = nil) -> CatalogArchiveFetch {
    { url in
        if let gate {
            gate.markEntered()
            // Task.sleep throws on cancellation, so a parked fetch is exactly
            // where a cancelled operation stops.
            while !gate.isOpen {
                try await Task.sleep(nanoseconds: 2_000_000)
            }
        }
        let destination = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString + ".archive")
        try FileManager.default.copyItem(at: payloadURL, to: destination)
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!
        return (destination, response)
    }
}

private func stagingArtifacts(in directory: URL) -> Set<String> {
    let entries = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
    return Set(entries.filter(CatalogArtifacts.isStagingArtifact).map(\.lastPathComponent))
}

private final class OperationLog: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String] = []

    func append(_ entry: String) {
        lock.lock()
        storage.append(entry)
        lock.unlock()
    }

    func reset() {
        lock.lock()
        storage.removeAll()
        lock.unlock()
    }

    var entries: [String] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }
}

/// Records the requested operation before performing it, so a test can assert
/// the order the swap performs them in.
private struct RecordingFileSystem: CatalogFileSystem {
    let log: OperationLog

    private var base: LiveCatalogFileSystem { LiveCatalogFileSystem() }

    func fileExists(at url: URL) -> Bool { base.fileExists(at: url) }

    func createDirectory(at url: URL) throws { try base.createDirectory(at: url) }

    func moveItem(at source: URL, to destination: URL) throws {
        log.append("move:" + source.path + "->" + destination.path)
        try base.moveItem(at: source, to: destination)
    }

    func removeItem(at url: URL) throws {
        log.append("remove:" + url.path)
        try base.removeItem(at: url)
    }

    func contentsOfDirectory(at url: URL) -> [URL] { base.contentsOfDirectory(at: url) }
}

/// Free function rather than a method: the corruption table stores these
/// closures, and capturing an XCTestCase in them would drag a non-Sendable
/// value across the awaits in that loop.
private func withQueue(at url: URL, _ body: (Database) throws -> Void) throws {
    let queue = try DatabaseQueue(path: url.path)
    try queue.write(body)
}

// MARK: - Tests

final class CatalogRecoveryTests: XCTestCase {

    // MARK: prepare()

    func testOrphanedBackupIsRestoredInsteadOfCreatingAnEmptyCatalog() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let live = directory.appending(path: "catalog.db")
        let backup = directory.appending(path: "catalog.db.backup")

        // A swap that died after moving live aside but before installing.
        try seedCatalog(at: backup, slugs: ["surviving-song", "second-song"])
        XCTAssertFalse(FileManager.default.fileExists(atPath: live.path))

        let coordinator = makeCoordinator(directory: directory)
        try await coordinator.prepare()

        let count = try await coordinator.songCount()
        XCTAssertEqual(count, 2, "the orphaned backup must be restored, not replaced by an empty catalog")
        let song = try await coordinator.song(id: "surviving-song")
        XCTAssertNotNil(song)
        XCTAssertFalse(FileManager.default.fileExists(atPath: backup.path), "backup is consumed by the restore")
        XCTAssertTrue(FileManager.default.fileExists(atPath: live.path))
    }

    func testValidLiveCatalogWinsOverStaleBackupAndBackupIsRemovedOnlyAfterOpen() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let live = directory.appending(path: "catalog.db")
        let backup = directory.appending(path: "catalog.db.backup")

        try seedCatalog(at: live, slugs: ["live-a", "live-b", "live-c"])
        try seedCatalog(at: backup, slugs: ["stale-song"])

        let opener = ScriptedPoolOpener(backupURL: backup)
        let coordinator = makeCoordinator(directory: directory, poolOpener: opener.opener)
        try await coordinator.prepare()

        let count = try await coordinator.songCount()
        XCTAssertEqual(count, 3, "the live catalog stays authoritative")
        let present0 = try await coordinator.song(id: "live-a")
        XCTAssertNotNil(present0)
        let absent1 = try await coordinator.song(id: "stale-song")
        XCTAssertNil(absent1)
        XCTAssertEqual(
            opener.backupPresentAtEachOpen,
            [true],
            "the backup must still exist while live is being opened"
        )
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: backup.path),
            "and must be removed once that open has succeeded"
        )
    }

    func testUnopenableLiveFallsBackToRestorableBackup() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let live = directory.appending(path: "catalog.db")
        let backup = directory.appending(path: "catalog.db.backup")

        try seedCatalog(at: live, slugs: ["doomed-song"])
        try seedCatalog(at: backup, slugs: ["rescued-song", "rescued-second"])

        let opener = ScriptedPoolOpener(backupURL: backup)
        opener.arm(failures: 1)
        let coordinator = makeCoordinator(directory: directory, poolOpener: opener.opener)
        try await coordinator.prepare()

        let installedCount2 = try await coordinator.songCount()
        XCTAssertEqual(installedCount2, 2)
        let present3 = try await coordinator.song(id: "rescued-song")
        XCTAssertNotNil(present3)
        XCTAssertEqual(opener.openCount, 2, "one failed open, then one on the restored backup")
    }

    func testPrepareRemovesStaleStagingArtifacts() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let legacyStaged = directory.appending(path: "catalog.db.installing")
        let uniqueStaged = CatalogArtifacts.stagedURL(
            in: directory,
            filename: "catalog.db",
            operationID: "abandoned-run"
        )
        let uniqueArchive = CatalogArtifacts.archiveURL(
            in: directory,
            filename: "catalog.db.gz",
            operationID: "abandoned-run"
        )

        try seedCatalog(at: directory.appending(path: "catalog.db"), slugs: ["kept"])
        // A leftover from an older build plus one from an operation-unique run.
        try seedCatalog(at: legacyStaged, slugs: ["abandoned"])
        try seedCatalog(at: uniqueStaged, slugs: ["abandoned"])
        for suffix in CatalogArtifacts.sidecarSuffixes {
            try Data("stale".utf8).write(to: URL(fileURLWithPath: uniqueStaged.path + suffix))
        }
        try Data("partial download".utf8).write(to: uniqueArchive)

        let coordinator = makeCoordinator(directory: directory)
        try await coordinator.prepare()

        XCTAssertEqual(stagingArtifacts(in: directory), [], "prepare() sweeps every staging leftover")
        XCTAssertFalse(FileManager.default.fileExists(atPath: legacyStaged.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: uniqueStaged.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: uniqueArchive.path))
        let installedCount4 = try await coordinator.songCount()
        XCTAssertEqual(installedCount4, 1)

        // Idempotent: a second prepare on an already-clean directory is a no-op.
        try await coordinator.prepare()
        let installedCount5 = try await coordinator.songCount()
        XCTAssertEqual(installedCount5, 1)
    }

    // MARK: replacement failure paths

    func testStagedMoveFailureRestoresAndReopensOldCatalog() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let live = directory.appending(path: "catalog.db")
        let staged = directory.appending(path: "catalog.db.installing")

        try seedCatalog(at: live, slugs: ["original-a", "original-b"])

        let stagedPath = staged.path
        let fileSystem = FaultyFileSystem { source, _ in source.path == stagedPath }
        let coordinator = makeCoordinator(directory: directory, fileSystem: fileSystem)
        try await coordinator.prepare()
        // Staged after prepare(): prepare() sweeps stale .installing files.
        try seedCatalog(at: staged, slugs: ["replacement-a", "replacement-b", "replacement-c"])

        await assertThrowsAsync(try await coordinator.replaceLiveDatabase(with: staged))

        try await assertCatalogIntact(coordinator, expectedCount: 2, knownSlug: "original-a")
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: directory.appending(path: "catalog.db.backup").path),
            "a restored catalog leaves no backup behind"
        )
    }

    func testBackupMoveFailureLeavesTheLiveCatalogUntouched() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let live = directory.appending(path: "catalog.db")
        let backup = directory.appending(path: "catalog.db.backup")
        let staged = directory.appending(path: "catalog.db.installing")

        try seedCatalog(at: live, slugs: ["original-a", "original-b"])

        // Fail the swap's very first move: retiring the old catalog.
        let backupPath = backup.path
        let fileSystem = FaultyFileSystem { _, destination in destination.path == backupPath }
        let coordinator = makeCoordinator(directory: directory, fileSystem: fileSystem)
        try await coordinator.prepare()
        try seedCatalog(at: staged, slugs: ["replacement-a"])

        await assertThrowsAsync(try await coordinator.replaceLiveDatabase(with: staged))

        // The live catalog was never moved, so it must still be exactly where
        // it was rather than deleted on the way out.
        try await assertCatalogIntact(coordinator, expectedCount: 2, knownSlug: "original-a")
        XCTAssertTrue(FileManager.default.fileExists(atPath: live.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: backup.path))
    }

    func testNewPoolOpenFailureRestoresAndReopensOldCatalog() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let live = directory.appending(path: "catalog.db")
        let backup = directory.appending(path: "catalog.db.backup")
        let staged = directory.appending(path: "catalog.db.installing")

        try seedCatalog(at: live, slugs: ["original-a", "original-b"])

        let opener = ScriptedPoolOpener(backupURL: backup)
        let coordinator = makeCoordinator(directory: directory, poolOpener: opener.opener)
        try await coordinator.prepare()
        try seedCatalog(at: staged, slugs: ["replacement-a"])

        // Fail only the reopen that follows the swap; the restore reopen works.
        opener.arm(failures: 1)
        await assertThrowsAsync(try await coordinator.replaceLiveDatabase(with: staged))

        try await assertCatalogIntact(coordinator, expectedCount: 2, knownSlug: "original-a")
        XCTAssertEqual(opener.openCount, 3, "prepare, the failed post-swap open, then the restore")
        XCTAssertTrue(
            opener.backupPresentAtEachOpen[1],
            "the backup must still exist when the new pool is opened, or the failure is unrecoverable"
        )
        XCTAssertFalse(FileManager.default.fileExists(atPath: backup.path))
    }

    func testMissingStagedPayloadNeverReplacesLive() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try seedCatalog(at: directory.appending(path: "catalog.db"), slugs: ["original-a", "original-b"])

        let coordinator = makeCoordinator(directory: directory)
        try await coordinator.prepare()

        let absent = directory.appending(path: "catalog.db.installing")
        await assertThrowsAsync(try await coordinator.replaceLiveDatabase(with: absent))
        try await assertCatalogIntact(coordinator, expectedCount: 2, knownSlug: "original-a")
    }

    func testSuccessfulReplacementRetiresOldSidecarsBeforeMovingTheDatabaseAside() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let live = directory.appending(path: "catalog.db")
        let backup = directory.appending(path: "catalog.db.backup")
        let staged = directory.appending(path: "catalog.db.installing")

        let log = OperationLog()
        let coordinator = makeCoordinator(directory: directory, fileSystem: RecordingFileSystem(log: log))
        try seedCatalog(at: live, slugs: ["original-a"])
        try await coordinator.prepare()
        try seedCatalog(at: staged, slugs: ["replacement-a", "replacement-b"])

        log.reset()
        try await coordinator.replaceLiveDatabase(with: staged)

        let installedCount6 = try await coordinator.songCount()
        XCTAssertEqual(installedCount6, 2)
        let present7 = try await coordinator.song(id: "replacement-a")
        XCTAssertNotNil(present7)
        let absent8 = try await coordinator.song(id: "original-a")
        XCTAssertNil(absent8)
        XCTAssertFalse(FileManager.default.fileExists(atPath: backup.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: staged.path))

        // Sidecars belong to the outgoing database, so they must be retired
        // before it is moved aside, never left to be read as the new one's.
        let entries = log.entries
        let walRemoval = entries.firstIndex(of: "remove:" + live.path + "-wal")
        let asideMove = entries.firstIndex(of: "move:" + live.path + "->" + backup.path)
        XCTAssertNotNil(walRemoval, "expected the outgoing -wal to be removed, log was \(entries)")
        XCTAssertNotNil(asideMove, "expected live to be moved aside, log was \(entries)")
        if let walRemoval, let asideMove {
            XCTAssertLessThan(walRemoval, asideMove)
        }
    }

    // MARK: candidate repair and rejection

    func testVersionTwoCandidateReceivesSchemaThreeBrowseRepair() throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let candidate = directory.appending(path: "v2.db")

        try withQueue(at: candidate) { db in
            try db.execute(sql: """
                PRAGMA user_version = 2;
                CREATE TABLE songs (slug TEXT NOT NULL PRIMARY KEY, artist TEXT, title TEXT, url TEXT NOT NULL, status TEXT NOT NULL, dataBlob BLOB);
                CREATE TABLE song_browse_entries (slug TEXT NOT NULL PRIMARY KEY, artist TEXT, title TEXT, alphaGroup TEXT NOT NULL, complexityRating REAL, complexityBucket INTEGER);
                INSERT INTO songs VALUES ('numeric-song', 'Artist', '7 Nation Army', 'https://example.com/n', 'ready', X'7B7D');
                INSERT INTO songs VALUES ('symbol-song', 'Artist', '! Anthem', 'https://example.com/s', 'ready', X'7B7D');
                INSERT INTO song_browse_entries VALUES ('numeric-song', 'Artist', '7 Nation Army', '#', 12.0, 1);
                INSERT INTO song_browse_entries VALUES ('symbol-song', 'Artist', '! Anthem', '#', 22.0, 2);
                """)
        }

        try CatalogCandidate.prepare(at: candidate)

        // The same outcome Android's v2 -> v3 migration produces: numerals leave
        // the symbol group, true symbols stay in it.
        try withQueue(at: candidate) { db in
            XCTAssertEqual(try Int.fetchOne(db, sql: "PRAGMA user_version"), 3)
            XCTAssertEqual(
                try String.fetchOne(db, sql: "SELECT alphaGroup FROM song_browse_entries WHERE slug = 'numeric-song'"),
                "7"
            )
            XCTAssertEqual(
                try String.fetchOne(db, sql: "SELECT alphaGroup FROM song_browse_entries WHERE slug = 'symbol-song'"),
                "#"
            )
            // The repair must not disturb metadata an export already carried.
            XCTAssertEqual(
                try Int.fetchOne(db, sql: "SELECT complexityBucket FROM song_browse_entries WHERE slug = 'numeric-song'"),
                1
            )
        }

        let result = try CatalogCandidate.validate(at: candidate, contract: miniatureContract(minimumRows: 2))
        XCTAssertEqual(result.browseCount, 2)
        XCTAssertEqual(result.payloadCount, 2)
    }

    func testInvalidCandidatesNeverReplaceLive() async throws {
        let contract = miniatureContract(minimumRows: 2)

        let corruptions: [(name: String, apply: (URL) throws -> Void)] = [
            ("missing required index", { url in
                try withQueue(at: url) { db in
                    try db.execute(sql: "DROP INDEX index_song_browse_entries_alphaGroup")
                }
            }),
            ("missing required column", { url in
                try withQueue(at: url) { db in
                    try db.execute(sql: "ALTER TABLE song_browse_entries DROP COLUMN complexityRating")
                }
            }),
            ("browse row without a chord payload", { url in
                try withQueue(at: url) { db in
                    try db.execute(sql: "UPDATE songs SET dataBlob = NULL WHERE slug = 'candidate-b'")
                }
            }),
            ("below the contract row floor", { url in
                try withQueue(at: url) { db in
                    try db.execute(sql: "DELETE FROM songs WHERE slug = 'candidate-b'")
                    try db.execute(sql: "DELETE FROM song_browse_entries WHERE slug = 'candidate-b'")
                }
            }),
            ("wrong schema version", { url in
                try withQueue(at: url) { db in
                    try db.execute(sql: "PRAGMA user_version = 9")
                }
            }),
            ("not a database at all", { url in
                try Data(repeating: 0xFF, count: 8_192).write(to: url)
            })
        ]

        for corruption in corruptions {
            let directory = try makeDirectory()
            defer { try? FileManager.default.removeItem(at: directory) }
            let staged = directory.appending(path: "catalog.db.installing")

            try seedCatalog(at: directory.appending(path: "catalog.db"), slugs: ["original-a", "original-b"])

            let coordinator = makeCoordinator(directory: directory)
            try await coordinator.prepare()
            try seedCatalog(at: staged, slugs: ["candidate-a", "candidate-b"])
            try corruption.apply(staged)

            XCTAssertThrowsError(
                try CatalogCandidate.validate(at: staged, contract: contract),
                "\(corruption.name) must be rejected"
            )
            // Rejection happens before the commit boundary, so the live pool was
            // never closed and the old catalog is still serving.
            try await assertCatalogIntact(
                coordinator,
                expectedCount: 2,
                knownSlug: "original-a",
                message: corruption.name
            )
        }
    }

    // MARK: full install pipeline

    func testInstallPipelineValidatesBeforeClosingTheLivePool() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try seedCatalog(at: directory.appending(path: "catalog.db"), slugs: ["original-a", "original-b"])

        let payloadDirectory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: payloadDirectory) }
        let payloadURL = payloadDirectory.appending(path: "payload.db")
        try seedCatalog(at: payloadURL, slugs: ["installed-a", "installed-b", "installed-c"])

        let configuration = makeConfiguration(directory: directory)
        let coordinator = CatalogCoordinator(configuration: configuration)
        try await coordinator.prepare()

        let service = DefaultCatalogMaintenanceService(
            coordinator: coordinator,
            configuration: configuration,
            fetchArchive: fileArchiveFetch(payloadURL: payloadURL)
        )

        var progress: [CatalogProgress] = []
        for try await value in service.downloadAndInstall() { progress.append(value) }

        let installedCount = try await coordinator.songCount()
        XCTAssertEqual(installedCount, 3)
        let installed = try await coordinator.song(id: "installed-a")
        XCTAssertNotNil(installed)
        XCTAssertTrue(progress.contains(.validating))
        XCTAssertTrue(progress.contains(.installing))
        let validatingIndex = progress.firstIndex(of: .validating) ?? Int.max
        let installingIndex = progress.firstIndex(of: .installing) ?? Int.min
        XCTAssertLessThan(
            validatingIndex,
            installingIndex,
            "validation must complete before the live pool is closed for installation"
        )
        assertNoStagingArtifacts(in: directory)
    }

    func testCancelledInstallLeavesLiveQueryableAndCleansArtifacts() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try seedCatalog(at: directory.appending(path: "catalog.db"), slugs: ["original-a", "original-b"])

        let payloadDirectory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: payloadDirectory) }
        let payloadURL = payloadDirectory.appending(path: "payload.db")
        try seedCatalog(at: payloadURL, slugs: ["never-installed"])

        let configuration = makeConfiguration(directory: directory)
        let coordinator = CatalogCoordinator(configuration: configuration)
        try await coordinator.prepare()

        // Park the fetch so cancellation lands before the commit boundary on
        // every run, rather than racing it.
        let gate = Gate()
        let service = DefaultCatalogMaintenanceService(
            coordinator: coordinator,
            configuration: configuration,
            fetchArchive: fileArchiveFetch(payloadURL: payloadURL, gate: gate)
        )

        let installation = Task {
            for try await _ in service.downloadAndInstall() {}
        }
        try await waitUntil(description: "the install has reached its fetch") { gate.wasEntered }
        installation.cancel()
        _ = await installation.result

        try await waitUntil(description: "staging artifacts are cleaned") {
            stagingArtifacts(in: directory).isEmpty
        }

        try await assertCatalogIntact(coordinator, expectedCount: 2, knownSlug: "original-a")
        let absent = try await coordinator.song(id: "never-installed")
        XCTAssertNil(absent)
        assertNoStagingArtifacts(in: directory)
    }

    // MARK: cancellation isolation

    /// Deterministic, timing-free proof of the ownership rule: one operation's
    /// cleanup, however late it lands, only ever names its own files.
    func testCleanupOfOneOperationCannotRemoveAnotherOperationsArtifacts() throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }

        let stagedByA = CatalogArtifacts.stagedURL(in: directory, filename: "catalog.db", operationID: "op-a")
        let stagedByB = CatalogArtifacts.stagedURL(in: directory, filename: "catalog.db", operationID: "op-b")
        try seedCatalog(at: stagedByA, slugs: ["from-a"])
        try seedCatalog(at: stagedByB, slugs: ["from-b"])
        XCTAssertNotEqual(stagedByA, stagedByB, "staging paths must be operation-unique")

        // A's cleanup, arriving after B has already staged.
        CatalogArtifacts.removeDatabase(at: stagedByA, using: LiveCatalogFileSystem())

        XCTAssertFalse(FileManager.default.fileExists(atPath: stagedByA.path), "A cleans up after itself")
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: stagedByB.path),
            "B staged candidate must survive a late cleanup from A"
        )
    }

    /// The required sequence: start A, cancel A, immediately start B, then let
    /// A cleanup finish and prove it took nothing of B with it.
    func testCancelledOperationDoesNotDisturbAnImmediatelyFollowingOperation() async throws {
        let directory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try seedCatalog(at: directory.appending(path: "catalog.db"), slugs: ["original-a", "original-b"])

        let payloadDirectory = try makeDirectory()
        defer { try? FileManager.default.removeItem(at: payloadDirectory) }
        let payloadA = payloadDirectory.appending(path: "a.db")
        let payloadB = payloadDirectory.appending(path: "b.db")
        try seedCatalog(at: payloadA, slugs: ["from-a-1", "from-a-2"])
        try seedCatalog(at: payloadB, slugs: ["from-b-1", "from-b-2", "from-b-3"])

        let configuration = makeConfiguration(directory: directory)
        let coordinator = CatalogCoordinator(configuration: configuration)
        try await coordinator.prepare()

        let gate = Gate()
        let serviceA = DefaultCatalogMaintenanceService(
            coordinator: coordinator,
            configuration: configuration,
            fetchArchive: fileArchiveFetch(payloadURL: payloadA, gate: gate)
        )
        let serviceB = DefaultCatalogMaintenanceService(
            coordinator: coordinator,
            configuration: configuration,
            fetchArchive: fileArchiveFetch(payloadURL: payloadB)
        )

        // Start A and hold it inside the operation.
        let installationA = Task {
            for try await _ in serviceA.downloadAndInstall() {}
        }
        try await waitUntil(description: "A is in flight") { gate.wasEntered }

        // Cancel A, then start B immediately without waiting for A to settle.
        installationA.cancel()
        for try await _ in serviceB.downloadAndInstall() {}

        // Only now allow A to unwind and run its cleanup, after B has finished.
        gate.open()
        _ = await installationA.result

        // B validated and installed, and A late cleanup took nothing of B.
        let count = try await coordinator.songCount()
        XCTAssertEqual(count, 3, "the catalog B installed must survive A cleanup")
        let fromB = try await coordinator.song(id: "from-b-1")
        XCTAssertNotNil(fromB)
        let fromA = try await coordinator.song(id: "from-a-1")
        XCTAssertNil(fromA, "the cancelled operation must not have installed anything")
        let original = try await coordinator.song(id: "original-a")
        XCTAssertNil(original)
        assertNoStagingArtifacts(in: directory)
    }

    // MARK: - Helpers

    /// Requirement 8: after every failed replacement the old catalog must still
    /// report its original count *and* answer real queries.
    private func assertCatalogIntact(
        _ coordinator: CatalogCoordinator,
        expectedCount: Int,
        knownSlug: String,
        message: String = "",
        file: StaticString = #filePath,
        line: UInt = #line
    ) async throws {
        let count = try await coordinator.songCount()
        XCTAssertEqual(count, expectedCount, "song count after failure: \(message)", file: file, line: line)
        let song = try await coordinator.song(id: knownSlug)
        XCTAssertEqual(song?.id, knownSlug, "known-slug query after failure: \(message)", file: file, line: line)
        let browsed = try await coordinator.browseSongs(group: .alphabetical("S"), filter: "")
        XCTAssertEqual(browsed.count, expectedCount, "browse query after failure: \(message)", file: file, line: line)
    }

    private func assertNoStagingArtifacts(
        in directory: URL,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(
            stagingArtifacts(in: directory),
            [],
            "no staging artifact may outlive the operation that owned it",
            file: file,
            line: line
        )
    }

    private func waitUntil(
        description: String,
        timeoutNanoseconds: UInt64 = 5_000_000_000,
        stepNanoseconds: UInt64 = 50_000_000,
        condition: () -> Bool
    ) async throws {
        let step = stepNanoseconds
        var waited: UInt64 = 0
        while waited < timeoutNanoseconds {
            if condition() { return }
            try await Task.sleep(nanoseconds: step)
            waited += step
        }
        XCTFail("timed out waiting until \(description)")
    }

    private func makeDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func makeConfiguration(
        directory: URL,
        downloadURL: URL = URL(string: "https://stub.invalid/catalog.db.gz")!
    ) -> CatalogConfiguration {
        CatalogConfiguration(
            directoryURL: directory,
            downloadURL: downloadURL,
            contract: miniatureContract(minimumRows: 1)
        )
    }

    private func makeCoordinator(
        directory: URL,
        fileSystem: (any CatalogFileSystem)? = nil,
        poolOpener: CatalogPoolOpener? = nil
    ) -> CatalogCoordinator {
        let resolvedFileSystem: any CatalogFileSystem
        if let fileSystem {
            resolvedFileSystem = fileSystem
        } else {
            resolvedFileSystem = LiveCatalogFileSystem()
        }
        let resolvedOpener: CatalogPoolOpener
        if let poolOpener {
            resolvedOpener = poolOpener
        } else {
            resolvedOpener = { url in try CatalogCoordinator.openPool(at: url) }
        }
        return CatalogCoordinator(
            configuration: makeConfiguration(directory: directory),
            fileSystem: resolvedFileSystem,
            poolOpener: resolvedOpener
        )
    }

    private func miniatureContract(minimumRows: Int) -> CatalogContract {
        CatalogContract(
            name: "test",
            schemaVersion: 3,
            databaseFilename: "catalog.db",
            archiveFilename: "catalog.db.gz",
            compression: "gzip",
            minimumBrowseRows: minimumRows,
            requiredTables: CatalogContract.mobileV3.requiredTables,
            requiredIndexes: CatalogContract.mobileV3.requiredIndexes
        )
    }

    /// Builds a contract-shaped catalog. Titles start with "S" so a single
    /// alphabetical browse group covers every seeded row.
    private func seedCatalog(at url: URL, slugs: [String]) throws {
        try withQueue(at: url) { db in
            try CatalogCoordinator.createSchema(in: db)
            for slug in slugs {
                let title = "Song \(slug)"
                try db.execute(
                    sql: "INSERT INTO songs (slug, artist, title, url, status, dataBlob) VALUES (?, ?, ?, ?, ?, ?)",
                    arguments: [slug, "Artist", title, "https://example.com/\(slug)", "ready", Data("{}".utf8)]
                )
                try db.execute(
                    sql: "INSERT INTO song_browse_entries (slug, artist, title, alphaGroup) VALUES (?, ?, ?, ?)",
                    arguments: [slug, "Artist", title, "S"]
                )
            }
        }
    }

    private func assertThrowsAsync(
        _ expression: @autoclosure () async throws -> Void,
        _ message: String = "expected an error",
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            try await expression()
            XCTFail(message, file: file, line: line)
        } catch {
            // expected
        }
    }
}
