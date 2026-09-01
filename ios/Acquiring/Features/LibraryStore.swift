import AcquiringCatalog
import AcquiringCore
import Foundation
import Observation

enum AppRoute: Hashable {
    case artist(String)
    case allSongs
    case playlist(String)
    case songDetail(String)
    case quiz(String)
}

enum SearchScope: String, CaseIterable, Identifiable {
    case songs = "Songs"
    case artists = "Artists"
    var id: Self { self }
}

@MainActor
@Observable
final class LibraryStore {
    var path: [AppRoute] = []
    var catalogState: FeatureState<Int> = .idle
    var suggestions: FeatureState<[CatalogSong]> = .idle
    var artistSuggestions: FeatureState<[String]> = .idle
    var recentSongs: [CatalogSong] = []
    var recentArtists: [String] = []
    var playlists: [PlaylistSummary] = []
    var query = "" { didSet { scheduleSearch() } }
    var searchScope: SearchScope = .songs { didSet { scheduleSearch() } }
    var maintenanceMessage: String?
    var harvestURL = ""

    private let environment: AppEnvironment
    @ObservationIgnored private var searchTask: Task<Void, Never>?
    @ObservationIgnored private var maintenanceTask: Task<Void, Never>?

    init(environment: AppEnvironment) {
        self.environment = environment
    }

    func load() async {
        catalogState = .loading
        do {
            try await environment.prepare()
            let count = try await environment.catalog.songCount()
            catalogState = count == 0 ? .empty : .content(count)
            await refreshUserContent()
        } catch {
            catalogState = .failure(error.localizedDescription)
        }
    }

    func refreshUserContent() async {
        do {
            let slugs = await environment.history.songSlugs()
            recentSongs = try await environment.catalog.songs(ids: slugs)
            recentArtists = await environment.history.artists()
            playlists = try environment.userLibrary.summaries()
        } catch {
            maintenanceMessage = error.localizedDescription
        }
    }

    func openSong(_ song: CatalogSong) {
        Task {
            await environment.history.addSong(song.id)
            await environment.history.addArtist(song.artist)
        }
        path.append(.songDetail(song.id))
        path.append(.quiz(song.id))
    }

    func installCatalog() {
        maintenanceTask?.cancel()
        maintenanceTask = Task {
            await consume(environment.maintenance.downloadAndInstall())
        }
    }

    func harvest() {
        guard let url = URL(string: harvestURL) else {
            maintenanceMessage = "Enter a valid Hooktheory TheoryTab URL."
            return
        }
        maintenanceTask?.cancel()
        maintenanceTask = Task {
            await consume(environment.maintenance.harvest(url: url))
        }
    }

    private func consume(_ stream: AsyncThrowingStream<CatalogProgress, any Error>) async {
        do {
            for try await progress in stream {
                maintenanceMessage = progress.message
                if case let .completed(count) = progress {
                    catalogState = .content(count)
                    await refreshUserContent()
                }
            }
        } catch {
            maintenanceMessage = error.localizedDescription
        }
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else {
            suggestions = .idle
            artistSuggestions = .idle
            return
        }
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            do {
                switch searchScope {
                case .songs:
                    suggestions = .loading
                    let values = try await environment.catalog.songSuggestions(query: term, limit: 20, offset: 0)
                    suggestions = values.isEmpty ? .empty : .content(values)
                case .artists:
                    artistSuggestions = .loading
                    let values = try await environment.catalog.artistSuggestions(query: term, limit: 20, offset: 0)
                    artistSuggestions = values.isEmpty ? .empty : .content(values)
                }
            } catch is CancellationError {
            } catch {
                if searchScope == .songs { suggestions = .failure(error.localizedDescription) }
                else { artistSuggestions = .failure(error.localizedDescription) }
            }
        }
    }
}
