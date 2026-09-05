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
                    case .allSongs:
                        AllSongsBrowseView(store: store)
                            .navigationTitle("All Songs")
                            .navigationBarTitleDisplayMode(.inline)
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
            setupContent
        case .content:
            SearchCatalogView(store: store)
        case let .failure(message):
            CatalogFailureView(message: message)
        }
    }

    @ViewBuilder
    private var setupContent: some View {
        switch store.maintenanceState {
        case let .running(operation: .downloadAndInstall, progress):
            CatalogSetupProgressView(message: progress.message)
        case .cancelling(operation: .downloadAndInstall):
            CatalogSetupProgressView(message: "Cancelling catalog setup…")
        case let .failed(operation: .downloadAndInstall, message):
            CatalogFailureView(message: "The full catalog download failed. \(message)")
        case .cancelled(operation: .downloadAndInstall):
            CatalogFailureView(message: "The full catalog download was cancelled.")
        case .idle,
             .running(operation: .harvest, progress: _),
             .cancelling(operation: .harvest),
             .cancelled(operation: .harvest),
             .failed(operation: .harvest, _),
             .completed(operation: .downloadAndInstall, songCount: _),
             .completed(operation: .harvest, songCount: _):
            CatalogEmptyView()
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

private struct CatalogEmptyView: View {
    var body: some View {
        ContentUnavailableView(
            "Preparing your song catalog",
            systemImage: "music.note.list",
            description: Text("Acquiring downloads the full catalog automatically the first time you open it. Check Settings for progress or help.")
        )
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("catalog.status.empty")
    }
}

private struct CatalogSetupProgressView: View {
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(message)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("catalog.status.loading")
    }
}

private struct SearchCatalogView: View {
    private enum FocusTarget: Hashable {
        case searchScope
        case search
        case hooktheorySearch
    }

    @Bindable var store: LibraryStore
    @FocusState private var focusedElement: FocusTarget?
    @State private var focusedSearchScope: SearchScope?
    @State private var isAllSongsExpanded = false
    @State private var isHooktheoryExpanded = false
    @State private var hooktheoryQuery = ""
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollViewReader { proxy in
            libraryList
                .onChange(of: isAllSongsExpanded) { _, expanded in
                    guard expanded else { return }
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                        proxy.scrollTo("library.allSongs.section", anchor: .top)
                    }
                }
        }
    }

    private var libraryList: some View {
        List {
            Section {
                PlaylistsSectionView(store: store)
            }
            Section {
                searchControls
                    .padding(14)
                    .background(Color.accentColor.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.accentColor.opacity(0.25), lineWidth: 1)
                    }
                    .listRowInsets(EdgeInsets(top: 20, leading: 16, bottom: 12, trailing: 16))
                    .listRowSeparator(.hidden)
            }
            searchResults

            Section {
                hooktheoryDisclosure
                    .listRowInsets(EdgeInsets(top: 20, leading: 16, bottom: 8, trailing: 16))
                    .listRowSeparator(.hidden)
                if isHooktheoryExpanded {
                    hooktheoryTools
                        .padding(14)
                        .background(Color.accentColor.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 12, trailing: 16))
                        .listRowSeparator(.hidden)
                }
            }

            Section {
                allSongsDisclosure
                    .id("library.allSongs.section")
                    .listRowInsets(EdgeInsets(top: 20, leading: 16, bottom: 8, trailing: 16))
                    .listRowSeparator(.hidden)

                if isAllSongsExpanded {
                    AllSongsBrowseView(store: store)
                        .frame(height: 560)
                        .background(.background, in: RoundedRectangle(cornerRadius: 14))
                        .overlay {
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(.secondary.opacity(0.25), lineWidth: 1)
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 12, trailing: 16))
                        .listRowSeparator(.hidden)
                }
            }
        }
        .listStyle(.plain)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("catalog.status.ready")
        // Keep initial focus on a non-text control near the top of Library.
        // All Songs is now below the other home controls.
        .defaultFocus($focusedElement, .searchScope)
        .onChange(of: store.path) { oldPath, newPath in
            // The search view remains alive below song destinations. Explicitly
            // choose a non-text control when the final destination is popped.
            guard !oldPath.isEmpty, newPath.isEmpty else { return }
            focusedElement = .searchScope
        }
    }

    private var allSongsDisclosure: some View {
        Button {
            focusedElement = nil
            isAllSongsExpanded.toggle()
        } label: {
            LibrarySectionLabel(
                title: "All Songs",
                subtitle: "Alphabetical · Complexity · Mode",
                systemImage: "music.note.list",
                isExpanded: isAllSongsExpanded
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("All Songs")
        .accessibilityValue(isAllSongsExpanded ? "Expanded" : "Collapsed")
        .accessibilityHint(isAllSongsExpanded ? "Hide the song browser" : "Browse songs here by title, complexity, or mode")
        .accessibilityIdentifier("library.allSongs")
    }

    private var hooktheoryDisclosure: some View {
        Button {
            focusedElement = nil
            isHooktheoryExpanded.toggle()
        } label: {
            LibrarySectionLabel(
                title: "Search Hooktheory.com",
                subtitle: "Web search and song downloads",
                systemImage: "globe",
                isExpanded: isHooktheoryExpanded,
                isLoading: isHarvesting
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Search Hooktheory.com")
        .accessibilityValue(isHooktheoryExpanded ? "Expanded" : "Collapsed")
        .accessibilityHint("Show or hide web search and song downloads")
        .accessibilityIdentifier("library.hooktheory.toggle")
    }

    private var isHarvesting: Bool {
        if case .running(operation: .harvest, progress: _) = store.maintenanceState {
            return true
        }
        return false
    }

    private var hooktheoryTools: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Search HookTheory:")
                    .font(.subheadline.weight(.semibold))
                TextField("", text: $hooktheoryQuery)
                    .textFieldStyle(.roundedBorder)
                    .focused($focusedElement, equals: .hooktheorySearch)
                    .submitLabel(.done)
                    .onSubmit { focusedElement = nil }
                    .accessibilityLabel("Search HookTheory")
                    .accessibilityIdentifier("library.hooktheory.search")
                HooktheorySearchButton(query: hooktheoryQuery)
            }
            Divider()
            ManualHarvestView(store: store)
        }
    }

    private var searchControls: some View {
        VStack(alignment: .leading, spacing: 0) {
            LibrarySectionHeading(
                title: "Search Database:",
                subtitle: "Songs and artists in your library",
                systemImage: "magnifyingglass"
            )
            .padding(.bottom, 12)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField(
                    store.searchScope == .songs ? "Search songs" : "Search artists",
                    text: $store.query
                )
                .textFieldStyle(.plain)
                .focused($focusedElement, equals: .search)
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
            .onChange(of: focusedElement) { _, focusedElement in
                let isFocused = focusedElement == .search
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
                focusedElement = nil
                store.setSearchFocused(false, for: store.searchScope)
            }

            Picker("Search scope", selection: $store.searchScope) {
                ForEach(SearchScope.allCases) { scope in Text(scope.rawValue).tag(scope) }
            }
            .pickerStyle(.segmented)
            .focused($focusedElement, equals: .searchScope)
            .padding(.top, 8)
            .accessibilityIdentifier("library.search.scope")

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
                    ForEach(store.recentSongs) { song in
                        SongRow(song: song, isCompact: true) { store.openSong(song) }
                            .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
                    }
                }
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
                        Button { store.path.append(.artist(artist)) } label: {
                            Text(artist)
                                .font(.subheadline)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
                    }
                }
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

}

