import AcquiringCatalog
import AcquiringCore
import SwiftUI

struct LibraryScene: View {
    @State private var store: LibraryStore
    private let environment: AppEnvironment

    init(environment: AppEnvironment) {
        self.environment = environment
        _store = State(initialValue: LibraryStore(environment: environment))
    }

    var body: some View {
        @Bindable var store = store
        NavigationStack(path: $store.path) {
            LibraryView(store: store)
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case let .artist(name): ArtistSongsView(artist: name, store: store)
                    case .allSongs: AllSongsView(store: store)
                    case let .playlist(id): PlaylistSongsView(playlistID: id, store: store)
                    case let .songDetail(id): SongDetailView(songID: id)
                    case let .quiz(id): QuizView(songID: id)
                    }
                }
        }
        .task { await store.load() }
    }
}

private struct LibraryView: View {
    @Bindable var store: LibraryStore

    var body: some View {
        content
            .onAppear { Task { await store.refreshUserContent() } }
            .navigationTitle("Library")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Library")
                        .font(.headline)
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch store.catalogState {
        case .idle, .loading:
            LibraryLoadingView()
        case .empty where !store.downloadPromptDismissed:
            CatalogDownloadPromptView(store: store)
        case .empty:
            SearchCatalogView(store: store, catalogCount: nil)
        case let .content(count):
            SearchCatalogView(store: store, catalogCount: count)
        case let .failure(message):
            CatalogFailureView(message: message) {
                Task { await store.load() }
            }
        }
    }
}

private struct LibraryLoadingView: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Opening catalog…")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Opening catalog")
        .accessibilityIdentifier("catalog.status.loading")
    }
}

private struct CatalogFailureView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            ContentUnavailableView(
                "Unable to load catalog",
                systemImage: "exclamationmark.triangle",
                description: Text(message)
            )
            Button("Try Again", systemImage: "arrow.clockwise", action: retry)
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("catalog.retry")
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("catalog.status.failure")
    }
}

private struct CatalogReadyBanner: View {
    let count: Int

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .accessibilityHidden(true)
            Text("\(count.formatted()) songs ready")
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.green)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("catalog.status.ready")
    }
}

private struct CatalogEmptyBanner: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "arrow.down.circle")
                .accessibilityHidden(true)
            Text("No catalog installed")
                .accessibilityIdentifier("catalog.status.empty")
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The app's opening page when no catalog is installed yet. Downloading is
/// recommended but skippable via the close button, which reveals the search
/// screen underneath with an empty (or partial) catalog.
private struct CatalogDownloadPromptView: View {
    @Bindable var store: LibraryStore

    var body: some View {
        CatalogDownloadPromptContent {
            store.downloadPromptDismissed = true
        } downloadButton: {
            DownloadCatalogButton(store: store)
        }
    }
}

private struct CatalogDownloadPromptContent<DownloadButton: View>: View {
    let onDismiss: () -> Void
    @ViewBuilder let downloadButton: () -> DownloadButton

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 20) {
                Spacer()
                Image(systemName: "music.note.list")
                    .font(.system(size: 56))
                    .foregroundStyle(.secondary)
                Text("Acquiring")
                    .font(.largeTitle.bold())
                Text("Download the full song catalog to search, browse, and quiz yourself on every song. This is highly recommended.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 32)
                Spacer()
                Spacer()
                downloadButton()
                    .padding(.horizontal, 32)
                    .padding(.bottom, 40)
            }

            Button(action: onDismiss) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .padding()
            }
            .accessibilityLabel("Skip downloading the catalog for now")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("catalog.status.empty")
    }
}

private struct SearchCatalogView: View {
    @Bindable var store: LibraryStore
    let catalogCount: Int?

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if let catalogCount {
                    CatalogReadyBanner(count: catalogCount)
                } else {
                    CatalogEmptyBanner()
                }
            }
            .padding(.horizontal)
            .padding(.top)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField(
                    store.searchScope == .songs ? "Search songs" : "Search artists",
                    text: $store.query
                )
                .textFieldStyle(.plain)
                .accessibilityIdentifier("library.search.field")
                if !store.query.isEmpty {
                    Button {
                        store.query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("library.search.clear")
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(10)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal)
            .padding(.top)

            Picker("Search scope", selection: $store.searchScope) {
                ForEach(SearchScope.allCases) { scope in Text(scope.rawValue).tag(scope) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)

            List {
                searchResults
            }
            .listStyle(.plain)

            DownloadCatalogButton(store: store)
                .padding()
        }
    }

    @ViewBuilder
    private var searchResults: some View {
        switch store.searchScope {
        case .songs: songResults
        case .artists: artistResults
        }
    }

    @ViewBuilder
    private var songResults: some View {
        switch store.suggestions {
        case .idle:
            if store.recentSongs.isEmpty {
                idlePrompt
            } else {
                Section("Recent Songs") {
                    ForEach(store.recentSongs) { song in SongRow(song: song) { store.openSong(song) } }
                }
            }
        case .loading: ProgressView()
        case let .content(songs):
            ForEach(songs) { song in SongRow(song: song) { store.openSong(song) } }
            if store.hasMoreSongSuggestions {
                loadMoreRow
            }
        case .empty:
            Text("No matches").foregroundStyle(.secondary)
        case let .failure(message):
            Text(message).foregroundStyle(.red)
        }
    }

    private var loadMoreRow: some View {
        Button {
            store.loadMoreSuggestions()
        } label: {
            if store.isLoadingMoreSuggestions {
                ProgressView()
            } else {
                Text("Load more")
            }
        }
        .disabled(store.isLoadingMoreSuggestions)
        .accessibilityIdentifier("library.search.loadMore")
    }

    @ViewBuilder
    private var artistResults: some View {
        switch store.artistSuggestions {
        case .idle:
            if store.recentArtists.isEmpty {
                idlePrompt
            } else {
                Section("Recent Artists") {
                    ForEach(store.recentArtists, id: \.self) { artist in
                        Button(artist) { store.path.append(.artist(artist)) }
                    }
                }
            }
        case .loading: ProgressView()
        case let .content(artists):
            ForEach(artists, id: \.self) { artist in
                Button(artist) { store.path.append(.artist(artist)) }
            }
            if store.hasMoreArtistSuggestions {
                loadMoreRow
            }
        case .empty:
            Text("No matches").foregroundStyle(.secondary)
        case let .failure(message):
            Text(message).foregroundStyle(.red)
        }
    }

    @ViewBuilder
    private var idlePrompt: some View {
        if case .content = store.catalogState {
            Text("Search above to find a song.")
                .foregroundStyle(.secondary)
        } else {
            Text("No catalog installed yet. Search results will be empty until you download it.")
                .foregroundStyle(.secondary)
        }
    }
}

