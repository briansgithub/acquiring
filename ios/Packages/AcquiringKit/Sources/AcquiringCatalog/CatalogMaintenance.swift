import AcquiringCore
import Foundation

final class CatalogOperationCancellationController: @unchecked Sendable {
    typealias OperationID = UUID

    private enum Phase {
        case starting
        case cancellable
        case cancellationRequested
        case committing
        case finished
    }

    private struct Entry {
        var phase: Phase
        var task: Task<Void, Never>?
        var isAttached: Bool
    }

    private let lock = NSLock()
    private var entries: [OperationID: Entry] = [:]

    func reserve() -> OperationID {
        let id = OperationID()
        lock.lock()
        entries[id] = Entry(phase: .starting, task: nil, isAttached: false)
        lock.unlock()
        return id
    }

    func attach(_ task: Task<Void, Never>, to id: OperationID) {
        var shouldCancel = false
        lock.lock()
        if var entry = entries[id] {
            entry.isAttached = true
            entry.task = task
            switch entry.phase {
            case .starting:
                entry.phase = .cancellable
                entries[id] = entry
            case .cancellationRequested:
                entries[id] = entry
                shouldCancel = true
            case .committing:
                entry.task = nil
                entries[id] = entry
            case .finished:
                entries[id] = nil
            case .cancellable:
                entries[id] = entry
            }
        }
        lock.unlock()
        if shouldCancel { task.cancel() }
    }

    func beginCommit(_ id: OperationID) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard var entry = entries[id] else { return false }
        switch entry.phase {
        case .starting, .cancellable:
            entry.phase = .committing
            entry.task = nil
            entries[id] = entry
            return true
        case .committing:
            return true
        case .cancellationRequested, .finished:
            return false
        }
    }

    @discardableResult
    func finish(_ id: OperationID) -> Bool {
        lock.lock()
        guard var entry = entries[id] else {
            lock.unlock()
            return false
        }
        let cancellationWasRequested: Bool
        if case .cancellationRequested = entry.phase {
            cancellationWasRequested = true
        } else {
            cancellationWasRequested = false
        }
        if entry.isAttached {
            entries[id] = nil
        } else {
            entry.phase = .finished
            entry.task = nil
            entries[id] = entry
        }
        lock.unlock()
        return cancellationWasRequested
    }

    @discardableResult
    func requestCancellation(for id: OperationID) -> CatalogCancellationDisposition {
        var task: Task<Void, Never>?
        let disposition: CatalogCancellationDisposition
        lock.lock()
        if var entry = entries[id] {
            switch entry.phase {
            case .starting, .cancellable:
                entry.phase = .cancellationRequested
                task = entry.task
                entries[id] = entry
                disposition = .accepted
            case .cancellationRequested:
                disposition = .accepted
            case .committing:
                disposition = .commitInProgress
            case .finished:
                disposition = .noOperation
            }
        } else {
            disposition = .noOperation
        }
        lock.unlock()
        task?.cancel()
        return disposition
    }
}

private enum CatalogMaintenanceOutcome {
    case completed(songCount: Int)
    case cancelled
    case failed(any Error)
}

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

    public func downloadAndInstall() -> CatalogMaintenanceRun {
        let cancellationController = CatalogOperationCancellationController()
        let cancellationID = cancellationController.reserve()
        let events = AsyncThrowingStream<CatalogProgress, any Error> { continuation in
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
                let outcome: CatalogMaintenanceOutcome
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
                    try Task.checkCancellation()
                    guard cancellationController.beginCommit(cancellationID) else {
                        throw CancellationError()
                    }

                    continuation.yield(.installing)
                    // Past this point requestCancellation() reports
                    // commitInProgress instead of cancelling this producer.
                    try await coordinator.replaceLiveDatabase(with: stagedURL)
                    outcome = .completed(songCount: result.songCount)
                } catch is CancellationError {
                    outcome = .cancelled
                } catch {
                    outcome = Task.isCancelled ? .cancelled : .failed(error)
                }

                // Terminal delivery comes only after operation-owned artifacts
                // are gone and cancellation can no longer name this run.
                try? fileManager.removeItem(at: archiveURL)
                CatalogArtifacts.removeDatabase(at: stagedURL, using: fileSystem)
                let cancellationWon = cancellationController.finish(cancellationID)
                let terminalOutcome: CatalogMaintenanceOutcome = cancellationWon ? .cancelled : outcome

                switch terminalOutcome {
                case let .completed(songCount):
                    continuation.yield(.completed(songCount: songCount))
                    continuation.finish()
                case .cancelled:
                    continuation.finish()
                case let .failed(error):
                    continuation.finish(throwing: error)
                }
            }
            cancellationController.attach(task, to: cancellationID)
            continuation.onTermination = { _ in
                cancellationController.requestCancellation(for: cancellationID)
            }
        }
        return CatalogMaintenanceRun(events: events) {
            cancellationController.requestCancellation(for: cancellationID)
        }
    }

    public func harvest(url: URL) -> CatalogMaintenanceRun {
        let cancellationController = CatalogOperationCancellationController()
        let cancellationID = cancellationController.reserve()
        let events = AsyncThrowingStream<CatalogProgress, any Error> { continuation in
            let task = Task {
                let outcome: CatalogMaintenanceOutcome
                do {
                    continuation.yield(.connecting)
                    let harvested = try await HooktheoryHarvester(session: session).harvest(url: url) { current, total in
                        continuation.yield(.harvesting(current: current, total: total))
                    }
                    let payload = try JSONEncoder().encode(harvested.sections)
                    try Task.checkCancellation()
                    guard cancellationController.beginCommit(cancellationID) else {
                        throw CancellationError()
                    }
                    continuation.yield(.installing)
                    try await coordinator.writeHarvested(
                        song: harvested.song,
                        payload: payload,
                        alphaGroup: BrowseGrouping.alphabeticalGroup(for: harvested.song.title),
                        modes: Set(
                            BrowseGrouping.modes(inSections: harvested.sections.values)
                                .map(\.rawValue)
                        )
                    )
                    let count = try await coordinator.songCount()
                    outcome = .completed(songCount: count)
                } catch is CancellationError {
                    outcome = .cancelled
                } catch {
                    outcome = Task.isCancelled ? .cancelled : .failed(error)
                }

                let cancellationWon = cancellationController.finish(cancellationID)
                let terminalOutcome: CatalogMaintenanceOutcome = cancellationWon ? .cancelled : outcome
                switch terminalOutcome {
                case let .completed(songCount):
                    continuation.yield(.completed(songCount: songCount))
                    continuation.finish()
                case .cancelled:
                    continuation.finish()
                case let .failed(error):
                    continuation.finish(throwing: error)
                }
            }
            cancellationController.attach(task, to: cancellationID)
            continuation.onTermination = { _ in
                cancellationController.requestCancellation(for: cancellationID)
            }
        }
        return CatalogMaintenanceRun(events: events) {
            cancellationController.requestCancellation(for: cancellationID)
        }
    }

}
