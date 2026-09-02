import Foundation
import GRDB

struct CatalogValidationResult: Equatable, Sendable {
    let songCount: Int
    let browseCount: Int
    let payloadCount: Int
}

enum CatalogCandidate {
    static func prepare(at url: URL) throws {
        let queue = try DatabaseQueue(path: url.path)
        try queue.write { db in
            try CatalogCoordinator.createSchema(in: db)
            try db.execute(sql: CatalogSchema.backfillSQL)
            try db.execute(sql: "DROP TABLE IF EXISTS room_master_table")
        }
    }

    static func validate(
        at url: URL,
        contract: CatalogContract,
        enforcesRowFloor: Bool = true
    ) throws -> CatalogValidationResult {
        let queue = try DatabaseQueue(path: url.path, configuration: Configuration(readonly: true))
        return try queue.read { db in
            let version = try Int.fetchOne(db, sql: "PRAGMA user_version") ?? 0
            guard version == contract.schemaVersion else {
                throw CatalogError.invalidSchema("expected version \(contract.schemaVersion), found \(version)")
            }

            let tableNames = Set(try String.fetchAll(
                db,
                sql: "SELECT name FROM sqlite_master WHERE type = 'table'"
            ))
            for (table, requiredColumns) in contract.requiredTables {
                guard tableNames.contains(table) else {
                    throw CatalogError.invalidSchema("missing table \(table)")
                }
                let escapedTable = table.replacingOccurrences(of: "\"", with: "\"\"")
                let rows = try Row.fetchAll(db, sql: "PRAGMA table_info(\"\(escapedTable)\")")
                let columns = Set(rows.compactMap { row -> String? in row["name"] })
                let missing = Set(requiredColumns).subtracting(columns).sorted()
                guard missing.isEmpty else {
                    throw CatalogError.invalidSchema("\(table) is missing \(missing.joined(separator: ", "))")
                }
            }

            let indexNames = Set(try String.fetchAll(
                db,
                sql: "SELECT name FROM sqlite_master WHERE type = 'index'"
            ))
            let missingIndexes = Set(contract.requiredIndexes).subtracting(indexNames).sorted()
            guard missingIndexes.isEmpty else {
                throw CatalogError.invalidSchema("missing indexes \(missingIndexes.joined(separator: ", "))")
            }

            let quickCheck = try String.fetchOne(db, sql: "PRAGMA quick_check") ?? "no result"
            guard quickCheck == "ok" else { throw CatalogError.integrity(quickCheck) }

            let songs = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM songs") ?? 0
            let browse = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM song_browse_entries") ?? 0
            let payloads = try Int.fetchOne(
                db,
                sql: """
                    SELECT COUNT(*) FROM song_browse_entries entries
                    INNER JOIN songs ON songs.slug = entries.slug
                    WHERE songs.dataBlob IS NOT NULL
                    """
            ) ?? 0
            if payloads != browse || (enforcesRowFloor && (songs < contract.minimumBrowseRows || browse < contract.minimumBrowseRows)) {
                throw CatalogError.incomplete(browseRows: browse, payloadRows: payloads)
            }
            return CatalogValidationResult(songCount: songs, browseCount: browse, payloadCount: payloads)
        }
    }
}

private extension Configuration {
    init(readonly: Bool) {
        self.init()
        self.readonly = readonly
    }
}
