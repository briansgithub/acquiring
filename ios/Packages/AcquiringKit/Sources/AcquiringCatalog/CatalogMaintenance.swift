import AcquiringCore
import Foundation

public struct DefaultCatalogMaintenanceService: CatalogMaintenanceService, Sendable {
    private let coordinator: CatalogCoordinator
    private let configuration: CatalogConfiguration
    private let session: URLSession
    private let fetchArchive: CatalogArchiveFetch

    public init(
        coordinator: CatalogCoordinator,
        configuration: CatalogConfiguration,
        session: URLSession = .shared
    ) {
        self.init(
            coordinator: coordinator,
            configuration: configuration,
            session: session,
            fetchArchive: { url in try await session.download(from: url) }
        )
    }

    init(
        coordinator: CatalogCoordinator,
        configuration: CatalogConfiguration,
        session: URLSession = .shared,
        fetchArchive: @escaping CatalogArchiveFetch
    ) {
        self.coordinator = coordinator
        self.configuration = configuration
        self.session = session
        self.fetchArchive = fetchArchive
    }

    public func downloadAndInstall() -> AsyncThrowingStream<CatalogProgress, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                let fileManager = FileManager.default
                // Staging paths are unique per operation. A cancelled run's
                // cleanup is therefore incapable of deleting a later run's
                // artifacts, however late that cleanup happens to land.
                let operationID = UUID().uuidString
                let archiveURL = CatalogArtifacts.archiveURL(
                    in: configuration.directoryURL,
                    filename: configuration.contract.archiveFilename,
                    operationID: operationID
                )
                let stagedURL = CatalogArtifacts.stagedURL(
                    in: configuration.directoryURL,
                    filename: configuration.contract.databaseFilename,
                    operationID: operationID
                )
                let fileSystem = LiveCatalogFileSystem()
                defer {
                    // Idempotent, owns only this operation's files, and reached
                    // on success, failure and cancellation alike.
                    try? fileManager.removeItem(at: archiveURL)
                    CatalogArtifacts.removeDatabase(at: stagedURL, using: fileSystem)
                }
                do {
                    try fileManager.createDirectory(at: configuration.directoryURL, withIntermediateDirectories: true)
                    continuation.yield(.connecting)
                    let (temporaryURL, response) = try await fetchArchive(configuration.downloadURL)
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
                    // The last point at which cancellation is honoured.
                    try Task.checkCancellation()

                    continuation.yield(.installing)
                    // Past this point the swap must run to completion. The
                    // commit is handed to an unstructured task, which does not
                    // inherit this task's cancellation, so cancelling the
                    // stream can no longer strand the catalog between states:
                    // it ends with the new catalog open or the old restored.
                    try await Task { try await coordinator.replaceLiveDatabase(with: stagedURL) }.value
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
}
