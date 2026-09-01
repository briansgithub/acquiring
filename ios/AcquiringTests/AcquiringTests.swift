import AcquiringCatalog
import AcquiringCore
import Foundation
import SwiftData
import XCTest
@testable import Acquiring

final class AcquiringTests: XCTestCase {
    @MainActor
    func testFavoritesMembershipIsUniqueAndNewestFirst() throws {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: PlaylistRecord.self, PlaylistEntryRecord.self,
            configurations: configuration
        )
        let store = try UserLibraryStore(context: container.mainContext)
        XCTAssertFalse(try store.contains(slug: "artist__first-song"))
        XCTAssertTrue(try store.toggle(slug: "artist__first-song"))
        XCTAssertTrue(try store.toggle(slug: "artist__second-song"))
        XCTAssertEqual(try store.newestSlugs(playlistID: UserLibraryStore.favoritesID), ["artist__second-song", "artist__first-song"])
        XCTAssertFalse(try store.toggle(slug: "artist__first-song"))
        XCTAssertEqual(try store.newestSlugs(playlistID: UserLibraryStore.favoritesID), ["artist__second-song"])
    }

    @MainActor
    func testDeletingCustomPlaylistCascadesEntries() throws {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: PlaylistRecord.self, PlaylistEntryRecord.self,
            configurations: configuration
        )
        let playlist = PlaylistRecord(id: "custom", name: "Custom")
        let entry = PlaylistEntryRecord(playlistID: playlist.id, slug: "artist__song", playlist: playlist)
        container.mainContext.insert(playlist)
        container.mainContext.insert(entry)
        try container.mainContext.save()
        container.mainContext.delete(playlist)
        try container.mainContext.save()
        XCTAssertTrue(try container.mainContext.fetch(FetchDescriptor<PlaylistEntryRecord>()).isEmpty)
    }

    func testHistoryUsesAndroidOrderingLimitAndArtistCanonicalization() async throws {
        let suite = "AcquiringTests.\(UUID().uuidString)"
        let history = HistoryStore(suiteName: suite)
        for index in 0..<12 { await history.addSong("song-\(index)") }
        await history.addArtist("The-Beatles")
        await history.addArtist("the beatles")
        let songs = await history.songSlugs()
        let artists = await history.artists()
        XCTAssertEqual(songs, (2..<12).reversed().map { "song-\($0)" })
        XCTAssertEqual(artists, ["the beatles"])
        await history.removeAll()
    }

    func testSharedParityCorpusIsBundledAndDecodable() throws {
        let fixtureURL = try XCTUnwrap(
            Bundle(for: AcquiringTests.self).url(
                forResource: "corpus_parity",
                withExtension: "json"
            )
        )
        let data = try Data(contentsOf: fixtureURL)
        let cases = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [[String: Any]])

        XCTAssertFalse(cases.isEmpty)
        XCTAssertNotNil(cases.first?["expectedRoman"])
        XCTAssertNotNil(cases.first?["expectedPcs"])
    }

    func testSharedChordCorpusMatchesAndroid() throws {
        struct Fixture: Decodable {
            let id: String
            let json: String
            let key: KeyInfo
            let expectedRoman: String
            let expectedLetter: String
            let expectedPcs: [Int]
        }
        let fixtureURL = try XCTUnwrap(
            Bundle(for: AcquiringTests.self).url(forResource: "corpus_parity", withExtension: "json")
        )
        let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: fixtureURL))
        for fixture in fixtures {
            let chord = try JSONDecoder().decode([String: JSONValue].self, from: Data(fixture.json.utf8))
            XCTAssertEqual(ChordInterpreter.romanSymbol(for: chord, key: fixture.key), fixture.expectedRoman, fixture.id)
            XCTAssertEqual(ChordInterpreter.letterName(for: chord, key: fixture.key), fixture.expectedLetter, fixture.id)
            let pitchClasses = Set(ChordInterpreter.chordNotes(for: chord, key: fixture.key).map { (($0 % 12) + 12) % 12 }).sorted()
            XCTAssertEqual(pitchClasses, fixture.expectedPcs, fixture.id)
        }
    }

    @MainActor
    func testCatalogMaintenanceCompletionRefreshesTheVisibleCount() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { progressStream([.connecting, .downloading(fraction: 0.5), .completed(songCount: 999)]) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 42)
        defer { fixture.cleanup() }
        fixture.store.catalogState = .content(7)

        fixture.store.installCatalog()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .completed(operation: .downloadAndInstall, songCount: 42)
        )
        XCTAssertEqual(fixture.store.catalogState, .content(42))
    }

    @MainActor
    func testCatalogMaintenanceCompletionIgnoresLaterProgress() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { progressStream([.completed(songCount: 999), .preparing]) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 42)
        defer { fixture.cleanup() }

        fixture.store.installCatalog()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .completed(operation: .downloadAndInstall, songCount: 42)
        )
        XCTAssertEqual(fixture.store.catalogState, .content(42))
    }

    @MainActor
    func testCatalogMaintenanceCountFailurePreservesThePriorCatalog() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { progressStream([.completed(songCount: 37)]) }
        ])
        let fixture = try makeLibraryStore(
            maintenance: maintenance,
            catalogCount: 7,
            catalogCountThrows: true
        )
        defer { fixture.cleanup() }
        fixture.store.catalogState = .content(7)

        fixture.store.installCatalog()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .failed(operation: .downloadAndInstall, message: "Test catalog failure.")
        )
        XCTAssertEqual(fixture.store.catalogState, .content(7))
    }

    @MainActor
    func testCatalogMaintenanceEndingWithoutCompletionIsFailure() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { progressStream([.connecting]) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance)
        defer { fixture.cleanup() }
        fixture.store.catalogState = .content(7)

        fixture.store.installCatalog()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .failed(
                operation: .downloadAndInstall,
                message: "The catalog operation ended before completion."
            )
        )
        XCTAssertEqual(fixture.store.catalogState, .content(7))
    }

    @MainActor
    func testCatalogMaintenanceFailurePreservesCatalogAndCanRetry() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { failureStream(TestCatalogFailure()) },
            { progressStream([.completed(songCount: 9)]) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 9)
        defer { fixture.cleanup() }
        fixture.store.catalogState = .content(7)

        fixture.store.installCatalog()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .failed(operation: .downloadAndInstall, message: "Test catalog failure.")
        )
        XCTAssertEqual(fixture.store.catalogState, .content(7))

        fixture.store.retryMaintenance()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .completed(operation: .downloadAndInstall, songCount: 9)
        )
        XCTAssertEqual(fixture.store.catalogState, .content(9))
    }

    @MainActor
    func testCancellingCatalogMaintenancePreservesTheUsableCatalog() async throws {
        let cancellationProbe = CancellationProbe()
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            {
                AsyncThrowingStream { continuation in
                    let producer = Task {
                        continuation.yield(.downloading(fraction: 0.25))
                        do {
                            try await Task.sleep(for: .seconds(60))
                        } catch {
                            await cancellationProbe.recordProducerTermination()
                            continuation.yield(.preparing)
                            continuation.finish()
                        }
                    }
                    continuation.onTermination = { _ in producer.cancel() }
                }
            }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance)
        defer { fixture.cleanup() }
        fixture.store.catalogState = .content(7)

        fixture.store.installCatalog()
        fixture.store.cancelMaintenance()
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .cancelling(operation: .downloadAndInstall)
        )
        await fixture.store.waitForMaintenance()

        for _ in 0..<100 {
            if await cancellationProbe.terminationCount > 0 { break }
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .cancelled(operation: .downloadAndInstall)
        )
        XCTAssertEqual(fixture.store.catalogState, .content(7))
        let terminationCount = await cancellationProbe.terminationCount
        XCTAssertEqual(terminationCount, 1)
    }

    @MainActor
    func testDuplicateCatalogStartsAreIgnoredWhileAnOperationIsRunning() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            {
                AsyncThrowingStream { continuation in
                    continuation.yield(.connecting)
                }
            }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance)
        defer { fixture.cleanup() }

        fixture.store.installCatalog()
        fixture.store.installCatalog()

        XCTAssertEqual(maintenance.downloadCallCount, 1)
        fixture.store.cancelMaintenance()
        await fixture.store.waitForMaintenance()
    }

    @MainActor
    func testAppScopedGateRejectsAnOverlappingOperationFromAnotherStore() async throws {
        let underlying = ScriptedCatalogMaintenanceService(downloads: [
            {
                AsyncThrowingStream { continuation in
                    continuation.yield(.downloading(fraction: 0.25))
                }
            }
        ])
        let maintenance = ExclusiveCatalogMaintenanceService(base: underlying)
        let first = try makeLibraryStore(maintenance: maintenance, catalogCount: 1)
        defer { first.cleanup() }
        let second = try makeLibraryStore(maintenance: maintenance, catalogCount: 1)
        defer { second.cleanup() }

        first.store.installCatalog()
        second.store.installCatalog()
        await second.store.waitForMaintenance()

        XCTAssertEqual(underlying.downloadCallCount, 1)
        XCTAssertEqual(
            second.store.maintenanceState,
            .failed(
                operation: .downloadAndInstall,
                message: "Another catalog operation is already running in a different window."
            )
        )
        first.store.cancelMaintenance()
        await first.store.waitForMaintenance()
    }

    @MainActor
    func testCatalogMaintenanceCannotStartBeforeCatalogPreparationFinishes() throws {
        let maintenance = ScriptedCatalogMaintenanceService()
        let fixture = try makeLibraryStore(maintenance: maintenance)
        defer { fixture.cleanup() }
        fixture.store.catalogState = .loading
        fixture.store.harvestURL = "https://www.hooktheory.com/theorytab/view/artist/song"

        fixture.store.installCatalog()
        fixture.store.harvest()

        XCTAssertEqual(maintenance.downloadCallCount, 0)
        XCTAssertTrue(maintenance.harvestURLs.isEmpty)
        XCTAssertEqual(fixture.store.maintenanceState, .idle)
        XCTAssertFalse(fixture.store.canInstallCatalog)
        XCTAssertFalse(fixture.store.canHarvest)
    }

    @MainActor
    func testHarvestRetryUsesTheOriginalValidatedURL() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(harvests: [
            { _ in failureStream(TestCatalogFailure()) },
            { _ in progressStream([.completed(songCount: 999)]) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 1)
        defer { fixture.cleanup() }
        let original = "https://www.hooktheory.com/theorytab/view/artist/song"
        fixture.store.harvestURL = original

        fixture.store.harvest()
        await fixture.store.waitForMaintenance()
        fixture.store.harvestURL = "https://www.hooktheory.com/theorytab/view/other/replacement"
        fixture.store.retryMaintenance()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(maintenance.harvestURLs.map(\.absoluteString), [original, original])
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .completed(operation: .harvest, songCount: 1)
        )
    }

    @MainActor
    func testInvalidHarvestSubmissionCannotRetryAnOlderURL() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(harvests: [
            { _ in failureStream(TestCatalogFailure()) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 1)
        defer { fixture.cleanup() }
        let original = "https://www.hooktheory.com/theorytab/view/artist/song"
        fixture.store.harvestURL = original

        fixture.store.harvest()
        await fixture.store.waitForMaintenance()
        fixture.store.harvestURL = "not a TheoryTab URL"
        fixture.store.harvest()
        fixture.store.retryMaintenance()

        XCTAssertEqual(maintenance.harvestURLs.map(\.absoluteString), [original])
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .failed(
                operation: .harvest,
                message: "Enter a valid Hooktheory TheoryTab URL."
            )
        )
    }

    @MainActor
    func testHarvestRetryWaitsForCatalogPreparation() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(harvests: [
            { _ in failureStream(TestCatalogFailure()) },
            { _ in progressStream([.completed(songCount: 1)]) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 1)
        defer { fixture.cleanup() }
        let original = "https://www.hooktheory.com/theorytab/view/artist/song"
        fixture.store.harvestURL = original

        fixture.store.harvest()
        await fixture.store.waitForMaintenance()
        fixture.store.catalogState = .loading
        fixture.store.retryMaintenance()

        XCTAssertEqual(maintenance.harvestURLs.map(\.absoluteString), [original])
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .failed(operation: .harvest, message: "Test catalog failure.")
        )
    }

    @MainActor
    func testHarvestRejectsInvalidSchemesHostsAndPathsWithoutCallingTheService() throws {
        let maintenance = ScriptedCatalogMaintenanceService()
        let fixture = try makeLibraryStore(maintenance: maintenance)
        defer { fixture.cleanup() }

        for invalidURL in [
            "ftp://www.hooktheory.com/theorytab/view/artist/song",
            "https://hooktheory.com.example.com/theorytab/view/artist/song",
            "https://www.hooktheory.com/search/theorytab/view/artist/song",
            "https://www.hooktheory.com/theorytab/view/artist"
        ] {
            fixture.store.harvestURL = invalidURL
            fixture.store.harvest()
            fixture.store.retryMaintenance()
        }

        XCTAssertTrue(maintenance.harvestURLs.isEmpty)
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .failed(
                operation: .harvest,
                message: "Enter a valid Hooktheory TheoryTab URL."
            )
        )
    }

    @MainActor
    func testHarvestValidationCannotHideAnActiveCatalogUpdate() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            {
                AsyncThrowingStream { continuation in
                    continuation.yield(.connecting)
                }
            }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance)
        defer { fixture.cleanup() }
        fixture.store.harvestURL = "not a TheoryTab URL"

        fixture.store.installCatalog()
        fixture.store.harvest()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .running(operation: .downloadAndInstall, progress: .connecting)
        )
        fixture.store.cancelMaintenance()
        await fixture.store.waitForMaintenance()
    }

    @MainActor
    func testCatalogInstallCannotBeCancelledAfterTheCommitBoundary() async throws {
        let maintenance = ScriptedCatalogMaintenanceService()
        let fixture = try makeLibraryStore(maintenance: maintenance)
        defer { fixture.cleanup() }
        fixture.store.maintenanceState = .running(
            operation: .downloadAndInstall,
            progress: .installing
        )

        fixture.store.cancelMaintenance()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .running(operation: .downloadAndInstall, progress: .installing)
        )
        XCTAssertFalse(fixture.store.maintenanceState.canCancel)
    }

    func testCatalogAccessibilityAnnouncementsIgnorePercentageChurn() {
        let first = CatalogMaintenanceState.running(
            operation: .downloadAndInstall,
            progress: .downloading(fraction: 0.1)
        )
        let second = CatalogMaintenanceState.running(
            operation: .downloadAndInstall,
            progress: .downloading(fraction: 0.9)
        )

        XCTAssertEqual(first.accessibilityAnnouncement, second.accessibilityAnnouncement)
        XCTAssertEqual(
            CatalogMaintenanceState.completed(
                operation: .downloadAndInstall,
                songCount: 40_979
            ).accessibilityAnnouncement,
            "Catalog update complete. \(40_979.formatted()) songs ready."
        )
    }

    @MainActor
    func testLibraryLoadDistinguishesEmptyAndReadyCatalogs() async throws {
        let maintenance = ScriptedCatalogMaintenanceService()
        let empty = try makeLibraryStore(maintenance: maintenance)
        defer { empty.cleanup() }
        let ready = try makeLibraryStore(maintenance: maintenance, catalogCount: 40_979)
        defer { ready.cleanup() }

        await empty.store.load()
        await ready.store.load()

        XCTAssertEqual(empty.store.catalogState, .empty)
        XCTAssertEqual(ready.store.catalogState, .content(40_979))
    }

    @MainActor
    func testLibraryLoadReportsPreparationFailure() async throws {
        let fixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            prepareCatalog: { throw TestCatalogFailure() }
        )
        defer { fixture.cleanup() }

        await fixture.store.load()

        XCTAssertEqual(fixture.store.catalogState, .failure("Test catalog failure."))
    }

    @MainActor
    func testFullCatalogInstallCanRepairAPreparationFailure() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { progressStream([.completed(songCount: 999)]) }
        ])
        let fixture = try makeLibraryStore(
            maintenance: maintenance,
            catalogCount: 9,
            prepareCatalog: { throw TestCatalogFailure() }
        )
        defer { fixture.cleanup() }

        await fixture.store.load()
        XCTAssertTrue(fixture.store.canInstallCatalog)
        XCTAssertFalse(fixture.store.canHarvest)

        fixture.store.installCatalog()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(fixture.store.catalogState, .content(9))
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .completed(operation: .downloadAndInstall, songCount: 9)
        )
    }

    @MainActor
    private func makeLibraryStore(
        maintenance: any CatalogMaintenanceService,
        catalogCount: Int = 0,
        catalogCountThrows: Bool = false,
        prepareCatalog: @escaping @MainActor () async throws -> Void = {}
    ) throws -> (store: LibraryStore, cleanup: () -> Void) {
        let catalog = StubCatalogRepository(
            songCount: catalogCount,
            failsSongCount: catalogCountThrows
        )
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: PlaylistRecord.self, PlaylistEntryRecord.self,
            configurations: configuration
        )
        let historySuite = "AcquiringTests.\(UUID().uuidString)"
        let history = HistoryStore(suiteName: historySuite)
        let store = LibraryStore(
            catalog: catalog,
            maintenance: maintenance,
            history: history,
            userLibrary: try UserLibraryStore(context: container.mainContext),
            prepareCatalog: prepareCatalog
        )
        store.catalogState = catalogCount == 0 ? .empty : .content(catalogCount)
        return (
            store,
            {
                UserDefaults(suiteName: historySuite)?.removePersistentDomain(forName: historySuite)
                _ = container
            }
        )
    }
}

