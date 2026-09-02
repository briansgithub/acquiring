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
        switch store.catalogState {
        case .idle, .loading:
            ProgressView()
        case .empty where !store.downloadPromptDismissed:
            CatalogDownloadPromptView(store: store)
        case .empty, .content:
            SearchCatalogView(store: store)
        case let .failure(message):
            ContentUnavailableView(
                "Unable to load catalog",
                systemImage: "exclamationmark.triangle",
                description: Text(message)
            )
        }
    }
}

/// The app's opening page when no catalog is installed yet. Downloading is
/// recommended but skippable via the close button, which reveals the search
/// screen underneath with an empty (or partial) catalog.
private struct CatalogDownloadPromptView: View {
    @Bindable var store: LibraryStore

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
                DownloadCatalogButton(store: store)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 40)
            }

            Button {
                store.downloadPromptDismissed = true
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .padding()
            }
            .accessibilityLabel("Skip downloading the catalog for now")
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

private struct SearchCatalogView: View {
    @Bindable var store: LibraryStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search songs or artists", text: $store.query)
                    .textFieldStyle(.plain)
                if !store.query.isEmpty {
                    Button {
                        store.query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
            .padding()

            List {
                searchResults
            }
            .listStyle(.plain)

            DownloadCatalogButton(store: store)
                .padding()
        }
        .navigationTitle("Library")
    }

    @ViewBuilder
    private var searchResults: some View {
        switch store.suggestions {
        case .idle:
            if case let .content(count) = store.catalogState {
                Text("\(count.formatted()) songs ready. Search above to find one.")
                    .foregroundStyle(.secondary)
            } else {
                Text("No catalog installed yet. Search results will be empty until you download it.")
                    .foregroundStyle(.secondary)
            }
        case .loading:
            ProgressView()
        case let .content(songs):
            ForEach(songs) { song in
                Button {
                    store.openSong(song)
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(song.displayTitle).foregroundStyle(.primary)
                        Text(song.displayArtist).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
        case .empty:
            Text("No matches").foregroundStyle(.secondary)
        case let .failure(message):
            Text(message).foregroundStyle(.red)
        }
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
                VStack(spacing: 4) {
                    Label("Download Full Catalog", systemImage: "arrow.down.circle.fill")
                        .font(.headline)
                    Text(subtitle).font(.caption)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!store.canInstallCatalog)
            .task { store.loadDownloadInfoIfNeeded() }

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

    var body: some View {
        Text(artist)
            .navigationTitle(artist)
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