struct SongRow: View {
    let song: CatalogSong
    var isCompact = false
    let action: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: action) {
            Group {
                if isCompact && !dynamicTypeSize.isAccessibilitySize {
                    HStack(spacing: 8) {
                        Text(song.displayTitle)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .layoutPriority(1)
                        Text(song.displayArtist)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(song.displayTitle).foregroundStyle(.primary)
                        Text(song.displayArtist).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
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
                CatalogUpdateStatusView(store: store)
                CatalogUpdateButton(store: store)
                DownloadMaintenanceStatusView(store: store)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: hasInstalledCatalog) {
            guard hasInstalledCatalog else { return }
            await store.checkForCatalogUpdate()
        }
    }

    private var hasInstalledCatalog: Bool {
        if case .content = store.catalogState { return true }
        return false
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

private struct CatalogUpdateStatusView: View {
    @Bindable var store: LibraryStore

    var body: some View {
        status
    }

    @ViewBuilder
    private var status: some View {
        switch store.catalogUpdateState {
        case .idle:
            EmptyView()
        case .checking:
            HStack(spacing: 8) {
                ProgressView()
                Text("Checking for catalog updates…")
                    .foregroundStyle(.secondary)
            }
            .accessibilityIdentifier("catalog.update.checking")
        case .current:
            Label("Catalog is up to date", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .accessibilityIdentifier("catalog.update.current")
        case .updateAvailable:
            Label("Catalog update available", systemImage: "arrow.down.circle.fill")
                .foregroundStyle(.orange)
                .accessibilityIdentifier("catalog.update.available")
        case .unknown:
            Label("Catalog version unknown", systemImage: "questionmark.circle")
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("catalog.update.unknown")
        case let .failed(message):
            VStack(alignment: .leading, spacing: 8) {
                Label("Couldn’t check for catalog updates", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("catalog.update.failed")
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Check Again", systemImage: "arrow.clockwise") {
                    Task { await store.checkForCatalogUpdate() }
                }
                .accessibilityIdentifier("catalog.update.retry")
            }
        }
    }
}

private struct ManualHarvestView: View {
    @Bindable var store: LibraryStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Add song from hooktheory.com URL to database:")
                .font(.subheadline.weight(.semibold))
            TextField(
                "HookTheory URL",
                text: $store.harvestURL,
                prompt: Text("URL")
                    .foregroundStyle(Color.blue.opacity(0.35))
            )
            .textInputAutocapitalization(.never)
            .keyboardType(.URL)
            .autocorrectionDisabled()
            .textFieldStyle(.roundedBorder)
            .accessibilityIdentifier("catalog.harvest.url")

            Button("Download", systemImage: "square.and.arrow.down") {
                store.harvest()
            }
            .buttonStyle(.bordered)
            .disabled(!store.canHarvest)
            .accessibilityIdentifier("catalog.harvest")

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

private struct CatalogUpdateButton: View {
    @Bindable var store: LibraryStore

    @ViewBuilder
    var body: some View {
        if offersCatalogDownload {
            VStack(alignment: .leading, spacing: 4) {
                Button(buttonTitle, systemImage: "arrow.down.circle") {
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
    }

    private var offersCatalogDownload: Bool {
        if case .failure = store.catalogState { return true }
        switch store.catalogUpdateState {
        case .updateAvailable, .unknown: return true
        case .idle, .checking, .current, .failed: return false
        }
    }

    private var buttonTitle: String {
        if case .failure = store.catalogState {
            return "Repair Catalog"
        }
        if case .unknown = store.catalogUpdateState {
            return "Download Latest Catalog"
        }
        return "Update Catalog"
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
        CatalogEmptyView()
            .navigationTitle("Library")
    }
    .preferredColorScheme(.dark)
}

#Preview("Library — Ready") {
    NavigationStack {
        ContentUnavailableView(
            "Find a song",
            systemImage: "magnifyingglass",
            description: Text("Search the installed catalog to begin.")
        )
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
