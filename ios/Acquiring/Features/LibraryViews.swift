import AcquiringCatalog
import AcquiringCore
import SwiftUI

struct LibraryScene: View {
    @State private var store: LibraryStore
    @Environment(\.scenePhase) private var scenePhase
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
                    case .allSongs: AllSongsBrowseView(store: store)
                    case let .playlist(id): PlaylistSongsView(playlistID: id, store: store)
                    case let .songDetail(id):
                        SongDetailView(songID: id) { song in
                            Task { await store.openArtist(from: song) }
                        }
                    case let .quiz(id):
                        QuizView(songID: id) { song in
                            Task { await store.openArtist(from: song) }
                        }
                    }
                }
        }
        .environment(store.userContent)
        .environment(environment.vocalPractice)
        .tessituraCalibrationPresentation(model: environment.vocalPractice)
        .onChange(of: store.path) { _, path in
            let remainsInSong = path.last.map { route in
                switch route {
                case .songDetail, .quiz: true
                default: false
                }
            } ?? false
            if !remainsInSong { environment.vocalPractice.leaveSong() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { environment.vocalPractice.handleSceneBackgrounded() }
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
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        CatalogSettingsView(store: store)
                    } label: {
                        Text("Settings")
                    }
                    .accessibilityIdentifier("catalog.settings")
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch store.catalogState {
        case .idle, .loading:
            LibraryLoadingView()
        case .empty:
            CatalogEmptyView {
                ManualHarvestView(store: store)
            }
        case let .content(count):
            SearchCatalogView(store: store, catalogCount: count)
        case let .failure(message):
            CatalogFailureView(message: message)
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

    var body: some View {
        VStack(spacing: 12) {
            ContentUnavailableView(
                "Unable to load catalog",
                systemImage: "exclamationmark.triangle",
                description: Text(message)
            )
            Text("Open Settings to try again or install a new catalog.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("catalog.status.failure")
    }
}

private struct CatalogEmptyView<HarvestContent: View>: View {
    private let harvestContent: HarvestContent

    init(@ViewBuilder harvestContent: () -> HarvestContent) {
        self.harvestContent = harvestContent()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                ContentUnavailableView(
                    "No catalog installed",
                    systemImage: "music.note.list",
                    description: Text("Install the song catalog from Settings when you’re ready.")
                )
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("catalog.status.empty")

                harvestContent
            }
            .padding()
        }
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

private struct SearchCatalogView: View {
    @Bindable var store: LibraryStore
    let catalogCount: Int
    @FocusState private var isSearchFieldFocused: Bool
    @State private var focusedSearchScope: SearchScope?

    var body: some View {
        VStack(spacing: 0) {
            CatalogReadyBanner(count: catalogCount)
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
                .submitLabel(.search)
                .onSubmit { store.submitSearch() }
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
                Section {
                    NavigationLink(value: AppRoute.allSongs) {
                        Label("All Songs", systemImage: "music.note.list")
                    }
                    .accessibilityIdentifier("library.allSongs")
                    .accessibilityHint("Browse songs alphabetically, by complexity, or by mode")
                    PlaylistsSectionView(store: store)
                }

                searchResults

                Section {
                    HooktheorySearchButton(query: store.query)
                }

                Section {
                    ManualHarvestView(store: store)
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
        Text("Search above to find a song.")
            .foregroundStyle(.secondary)
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
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("\(song.displayTitle), by \(song.displayArtist)")
    }
}

private struct CatalogSettingsView: View {
    @Bindable var store: LibraryStore

    var body: some View {
        Form {
            AppUpdateSettingsSection()
            TimelineRenderingSettingsSection()

            Section("Catalog") {
                CatalogSettingsStatusView(store: store)
                DownloadCatalogButton(store: store)
                DownloadMaintenanceStatusView(store: store)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct TimelineRenderingSettingsSection: View {
    @AppStorage(TimelineFrameRatePreference.defaultsKey)
    private var frameRate: TimelineFrameRatePreference = .standard

    var body: some View {
        Section {
            Picker("Timeline frame rate", selection: $frameRate) {
                ForEach(TimelineFrameRatePreference.allCases) { preference in
                    Text(preference.title).tag(preference)
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("settings.timelineFrameRate")
            .accessibilityValue(frameRate.title)
            .accessibilityHint("Controls visual smoothness, not song tempo")
        } header: {
            Text("Display")
        } footer: {
            Text("Both tracks refresh together, synchronized with the display. 60 fps is the default; Maximum requests your display’s highest supported rate and may use more battery. iOS may reduce the rate to save power or manage temperature. Reduce Motion disables smooth interpolation. Audio speed is unchanged.")
        }
    }
}

private struct AppUpdateSettingsSection: View {
    @Environment(\.openURL) private var openURL
    @State private var cannotOpenTestFlight = false

    var body: some View {
        Section {
            LabeledContent("Installed Version", value: installedVersion)
                .accessibilityIdentifier("app.installedVersion")

            Button("Check for Updates", systemImage: "arrow.triangle.2.circlepath") {
                // Beta builds are updated by TestFlight, not the catalog downloader.
                guard let url = URL(string: "itms-beta://testflight.apple.com/v1/app/6807512572") else {
                    cannotOpenTestFlight = true
                    return
                }
                openURL(url) { accepted in
                    cannotOpenTestFlight = !accepted
                }
            }
            .accessibilityIdentifier("app.checkForUpdates")
            .accessibilityHint("Opens Acquiring in TestFlight to check for a newer beta build")
        } header: {
            Text("App Updates")
                // A leaf anchors the screen without overriding Form controls' IDs.
                .accessibilityIdentifier("catalog.settings.screen")
        } footer: {
            Text("Updates are delivered through TestFlight. Select Acquiring there and tap Update if a newer build is available.")
        }
        .alert("Unable to Open TestFlight", isPresented: $cannotOpenTestFlight) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Open TestFlight manually and select Acquiring to check for updates. If TestFlight is not installed, get it from the App Store and sign in with your tester account.")
        }
    }

    private var installedVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Unknown"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return build.map { "\(version) (\($0))" } ?? version
    }
}

private struct CatalogSettingsStatusView: View {
    @Bindable var store: LibraryStore

    @ViewBuilder
    var body: some View {
        switch store.catalogState {
        case .idle, .loading:
            HStack(spacing: 8) {
                ProgressView()
                Text("Opening catalog…")
                    .foregroundStyle(.secondary)
            }
            .accessibilityIdentifier("catalog.settings.status.loading")
        case .empty:
            Label("No catalog installed", systemImage: "music.note.list")
                .accessibilityIdentifier("catalog.settings.status.empty")
        case let .content(count):
            Label("\(count.formatted()) songs installed", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .accessibilityIdentifier("catalog.settings.status.ready")
        case let .failure(message):
            VStack(alignment: .leading, spacing: 8) {
                Label("Catalog unavailable", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("catalog.settings.status.failure")
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Try Again", systemImage: "arrow.clockwise") {
                    Task { await store.load() }
                }
                .accessibilityIdentifier("catalog.retry")
            }
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

            HarvestMaintenanceStatusView(store: store)
        }
    }
}

private struct HarvestMaintenanceStatusView: View {
    @Bindable var store: LibraryStore

    @ViewBuilder
    var body: some View {
        switch store.maintenanceState {
        case .running(operation: .harvest, progress: _),
             .cancelling(operation: .harvest),
             .cancelled(operation: .harvest),
             .failed(operation: .harvest, _),
             .completed(operation: .harvest, _):
            CatalogMaintenanceStatusView(
                state: store.maintenanceState,
                catalogIsReady: hasInstalledCatalog,
                cancel: store.cancelMaintenance,
                retry: store.retryMaintenance
            )
        case .idle,
             .running(operation: .downloadAndInstall, progress: _),
             .cancelling(operation: .downloadAndInstall),
             .cancelled(operation: .downloadAndInstall),
             .failed(operation: .downloadAndInstall, _),
             .completed(operation: .downloadAndInstall, _):
            EmptyView()
        }
    }

    private var hasInstalledCatalog: Bool {
        if case .content = store.catalogState { return true }
        return false
    }
}

private struct DownloadMaintenanceStatusView: View {
    @Bindable var store: LibraryStore

    @ViewBuilder
    var body: some View {
        switch store.maintenanceState {
        case .running(operation: .downloadAndInstall, progress: _),
             .cancelling(operation: .downloadAndInstall),
             .cancelled(operation: .downloadAndInstall),
             .failed(operation: .downloadAndInstall, _),
             .completed(operation: .downloadAndInstall, _):
            CatalogMaintenanceStatusView(
                state: store.maintenanceState,
                catalogIsReady: hasInstalledCatalog,
                cancel: store.cancelMaintenance,
                retry: store.retryMaintenance
            )
        case .idle,
             .running(operation: .harvest, progress: _),
             .cancelling(operation: .harvest),
             .cancelled(operation: .harvest),
             .failed(operation: .harvest, _),
             .completed(operation: .harvest, _):
            EmptyView()
        }
    }

    private var hasInstalledCatalog: Bool {
        if case .content = store.catalogState { return true }
        return false
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

private struct DownloadCatalogButton: View {
    @Bindable var store: LibraryStore

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(buttonTitle) {
                store.installCatalog()
            }
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

    private var subtitle: String {
        switch store.downloadInfo {
        case .idle, .loading: "Checking size…"
        case let .content(info): "\(info.formattedSize) · \(info.songCount.formatted())+ songs"
        case .empty, .failure: "Size unavailable"
        }
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

#Preview("Library — Loading") {
    NavigationStack {
        LibraryLoadingView()
            .navigationTitle("Library")
    }
    .preferredColorScheme(.dark)
}

#Preview("Library — Empty") {
    NavigationStack {
        CatalogEmptyView { EmptyView() }
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
        CatalogFailureView(message: "The catalog could not be opened.")
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
