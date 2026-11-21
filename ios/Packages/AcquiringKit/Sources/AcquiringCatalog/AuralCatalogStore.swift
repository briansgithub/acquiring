import Foundation
import GRDB
import CryptoKit
import zlib

public struct AuralBundleManifest: Codable, Sendable {
    public struct File: Codable, Sendable {
        public let name: String
        public let url: URL
        public let checksum: String
        public let byteSize: Int64
    }
    public let schemaVersion: String
    public let snapshotId: String
    public let files: [File]
}

/// One store per root directory. The application owns this instance, independent
/// of navigation. No external process may mutate its immutable generation files.
public actor AuralCatalogStore {
    public enum StateError: Error { case busy, notInstalled, downgrade }
    public typealias Fetch = @Sendable (URL) async throws -> URL
    private let root: URL
    private let fs: any CatalogFileSystem
    private var prepared: AuralCatalog?
    private var users = 0
    private var installing = false
    private var draining = false
    private var drain: CheckedContinuation<Void, Error>?
    private var drainID: UUID?
    private struct Pointer: Codable { let generation: String; let schema: Int; let snapshot: String }
    private static let names = ["aural-catalog.db", "aural-evidence.db", "aural-popularity.db"]

    public init(directory: URL) throws {
        root = directory; fs = LiveCatalogFileSystem()
        try fs.createDirectory(at: directory)
    }
    init(directory: URL, fileSystem: any CatalogFileSystem) throws {
        root = directory; fs = fileSystem
        try fs.createDirectory(at: directory)
    }
    // Internal observation for deterministic lifecycle regression tests.
    private var activationObservers: [CheckedContinuation<Void, Never>] = []
    func waitForActivation() async {
        if draining { return }
        await withCheckedContinuation { activationObservers.append($0) }
    }
    private func pointer() throws -> Pointer? {
        let url = root.appendingPathComponent("current.json")
        guard fs.fileExists(at: url) else { return nil }
        let data = try Data(contentsOf: url)
        guard data.count < 4096 else { throw AuralCatalogError.invalid("bundle pointer") }
        let p = try JSONDecoder().decode(Pointer.self, from: data)
        guard UUID(uuidString: p.generation) != nil else { throw AuralCatalogError.invalid("generation path") }
        return p
    }
    private func load() throws -> AuralCatalog {
        if let prepared { return prepared }
        guard let p = try pointer() else { throw StateError.notInstalled }
        let directory = root.appendingPathComponent(p.generation)
        try Self.validate(directory: directory, snapshot: p.snapshot, schema: p.schema)
        let reader = try AuralCatalog(directory: directory)
        prepared = reader
        return reader
    }
    /// The closure is the lease. Cancellation and thrown errors release it.
    /// Do not retain the reader beyond the closure or start unstructured work with it.
    public func withCatalog<T: Sendable>(_ body: @Sendable (AuralCatalog) async throws -> T) async throws -> T {
        try Task.checkCancellation()
        guard !draining else { throw StateError.busy }
        let reader = try load(); users += 1
        defer {
            users -= 1
            if users == 0 { drain?.resume(); drain = nil }
        }
        return try await body(reader)
    }
    private func cancelDrain(_ id: UUID) { if drainID == id { drain?.resume(throwing: CancellationError()); drain = nil } }
    private func waitForUsers() async throws {
        let id = UUID(); drainID = id
        defer { drainID = nil }
        try await withTaskCancellationHandler {
            try Task.checkCancellation()
            if users > 0 { try await withCheckedThrowingContinuation { drain = $0 } }
            try Task.checkCancellation()
        } onCancel: { Task { await self.cancelDrain(id) } }
    }

    /// A concurrent install receives busy and may retry. Staging does not block
    /// existing/new readers. Activation rejects new leases and drains old ones.
    public func install(_ manifest: AuralBundleManifest, fetch: @escaping Fetch = AuralCatalogStore.download) async throws {
        guard !installing else { throw StateError.busy }
        installing = true
        defer { installing = false; draining = false }
        guard let version = ["aural-catalog-1", "aural-catalog-2", "aural-catalog-3"].firstIndex(of: manifest.schemaVersion), !manifest.snapshotId.isEmpty,
              manifest.files.count == 3, Set(manifest.files.map(\.name)) == Set(Self.names) else { throw AuralCatalogError.invalid("manifest") }
        if let prior = try pointer(), prior.schema > version + 1 { throw StateError.downgrade }
        let generation = UUID().uuidString
        let stage = root.appendingPathComponent(generation + ".installing")
        let destination = root.appendingPathComponent(generation)
        try fs.createDirectory(at: stage)
        var activated = false
        defer {
            try? fs.removeItem(at: stage)
            if !activated { try? fs.removeItem(at: destination) }
        }
        for entry in manifest.files {
            guard entry.checksum.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  entry.byteSize >= 0, entry.byteSize <= 8 * 1024 * 1024 * 1024 else { throw AuralCatalogError.invalid("file checksum/size") }
            try Task.checkCancellation()
            let archive = try await fetch(entry.url)
            defer { try? FileManager.default.removeItem(at: archive) }
            let compressedSize = try archive.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard compressedSize > 0, compressedSize <= 2 * 1024 * 1024 * 1024 else { throw AuralCatalogError.budget("compressed database") }
            let output = stage.appendingPathComponent(entry.name)
            // Stream gzip and SHA off the actor executor. Cancellation propagates
            // explicitly to the detached I/O task, and is checked every 64 KiB.
            let task = Task.detached { try Self.expand(archive: archive, output: output, entry: entry) }
            try await withTaskCancellationHandler { try await task.value } onCancel: { task.cancel() }
        }
        try Self.validate(directory: stage, snapshot: manifest.snapshotId, schema: version + 1)
        try fs.moveItem(at: stage, to: destination)
        // Prove the actual new reader can prepare before changing the pointer.
        let next = try AuralCatalog(directory: destination)
        do {
            draining = true
            let observers = activationObservers; activationObservers.removeAll()
            for observer in observers { observer.resume() }
            try await waitForUsers()
            try Task.checkCancellation()
            let pointer = Pointer(generation: generation, schema: version + 1, snapshot: manifest.snapshotId)
            try JSONEncoder().encode(pointer).write(to: root.appendingPathComponent("current.json"), options: .atomic)
            let old = prepared
            prepared = next; activated = true
            // The pointer commit is the cancellation boundary. Finish ownership
            // transfer even if the caller cancels immediately after publication.
            try? await old?.close()
        } catch {
            try? await next.close()
            throw error
        }
    }

    public static func download(_ url: URL) async throws -> URL {
        guard url.scheme == "https" else { throw AuralCatalogError.invalid("download scheme") }
        let (temporary, response) = try await URLSession.shared.download(from: url)
        guard let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode) else {
            try? FileManager.default.removeItem(at: temporary)
            throw AuralCatalogError.invalid("download status")
        }
        return temporary
    }
    private static func expand(archive: URL, output: URL, entry: AuralBundleManifest.File) throws {
        let header = try FileHandle(forReadingFrom: archive)
        defer { try? header.close() }
        guard try header.read(upToCount: 2) == Data([31,139]) else { throw AuralCatalogError.invalid("archive gzip header") }
        guard let input = gzopen(archive.path, "rb") else { throw AuralCatalogError.invalid("archive open") }
        defer { gzclose(input) }
        guard FileManager.default.createFile(atPath: output.path, contents: nil) else { throw AuralCatalogError.invalid("staged file creation") }
        let handle = try FileHandle(forWritingTo: output); defer { try? handle.close() }
        var buffer = [UInt8](repeating: 0, count: 65536), digest = SHA256(), total: Int64 = 0
        while true {
            try Task.checkCancellation()
            let count = gzread(input, &buffer, 65536)
            guard count >= 0 else { throw AuralCatalogError.invalid("archive gzip corruption") }
            if count == 0 {
                var code: Int32 = 0; _ = gzerror(input, &code)
                guard code == Z_OK || code == Z_STREAM_END else { throw AuralCatalogError.invalid("truncated archive") }
                break
            }
            total += Int64(count)
            guard total <= (entry.byteSize > 0 ? entry.byteSize : 8 * 1024 * 1024 * 1024) else { throw AuralCatalogError.budget("expanded database") }
            let data = Data(buffer.prefix(Int(count)))
            digest.update(data: data); try handle.write(contentsOf: data)
        }
        guard (entry.byteSize == 0 || total == entry.byteSize), digest.finalize().map({ String(format: "%02x", $0) }).joined() == entry.checksum else { throw AuralCatalogError.invalid("database size/hash") }
        try handle.synchronize()
    }
    static func validate(directory: URL, snapshot: String, schema: Int) throws {
        func metadata(_ name: String) throws -> [String: String] {
            for suffix in CatalogArtifacts.sidecarSuffixes where FileManager.default.fileExists(atPath: directory.appendingPathComponent(name + suffix).path) { throw AuralCatalogError.invalid("bundle sidecar") }
            var config = Configuration(); config.readonly = true
            let db = try DatabaseQueue(path: directory.appendingPathComponent(name).path, configuration: config)
            defer { try? db.close() }
            return try db.read { db in
                guard try String.fetchAll(db, sql: "PRAGMA quick_check") == ["ok"] else { throw AuralCatalogError.invalid("database integrity") }
                return Dictionary(uniqueKeysWithValues: try Row.fetchAll(db, sql: "SELECT key,value FROM metadata").map { ($0["key"] as String, $0["value"] as String) })
            }
        }
        let catalog = try metadata(Self.names[0]), evidence = try metadata(Self.names[1]), popularity = try metadata(Self.names[2])
        guard catalog["schema_version"] == "aural-catalog-\(schema)", (1...3).contains(schema), catalog["snapshot_id"] == snapshot, evidence["catalog_snapshot"] == snapshot,
              !(popularity["snapshotId"] ?? "").isEmpty, !(popularity["provider"] ?? "").isEmpty else { throw AuralCatalogError.invalid("bundle snapshot") }
        // Popularity has its own measurement snapshot, not the catalog snapshot.
    }
}