private struct TestCatalogFailure: LocalizedError, Sendable {
    var errorDescription: String? { "Test catalog failure." }
}

private final class ScriptedCatalogMaintenanceService: CatalogMaintenanceService, @unchecked Sendable {
    typealias Stream = AsyncThrowingStream<CatalogProgress, any Error>

    private let lock = NSLock()
    private var downloads: [@Sendable () -> Stream]
    private var harvests: [@Sendable (URL) -> Stream]
    private var downloadCalls = 0
    private var requestedHarvestURLs: [URL] = []

    init(
        downloads: [@Sendable () -> Stream] = [],
        harvests: [@Sendable (URL) -> Stream] = []
    ) {
        self.downloads = downloads
        self.harvests = harvests
    }

    var downloadCallCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return downloadCalls
    }

    var harvestURLs: [URL] {
        lock.lock()
        defer { lock.unlock() }
        return requestedHarvestURLs
    }

    func downloadAndInstall() -> Stream {
        lock.lock()
        downloadCalls += 1
        let factory = downloads.isEmpty ? nil : downloads.removeFirst()
        lock.unlock()
        return factory?() ?? failureStream(TestCatalogFailure())
    }

    func harvest(url: URL) -> Stream {
        lock.lock()
        requestedHarvestURLs.append(url)
        let factory = harvests.isEmpty ? nil : harvests.removeFirst()
        lock.unlock()
        return factory?(url) ?? failureStream(TestCatalogFailure())
    }
}

