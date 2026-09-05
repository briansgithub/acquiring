import AcquiringCatalog
import AcquiringCore
import Foundation
import Observation

/// Shared, catalog-aware presentation state for the separately persisted user
/// library. Playlist entries intentionally store only slugs; catalog records
/// are resolved when they are displayed, so a catalog replacement never edits
/// user data just because a row is temporarily unavailable.
@MainActor
@Observable
final class UserLibraryViewModel {
    private let catalog: any CatalogRepository
    private let userLibrary: UserLibraryStore

    private(set) var favoriteSlugs: Set<String> = []
    private(set) var playlistSummaries: FeatureState<[PlaylistSummary]> = .idle
    private(set) var playlistSongs: [String: FeatureState<[CatalogSong]>] = [:]
    private(set) var favoriteError: String?
    private(set) var playlistErrors: [String: String] = [:]
    private(set) var isMembershipMutationInFlight = false
    var isPlaylistsExpanded = false
    var expandedPlaylistID: String?

    @ObservationIgnored private var refreshGeneration = 0
    @ObservationIgnored private var playlistLoadGenerations: [String: Int] = [:]
    @ObservationIgnored private var deferredCatalogRevision: Int?
    @ObservationIgnored private var currentCatalogRevision = 0

    init(catalog: any CatalogRepository, userLibrary: UserLibraryStore) {
        self.catalog = catalog
        self.userLibrary = userLibrary
    }

    func isFavorite(_ slug: String) -> Bool {
        favoriteSlugs.contains(slug)
    }

    func summary(for playlistID: String) -> PlaylistSummary? {
        guard case let .content(summaries) = playlistSummaries else { return nil }
        return summaries.first { $0.id == playlistID }
    }

    func playlistState(for playlistID: String) -> FeatureState<[CatalogSong]> {
        playlistSongs[playlistID] ?? .idle
    }

    func playlistError(for playlistID: String) -> String? {
        playlistErrors[playlistID]
    }

    func isMembershipMutationPending() -> Bool {
        isMembershipMutationInFlight
    }

    /// Re-reads durable user data after a catalog revision. The summaries keep
    /// their stored counts, while catalog resolution hides only unavailable
    /// rows. Calling this with the same revision is also safe for first view
    /// appearance and explicit retry.
    func refresh(catalogRevision: Int) async {
        currentCatalogRevision = catalogRevision
        guard !isMembershipMutationInFlight else {
            deferredCatalogRevision = catalogRevision
            return
        }
        refreshGeneration &+= 1
        let generation = refreshGeneration
        await refreshDurableState(generation: generation)
    }

    private func refreshDurableState(generation: Int) async {
        // These reads are synchronous on the main actor. Keep existing rows
        // mounted until their replacement is ready instead of publishing an
        // intermediate loading state on every Library appearance/refresh.
        do {
            _ = try userLibrary.ensureFavorites()
            let summaries = try userLibrary.summaries()
            let favorites = try userLibrary.newestSlugs(playlistID: UserLibraryStore.favoritesID)
            guard generation == refreshGeneration else { return }
            favoriteSlugs = Set(favorites)
            playlistSummaries = summaries.isEmpty ? .empty : .content(summaries)
        } catch {
            guard generation == refreshGeneration else { return }
            playlistSummaries = .failure(error.localizedDescription)
        }

        var playlistIDs = Set(playlistSongs.keys)
        if let expandedPlaylistID {
            playlistIDs.insert(expandedPlaylistID)
        }
        for playlistID in playlistIDs {
            await loadPlaylist(playlistID)
        }
    }

    /// Updates the visible star immediately, then commits its unique durable
    /// entry. A failed save restores the prior membership and count.
    func toggleFavorite(slug: String) async {
        guard !slug.isEmpty else { return }
        let playlistID = UserLibraryStore.favoritesID
        guard beginMembershipMutation() else { return }
        let playlistLoadGeneration = invalidatePlaylistLoad(playlistID)
        let wasFavorite = favoriteSlugs.contains(slug)
        favoriteSlugs = wasFavorite ? favoriteSlugs.subtracting([slug]) : favoriteSlugs.union([slug])
        adjustSummaryCount(playlistID: playlistID, by: wasFavorite ? -1 : 1)
        favoriteError = nil

        // Yield once so the optimistic state is observable before the storage
        // transaction (which is intentionally synchronous on the main actor).
        await Task.yield()
        do {
            let isFavorite = try userLibrary.toggle(slug: slug, playlistID: playlistID)
            if isFavorite {
                favoriteSlugs.insert(slug)
            } else {
                favoriteSlugs.remove(slug)
            }
            reconcileFavoriteSummary(after: wasFavorite, isFavorite: isFavorite)
            await synchronizeFavoriteList(
                slug: slug,
                isFavorite: isFavorite,
                expectedGeneration: playlistLoadGeneration
            )
        } catch {
            if wasFavorite {
                favoriteSlugs.insert(slug)
            } else {
                favoriteSlugs.remove(slug)
            }
            adjustSummaryCount(playlistID: UserLibraryStore.favoritesID, by: wasFavorite ? 1 : -1)
            favoriteError = error.localizedDescription
        }
        finishMembershipMutation()
    }

