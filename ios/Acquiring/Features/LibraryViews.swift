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
                    case let .songDetail(id):
                        SongDetailView(songID: id) { song in
                            Task { await store.openArtist(from: song) }
                        }
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
            CatalogDownloadSurface(store: store)
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
    @FocusState private var isSearchFieldFocused: Bool
    @State private var focusedSearchScope: SearchScope?

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
                .focused($isSearchFieldFocused)
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
            .onChange(of: isSearchFieldFocused) { _, isFocused in
                let scope = isFocused ? store.searchScope : focusedSearchScope
                guard let scope else { return }
                store.setSearchFocused(isFocused, for: scope)
                focusedSearchScope = isFocused ? scope : nil
            }
            .onChange(of: store.searchScope.rawValue) { _, _ in
                if let focusedSearchScope {
                    store.setSearchFocused(false, for: focusedSearchScope)
                }
                focusedSearchScope = nil
                isSearchFieldFocused = false
                store.setSearchFocused(false, for: store.searchScope)
            }

            Picker("Search scope", selection: $store.searchScope) {
                ForEach(SearchScope.allCases) { scope in Text(scope.rawValue).tag(scope) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)
            .accessibilityIdentifier("library.search.scope")

            List {
                searchResults
                Section("Catalog Maintenance") {
                    CatalogMaintenanceSurface(store: store)
                }
            }
            .listStyle(.plain)
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
            if store.shouldShowRecentContent, !store.recentSongs.isEmpty {
                Section("Recent Songs") {
                    ForEach(store.recentSongs) { song in SongRow(song: song) { store.openSong(song) } }
                }
            } else {
                idlePrompt
            }
        case .loading: ProgressView()
        case let .content(songs):
            ForEach(songs) { song in SongRow(song: song) { store.openSong(song) } }
            pagingErrorRow
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
    private var pagingErrorRow: some View {
        if let pagingError = store.pagingError {
            Text("Couldn't load more results. \(pagingError)")
                .font(.footnote)
                .foregroundStyle(.red)
                .accessibilityIdentifier("library.search.pagingError")
        }
    }

    @ViewBuilder
    private var artistResults: some View {
        switch store.artistSuggestions {
        case .idle:
            if store.shouldShowRecentContent, !store.recentArtists.isEmpty {
                Section("Recent Artists") {
                    ForEach(store.recentArtists, id: \.self) { artist in
                        Button(artist) { store.path.append(.artist(artist)) }
                    }
                }
            } else {
                idlePrompt
            }
        case .loading: ProgressView()
        case let .content(artists):
            ForEach(artists, id: \.self) { artist in
                Button(artist) { store.path.append(.artist(artist)) }
            }
            pagingErrorRow
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

/// Shared between the opening prompt and the Library so catalog replacement
/// always exposes the same status, cancellation, and recovery affordances.
private struct CatalogMaintenanceSurface: View {
    @Bindable var store: LibraryStore

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            DownloadCatalogButton(store: store)
            Divider()
            ManualHarvestView(store: store)
            CatalogMaintenanceStatusView(
                state: store.maintenanceState,
                catalogIsReady: hasInstalledCatalog,
                cancel: store.cancelMaintenance,
                retry: store.retryMaintenance
            )
        }
        .padding(.vertical, 4)
    }

    private var hasInstalledCatalog: Bool {
        if case .content = store.catalogState { return true }
        return false
    }
}

/// Used by the opening prompt, which does not offer song-level maintenance
/// until the person chooses to continue into Library.
private struct CatalogDownloadSurface: View {
    @Bindable var store: LibraryStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DownloadCatalogButton(store: store)
            CatalogMaintenanceStatusView(
                state: store.maintenanceState,
                catalogIsReady: false,
                cancel: store.cancelMaintenance,
                retry: store.retryMaintenance
            )
        }
    }
}

private struct ManualHarvestView: View {
    @Bindable var store: LibraryStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Add a TheoryTab song")
                .font(.subheadline.weight(.semibold))
            TextField(
                "https://www.hooktheory.com/theorytab/view/artist/song",
                text: $store.harvestURL
            )
            .textInputAutocapitalization(.never)
            .keyboardType(.URL)
            .autocorrectionDisabled()
            .textFieldStyle(.roundedBorder)
            .accessibilityIdentifier("catalog.harvest.url")

            Button("Harvest & Save", systemImage: "square.and.arrow.down") {
                store.harvest()
            }
            .buttonStyle(.bordered)
            .disabled(!store.canHarvest)
            .accessibilityIdentifier("catalog.harvest")

            Text("Paste a Hooktheory TheoryTab URL to add its sections to this catalog.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct CatalogMaintenanceStatusView: View {
    let state: CatalogMaintenanceState
    let catalogIsReady: Bool
    let cancel: () -> Void
    let retry: () -> Void

    var body: some View {
        CatalogMaintenanceStatusContent(
            state: state,
            catalogIsReady: catalogIsReady,
            cancel: cancel,
            retry: retry
        )
    }
}

private struct CatalogMaintenanceStatusContent: View {
    let state: CatalogMaintenanceState
    let catalogIsReady: Bool
    let cancel: () -> Void
    let retry: () -> Void

    var body: some View {
        switch state {
        case .idle:
            EmptyView()
        case let .running(_, progress):
            HStack(spacing: 8) {
                ProgressView()
                Text(progress.message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if state.canCancel {
                Button("Cancel", systemImage: "xmark") { cancel() }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("catalog.cancel")
            }
        case let .cancelling(operation):
            HStack(spacing: 8) {
                ProgressView()
                Text("Cancelling \(operation.title.lowercased())…")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        case let .cancelled(operation):
            maintenanceMessage(
                "\(operation.title) cancelled.",
                identifier: "catalog.maintenance.cancelled",
                tint: .secondary
            )
            retainedCatalogMessage
            retryButton
        case let .failed(operation, message):
            maintenanceMessage(
                "\(operation.title) failed. \(message)",
                identifier: "catalog.maintenance.failed",
                tint: .red
            )
            retainedCatalogMessage
            retryButton
        case let .completed(operation, songCount):
            maintenanceMessage(
                "\(operation.title) complete. \(songCount.formatted()) songs ready.",
                identifier: "catalog.maintenance.completed",
                tint: .green
            )
        }
    }

    private func maintenanceMessage(
        _ text: String,
        identifier: String,
        tint: Color
    ) -> some View {
        Text(text)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(tint)
            .accessibilityIdentifier(identifier)
    }

    @ViewBuilder
    private var retainedCatalogMessage: some View {
        if catalogIsReady {
            Text("Your current catalog remains available.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("catalog.maintenance.catalog-ready")
        }
    }

    private var retryButton: some View {
        Button("Retry", systemImage: "arrow.clockwise") { retry() }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("catalog.retry")
    }
}

/// The focused catalog action is shared between the opening page and Library.
private struct DownloadCatalogButton: View {
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

#Preview("Catalog Maintenance — Retained Catalog Failure") {
    CatalogMaintenanceStatusContent(
        state: .failed(
            operation: .downloadAndInstall,
            message: "The server returned HTTP 503."
        ),
        catalogIsReady: true,
        cancel: {},
        retry: {}
    )
    .padding()
    .preferredColorScheme(.dark)
}

#Preview("Catalog Maintenance — Harvest Complete") {
    CatalogMaintenanceStatusContent(
        state: .completed(operation: .harvest, songCount: 40_979),
        catalogIsReady: true,
        cancel: {},
        retry: {}
    )
    .padding()
    .preferredColorScheme(.dark)
}
