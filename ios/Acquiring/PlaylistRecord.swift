import Foundation
import SwiftData

@Model
final class PlaylistRecord {
    @Attribute(.unique) var id: String
    var name: String
    var isBuiltIn: Bool
    var createdAt: Date
    @Relationship(deleteRule: .cascade, inverse: \PlaylistEntryRecord.playlist)
    var entries: [PlaylistEntryRecord]

    init(
        id: String,
        name: String,
        isBuiltIn: Bool = false,
        createdAt: Date = .now,
        entries: [PlaylistEntryRecord] = []
    ) {
        self.id = id
        self.name = name
        self.isBuiltIn = isBuiltIn
        self.createdAt = createdAt
        self.entries = entries
    }
}

@Model
final class PlaylistEntryRecord {
    @Attribute(.unique) var uniqueKey: String
    var playlistID: String
    var slug: String
    var addedAt: Date
    var playlist: PlaylistRecord?

    init(
        playlistID: String,
        slug: String,
        addedAt: Date = .now,
        playlist: PlaylistRecord? = nil
    ) {
        uniqueKey = Self.key(playlistID: playlistID, slug: slug)
        self.playlistID = playlistID
        self.slug = slug
        self.addedAt = addedAt
        self.playlist = playlist
    }

    static func key(playlistID: String, slug: String) -> String {
        "\(playlistID)\u{001f}\(slug)"
    }
}
