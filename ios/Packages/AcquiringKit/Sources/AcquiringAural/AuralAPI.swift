import AcquiringCore
import Foundation

public enum AuralCatalogError: Error, LocalizedError, Equatable, Sendable {
    case unavailable
    case invalidManifest(String)
    case http(Int)
    case emptyResponse
    case invalidChecksum(String)
    case invalidSchema(String)
    case integrity(String)
    case decompression(String)
    case installation(String)
    case missingPattern(String)
    case missingSource(String)

    public var errorDescription: String? {
        switch self {
        case .unavailable: "Aural Quiz data is not installed."
        case let .invalidManifest(message): "The Aural Quiz manifest is invalid: \(message)"
        case let .http(code): "The Aural Quiz server returned HTTP \(code)."
        case .emptyResponse: "The Aural Quiz server returned an empty response."
        case let .invalidChecksum(name): "The downloaded \(name) file failed its checksum."
        case let .invalidSchema(message): "The Aural Quiz data is incompatible: \(message)"
        case let .integrity(message): "The Aural Quiz data failed its integrity check: \(message)"
        case let .decompression(message): "The Aural Quiz data could not be decompressed: \(message)"
        case let .installation(message): "The Aural Quiz data could not be installed: \(message)"
        case let .missingPattern(id): "Progression \(id) is no longer available."
        case let .missingSource(id): "The exact source passage \(id) is no longer available."
        }
    }
}

public struct AuralBundleConfiguration: Sendable {
    public static let schemaVersion = "aural-catalog-1"
    public static let requiredFilenames = [
        "aural-catalog.db",
        "aural-evidence.db",
        "aural-popularity.db"
    ]

    public let directoryURL: URL
    public let manifestURL: URL

    public init(directoryURL: URL, manifestURL: URL) {
        self.directoryURL = directoryURL
        self.manifestURL = manifestURL
    }

    public static func live(fileManager: FileManager = .default) throws -> Self {
        let support = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return Self(
            directoryURL: support.appending(path: "Acquiring/Aural", directoryHint: .isDirectory),
            manifestURL: URL(
                string: "https://github.com/briansgithub/acquiring/releases/download/v1.0.0-data/aural-catalog-manifest.json"
            )!
        )
    }

    public func fileURL(_ name: String) -> URL {
        directoryURL.appending(path: name)
    }
}

public struct AuralBundleManifest: Codable, Equatable, Sendable {
    public struct File: Codable, Equatable, Sendable {
        public let name: String
        public let url: URL
        public let checksum: String
    }

    public let schemaVersion: String
    public let snapshotId: String
    public let files: [File]

    public func validated() throws -> Self {
        guard schemaVersion == AuralBundleConfiguration.schemaVersion else {
            throw AuralCatalogError.invalidManifest("unsupported schema \(schemaVersion)")
        }
        guard snapshotId.count == 64, snapshotId.allSatisfy(\.isHexDigit) else {
            throw AuralCatalogError.invalidManifest("invalid snapshot identity")
        }
        guard Set(files.map(\.name)).count == files.count else {
            throw AuralCatalogError.invalidManifest("duplicate file entries")
        }
        let entries = Dictionary(uniqueKeysWithValues: files.map { ($0.name, $0) })
        guard Set(AuralBundleConfiguration.requiredFilenames).isSubset(of: entries.keys)
        else {
            throw AuralCatalogError.invalidManifest("the three-file bundle is incomplete")
        }
        for name in AuralBundleConfiguration.requiredFilenames {
            guard let entry = entries[name],
                  entry.url.scheme == "https",
                  entry.checksum.count == 64,
                  entry.checksum.allSatisfy(\.isHexDigit)
            else { throw AuralCatalogError.invalidManifest("invalid entry for \(name)") }
        }
        return self
    }
}

public enum AuralInstallProgress: Equatable, Sendable {
    case checking
    case downloading(name: String, index: Int, count: Int)
    case preparing(name: String)
    case validating
    case installing
    case ready(installed: Bool)

