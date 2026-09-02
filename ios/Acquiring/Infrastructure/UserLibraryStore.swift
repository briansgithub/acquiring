import Foundation
import SwiftData

struct PlaylistSummary: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let isBuiltIn: Bool
    let count: Int
}

@MainActor
final class UserLibraryStore {
    static let favoritesID = "favorites"
    private let context: ModelContext

    init(context: ModelContext) throws {
        self.context = context
        try ensureFavorites()
    }

    @discardableResult
    func ensureFavorites() throws -> PlaylistRecord {
        if let existing = try playlist(id: Self.favoritesID) { return existing }
        let favorites = PlaylistRecord(id: Self.favoritesID, name: "Favorites", isBuiltIn: true)
        context.insert(favorites)
        try context.save()
        return favorites
    }

    func contains(slug: String, playlistID: String = favoritesID) throws -> Bool {
        let key = PlaylistEntryRecord.key(playlistID: playlistID, slug: slug)
        var descriptor = FetchDescriptor<PlaylistEntryRecord>(predicate: #Predicate { $0.uniqueKey == key })
        descriptor.fetchLimit = 1
        return try !context.fetch(descriptor).isEmpty
    }

    @discardableResult
    func toggle(slug: String, playlistID: String = favoritesID) throws -> Bool {
        let key = PlaylistEntryRecord.key(playlistID: playlistID, slug: slug)
        var entryDescriptor = FetchDescriptor<PlaylistEntryRecord>(predicate: #Predicate { $0.uniqueKey == key })
        entryDescriptor.fetchLimit = 1
        do {
            if let entry = try context.fetch(entryDescriptor).first {
                context.delete(entry)
                try context.save()
                return false
            }
            guard let playlist = try playlist(id: playlistID) else {
                throw UserLibraryError.missingPlaylist(playlistID)
            }
            let entry = PlaylistEntryRecord(playlistID: playlistID, slug: slug, playlist: playlist)
            context.insert(entry)
            try context.save()
            return true
        } catch {
            context.rollback()
            throw error
        }
    }

    func summaries() throws -> [PlaylistSummary] {
        let playlists = try context.fetch(FetchDescriptor<PlaylistRecord>(sortBy: [SortDescriptor(\.createdAt)]))
        return playlists.map { playlist in
            PlaylistSummary(id: playlist.id, name: playlist.name, isBuiltIn: playlist.isBuiltIn, count: playlist.entries.count)
        }
    }

    func newestSlugs(playlistID: String) throws -> [String] {
        let descriptor = FetchDescriptor<PlaylistEntryRecord>(
            predicate: #Predicate { $0.playlistID == playlistID },
            sortBy: [SortDescriptor(\.addedAt, order: .reverse)]
        )
        return try context.fetch(descriptor).map(\.slug)
    }

    func remove(slug: String, playlistID: String) throws {
        guard try contains(slug: slug, playlistID: playlistID) else { return }
        _ = try toggle(slug: slug, playlistID: playlistID)
    }

    private func playlist(id: String) throws -> PlaylistRecord? {
        var descriptor = FetchDescriptor<PlaylistRecord>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return try context.fetch(descriptor).first
    }
}

enum UserLibraryError: Error, LocalizedError {
    case missingPlaylist(String)

    var errorDescription: String? {
        switch self {
        case let .missingPlaylist(id): "Playlist \(id) does not exist."
        }
    }
}
