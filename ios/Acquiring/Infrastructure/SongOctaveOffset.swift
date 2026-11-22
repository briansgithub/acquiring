import AcquiringCore
import Foundation
import SwiftData

@Model
final class SongOctaveOffsetRecord {
    @Attribute(.unique) var slug: String
    var offset: Int

    init(slug: String, offset: Int) {
        self.slug = slug
        self.offset = SingingOctaveOffset.clamped(offset)
    }
}

@MainActor
protocol SongOctaveOffsetStore {
    func offset(for slug: String) throws -> Int?
    func save(offset: Int, for slug: String) throws
}

/// Separate transactions keep a failed octave save from rolling back Favorites.
@MainActor
final class SwiftDataSongOctaveOffsetStore: SongOctaveOffsetStore {
    private let context: ModelContext

    init(container: ModelContainer) {
        context = ModelContext(container)
        context.autosaveEnabled = false
    }

    private func record(for slug: String) throws -> SongOctaveOffsetRecord? {
        var query = FetchDescriptor<SongOctaveOffsetRecord>(predicate: #Predicate { $0.slug == slug })
        query.fetchLimit = 1
        return try context.fetch(query).first
    }

    func offset(for slug: String) throws -> Int? {
        try record(for: slug).map { SingingOctaveOffset.clamped($0.offset) }
    }

    func save(offset: Int, for slug: String) throws {
        do {
            if let row = try record(for: slug) {
                row.offset = SingingOctaveOffset.clamped(offset)
            } else {
                context.insert(SongOctaveOffsetRecord(slug: slug, offset: offset))
            }
            try context.save()
        } catch {
            context.rollback()
            throw error
        }
    }
}