private actor StubCatalogRepository: CatalogRepository {
    let count: Int
    let failsSongCount: Bool

    init(songCount: Int, failsSongCount: Bool = false) {
        count = songCount
        self.failsSongCount = failsSongCount
    }

    func status() -> CatalogStatus {
        count == 0 ? .unavailable : .ready(songCount: count)
    }

    func songCount() throws -> Int {
        if failsSongCount { throw TestCatalogFailure() }
        return count
    }
    func song(id: String) -> CatalogSong? { nil }
    func songDocument(id: String) throws -> SongDocument { throw CatalogError.missingSong(id) }
    func searchSongs(title query: String) -> [CatalogSong] { [] }
    func songSuggestions(query: String, limit: Int, offset: Int) -> [CatalogSong] { [] }
    func artistSuggestions(query: String, limit: Int, offset: Int) -> [String] { [] }
    func songs(artist: String) -> [CatalogSong] { [] }
    func songs(ids: [String]) -> [CatalogSong] { [] }
    func browseMetadata() -> BrowseMetadataStatus {
        .init(browseCount: 0, ratedSongCount: 0, modeMembershipCount: 0)
    }
    func browseCounts(mode: BrowseMode, filter: String) -> [BrowseGroupCount] { [] }
    func browseSongs(group: BrowseGroup, filter: String) -> [CatalogSong] { [] }
}

private actor CancellationProbe {
    private(set) var terminationCount = 0

    func recordProducerTermination() {
        terminationCount += 1
    }
}

private func progressStream(
    _ progress: [CatalogProgress]
) -> AsyncThrowingStream<CatalogProgress, any Error> {
    AsyncThrowingStream { continuation in
        for value in progress { continuation.yield(value) }
        continuation.finish()
    }
}

private func failureStream(
    _ error: any Error & Sendable
) -> AsyncThrowingStream<CatalogProgress, any Error> {
    AsyncThrowingStream { continuation in
        continuation.finish(throwing: error)
    }
}
