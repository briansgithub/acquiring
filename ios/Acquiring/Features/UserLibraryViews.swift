import AcquiringCore
import SwiftUI

struct FavoriteSongButton: View {
    let songID: String
    @Environment(UserLibraryViewModel.self) private var userContent: UserLibraryViewModel?

    var body: some View {
        if let userContent {
            let isFavorite = userContent.isFavorite(songID)
            Button {
                Task { await userContent.toggleFavorite(slug: songID) }
            } label: {
                Image(systemName: isFavorite ? "star.fill" : "star")
                    .foregroundStyle(isFavorite ? .yellow : .primary)
            }
            .disabled(userContent.isMembershipMutationPending())
            .accessibilityLabel(isFavorite ? "Remove from Favorites" : "Add to Favorites")
            .accessibilityValue(isFavorite ? "Favorite" : "Not favorite")
            .accessibilityHint(userContent.favoriteError ?? "Saves this song in Favorites")
            .accessibilityIdentifier("song.favorite")
            .alert(
                "Favorites",
                isPresented: Binding(
                    get: { userContent.favoriteError != nil },
                    set: { if !$0 { userContent.clearFavoriteError() } }
                )
            ) {
                Button("OK") { userContent.clearFavoriteError() }
            } message: {
                Text(userContent.favoriteError ?? "Unable to update Favorites.")
            }
        }
    }
}

/// Shared visual treatment for the primary Library disclosure controls.
struct LibrarySectionHeading: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.title3.weight(.medium))
                .foregroundStyle(Color.accentColor)
                .frame(width: 38, height: 38)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct LibrarySectionLabel: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let isExpanded: Bool
    var isLoading = false

    var body: some View {
        HStack(spacing: 12) {
            LibrarySectionHeading(title: title, subtitle: subtitle, systemImage: systemImage)
            Spacer(minLength: 4)
            if isLoading {
                ProgressView().controlSize(.small)
            }
            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.accentColor)
                .accessibilityHidden(true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .background(Color.accentColor.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.accentColor.opacity(0.25), lineWidth: 1)
        }
        .contentShape(Rectangle())
    }
}

struct PlaylistsSectionView: View {
    let store: LibraryStore
    @Environment(UserLibraryViewModel.self) private var userContent: UserLibraryViewModel?

    var body: some View {
        if let userContent {
            Group {
                Button {
                    userContent.isPlaylistsExpanded.toggle()
                } label: {
                    LibrarySectionLabel(
                        title: "Playlists",
                        subtitle: "Favorites and saved songs",
                        systemImage: "rectangle.stack",
                        isExpanded: userContent.isPlaylistsExpanded
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(userContent.isPlaylistsExpanded ? "Collapse Playlists" : "Expand Playlists")
                .accessibilityValue(userContent.isPlaylistsExpanded ? "Expanded" : "Collapsed")
                .accessibilityIdentifier("playlists.header")
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 8, trailing: 16))

                if userContent.isPlaylistsExpanded {
                    playlistContent(userContent)
                }
            }
            .task(id: store.catalogRevision) {
                await userContent.refresh(catalogRevision: store.catalogRevision)
            }
        }
    }

    @ViewBuilder
    private func playlistContent(_ userContent: UserLibraryViewModel) -> some View {
        switch userContent.playlistSummaries {
        case .idle, .loading:
            HStack {
                ProgressView()
                Text("Loading playlists…")
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("playlists.loading")
        case .empty:
            Text("No playlists yet.")
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("playlists.empty")
        case let .failure(message):
            VStack(alignment: .leading, spacing: 8) {
                Text("Unable to load playlists. \(message)")
                    .foregroundStyle(.red)
                Button("Try Again") {
                    Task { await userContent.refresh(catalogRevision: store.catalogRevision) }
                }
                .buttonStyle(.bordered)
            }
            .accessibilityIdentifier("playlists.failure")
        case let .content(summaries):
            ForEach(summaries) { summary in
                PlaylistAccordionRow(summary: summary, store: store, userContent: userContent)
            }
        }
    }
}

private struct PlaylistAccordionRow: View {
    let summary: PlaylistSummary
    let store: LibraryStore
    let userContent: UserLibraryViewModel

    private var isExpanded: Bool { userContent.expandedPlaylistID == summary.id }

