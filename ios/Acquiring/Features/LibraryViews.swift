import Accessibility
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
    @State private var lastMaintenanceAnnouncement: String?

    var body: some View {
        List {
            catalogSection
            searchResults
            if !store.recentSongs.isEmpty {
                Section("Recent songs") {
                    ForEach(store.recentSongs) { song in
                        SongRow(song: song) { store.openSong(song) }
                    }
                }
            }
            if !store.recentArtists.isEmpty {
                Section("Recent artists") {
                    ForEach(store.recentArtists, id: \.self) { artist in
                        Button(artist) { store.path.append(.artist(artist)) }
                    }
                }
            }
            Section("Browse") {
                Button("All Songs", systemImage: "music.note.list") { store.path.append(.allSongs) }
                ForEach(store.playlists) { playlist in
                    Button {
                        store.path.append(.playlist(playlist.id))
                    } label: {
                        LabeledContent(playlist.name, value: playlist.count.formatted())
                    }
                }
                if let message = store.userContentError {
                    Label(message, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
            maintenanceSection
        }
        .navigationTitle("Library")
        .searchable(text: $store.query, prompt: "Song title or artist")
        .searchScopes($store.searchScope) {
            ForEach(SearchScope.allCases) { scope in Text(scope.rawValue).tag(scope) }
        }
        .refreshable { await store.refreshUserContent() }
        .onChange(of: store.maintenanceState) { _, state in
            guard let announcement = state.accessibilityAnnouncement,
                  announcement != lastMaintenanceAnnouncement
            else { return }
            lastMaintenanceAnnouncement = announcement
            AccessibilityNotification.Announcement(announcement).post()
        }
    }

    @ViewBuilder
    private var catalogSection: some View {
        Section {
            switch store.catalogState {
            case .idle, .loading:
                HStack { ProgressView(); Text("Opening catalog…") }
            case let .content(count):
                Label("\(count.formatted()) songs available", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .accessibilityIdentifier("catalog.status.ready")
            case .empty:
                ContentUnavailableView(
                    "Catalog not installed",
                    systemImage: "arrow.down.circle",
                    description: Text("Install the shared catalog or harvest a single TheoryTab song.")
                )
                .accessibilityIdentifier("catalog.status.empty")
                Button("Download full catalog", systemImage: "arrow.down.circle") { store.installCatalog() }
                    .disabled(!store.canInstallCatalog)
                    .accessibilityIdentifier("catalog.download")
            case let .failure(message):
                Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(.red)
                Button("Try again") { Task { await store.load() } }
            }
        }
    }

    @ViewBuilder
    private var searchResults: some View {
        if !store.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Section("Search") {
                if store.searchScope == .songs {
                    featureRows(store.suggestions) { song in SongRow(song: song) { store.openSong(song) } }
                } else {
                    featureRows(store.artistSuggestions) { artist in
                        Button(artist) { store.path.append(.artist(artist)) }
                    }
                }
                if let query = store.query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                   let url = URL(string: "https://www.hooktheory.com/theorytab/search?q=\(query)") {
                    Link("Search Hooktheory.com", destination: url)
                }
            }
        }
    }

    @ViewBuilder
    private func featureRows<Value: Equatable, Content: View>(
        _ state: FeatureState<[Value]>,
        @ViewBuilder content: @escaping (Value) -> Content
    ) -> some View {
        switch state {
        case .idle: EmptyView()
        case .loading: ProgressView()
        case let .content(values): ForEach(Array(values.enumerated()), id: \.offset) { _, value in content(value) }
        case .empty: Text("No matches").foregroundStyle(.secondary)
        case let .failure(message): Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(.red)
        }
    }

    private var maintenanceSection: some View {
        Section("Catalog maintenance") {
            if case .empty = store.catalogState {
                EmptyView()
            } else {
                Button("Download or replace full catalog", systemImage: "arrow.triangle.2.circlepath") {
                    store.installCatalog()
                }
                .disabled(!store.canInstallCatalog)
                .accessibilityIdentifier("catalog.download")
            }
            TextField("Hooktheory TheoryTab URL", text: $store.harvestURL)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                .disabled(!store.canHarvest)
                .accessibilityIdentifier("catalog.harvest.url")
            Button("Harvest this song", systemImage: "leaf") { store.harvest() }
                .disabled(store.harvestURL.isEmpty || !store.canHarvest)
                .accessibilityIdentifier("catalog.harvest")

            switch store.maintenanceState {
            case .idle:
                EmptyView()
            case let .running(operation, progress):
                maintenanceProgress(operation: operation, progress: progress)
                if store.maintenanceState.canCancel {
                    Button("Cancel \(operation.title.lowercased())", role: .cancel) {
                        store.cancelMaintenance()
                    }
                    .accessibilityIdentifier("catalog.cancel")
                }
            case let .cancelling(operation):
                HStack {
                    ProgressView()
                    Text("Cancelling \(operation.title.lowercased())…")
                        .font(.footnote)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("catalog.maintenance.cancelling")
            case let .cancelled(operation):
                Label("\(operation.title) cancelled.", systemImage: "xmark.circle")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("catalog.maintenance.cancelled")
                retryButton(operation: operation)
            case let .failed(operation, message):
                Label(message, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("catalog.maintenance.failed")
                retryButton(operation: operation)
            case let .completed(operation, count):
                Label(
                    "\(operation.title) complete. \(count.formatted()) songs ready.",
                    systemImage: "checkmark.circle.fill"
                )
                .font(.footnote)
                .foregroundStyle(.green)
                .accessibilityIdentifier("catalog.maintenance.completed")
            }

            if store.maintenanceState.retainsCurrentCatalogMessage,
               case let .content(count) = store.catalogState {
                Label(
                    "The current catalog remains available with \(count.formatted()) songs.",
                    systemImage: "checkmark.shield"
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("catalog.maintenance.catalog-ready")
            }
        }
    }

    @ViewBuilder
    private func maintenanceProgress(
        operation: CatalogMaintenanceOperation,
        progress: CatalogProgress
    ) -> some View {
        HStack {
            if case let .downloading(fraction?) = progress {
                ProgressView(value: min(max(fraction, 0), 1))
            } else {
                ProgressView()
            }
            Text(progress.message).font(.footnote)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(operation.title)
        .accessibilityValue(progress.message)
        .accessibilityIdentifier("catalog.maintenance.running")
    }

    private func retryButton(operation: CatalogMaintenanceOperation) -> some View {
        Button("Retry \(operation.title.lowercased())", systemImage: "arrow.clockwise") {
            store.retryMaintenance()
        }
        .accessibilityIdentifier("catalog.retry")
    }
}

struct SongRow: View {
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

private struct ArtistSongsView: View {
    let artist: String
    let store: LibraryStore
    @Environment(AppEnvironment.self) private var environment
    @State private var state: FeatureState<[CatalogSong]> = .loading

    var body: some View {
        FeatureList(state: state) { songs in
            ForEach(songs) { song in SongRow(song: song) { store.openSong(song) } }
        }
        .navigationTitle(artist)
        .task {
            do {
                let songs = try await environment.catalog.songs(artist: artist)
                state = songs.isEmpty ? .empty : .content(songs)
                await environment.history.addArtist(artist)
            } catch { state = .failure(error.localizedDescription) }
        }
    }
}

private struct PlaylistSongsView: View {
    let playlistID: String
    let store: LibraryStore
    @Environment(AppEnvironment.self) private var environment
    @State private var state: FeatureState<[CatalogSong]> = .loading

    var body: some View {
        FeatureList(state: state) { songs in
            ForEach(songs) { song in
                SongRow(song: song) { store.openSong(song) }
                    .swipeActions {
                        Button("Remove", role: .destructive) {
                            try? environment.userLibrary.remove(slug: song.id, playlistID: playlistID)
                            Task { await load() }
                        }
                    }
            }
        }
        .navigationTitle(playlistID == UserLibraryStore.favoritesID ? "Favorites" : "Playlist")
        .task { await load() }
    }

    private func load() async {
        do {
            let slugs = try environment.userLibrary.newestSlugs(playlistID: playlistID)
            let songs = try await environment.catalog.songs(ids: slugs)
            state = songs.isEmpty ? .empty : .content(songs)
        } catch { state = .failure(error.localizedDescription) }
    }
}

private struct AllSongsView: View {
    let store: LibraryStore
    @Environment(AppEnvironment.self) private var environment
    @State private var mode: BrowseMode = .alphabetical
    @State private var filter = ""
    @State private var countsByKey: [String: Int] = [:]
    @State private var expandedKey: String?
    @State private var songs: [CatalogSong] = []
    @State private var error: String?

    /// The domain owns which headings exist, what they are called and the order
    /// they appear in. The view never derives a heading from a query result, so
    /// a group with no rows is still offered to the reader.
    private var groups: [BrowseGroupDescriptor] { BrowseGrouping.groups(for: mode) }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Grouping", selection: $mode) {
                Text("Alphabetical").tag(BrowseMode.alphabetical)
                Text("Complexity").tag(BrowseMode.complexity)
                Text("Mode").tag(BrowseMode.mode)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)
            .accessibilityIdentifier("allSongs.grouping")

            if let error {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
                    .padding(.bottom, 8)
                    .accessibilityIdentifier("allSongs.error")
            }

            List {
                ForEach(groups) { group in
                    Section {
                        if expandedKey == group.key {
                            ForEach(songs) { song in
                                SongRow(song: song) { store.openSong(song) }
                            }
                        }
                    } header: {
                        heading(for: group)
                    }
                }
            }
            // Plain style keeps each heading pinned while its own rows scroll,
            // which is what makes the heading a usable landmark in a list this
            // long.
            .listStyle(.plain)
            // Re-identifying on the grouping returns the list to its top rather
            // than stranding the reader at a scroll offset that meant something
            // in the previous grouping.
            .id(mode)
        }
        .navigationTitle("All Songs")
        .searchable(text: $filter, prompt: "Filter title or artist")
        .task(id: mode) {
            // A grouping change invalidates the open heading, its rows and any
            // error raised under the previous grouping.
            expandedKey = nil
            songs = []
            error = nil
            await loadCounts()
        }
        .task(id: filter) {
            try? await Task.sleep(for: .milliseconds(250))
            await loadCounts()
        }
    }

    private func heading(for group: BrowseGroupDescriptor) -> some View {
        let count = countsByKey[group.key]
        let isExpanded = expandedKey == group.key
        return Button {
            toggle(group)
        } label: {
            HStack {
                Text(group.label)
                Spacer()
                // A count appears only where the query reported one. A heading
                // is never hidden for want of a count, and a missing count is
                // never shown as a zero.
                if let count {
                    Text(count.formatted()).foregroundStyle(.secondary)
                }
                Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("allSongs.group.\(mode.rawValue).\(group.key)")
        .accessibilityLabel(isExpanded ? "Collapse \(group.label)" : "Expand \(group.label)")
        .accessibilityValue(Self.accessibilityValue(count: count, isExpanded: isExpanded))
        .accessibilityAddTraits(.isHeader)
    }

    private static func accessibilityValue(count: Int?, isExpanded: Bool) -> String {
        let state = isExpanded ? "expanded" : "collapsed"
        guard let count else { return state }
        return "\(count.formatted()) \(count == 1 ? "song" : "songs"), \(state)"
    }

    private func toggle(_ group: BrowseGroupDescriptor) {
        expandedKey = BrowseGrouping.toggledExpandedGroup(current: expandedKey, selected: group.key)
        // Drop the previous heading's rows immediately so they cannot appear
        // for a moment underneath a different heading.
        songs = []
        guard let expandedKey else { return }
        Task { await loadSongs(key: expandedKey) }
    }

    private func loadCounts() async {
        do {
            let results = try await environment.catalog.browseCounts(mode: mode, filter: filter)
            countsByKey = Dictionary(results.map { ($0.key, $0.count) }, uniquingKeysWith: +)
            error = nil
            if let expandedKey { await loadSongs(key: expandedKey) }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadSongs(key: String) async {
        // The second condition stops a key from a previous grouping being
        // spent as though it belonged to this one.
        guard expandedKey == key, groups.contains(where: { $0.key == key }) else {
            songs = []
            return
        }
        do {
            songs = try await environment.catalog.browseSongs(group: browseGroup(for: key), filter: filter)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func browseGroup(for key: String) -> BrowseGroup {
        switch mode {
        case .alphabetical:
            .alphabetical(key)
        case .complexity:
            key == BrowseGrouping.unratedKey ? .complexity(nil) : .complexity(Int(key))
        case .mode:
            .mode(key)
        }
    }
}

private struct FeatureList<Value: Equatable, Content: View>: View {
    let state: FeatureState<[Value]>
    @ViewBuilder let content: ([Value]) -> Content

    var body: some View {
        List {
            switch state {
            case .idle, .loading: ProgressView()
            case let .content(values): content(values)
            case .empty: ContentUnavailableView("Nothing here", systemImage: "music.note")
            case let .failure(message): ContentUnavailableView("Unable to load", systemImage: "exclamationmark.triangle", description: Text(message))
            }
        }
    }
}
