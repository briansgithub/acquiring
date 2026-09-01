import AcquiringCore
import Foundation

public struct DefaultCatalogMaintenanceService: CatalogMaintenanceService, Sendable {
    private let coordinator: CatalogCoordinator
    private let configuration: CatalogConfiguration
    private let session: URLSession

    public init(
        coordinator: CatalogCoordinator,
        configuration: CatalogConfiguration,
        session: URLSession = .shared
    ) {
        self.coordinator = coordinator
        self.configuration = configuration
        self.session = session
    }

    public func downloadAndInstall() -> AsyncThrowingStream<CatalogProgress, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                let fileManager = FileManager.default
                let archiveURL = configuration.directoryURL.appending(path: configuration.contract.archiveFilename + ".downloading")
                let stagedURL = configuration.directoryURL.appending(path: configuration.contract.databaseFilename + ".installing")
                defer {
                    try? fileManager.removeItem(at: archiveURL)
                    try? fileManager.removeItem(at: stagedURL)
                    Self.removeSidecars(for: stagedURL)
                }
                do {
                    try fileManager.createDirectory(at: configuration.directoryURL, withIntermediateDirectories: true)
                    continuation.yield(.connecting)
                    let (temporaryURL, response) = try await session.download(from: configuration.downloadURL)
                    try Task.checkCancellation()
                    guard let response = response as? HTTPURLResponse else { throw CatalogError.emptyResponse }
                    guard (200..<300).contains(response.statusCode) else { throw CatalogError.http(response.statusCode) }
                    let attributes = try fileManager.attributesOfItem(atPath: temporaryURL.path)
                    guard (attributes[.size] as? NSNumber)?.intValue ?? 0 > 0 else { throw CatalogError.emptyResponse }
                    continuation.yield(.downloading(fraction: 1))
                    try? fileManager.removeItem(at: archiveURL)
                    try fileManager.moveItem(at: temporaryURL, to: archiveURL)

                    continuation.yield(.preparing)
                    try? fileManager.removeItem(at: stagedURL)
                    let handle = try FileHandle(forReadingFrom: archiveURL)
                    let magic = try handle.read(upToCount: 2) ?? Data()
                    try handle.close()
                    if magic.starts(with: [0x1f, 0x8b]) {
                        try Gzip.inflateFile(from: archiveURL, to: stagedURL)
                    } else {
                        try fileManager.copyItem(at: archiveURL, to: stagedURL)
                    }
                    try CatalogCandidate.prepare(at: stagedURL)

                    continuation.yield(.validating)
                    let result = try CatalogCandidate.validate(at: stagedURL, contract: configuration.contract)
                    try Task.checkCancellation()
                    continuation.yield(.installing)
                    try await coordinator.replaceLiveDatabase(with: stagedURL)
                    continuation.yield(.completed(songCount: result.songCount))
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func harvest(url: URL) -> AsyncThrowingStream<CatalogProgress, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    continuation.yield(.connecting)
                    let harvested = try await HooktheoryHarvester(session: session).harvest(url: url) { current, total in
                        continuation.yield(.harvesting(current: current, total: total))
                    }
                    let payload = try JSONEncoder().encode(harvested.sections)
                    try await coordinator.writeHarvested(
                        song: harvested.song,
                        payload: payload,
                        alphaGroup: Self.alphabeticalGroup(harvested.song.title),
                        modes: Self.modes(in: harvested.sections.values)
                    )
                    let count = try await coordinator.songCount()
                    continuation.yield(.completed(songCount: count))
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func alphabeticalGroup(_ title: String?) -> String {
        guard let character = title?.trimmingCharacters(in: .whitespacesAndNewlines).first else { return "#" }
        let value = String(character).uppercased()
        return value.range(of: "^[A-Z0-9]$", options: .regularExpression) == nil ? "#" : value
    }

    private static func modes(in sections: Dictionary<String, ExtractedSection>.Values) -> Set<String> {
        var result = Set<String>()
        for section in sections {
            for keyValue in section.metadata?["keys"]?.arrayValue ?? [] {
                if let mode = canonicalMode(keyValue.objectValue?["scale"]?.stringValue) {
                    result.insert(mode)
                }
            }
        }
        return result
    }

    private static func canonicalMode(_ scale: String?) -> String? {
        let value = scale?.lowercased().filter { !$0.isWhitespace && $0 != "-" && $0 != "_" }
        switch value {
        case "major", "ionian": return "ionian"
        case "dorian": return "dorian"
        case "phrygian": return "phrygian"
        case "lydian": return "lydian"
        case "mixolydian": return "mixolydian"
        case "minor", "aeolian", "naturalminor": return "aeolian"
        case "locrian": return "locrian"
        default: return nil
        }
    }

    private static func removeSidecars(for url: URL) {
        for suffix in ["-wal", "-shm", "-journal"] {
            try? FileManager.default.removeItem(atPath: url.path + suffix)
        }
    }
}
