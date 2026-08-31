import Foundation

struct CatalogSong: Identifiable, Equatable, Sendable {
    let id: String
    let artist: String?
    let title: String?
}

/// Read-only boundary for the replaceable SQLite catalog.
///
/// Implementations must validate `contracts/catalog/` before exposing a newly
/// downloaded database and must never store user-owned records in that file.
protocol CatalogRepository: Sendable {
    func songCount() async throws -> Int
    func song(id: String) async throws -> CatalogSong?
}

struct EmptyCatalogRepository: CatalogRepository {
    func songCount() async throws -> Int { 0 }
    func song(id: String) async throws -> CatalogSong? { nil }
}