    var body: some View {
        Button {
            Task { await userContent.selectPlaylist(summary.id) }
        } label: {
            HStack(spacing: 10) {
                Text(summary.name)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                Spacer()
                Text(summary.count.formatted())
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.secondary.opacity(0.08), in: Capsule())
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(.secondary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(.secondary.opacity(0.25), lineWidth: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isExpanded ? "Collapse \(summary.name)" : "Expand \(summary.name)")
        .accessibilityValue("\(summary.count) songs")
        .accessibilityIdentifier("playlist.\(summary.id)")
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 4, leading: 24, bottom: 4, trailing: 16))

        if isExpanded {
            PlaylistSongRows(
                playlistID: summary.id,
                playlistName: summary.name,
                store: store,
                userContent: userContent,
                storedCount: summary.count,
                maximumVisibleSongs: 5
            )
            NavigationLink(value: AppRoute.playlist(summary.id)) {
                Label("Open \(summary.name)", systemImage: "music.note.list")
            }
            .accessibilityIdentifier("playlist.open.\(summary.id)")
        }
    }
}

struct PlaylistSongsView: View {
    let playlistID: String
    let store: LibraryStore
    @Environment(UserLibraryViewModel.self) private var userContent: UserLibraryViewModel?

    var body: some View {
        Group {
            if let userContent {
                let summary = userContent.summary(for: playlistID)
                List {
                    Section {
                        if let summary {
                            LabeledContent("Songs", value: summary.count.formatted())
                        }
                        PlaylistSongRows(
                            playlistID: playlistID,
                            playlistName: summary?.name ?? "Playlist",
                            store: store,
                            userContent: userContent,
                            storedCount: summary?.count,
                            maximumVisibleSongs: nil
                        )
                    }
                }
                .listStyle(.plain)
                .task(id: playlistID) {
                    await userContent.loadPlaylist(playlistID)
                }
                .task(id: store.catalogRevision) {
                    await userContent.refresh(catalogRevision: store.catalogRevision)
                }
                .navigationTitle(summary?.name ?? "Playlist")
            } else {
                ContentUnavailableView("Playlist unavailable", systemImage: "music.note.list")
                    .navigationTitle("Playlist")
            }
        }
    }
}

private struct PlaylistSongRows: View {
    let playlistID: String
    let playlistName: String
    let store: LibraryStore
    let userContent: UserLibraryViewModel
    let storedCount: Int?
    let maximumVisibleSongs: Int?

    var body: some View {
        if let actionError = userContent.playlistError(for: playlistID) {
            HStack(alignment: .firstTextBaseline) {
                Text("Couldn’t remove song. \(actionError)")
                    .font(.footnote)
                    .foregroundStyle(.red)
                Spacer()
                Button("Dismiss") {
                    userContent.clearPlaylistError(playlistID)
                }
                .font(.footnote)
            }
            .accessibilityIdentifier("playlist.songs.removeFailure")
        }

        switch userContent.playlistState(for: playlistID) {
        case .idle, .loading:
            HStack {
                ProgressView()
                Text("Loading songs…")
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("playlist.songs.loading")
        case .empty:
            Text(emptyDescription)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("playlist.songs.empty")
        case let .failure(message):
            VStack(alignment: .leading, spacing: 8) {
                Text("Unable to load this playlist. \(message)")
                    .foregroundStyle(.red)
                Button("Try Again") {
                    Task { await userContent.loadPlaylist(playlistID) }
                }
                .buttonStyle(.bordered)
            }
            .accessibilityIdentifier("playlist.songs.failure")
        case let .content(songs):
            ForEach(visibleSongs(songs)) { song in
                SongRow(song: song) { store.openSong(song) }
                    .disabled(userContent.isMembershipMutationInFlight)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            Task { await userContent.remove(slug: song.id, from: playlistID) }
                        } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                    .accessibilityAction(named: "Remove \(song.displayTitle) from \(playlistName)") {
                        Task { await userContent.remove(slug: song.id, from: playlistID) }
                    }
                    .accessibilityIdentifier("playlist.song.\(song.id)")
            }
            if let maximumVisibleSongs, songs.count > maximumVisibleSongs {
                Text("Showing the newest \(maximumVisibleSongs) songs.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var emptyDescription: String {
        if let storedCount, storedCount > 0 {
            "The songs in this playlist aren’t in the current catalog. They’ll reappear if a future catalog contains them."
        } else {
            "No songs yet. Tap the star on a song to add it to Favorites."
        }
    }

    private func visibleSongs(_ songs: [CatalogSong]) -> [CatalogSong] {
        guard let maximumVisibleSongs else { return songs }
        return Array(songs.prefix(maximumVisibleSongs))
    }
}
