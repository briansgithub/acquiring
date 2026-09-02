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
    }
}

private struct LibraryView: View {
    @Bindable var store: LibraryStore

    var body: some View {
        Text("Acquiring")
            .font(.largeTitle.bold())
            .navigationTitle("Library")
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
