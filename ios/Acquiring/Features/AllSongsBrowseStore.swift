import AcquiringCatalog
import AcquiringCore
import Foundation
import Observation

/// App-lifetime state for the All Songs screen. Browse queries deliberately use
/// the catalog's metadata projections; opening a group never reads a song blob.
@MainActor
@Observable
final class AllSongsBrowseStore {
    var browseMode: BrowseMode = .alphabetical
    var filterText = "" {
        didSet {
            guard filterText != oldValue else { return }
            scheduleFilterApplication()
        }
    }
    private(set) var appliedFilter = ""
    private(set) var expandedGroupKey: String?
    private(set) var metadataState: FeatureState<BrowseMetadataStatus> = .idle
    private(set) var countsState: FeatureState<[String: Int]> = .idle
    private(set) var songsState: FeatureState<[CatalogSong]> = .idle

    /// A stable, row-based restoration point supplied by the scroll view, not
    /// by lazy-row appearance (which can be prefetched off screen). A mounted
    /// scroll view keeps its native pixel offset; this is the fallback after a
    /// navigation round trip recreates the view.
    private(set) var scrollAnchorID: String?

    private let catalog: any CatalogRepository
    @ObservationIgnored private var filterTask: Task<Void, Never>?
    @ObservationIgnored private var metadataTask: Task<Void, Never>?
    @ObservationIgnored private var countsTask: Task<Void, Never>?
    @ObservationIgnored private var songsTask: Task<Void, Never>?
    @ObservationIgnored private var filterGeneration = 0
    @ObservationIgnored private var metadataGeneration = 0
    @ObservationIgnored private var countsGeneration = 0
    @ObservationIgnored private var songsGeneration = 0
    @ObservationIgnored private var loadedCatalogRevision: Int?
    @ObservationIgnored private var loadedMode: BrowseMode?
    @ObservationIgnored private var loadedGroupKey: String?
    @ObservationIgnored private var loadedFilter: String?

    init(catalog: any CatalogRepository) {
        self.catalog = catalog
    }

    var groups: [BrowseGroupDescriptor] {
        BrowseGrouping.groups(for: browseMode)
    }

    var groupCounts: [String: Int] {
        guard case let .content(counts) = countsState else { return [:] }
        return counts
    }

    var isShowingNoMatches: Bool {
        guard !appliedFilter.isEmpty, case let .content(counts) = countsState else { return false }
        return counts.values.reduce(0, +) == 0
    }

    var shouldShowGroups: Bool {
        if case let .content(metadata) = metadataState, metadata.browseCount == 0 { return false }
        if case .empty = countsState { return false }
        return true
    }

    var legacyMetadataWarning: String? {
        guard case let .content(metadata) = metadataState, metadata.browseCount > 0 else { return nil }
        switch browseMode {
        case .complexity where metadata.ratedSongCount == 0:
            return "Complexity data requires the latest song catalog. Return to Library to update it."
        case .mode where metadata.modeMembershipCount == 0:
            return "Mode data requires the latest song catalog. Return to Library to update it."
        default:
            return nil
        }
    }

    func refresh(catalogRevision: Int) async {
        guard loadedCatalogRevision != catalogRevision else { return }
        loadedCatalogRevision = catalogRevision
        filterTask?.cancel()
        applyFilterImmediately(reloadMetadata: true)
    }

    func selectMode(_ mode: BrowseMode) {
        guard browseMode != mode else { return }
        browseMode = mode
        expandedGroupKey = nil
        invalidateSongs()
        scrollAnchorID = nil
        applyFilterImmediately(reloadMetadata: false)
    }

    func toggleGroup(_ key: String) {
        let next = BrowseGrouping.toggledExpandedGroup(current: expandedGroupKey, selected: key)
        expandedGroupKey = next
        songsTask?.cancel()
        songsGeneration &+= 1
        if next == nil {
            songsState = .idle
            loadedMode = nil
            loadedGroupKey = nil
            loadedFilter = nil
            return
        }
        loadSongsIfNeeded(force: false)
    }

    func retry() {
        loadMetadata()
        loadCounts()
        loadSongsIfNeeded(force: true)
    }