    public var message: String {
        switch self {
        case .checking: "Checking Aural Quiz data…"
        case let .downloading(name, index, count):
            "Downloading Aural Quiz data \(index) of \(count): \(name)…"
        case let .preparing(name): "Preparing \(name)…"
        case .validating: "Validating Aural Quiz data…"
        case .installing: "Installing Aural Quiz data…"
        case .ready: "Aural Quiz data is ready."
        }
    }
}

public struct AuralCatalogInfo: Equatable, Sendable {
    public let schemaVersion: String
    public let snapshotId: String
    public let normalizationVersion: String?
    public let sequenceCount: Int64
    public let songCount: Int
    public let sectionCount: Int
    public let scoredSongCount: Int
    public let popularitySongCount: Int
    public let popularitySnapshotId: String?
    public let provider: String?
    public let attribution: String?
    public let measuredAt: Date?
    public let scoringVersion: String?

    public var popularityCoverage: Double {
        guard popularitySongCount > 0 else { return 0 }
        return Double(scoredSongCount) / Double(popularitySongCount)
    }
}

public struct AuralCatalogQuery: Equatable, Sendable {
    public var view: String
    public var search: String
    public var minimumLength: Int
    public var maximumLength: Int?
    public var preferPopular: Bool
    public var keepVaried: Bool
    public var favorFavorites: Bool
    public var flatList: Bool
    public var favoriteSongIds: Set<String>
    public var recentSongIds: [String]

    public init(
        view: String = "harmony",
        search: String = "",
        minimumLength: Int = 2,
        maximumLength: Int? = nil,
        preferPopular: Bool = true,
        keepVaried: Bool = true,
        favorFavorites: Bool = false,
        flatList: Bool = false,
        favoriteSongIds: Set<String> = [],
        recentSongIds: [String] = []
    ) {
        self.view = view
        self.search = search
        self.minimumLength = max(2, minimumLength)
        self.maximumLength = maximumLength.map { max(2, $0) }
        self.preferPopular = preferPopular
        self.keepVaried = keepVaried
        self.favorFavorites = favorFavorites
        self.flatList = flatList
        self.favoriteSongIds = favoriteSongIds
        self.recentSongIds = recentSongIds
    }
}

public struct AuralCatalogRow: Identifiable, Hashable, Sendable {
    public let id: String
    public let view: String
    public let tokens: [String]
    public let labels: [String]
    public let start: Int
    public let end: Int
    public let snapshotId: String
    public let length: Int
    public let occurrenceCount: Int
    public let songCount: Int
    public let sectionCount: Int
    public let effectiveOccurrenceCount: Int
    public let score: Double
    public var outline: String
    public let mode: String?

    public init(
        id: String,
        view: String,
        tokens: [String],
        labels: [String],
        start: Int,
        end: Int,
        snapshotId: String,
        occurrenceCount: Int,
        songCount: Int,
        sectionCount: Int,
        effectiveOccurrenceCount: Int,
        score: Double,
        outline: String = "",
        mode: String? = nil
    ) {
        self.id = id
        self.view = view
        self.tokens = tokens
        self.labels = labels
        self.start = start
        self.end = end
        self.snapshotId = snapshotId
        length = tokens.count
        self.occurrenceCount = occurrenceCount
        self.songCount = songCount
        self.sectionCount = sectionCount
        self.effectiveOccurrenceCount = effectiveOccurrenceCount
        self.score = score
        self.outline = outline
        self.mode = mode
    }

    public var pattern: AuralPattern {
        AuralPattern(
            id: id,
            view: view,
            tokens: tokens,
            labels: labels,
            start: start,
            end: end,
            snapshotId: snapshotId
        )
    }
}

public struct AuralPatternSong: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let artist: String
    public let popularity: Double?
    public let confidence: Double
    public let providerURL: URL?
    public let measuredAt: Date?
}

public struct AuralCatalogPage: Equatable, Sendable {
    public let rows: [AuralCatalogRow]
    public let hasMore: Bool
    public let nextOffset: Int
}
