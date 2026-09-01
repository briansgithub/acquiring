import Foundation
import GRDB

/// Package-internal seam over the file operations the catalog swap depends on.
///
/// Production uses `LiveCatalogFileSystem`. Tests substitute an implementation
/// that fails one specific move, so the recovery path can be exercised without
/// waiting for a real filesystem fault.
protocol CatalogFileSystem: Sendable {
    func fileExists(at url: URL) -> Bool
    func createDirectory(at url: URL) throws
    func moveItem(at source: URL, to destination: URL) throws
    func copyItem(at source: URL, to destination: URL) throws
    func removeItem(at url: URL) throws
    func contentsOfDirectory(at url: URL) -> [URL]
}

struct LiveCatalogFileSystem: CatalogFileSystem {
    func fileExists(at url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path)
    }

    func createDirectory(at url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    func moveItem(at source: URL, to destination: URL) throws {
        try FileManager.default.moveItem(at: source, to: destination)
    }

    func copyItem(at source: URL, to destination: URL) throws {
        try FileManager.default.copyItem(at: source, to: destination)
    }

    func removeItem(at url: URL) throws {
        try FileManager.default.removeItem(at: url)
    }

    func contentsOfDirectory(at url: URL) -> [URL] {
        (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)) ?? []
    }
}

/// Opens a pool for the live catalog. Injected so a test can fail the reopen
/// that happens immediately after the staged file moves into place, which is
/// the one failure that used to leave the app with no catalog at all.
typealias CatalogPoolOpener = @Sendable (URL) throws -> DatabasePool

/// Fetches the catalog archive to a temporary file. Injected so the install
/// pipeline can be driven end to end without Foundation's networking stack,
/// which makes cancellation timing controllable instead of racy.
typealias CatalogArchiveFetch = @Sendable (URL) async throws -> (URL, URLResponse)

enum CatalogArtifacts {
    /// SQLite writes these beside the database. They must never outlive the
    /// file they belong to, or they are misread as belonging to whatever
    /// replaces it.
    static let sidecarSuffixes = ["-wal", "-shm", "-journal"]

    static func removeSidecars(for url: URL, using fileSystem: any CatalogFileSystem) {
        for suffix in sidecarSuffixes {
            try? fileSystem.removeItem(at: URL(fileURLWithPath: url.path + suffix))
        }
    }

    /// Idempotent: removes the database and its sidecars when present, and does
    /// nothing when they are already gone.
    static func removeDatabase(at url: URL, using fileSystem: any CatalogFileSystem) {
        try? fileSystem.removeItem(at: url)
        removeSidecars(for: url, using: fileSystem)
    }

    /// Staging names carry these markers plus an operation-unique identifier,
    /// so a run only ever cleans up after itself.
    static let stagedMarker = ".installing"
    static let archiveMarker = ".downloading"

    static func stagedURL(in directory: URL, filename: String, operationID: String) -> URL {
        directory.appending(path: "\(filename).\(operationID)\(stagedMarker)")
    }

    static func archiveURL(in directory: URL, filename: String, operationID: String) -> URL {
        directory.appending(path: "\(filename).\(operationID)\(archiveMarker)")
    }

    static func isStagingArtifact(_ url: URL) -> Bool {
        let name = url.lastPathComponent
        return name.contains(stagedMarker) || name.contains(archiveMarker)
    }
}