    func recordScrollAnchor(id: String) {
        scrollAnchorID = id
    }

    private func scheduleFilterApplication() {
        filterGeneration &+= 1
        let generation = filterGeneration
        filterTask?.cancel()
        filterTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .milliseconds(250))
                guard let self, !Task.isCancelled, self.filterGeneration == generation else { return }
                self.applyFilterImmediately(reloadMetadata: false)
            } catch is CancellationError {
                return
            } catch {
                return
            }
        }
    }

    private func applyFilterImmediately(reloadMetadata: Bool) {
        appliedFilter = filterText.trimmingCharacters(in: .whitespacesAndNewlines)
        if reloadMetadata { loadMetadata() }
        loadCounts()
        loadSongsIfNeeded(force: true)
    }

    private func loadMetadata() {
        metadataTask?.cancel()
        metadataGeneration &+= 1
        let generation = metadataGeneration
        metadataState = .loading
        metadataTask = Task { [weak self] in
            do {
                guard let self else { return }
                let metadata = try await self.catalog.browseMetadata()
                guard !Task.isCancelled, self.metadataGeneration == generation else { return }
                self.metadataState = .content(metadata)
            } catch is CancellationError {
                return
            } catch {
                guard let self, self.metadataGeneration == generation else { return }
                self.metadataState = .failure(error.localizedDescription)
            }
        }
    }

    private func loadCounts() {
        countsTask?.cancel()
        countsGeneration &+= 1
        let generation = countsGeneration
        let mode = browseMode
        let filter = appliedFilter
        countsState = .loading
        countsTask = Task { [weak self] in
            do {
                guard let self else { return }
                let counts = try await self.catalog.browseCounts(mode: mode, filter: filter)
                guard !Task.isCancelled,
                      self.countsGeneration == generation,
                      self.browseMode == mode,
                      self.appliedFilter == filter
                else { return }
                self.countsState = .content(Dictionary(uniqueKeysWithValues: counts.map { ($0.key, $0.count) }))
            } catch is CancellationError {
                return
            } catch {
                guard let self,
                      self.countsGeneration == generation,
                      self.browseMode == mode,
                      self.appliedFilter == filter
                else { return }
                self.countsState = .failure(error.localizedDescription)
            }
        }
    }

    private func loadSongsIfNeeded(force: Bool) {
        guard let key = expandedGroupKey else {
            songsState = .idle
            return
        }
        let mode = browseMode
        let filter = appliedFilter
        guard force || loadedMode != mode || loadedGroupKey != key || loadedFilter != filter else { return }

        songsTask?.cancel()
        songsGeneration &+= 1
        let generation = songsGeneration
        songsState = .loading
        let group = catalogGroup(mode: mode, key: key)
        songsTask = Task { [weak self] in
            do {
                guard let self else { return }
                let songs = try await self.catalog.browseSongs(group: group, filter: filter)
                guard !Task.isCancelled,
                      self.songsGeneration == generation,
                      self.browseMode == mode,
                      self.expandedGroupKey == key,
                      self.appliedFilter == filter
                else { return }
                self.songsState = songs.isEmpty ? .empty : .content(songs)
                self.loadedMode = mode
                self.loadedGroupKey = key
                self.loadedFilter = filter
            } catch is CancellationError {
                return
            } catch {
                guard let self,
                      self.songsGeneration == generation,
                      self.browseMode == mode,
                      self.expandedGroupKey == key,
                      self.appliedFilter == filter
                else { return }
                self.songsState = .failure(error.localizedDescription)
            }
        }
    }

    private func invalidateSongs() {
        songsTask?.cancel()
        songsGeneration &+= 1
        songsState = .idle
        loadedMode = nil
        loadedGroupKey = nil
        loadedFilter = nil
    }

    private func catalogGroup(mode: BrowseMode, key: String) -> BrowseGroup {
        switch mode {
        case .alphabetical:
            .alphabetical(key)
        case .complexity:
            .complexity(key == BrowseGrouping.unratedKey ? nil : Int(key))
        case .mode:
            .mode(key)
        }
    }
}