    func clearFavoriteError() {
        favoriteError = nil
        playlistErrors[UserLibraryStore.favoritesID] = nil
    }

    func clearPlaylistError(_ playlistID: String) {
        playlistErrors[playlistID] = nil
    }

    func selectPlaylist(_ playlistID: String) async {
        if expandedPlaylistID == playlistID {
            expandedPlaylistID = nil
            return
        }
        expandedPlaylistID = playlistID
        await loadPlaylist(playlistID)
    }

    func loadPlaylist(_ playlistID: String) async {
        if isMembershipMutationInFlight {
            playlistSongs[playlistID] = .loading
            return
        }
        let generation = invalidatePlaylistLoad(playlistID)
        playlistSongs[playlistID] = .loading

        do {
            let slugs = try userLibrary.newestSlugs(playlistID: playlistID)
            let songs = try await catalog.songs(ids: slugs)
            guard generation == playlistLoadGenerations[playlistID] else { return }
            // `songs(ids:)` restores the input order. Missing catalog slugs are
            // deliberately absent here but remain in SwiftData for a later
            // catalog revision to resolve.
            playlistSongs[playlistID] = songs.isEmpty ? .empty : .content(songs)
        } catch is CancellationError {
            return
        } catch {
            guard generation == playlistLoadGenerations[playlistID] else { return }
            playlistSongs[playlistID] = .failure(error.localizedDescription)
        }
    }

    /// Removes an entry optimistically for both inline and destination lists.
    /// The previous list and stored membership count are restored on failure.
    func remove(slug: String, from playlistID: String) async {
        guard beginMembershipMutation() else { return }
        _ = invalidatePlaylistLoad(playlistID)
        let previousState = playlistSongs[playlistID]
        playlistErrors[playlistID] = nil
        if case let .content(songs)? = previousState {
            let remaining = songs.filter { $0.id != slug }
            playlistSongs[playlistID] = remaining.isEmpty ? .empty : .content(remaining)
        }
        adjustSummaryCount(playlistID: playlistID, by: -1)
        if playlistID == UserLibraryStore.favoritesID {
            favoriteSlugs.remove(slug)
        }

        await Task.yield()
        do {
            try userLibrary.remove(slug: slug, playlistID: playlistID)
        } catch {
            if let previousState {
                playlistSongs[playlistID] = previousState
            }
            adjustSummaryCount(playlistID: playlistID, by: 1)
            if playlistID == UserLibraryStore.favoritesID {
                favoriteSlugs.insert(slug)
                favoriteError = error.localizedDescription
            }
            playlistErrors[playlistID] = error.localizedDescription
        }
        finishMembershipMutation()
    }

    private func adjustSummaryCount(playlistID: String, by delta: Int) {
        guard case let .content(summaries) = playlistSummaries,
              let index = summaries.firstIndex(where: { $0.id == playlistID })
        else { return }
        let existing = summaries[index]
        let adjusted = PlaylistSummary(
            id: existing.id,
            name: existing.name,
            isBuiltIn: existing.isBuiltIn,
            count: max(0, existing.count + delta)
        )
        var updated = summaries
        updated[index] = adjusted
        playlistSummaries = .content(updated)
    }

    private func reconcileFavoriteSummary(after wasFavorite: Bool, isFavorite: Bool) {
        guard wasFavorite != isFavorite else { return }
        // The optimistic count already represents the result. This only fixes
        // an unexpected store result (for example, a recovered duplicate).
        let expectedDelta = (isFavorite ? 1 : 0) - (wasFavorite ? 1 : 0)
        let optimisticDelta = wasFavorite ? -1 : 1
        adjustSummaryCount(
            playlistID: UserLibraryStore.favoritesID,
            by: expectedDelta - optimisticDelta
        )
    }

    private func synchronizeFavoriteList(
        slug: String,
        isFavorite: Bool,
        expectedGeneration: Int
    ) async {
        let playlistID = UserLibraryStore.favoritesID
        guard expectedGeneration == playlistLoadGenerations[playlistID],
              case let .content(existing)? = playlistSongs[playlistID]
        else { return }

        if !isFavorite {
            let remaining = existing.filter { $0.id != slug }
            playlistSongs[playlistID] = remaining.isEmpty ? .empty : .content(remaining)
            return
        }

        do {
            guard let song = try await catalog.song(id: slug) else { return }
            guard expectedGeneration == playlistLoadGenerations[playlistID] else { return }
            playlistSongs[playlistID] = .content(
                [song] + existing.filter { $0.id != slug }
            )
        } catch {
            // The durable count remains correct. A later catalog refresh can
            // resolve this row without turning a successful favorite save into
            // a visible failure.
        }
    }

    private func invalidatePlaylistLoad(_ playlistID: String) -> Int {
        let next = (playlistLoadGenerations[playlistID] ?? 0) &+ 1
        playlistLoadGenerations[playlistID] = next
        return next
    }

    private func beginMembershipMutation() -> Bool {
        guard !isMembershipMutationInFlight else { return false }
        isMembershipMutationInFlight = true
        return true
    }

    private func finishMembershipMutation() {
        isMembershipMutationInFlight = false
        let revision = deferredCatalogRevision ?? currentCatalogRevision
        deferredCatalogRevision = nil
        Task { await refresh(catalogRevision: revision) }
    }
}