private struct SongRow: View {
    let song: CatalogSong
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 3) {
                Text(song.displayTitle).foregroundStyle(.primary)
                Text(song.displayArtist).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .accessibilityLabel("\(song.displayTitle), by \(song.displayArtist)")
    }
}

/// Shared between the opening page and the search screen so both offer an
/// identical way to fetch (or replace) the full catalog.
struct DownloadCatalogButton: View {
    @Bindable var store: LibraryStore

    var body: some View {
        VStack(spacing: 10) {
            Button {
                store.installCatalog()
            } label: {
                Label(buttonTitle, systemImage: buttonSymbol)
                    .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(isAlreadyInstalled ? .gray : .accentColor)
            .disabled(!store.canInstallCatalog)
            .accessibilityIdentifier("catalog.download")
            .task { store.loadDownloadInfoIfNeeded() }

            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)

            if case let .running(_, progress) = store.maintenanceState {
                HStack {
                    ProgressView()
                    Text(progress.message).font(.footnote).foregroundStyle(.secondary)
                }
            } else if case let .failed(_, message) = store.maintenanceState {
                Text(message).font(.footnote).foregroundStyle(.red)
            }
        }
    }

    private var isAlreadyInstalled: Bool {
        if case .content = store.catalogState { return true }
        return false
    }

    private var buttonTitle: String {
        isAlreadyInstalled ? "Resync Catalog" : "Download Full Catalog"
    }

    private var buttonSymbol: String {
        isAlreadyInstalled ? "arrow.triangle.2.circlepath" : "arrow.down.circle.fill"
    }

    private var subtitle: String {
        switch store.downloadInfo {
        case .idle, .loading: "Checking size…"
        case let .content(info): "\(info.formattedSize) · \(info.songCount.formatted())+ songs"
        case .empty, .failure: "Size unavailable"
        }
    }
}

private struct AllSongsView: View {
    let store: LibraryStore

    var body: some View {
        Text("All Songs")
            .navigationTitle("All Songs")
    }
}

private struct ArtistSongsView: View {
    let artist: String
    let store: LibraryStore
    @Environment(AppEnvironment.self) private var environment
    @State private var state: FeatureState<[CatalogSong]> = .loading

    var body: some View {
        List {
            switch state {
            case .idle, .loading:
                ProgressView()
            case let .content(songs):
                ForEach(songs) { song in SongRow(song: song) { store.openSong(song) } }
            case .empty:
                Text("No songs found").foregroundStyle(.secondary)
            case let .failure(message):
                Text(message).foregroundStyle(.red)
            }
        }
        .listStyle(.plain)
        .navigationTitle(artist)
        .task {
            do {
                let songs = try await environment.catalog.songs(artist: artist)
                state = songs.isEmpty ? .empty : .content(songs)
                await environment.history.addArtist(artist)
            } catch {
                state = .failure(error.localizedDescription)
            }
        }
    }
}

private struct PlaylistSongsView: View {
    let playlistID: String
    let store: LibraryStore

    var body: some View {
        Text(playlistID)
            .navigationTitle(playlistID)
    }
}

#Preview("Library — Loading") {
    NavigationStack {
        LibraryLoadingView()
            .navigationTitle("Library")
    }
    .preferredColorScheme(.dark)
}

#Preview("Library — Empty") {
    NavigationStack {
        CatalogDownloadPromptContent(onDismiss: {}) {
            Button("Download Full Catalog", systemImage: "arrow.down.circle.fill") {}
                .buttonStyle(.borderedProminent)
        }
        .navigationTitle("Library")
    }
    .preferredColorScheme(.dark)
}

#Preview("Library — Ready") {
    NavigationStack {
        VStack(spacing: 20) {
            CatalogReadyBanner(count: 40_979)
            ContentUnavailableView(
                "Find a song",
                systemImage: "magnifyingglass",
                description: Text("Search the installed catalog to begin.")
            )
        }
        .padding()
        .navigationTitle("Library")
    }
    .preferredColorScheme(.dark)
}

#Preview("Library — Failure") {
    NavigationStack {
        CatalogFailureView(message: "The catalog could not be opened.", retry: {})
            .navigationTitle("Library")
    }
    .preferredColorScheme(.dark)
}
