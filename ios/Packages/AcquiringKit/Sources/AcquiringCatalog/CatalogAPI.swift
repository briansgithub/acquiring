import AcquiringCore
import Foundation

public enum CatalogStatus: Equatable, Sendable {
    case unavailable
    case ready(songCount: Int)
    case updating(CatalogProgress)
    case failed(String)
}

public enum CatalogProgress: Equatable, Sendable {
    case connecting
    case downloading(fraction: Double?)
    case preparing
    case validating
    case installing
    case harvesting(current: Int, total: Int)
    case completed(songCount: Int)

    public var message: String {
        switch self {
        case .connecting: "Connecting…"
        case let .downloading(fraction): fraction.map { "Downloading catalog: \(Int($0 * 100))%" } ?? "Downloading catalog…"
        case .preparing: "Preparing catalog update…"
        case .validating: "Validating catalog…"
        case .installing: "Installing catalog…"
        case let .harvesting(current, total): "Fetching section \(current)/\(total)…"
        case let .completed(songCount): "\(songCount.formatted()) songs ready"
        }
    }
}

public enum BrowseGroup: Equatable, Sendable {
    case alphabetical(String)
    case complexity(Int?)
    case mode(String)
}

public struct CatalogContract: Codable, Equatable, Sendable {
    public let name: String
    public let schemaVersion: Int
    public let databaseFilename: String
    public let archiveFilename: String
    public let compression: String
    public let minimumBrowseRows: Int
    public let requiredTables: [String: [String]]
    public let requiredIndexes: [String]

    public init(
        name: String,
        schemaVersion: Int,
        databaseFilename: String,
        archiveFilename: String,
        compression: String,
        minimumBrowseRows: Int,
        requiredTables: [String: [String]],
        requiredIndexes: [String]
    ) {
        self.name = name
        self.schemaVersion = schemaVersion
        self.databaseFilename = databaseFilename
        self.archiveFilename = archiveFilename
        self.compression = compression
        self.minimumBrowseRows = minimumBrowseRows
        self.requiredTables = requiredTables
        self.requiredIndexes = requiredIndexes
    }

    public static let mobileV3 = CatalogContract(
        name: "acquiring-catalog",
        schemaVersion: 3,
        databaseFilename: "catalog.db",
        archiveFilename: "catalog.db.gz",
        compression: "gzip",
        minimumBrowseRows: 40_609,
        requiredTables: [
            "songs": ["slug", "artist", "title", "url", "status", "dataBlob"],
            "song_browse_entries": ["slug", "artist", "title", "alphaGroup", "complexityRating", "complexityBucket"],
            "song_browse_modes": ["slug", "mode"]
        ],
        requiredIndexes: [
            "index_song_browse_entries_alphaGroup",
            "index_song_browse_entries_complexityBucket",
            "index_song_browse_modes_mode"
        ]
    )

    public static func load(from url: URL) throws -> CatalogContract {
        do {
            return try JSONDecoder().decode(CatalogContract.self, from: Data(contentsOf: url))
        } catch {
            throw CatalogError.invalidSchema("contract.json could not be decoded: \(error.localizedDescription)")
        }
    }
}

public struct CatalogConfiguration: Sendable {
    public let directoryURL: URL
    public let downloadURL: URL
    public let contract: CatalogContract

    public init(directoryURL: URL, downloadURL: URL, contract: CatalogContract = .mobileV3) {
        self.directoryURL = directoryURL
        self.downloadURL = downloadURL
        self.contract = contract
    }

    public static func live(
        fileManager: FileManager = .default,
        contract: CatalogContract = .mobileV3
    ) throws -> CatalogConfiguration {
        let applicationSupport = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return CatalogConfiguration(
            directoryURL: applicationSupport.appending(path: "Acquiring/Catalog", directoryHint: .isDirectory),
            downloadURL: URL(string: "https://github.com/briansgithub/acquiring/releases/download/v1.0.0-data/catalog.db.gz")!,
            contract: contract
        )
    }
}

public enum CatalogError: Error, LocalizedError, Equatable, Sendable {
    case invalidURL
    case http(Int)
    case emptyResponse
    case decompression(String)
    case invalidSchema(String)
    case integrity(String)
    case incomplete(browseRows: Int, payloadRows: Int)
    case missingSong(String)
    case invalidPayload(String)
    case install(String)
    case harvest(String)

    public var errorDescription: String? {
        switch self {
        case .invalidURL: "Enter a valid Hooktheory TheoryTab URL."
        case let .http(code): "The server returned HTTP \(code)."
        case .emptyResponse: "The server returned an empty response."
        case let .decompression(message): "The catalog could not be decompressed: \(message)"
        case let .invalidSchema(message): "The catalog schema is invalid: \(message)"
        case let .integrity(message): "The catalog failed its integrity check: \(message)"
        case let .incomplete(browse, payload): "The catalog is incomplete (\(browse) browse rows, \(payload) with chords)."
        case let .missingSong(slug): "Song \(slug) is not available."
        case let .invalidPayload(message): "The song payload is invalid: \(message)"
        case let .install(message): "The catalog could not be installed: \(message)"
        case let .harvest(message): "The song could not be harvested: \(message)"
        }
    }
}

public protocol CatalogRepository: Sendable {
    func status() async throws -> CatalogStatus
    func songCount() async throws -> Int
    func song(id: String) async throws -> CatalogSong?
    func songDocument(id: String) async throws -> SongDocument
    func searchSongs(title query: String) async throws -> [CatalogSong]
    func songSuggestions(query: String, limit: Int, offset: Int) async throws -> [CatalogSong]
    func artistSuggestions(query: String, limit: Int, offset: Int) async throws -> [String]
    func songs(artist: String) async throws -> [CatalogSong]
    func songs(ids: [String]) async throws -> [CatalogSong]
    func browseMetadata() async throws -> BrowseMetadataStatus
    func browseCounts(mode: BrowseMode, filter: String) async throws -> [BrowseGroupCount]
    func browseSongs(group: BrowseGroup, filter: String) async throws -> [CatalogSong]
}

public protocol CatalogMaintenanceService: Sendable {
    func downloadAndInstall() -> AsyncThrowingStream<CatalogProgress, any Error>
    func harvest(url: URL) -> AsyncThrowingStream<CatalogProgress, any Error>
}
