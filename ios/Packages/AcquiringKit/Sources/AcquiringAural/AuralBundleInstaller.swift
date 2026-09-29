import CryptoKit
import Foundation
import GRDB
import zlib

public actor AuralBundleInstaller {
    public typealias ProgressHandler = @Sendable (AuralInstallProgress) -> Void

    private let configuration: AuralBundleConfiguration
    private let session: URLSession
    private let fileManager: FileManager
    private var installationInProgress = false
    private var installationWaiters: [CheckedContinuation<Void, Never>] = []

    public init(
        configuration: AuralBundleConfiguration,
        session: URLSession = .shared,
        fileManager: FileManager = .default
    ) {
        self.configuration = configuration
        self.session = session
        self.fileManager = fileManager
    }

    @discardableResult
    public func ensureInstalled(
        force: Bool = false,
        onProgress: @escaping ProgressHandler = { _ in }
    ) async throws -> Bool {
        await waitForInstallation()
        defer { finishInstallation() }
        try Task.checkCancellation()
        onProgress(.checking)
        try prepareDirectory()
        let manifest = try await fetchManifest().validated()
        if installedBundleIsNewer(than: manifest) {
            onProgress(.ready(installed: false))
            return false
        }
        if !force, try installedBundleMatches(manifest) {
            onProgress(.ready(installed: false))
            return false
        }

        let operation = UUID().uuidString
        let entries = Dictionary(uniqueKeysWithValues: manifest.files.map { ($0.name, $0) })
        var staged: [String: URL] = [:]
        var archives: [URL] = []
        defer {
            for url in archives { try? fileManager.removeItem(at: url) }
            for url in staged.values { try? fileManager.removeItem(at: url) }
        }

        for (index, name) in AuralBundleConfiguration.requiredFilenames.enumerated() {
            try Task.checkCancellation()
            guard let entry = entries[name] else {
                throw AuralCatalogError.invalidManifest("missing \(name)")
            }
            onProgress(.downloading(name: name, index: index + 1, count: entries.count))
            let archive = configuration.directoryURL.appending(path: ".\(name).\(operation).download")
            let stagedURL = configuration.directoryURL.appending(path: ".\(name).\(operation).installing")
            archives.append(archive)
            staged[name] = stagedURL
            try? fileManager.removeItem(at: archive)
            try? fileManager.removeItem(at: stagedURL)

            let (temporaryURL, response) = try await session.download(from: entry.url)
            guard let response = response as? HTTPURLResponse else {
                throw AuralCatalogError.emptyResponse
            }
            guard (200..<300).contains(response.statusCode) else {
                throw AuralCatalogError.http(response.statusCode)
            }
            let size = try fileManager.attributesOfItem(atPath: temporaryURL.path)[.size] as? NSNumber
            guard size?.int64Value ?? 0 > 0 else { throw AuralCatalogError.emptyResponse }
            try fileManager.moveItem(at: temporaryURL, to: archive)
            onProgress(.preparing(name: name))
            let checksum = try Self.inflateAndHash(from: archive, to: stagedURL)
            guard checksum.caseInsensitiveCompare(entry.checksum) == .orderedSame else {
                throw AuralCatalogError.invalidChecksum(name)
            }
        }

        try Task.checkCancellation()
        onProgress(.validating)
        try Self.validateBundle(staged, manifest: manifest)
        try Task.checkCancellation()
        onProgress(.installing)
        try install(staged)
        onProgress(.ready(installed: true))
        return true
    }

    public func hasInstalledFiles() -> Bool {
        AuralBundleConfiguration.requiredFilenames.allSatisfy {
            fileManager.fileExists(atPath: configuration.fileURL($0).path)
        }
    }

    // Actor methods can interleave at URLSession awaits. Keep one installer in
    // the private directory so a second check cannot remove its staged files.
    private func waitForInstallation() async {
        if installationInProgress {
            await withCheckedContinuation { installationWaiters.append($0) }
        } else {
            installationInProgress = true
        }
    }

    private func finishInstallation() {
        if installationWaiters.isEmpty {
            installationInProgress = false
        } else {
            installationWaiters.removeFirst().resume()
        }
    }

    func prepareDirectory() throws {
        try fileManager.createDirectory(
            at: configuration.directoryURL,
            withIntermediateDirectories: true
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var directory = configuration.directoryURL
        try? directory.setResourceValues(values)
        try recoverBackups()
        for url in (try? fileManager.contentsOfDirectory(
            at: configuration.directoryURL,
            includingPropertiesForKeys: nil
        )) ?? [] where url.lastPathComponent.contains(".installing")
            || url.lastPathComponent.contains(".download") {
            try? fileManager.removeItem(at: url)
        }
    }

    private func recoverBackups() throws {
        let names = AuralBundleConfiguration.requiredFilenames
        let backups = names.compactMap { name -> (String, URL)? in
            let url = configuration.directoryURL.appending(path: ".\(name).backup")
            return fileManager.fileExists(atPath: url.path) ? (name, url) : nil
        }
        guard !backups.isEmpty else { return }

        // A crash after all replacements may leave only backup cleanup undone.
        // Keep that complete, self-consistent installation; otherwise restore
        // every preserved original before another download can begin.
        let files = Dictionary(uniqueKeysWithValues: names.map { ($0, configuration.fileURL($0)) })
        if Self.installedFilesAreSelfConsistent(files) {
            for (_, backup) in backups { try fileManager.removeItem(at: backup) }
            return
        }

        do {
            for (name, backup) in backups {
                let destination = configuration.fileURL(name)
                if fileManager.fileExists(atPath: destination.path) {
                    try fileManager.removeItem(at: destination)
                }
                try fileManager.moveItem(at: backup, to: destination)
            }
        } catch {
            throw AuralCatalogError.installation(
                "previous catalog remains in .backup for recovery: \(error.localizedDescription)"
            )
        }
    }

    private static func installedFilesAreSelfConsistent(_ files: [String: URL]) -> Bool {
        do {
            guard let catalogURL = files["aural-catalog.db"] else { return false }
            let metadata = try validateDatabase(catalogURL)
            guard let schema = metadata["schema_version"],
                  let snapshot = metadata["snapshot_id"],
                  AuralBundleConfiguration.supportedSchemas.contains(schema)
            else { return false }
            try validateBundle(files, manifest: AuralBundleManifest(
                schemaVersion: schema, snapshotId: snapshot, files: []
            ))
            return true
        } catch {
            return false
        }
    }

    private func fetchManifest() async throws -> AuralBundleManifest {
        let (data, response) = try await session.data(from: configuration.manifestURL)
        guard let response = response as? HTTPURLResponse else {
            throw AuralCatalogError.emptyResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            throw AuralCatalogError.http(response.statusCode)
        }
        guard !data.isEmpty else { throw AuralCatalogError.emptyResponse }
        do {
            return try JSONDecoder().decode(AuralBundleManifest.self, from: data)
        } catch {
            throw AuralCatalogError.invalidManifest(error.localizedDescription)
        }
    }

    private func installedBundleMatches(_ manifest: AuralBundleManifest) throws -> Bool {
        let entries = Dictionary(uniqueKeysWithValues: manifest.files.map { ($0.name, $0) })
        var files: [String: URL] = [:]
        for name in AuralBundleConfiguration.requiredFilenames {
            let url = configuration.fileURL(name)
            guard fileManager.fileExists(atPath: url.path),
                  let entry = entries[name],
                  try Self.hash(url).caseInsensitiveCompare(entry.checksum) == .orderedSame
            else { return false }
            files[name] = url
        }
        do {
            try Self.validateBundle(files, manifest: manifest)
            return true
        } catch {
            return false
        }
    }

    func installedBundleIsNewer(than offered: AuralBundleManifest) -> Bool {
        guard hasInstalledFiles() else { return false }
        do {
            let catalog = try Self.validateDatabase(configuration.fileURL("aural-catalog.db"))
            guard let localSchema = catalog["schema_version"],
                  AuralBundleConfiguration.supportedSchemas.contains(localSchema),
                  let localVersion = localSchema.split(separator: "-").last.flatMap({ Int($0) }),
                  let offeredVersion = offered.schemaVersion.split(separator: "-").last.flatMap({ Int($0) }),
                  localVersion > offeredVersion,
                  let snapshot = catalog["snapshot_id"] else { return false }
            let files = Dictionary(uniqueKeysWithValues: AuralBundleConfiguration.requiredFilenames.map {
                ($0, configuration.fileURL($0))
            })
            try Self.validateBundle(files, manifest: AuralBundleManifest(
                schemaVersion: localSchema, snapshotId: snapshot, files: offered.files
            ))
            return true
        } catch { return false }
    }

    func install(_ staged: [String: URL]) throws {
        let names = AuralBundleConfiguration.requiredFilenames
        var backups: [String: URL] = [:]
        var replacements: [URL] = []
        do {
            for name in names {
                let destination = configuration.fileURL(name)
                let backup = configuration.directoryURL.appending(path: ".\(name).backup")
                guard !fileManager.fileExists(atPath: backup.path) else {
                    throw AuralCatalogError.installation("an earlier catalog backup needs recovery")
                }
                if fileManager.fileExists(atPath: destination.path) {
                    try fileManager.moveItem(at: destination, to: backup)
                    backups[name] = backup
                }
            }
            for name in names {
                guard let source = staged[name] else {
                    throw AuralCatalogError.installation("missing staged \(name)")
                }
                let destination = configuration.fileURL(name)
                try fileManager.moveItem(at: source, to: destination)
                replacements.append(destination)
            }
            for backup in backups.values { try? fileManager.removeItem(at: backup) }
        } catch {
            var recoveryFailed = false
            for destination in replacements {
                do { try fileManager.removeItem(at: destination) }
                catch { recoveryFailed = true }
            }
            for name in names {
                if let backup = backups[name], fileManager.fileExists(atPath: backup.path) {
                    do { try fileManager.moveItem(at: backup, to: configuration.fileURL(name)) }
                    catch { recoveryFailed = true }
                }
            }
            if recoveryFailed {
                throw AuralCatalogError.installation(
                    "update failed; previous files remain in .backup for recovery: \(error.localizedDescription)"
                )
            }
            throw AuralCatalogError.installation(error.localizedDescription)
        }
    }

    static func validateBundle(
        _ files: [String: URL],
        manifest: AuralBundleManifest
    ) throws {
        guard let catalog = files["aural-catalog.db"],
              let evidence = files["aural-evidence.db"],
              let popularity = files["aural-popularity.db"]
        else { throw AuralCatalogError.invalidSchema("bundle is incomplete") }
        let catalogMetadata = try validateDatabase(catalog)
        let evidenceMetadata = try validateDatabase(evidence)
        let popularityMetadata = try validateDatabase(popularity)
        guard catalogMetadata["schema_version"] == manifest.schemaVersion else {
            throw AuralCatalogError.invalidSchema("catalog schema mismatch")
        }
        guard catalogMetadata["snapshot_id"] == manifest.snapshotId else {
            throw AuralCatalogError.invalidSchema("catalog snapshot mismatch")
        }
        guard evidenceMetadata["catalog_snapshot"] == manifest.snapshotId else {
            throw AuralCatalogError.invalidSchema("evidence belongs to another catalog")
        }
        try requireTable("popularity", in: popularity)
        guard let popularitySnapshot = popularityMetadata["snapshotId"],
              !popularitySnapshot.isEmpty,
              let provider = popularityMetadata["provider"], !provider.isEmpty,
              let attribution = popularityMetadata["attribution"], !attribution.isEmpty,
              Int(popularityMetadata["total"] ?? "") != nil
        else {
            throw AuralCatalogError.invalidSchema("popularity provenance is incomplete")
        }
    }

    private static func validateDatabase(_ url: URL) throws -> [String: String] {
        var config = Configuration()
        config.readonly = true
        let queue = try DatabaseQueue(path: url.path, configuration: config)
        return try queue.read { db in
            let quickCheck = try String.fetchOne(db, sql: "PRAGMA quick_check") ?? "no result"
            guard quickCheck == "ok" else { throw AuralCatalogError.integrity(quickCheck) }
            let tableExists = try Bool.fetchOne(
                db,
                sql: "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata')"
            ) ?? false
            guard tableExists else { throw AuralCatalogError.invalidSchema("metadata table missing") }
            let rows = try Row.fetchAll(db, sql: "SELECT key, value FROM metadata")
            return Dictionary(uniqueKeysWithValues: rows.compactMap { row in
                guard let key: String = row["key"], let value: String = row["value"] else { return nil }
                return (key, value)
            })
        }
    }

    private static func requireTable(_ name: String, in url: URL) throws {
        var config = Configuration()
        config.readonly = true
        let queue = try DatabaseQueue(path: url.path, configuration: config)
        let exists = try queue.read { db in
            try Bool.fetchOne(
                db,
                sql: "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?)",
                arguments: [name]
            ) ?? false
        }
        guard exists else { throw AuralCatalogError.invalidSchema("missing table \(name)") }
    }

    private static func hash(_ url: URL) throws -> String {
        let input = try FileHandle(forReadingFrom: url)
        defer { try? input.close() }
        var digest = SHA256()
        while true {
            let data = try input.read(upToCount: 1024 * 1024) ?? Data()
            if data.isEmpty { break }
            digest.update(data: data)
        }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private static func inflateAndHash(from archive: URL, to destination: URL) throws -> String {
        guard let gzip = gzopen(archive.path, "rb") else {
            throw AuralCatalogError.decompression("could not open archive")
        }
        defer { gzclose(gzip) }
        FileManager.default.createFile(atPath: destination.path, contents: nil)
        let output = try FileHandle(forWritingTo: destination)
        defer { try? output.close() }
        var digest = SHA256()
        var buffer = [UInt8](repeating: 0, count: 256 * 1024)
        while true {
            try Task.checkCancellation()
            let count = gzread(gzip, &buffer, UInt32(buffer.count))
            if count == 0 { break }
            guard count > 0 else {
                var code: Int32 = 0
                let message = gzerror(gzip, &code).map(String.init(cString:)) ?? "zlib error \(code)"
                throw AuralCatalogError.decompression(message)
            }
            let data = Data(buffer.prefix(Int(count)))
            try output.write(contentsOf: data)
            digest.update(data: data)
        }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
