import AcquiringCore
import Foundation
import GRDB

public actor CatalogCoordinator: CatalogRepository {
    public let configuration: CatalogConfiguration
    private var databasePool: DatabasePool?

    public init(configuration: CatalogConfiguration) {
        self.configuration = configuration
    }

    public var databaseURL: URL {
        configuration.directoryURL.appending(path: configuration.contract.databaseFilename)
    }

    public func prepare() throws {
        try FileManager.default.createDirectory(at: configuration.directoryURL, withIntermediateDirectories: true)
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        var directory = configuration.directoryURL
        try? directory.setResourceValues(resourceValues)
        if !FileManager.default.fileExists(atPath: databaseURL.path) {
            let queue = try DatabaseQueue(path: databaseURL.path)
            try queue.write { db in try Self.createSchema(in: db) }
        }
        databasePool = try Self.openPool(at: databaseURL)
    }

    public func status() throws -> CatalogStatus {
        let count = try songCount()
        return count == 0 ? .unavailable : .ready(songCount: count)
    }

    public func songCount() throws -> Int {
        try read { db in try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM songs") ?? 0 }
    }

    public func song(id: String) throws -> CatalogSong? {
        try read { db in
            try Row.fetchOne(db, sql: "SELECT slug, artist, title, url, status FROM songs WHERE slug = ?", arguments: [id]).map(Self.song(from:))
        }
    }

    public func songDocument(id: String) throws -> SongDocument {
        try read { db in
            guard let row = try Row.fetchOne(db, sql: "SELECT slug, artist, title, url, status, dataBlob FROM songs WHERE slug = ?", arguments: [id]) else {
                throw CatalogError.missingSong(id)
            }
            guard let payload: Data = row["dataBlob"] else { throw CatalogError.invalidPayload("song has no chord payload") }
            return try SongDocument(song: Self.song(from: row), sections: SongPayloadDecoder.decode(payload))
        }
    }

    public func searchSongs(title query: String) throws -> [CatalogSong] {
        try rows(
            sql: """
                SELECT slug, artist, title, url, status FROM songs
                WHERE dataBlob IS NOT NULL
                  AND REPLACE(title, '-', ' ') LIKE '%' || REPLACE(?, '-', ' ') || '%'
                ORDER BY CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
                         title COLLATE NOCASE, artist COLLATE NOCASE, slug COLLATE NOCASE
                """,
            arguments: [query]
        )
    }

    public func songSuggestions(query: String, limit: Int = 20, offset: Int = 0) throws -> [CatalogSong] {
        try rows(
            sql: """
                SELECT slug, artist, title, url, status FROM songs
                WHERE dataBlob IS NOT NULL AND (
                    REPLACE(title, '-', ' ') LIKE '%' || REPLACE(?, '-', ' ') || '%'
                    OR REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(?, '-', ' ') || '%'
                )
                ORDER BY CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
                         title COLLATE NOCASE, artist COLLATE NOCASE, slug COLLATE NOCASE
                LIMIT ? OFFSET ?
                """,
            arguments: [query, query, limit, offset]
        )
    }

    public func artistSuggestions(query: String, limit: Int = 20, offset: Int = 0) throws -> [String] {
        try read { db in
            try String.fetchAll(
                db,
                sql: """
                    SELECT DISTINCT REPLACE(artist, '-', ' ') FROM songs
                    WHERE dataBlob IS NOT NULL AND artist IS NOT NULL
                      AND REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(?, '-', ' ') || '%'
                    LIMIT ? OFFSET ?
                    """,
                arguments: [query, limit, offset]
            )
        }
    }

    public func songs(artist: String) throws -> [CatalogSong] {
        try rows(
            sql: """
                SELECT slug, artist, title, url, status FROM songs
                WHERE dataBlob IS NOT NULL AND REPLACE(artist, '-', ' ') = REPLACE(?, '-', ' ')
                ORDER BY CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
                         title COLLATE NOCASE, slug COLLATE NOCASE
                """,
            arguments: [artist]
        )
    }

    public func songs(ids: [String]) throws -> [CatalogSong] {
        guard !ids.isEmpty else { return [] }
        let found: [CatalogSong] = try read { db in
            let placeholders = Array(repeating: "?", count: ids.count).joined(separator: ",")
            return try Row.fetchAll(
                db,
                sql: "SELECT slug, artist, title, url, status FROM songs WHERE slug IN (\(placeholders))",
                arguments: StatementArguments(ids)
            ).map(Self.song(from:))
        }
        let byID = Dictionary(uniqueKeysWithValues: found.map { ($0.id, $0) })
        return ids.compactMap { byID[$0] }
    }

    public func browseMetadata() throws -> BrowseMetadataStatus {
        try read { db in
            let row = try Row.fetchOne(db, sql: """
                SELECT (SELECT COUNT(*) FROM song_browse_entries) AS browseCount,
                       (SELECT COUNT(*) FROM song_browse_entries WHERE complexityRating IS NOT NULL) AS ratedSongCount,
                       (SELECT COUNT(*) FROM song_browse_modes) AS modeMembershipCount
                """)!
            return BrowseMetadataStatus(
                browseCount: row["browseCount"],
                ratedSongCount: row["ratedSongCount"],
                modeMembershipCount: row["modeMembershipCount"]
            )
        }
    }

    public func browseCounts(mode: BrowseMode, filter: String = "") throws -> [BrowseGroupCount] {
        let filterSQL = Self.browseFilterSQL
        let sql: String
        switch mode {
        case .alphabetical:
            sql = "SELECT entries.alphaGroup AS groupKey, COUNT(*) AS songCount FROM song_browse_entries entries WHERE \(filterSQL) GROUP BY entries.alphaGroup"
        case .complexity:
            sql = "SELECT COALESCE(CAST(entries.complexityBucket AS TEXT), 'unrated') AS groupKey, COUNT(*) AS songCount FROM song_browse_entries entries WHERE \(filterSQL) GROUP BY entries.complexityBucket"
        case .mode:
            sql = "SELECT modes.mode AS groupKey, COUNT(*) AS songCount FROM song_browse_modes modes INNER JOIN song_browse_entries entries ON entries.slug = modes.slug WHERE \(filterSQL) GROUP BY modes.mode"
        }
        return try read { db in
            try Row.fetchAll(db, sql: sql, arguments: [filter, filter, filter]).map {
                BrowseGroupCount(key: $0["groupKey"], count: $0["songCount"])
            }
        }
    }

    public func browseSongs(group: BrowseGroup, filter: String = "") throws -> [CatalogSong] {
        let filterSQL = Self.browseFilterSQL
        let sql: String
        let arguments: StatementArguments
        switch group {
        case let .alphabetical(key):
            sql = "SELECT entries.slug, entries.artist, entries.title, songs.url, songs.status FROM song_browse_entries entries JOIN songs ON songs.slug = entries.slug WHERE entries.alphaGroup = ? AND \(filterSQL) " + Self.browseOrderSQL
            arguments = [key, filter, filter, filter]
        case let .complexity(bucket):
            if let bucket {
                sql = "SELECT entries.slug, entries.artist, entries.title, songs.url, songs.status FROM song_browse_entries entries JOIN songs ON songs.slug = entries.slug WHERE entries.complexityBucket = ? AND \(filterSQL) " + Self.browseOrderSQL
                arguments = [bucket, filter, filter, filter]
            } else {
                sql = "SELECT entries.slug, entries.artist, entries.title, songs.url, songs.status FROM song_browse_entries entries JOIN songs ON songs.slug = entries.slug WHERE entries.complexityBucket IS NULL AND \(filterSQL) " + Self.browseOrderSQL
                arguments = [filter, filter, filter]
            }
        case let .mode(mode):
            sql = "SELECT entries.slug, entries.artist, entries.title, songs.url, songs.status FROM song_browse_entries entries JOIN song_browse_modes modes ON modes.slug = entries.slug JOIN songs ON songs.slug = entries.slug WHERE modes.mode = ? AND \(filterSQL) " + Self.browseOrderSQL
            arguments = [mode, filter, filter, filter]
        }
        return try rows(sql: sql, arguments: arguments)
    }

    public func writeHarvested(
        song: CatalogSong,
        payload: Data,
        alphaGroup: String,
        modes: Set<String>
    ) throws {
        guard let pool = databasePool else { throw CatalogError.install("catalog is not prepared") }
        try pool.write { db in
            try db.execute(
                sql: "INSERT OR REPLACE INTO songs (slug, artist, title, url, status, dataBlob) VALUES (?, ?, ?, ?, ?, ?)",
                arguments: [song.id, song.artist, song.title, song.url?.absoluteString ?? "", song.status, payload]
            )
            try db.execute(
                sql: """
                    INSERT OR REPLACE INTO song_browse_entries
                        (slug, artist, title, alphaGroup, complexityRating, complexityBucket)
                    VALUES (?, ?, ?, ?,
                        (SELECT complexityRating FROM song_browse_entries WHERE slug = ?),
                        (SELECT complexityBucket FROM song_browse_entries WHERE slug = ?))
                    """,
                arguments: [song.id, song.artist, song.title, alphaGroup, song.id, song.id]
            )
            try db.execute(sql: "DELETE FROM song_browse_modes WHERE slug = ?", arguments: [song.id])
            for mode in modes {
                try db.execute(sql: "INSERT OR IGNORE INTO song_browse_modes (slug, mode) VALUES (?, ?)", arguments: [song.id, mode])
            }
        }
    }

    public func replaceLiveDatabase(with stagedURL: URL) throws {
        try databasePool?.close()
        databasePool = nil
        let fileManager = FileManager.default
        let backupURL = databaseURL.appendingPathExtension("backup")
        try? fileManager.removeItem(at: backupURL)
        do {
            if fileManager.fileExists(atPath: databaseURL.path) {
                try fileManager.moveItem(at: databaseURL, to: backupURL)
            }
            try fileManager.moveItem(at: stagedURL, to: databaseURL)
            try? fileManager.removeItem(at: backupURL)
            databasePool = try Self.openPool(at: databaseURL)
        } catch {
            try? fileManager.removeItem(at: databaseURL)
            if fileManager.fileExists(atPath: backupURL.path) {
                try? fileManager.moveItem(at: backupURL, to: databaseURL)
            }
            databasePool = try? Self.openPool(at: databaseURL)
            throw CatalogError.install(error.localizedDescription)
        }
    }

    private func read<T>(_ body: (Database) throws -> T) throws -> T {
        guard let databasePool else { throw CatalogError.install("catalog is not prepared") }
        return try databasePool.read(body)
    }

    private func rows(sql: String, arguments: StatementArguments = []) throws -> [CatalogSong] {
        try read { db in try Row.fetchAll(db, sql: sql, arguments: arguments).map(Self.song(from:)) }
    }

    private static func openPool(at url: URL) throws -> DatabasePool {
        var configuration = Configuration()
        configuration.label = "AcquiringCatalog"
        configuration.prepareDatabase { db in try db.execute(sql: "PRAGMA foreign_keys = ON") }
        return try DatabasePool(path: url.path, configuration: configuration)
    }

    static func createSchema(in db: Database) throws {
        try db.execute(sql: CatalogSchema.createSQL)
    }

    private static func song(from row: Row) -> CatalogSong {
        CatalogSong(
            id: row["slug"],
            artist: row["artist"],
            title: row["title"],
            url: (row["url"] as String?).flatMap(URL.init(string:)),
            status: row["status"] ?? "ready"
        )
    }

    private static let browseFilterSQL = """
        (TRIM(?) = '' OR
         INSTR(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(entries.title, '')), ' ', ''), '-', ''), '_', ''), REPLACE(REPLACE(REPLACE(LOWER(TRIM(?)), ' ', ''), '-', ''), '_', '')) > 0 OR
         INSTR(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(entries.artist, '')), ' ', ''), '-', ''), '_', ''), REPLACE(REPLACE(REPLACE(LOWER(TRIM(?)), ' ', ''), '-', ''), '_', '')) > 0)
        """

    private static let browseOrderSQL = """
        ORDER BY CASE WHEN entries.title IS NULL OR TRIM(entries.title) = '' THEN 1 ELSE 0 END,
                 entries.title COLLATE NOCASE, entries.artist COLLATE NOCASE, entries.slug COLLATE NOCASE
        """
}

enum CatalogSchema {
    static let createSQL = """
        PRAGMA user_version = 3;
        CREATE TABLE IF NOT EXISTS songs (
            slug TEXT NOT NULL PRIMARY KEY, artist TEXT, title TEXT,
            url TEXT NOT NULL, status TEXT NOT NULL, dataBlob BLOB
        );
        CREATE TABLE IF NOT EXISTS song_browse_entries (
            slug TEXT NOT NULL PRIMARY KEY, artist TEXT, title TEXT, alphaGroup TEXT NOT NULL,
            complexityRating REAL, complexityBucket INTEGER
        );
        CREATE TABLE IF NOT EXISTS song_browse_modes (
            slug TEXT NOT NULL, mode TEXT NOT NULL, PRIMARY KEY (slug, mode)
        );
        CREATE INDEX IF NOT EXISTS index_song_browse_entries_alphaGroup ON song_browse_entries (alphaGroup);
        CREATE INDEX IF NOT EXISTS index_song_browse_entries_complexityBucket ON song_browse_entries (complexityBucket);
        CREATE INDEX IF NOT EXISTS index_song_browse_modes_mode ON song_browse_modes (mode);
        """

    static let backfillSQL = """
        INSERT OR IGNORE INTO song_browse_entries
            (slug, artist, title, alphaGroup, complexityRating, complexityBucket)
        SELECT slug, artist, title,
            CASE
                WHEN UPPER(SUBSTR(TRIM(COALESCE(title, '')), 1, 1)) GLOB '[A-Z]' THEN UPPER(SUBSTR(TRIM(title), 1, 1))
                WHEN SUBSTR(TRIM(COALESCE(title, '')), 1, 1) GLOB '[0-9]' THEN SUBSTR(TRIM(title), 1, 1)
                ELSE '#'
            END,
            NULL, NULL
        FROM songs WHERE dataBlob IS NOT NULL;
        UPDATE song_browse_entries SET alphaGroup = CASE
            WHEN UPPER(SUBSTR(TRIM(COALESCE(title, '')), 1, 1)) GLOB '[A-Z]' THEN UPPER(SUBSTR(TRIM(title), 1, 1))
            WHEN SUBSTR(TRIM(COALESCE(title, '')), 1, 1) GLOB '[0-9]' THEN SUBSTR(TRIM(title), 1, 1)
            ELSE '#'
        END;
        PRAGMA user_version = 3;
        """
}
