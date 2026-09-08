import AcquiringCore
import Foundation
import GRDB

/// One manually harvested song, held in full so it can be rebuilt into a fresh
/// catalog without contacting Hooktheory again.
public struct HarvestLedgerEntry: Sendable, Equatable {
    public let slug: String
    public let artist: String?
    public let title: String?
    public let url: String
    public let status: String
    public let payload: Data
    public let alphaGroup: String
    public let modes: Set<String>

    public init(
        slug: String,
        artist: String?,
        title: String?,
        url: String,
        status: String,
        payload: Data,
        alphaGroup: String,
        modes: Set<String>
    ) {
        self.slug = slug
        self.artist = artist
        self.title = title
        self.url = url
        self.status = status
        self.payload = payload
        self.alphaGroup = alphaGroup
        self.modes = modes
    }
}

/// User-owned record of every manually harvested song.
///
/// A catalog install replaces `catalog.db` as a whole file
/// (`CatalogCoordinator.replaceLiveDatabase(with:)`), so a harvested row written
/// only into the catalog is destroyed by the next download. This ledger lives in
/// its own file in its own directory — deliberately *outside*
/// `CatalogConfiguration.directoryURL`, which the install writes into and
/// `prepare()` sweeps — and is replayed into the catalog after each swap.
///
/// Unlike the catalog directory this one is not excluded from backup: a harvest
/// cannot be re-downloaded.
public final class HarvestLedger: Sendable {
    private let queue: DatabaseQueue

    public let directoryURL: URL

    public init(directoryURL: URL, fileManager: FileManager = .default) throws {
        self.directoryURL = directoryURL
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        var configuration = Configuration()
        configuration.label = "AcquiringHarvestLedger"
        queue = try DatabaseQueue(
            path: directoryURL.appending(path: "harvests.db").path,
            configuration: configuration
        )
        try queue.write { db in try db.execute(sql: Self.createSQL) }
    }

    /// Records a manual harvest. Re-harvesting the same slug replaces the entry,
    /// matching `CatalogCoordinator.writeHarvested(...)`.
    public func record(
        slug: String,
        artist: String?,
        title: String?,
        url: String,
        status: String,
        payload: Data,
        alphaGroup: String,
        modes: Set<String>
    ) throws {
        try queue.write { db in
            try Self.write(
                HarvestLedgerEntry(
                    slug: slug,
                    artist: artist,
                    title: title,
                    url: url,
                    status: status,
                    payload: payload,
                    alphaGroup: alphaGroup,
                    modes: modes
                ),
                replacingExisting: true,
                in: db
            )
        }
    }

    /// Takes ownership of songs harvested before the ledger existed. Never
    /// displaces an entry the user's own harvest already wrote.
    public func adopt(_ entries: [HarvestLedgerEntry]) throws {
        guard !entries.isEmpty else { return }
        try queue.write { db in
            for entry in entries {
                try Self.write(entry, replacingExisting: false, in: db)
            }
        }
    }

    public func entries() throws -> [HarvestLedgerEntry] {
        try queue.read { db in
            try Row.fetchAll(db, sql: """
                SELECT slug, artist, title, url, status, dataBlob, alphaGroup, modes
                FROM harvested_songs ORDER BY harvestedAt
                """).map(Self.entry(from:))
        }
    }

    public func isEmpty() throws -> Bool {
        try queue.read { db in try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM harvested_songs") ?? 0 } == 0
    }

    /// The legacy sweep is a one-time amnesty for harvests made before this
    /// ledger shipped. Running it on every install would permanently resurrect
    /// songs the catalog later prunes on purpose. The flag lives beside the rows
    /// it guards so the two cannot drift apart.
    public func hasAdoptedLegacyHarvests() throws -> Bool {
        try queue.read { db in
            try String.fetchOne(db, sql: "SELECT value FROM harvest_ledger_meta WHERE key = ?", arguments: [Self.legacyAdoptionKey]) != nil
        }
    }

    public func markLegacyHarvestsAdopted() throws {
        try queue.write { db in
            try db.execute(
                sql: "INSERT OR REPLACE INTO harvest_ledger_meta (key, value) VALUES (?, ?)",
                arguments: [Self.legacyAdoptionKey, ISO8601DateFormatter().string(from: Date())]
            )
        }
    }

    private static let legacyAdoptionKey = "legacyHarvestsAdopted"

    private static func write(_ entry: HarvestLedgerEntry, replacingExisting: Bool, in db: Database) throws {
        try db.execute(
            sql: """
                INSERT OR \(replacingExisting ? "REPLACE" : "IGNORE") INTO harvested_songs
                    (slug, artist, title, url, status, dataBlob, alphaGroup, modes, harvestedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
            arguments: [
                entry.slug, entry.artist, entry.title, entry.url, entry.status,
                entry.payload, entry.alphaGroup, encode(modes: entry.modes),
                Date().timeIntervalSince1970
            ]
        )
    }

    private static func entry(from row: Row) -> HarvestLedgerEntry {
        HarvestLedgerEntry(
            slug: row["slug"],
            artist: row["artist"],
            title: row["title"],
            url: row["url"],
            status: row["status"],
            payload: row["dataBlob"],
            alphaGroup: row["alphaGroup"],
            modes: decodeModes(row["modes"] ?? "")
        )
    }

    static func encode(modes: Set<String>) -> String {
        modes.sorted().joined(separator: "\n")
    }

    static func decodeModes(_ value: String) -> Set<String> {
        Set(value.split(separator: "\n").map(String.init))
    }

    private static let createSQL = """
        PRAGMA user_version = 1;
        CREATE TABLE IF NOT EXISTS harvested_songs (
            slug TEXT NOT NULL PRIMARY KEY, artist TEXT, title TEXT,
            url TEXT NOT NULL, status TEXT NOT NULL, dataBlob BLOB NOT NULL,
            alphaGroup TEXT NOT NULL, modes TEXT NOT NULL, harvestedAt REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS harvest_ledger_meta (
            key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL
        );
        """
}
