import AcquiringCatalog
import AcquiringCore
import Foundation
import SwiftData
import XCTest
import UIKit
@testable import Acquiring

final class AcquiringTests: XCTestCase {
    @MainActor
    func testMelodyIntervalRobotoBoldIsBundledAndRegistered() throws {
        let font = try XCTUnwrap(UIFont(name: "Roboto-Bold", size: 32))
        XCTAssertEqual(font.fontName, "Roboto-Bold")
        XCTAssertTrue(font.fontDescriptor.symbolicTraits.contains(.traitBold))
        XCTAssertNotNil(Bundle.main.url(forResource: "Roboto-Bold", withExtension: "ttf", subdirectory: "Fonts"))
        XCTAssertNotNil(Bundle.main.url(forResource: "OFL", withExtension: "txt", subdirectory: "Fonts"))
    }

    func testUITestCatalogFixtureContainsTheRequestedCompressedSongs() throws {
        let fixture = try UITestCatalogFixture.load(from: Bundle(for: AcquiringTests.self))

        XCTAssertEqual(fixture.source.snapshot, "acquiring-full-catalog-fixture-source.db")
        XCTAssertEqual(fixture.source.schemaVersion, 3)
        XCTAssertEqual(fixture.source.songCount, 40_979)
        XCTAssertEqual(fixture.source.payloadEncoding, "base64-chunks")
        XCTAssertEqual(fixture.source.payloadCompression, "gzip")
        XCTAssertEqual(fixture.songs.map(\.id), [
            "weird-al-yankovic__everything-you-know-is-wrong",
            "the-proclaimers__500-miles",
            "olivia-rodrigo__drop-dead",
            "lady-gaga__bad-romance",
            "billy-joel__honesty",
            "scott-joplin__the-entertainer",
            "scott-joplin__gladiolus-rag",
            "queen__bohemian-rhapsody"
        ])
        let expectedChecksums = [
            "weird-al-yankovic__everything-you-know-is-wrong": "8674ec36bc3fc170d20028e20612b6b0c6c65c63e650c1ccff621883ff6b3cff",
            "the-proclaimers__500-miles": "42ad263451e6812d4f5e3636b46f8d4030e7bd41f4160d0cf0089fc54634e4d1",
            "olivia-rodrigo__drop-dead": "1ea9f1be0ecc0306c28c0cb67ef15fc5b3d84f958ab78112d32210fcddb29ef6",
            "lady-gaga__bad-romance": "652096b49593d8f6201f17a174264ed67b48fc212a75e44e178ecd2fb01642c2",
            "billy-joel__honesty": "26125f6c2dabd5a8bacfee1af5a18e139f40caeb341532d124e1ff955a2b9549",
            "scott-joplin__the-entertainer": "6fff797a517d508317d48767a763a23d4b63867a0ae77afc844ed91e2782235f",
            "scott-joplin__gladiolus-rag": "99f081f3e283652167e0c018dff24890efeffc8a3077a13f4ae3ea7dac5ff539",
            "queen__bohemian-rhapsody": "7b45210a17a65b30aebf05611e775225c85c49deb4c7f39ad66b4d389bb872bb"
        ]

        for song in fixture.songs {
            let payload = try song.compressedPayload()
            XCTAssertFalse(payload.isEmpty, song.id)
            XCTAssertTrue(payload.starts(with: [0x1F, 0x8B]), song.id)
            XCTAssertEqual(payload.count, song.compressedPayloadByteCount, song.id)
            XCTAssertEqual(song.compressedPayloadSHA256, expectedChecksums[song.id], song.id)
            XCTAssertEqual(try song.catalogSong().status, "enriched", song.id)
        }
    }

    @MainActor
    func testUITestCatalogFixtureInstallsAndDecodesEverySong() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "AcquiringTests-UIFixture-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }

        let coordinator = CatalogCoordinator(
            configuration: CatalogConfiguration(
                directoryURL: directory,
                downloadURL: URL(string: "https://example.invalid/catalog.db.gz")!
            )
        )
        try await coordinator.prepare()
        let installedCount = try await AppEnvironment.installUITestCatalog(
            into: coordinator,
            bundle: Bundle(for: AcquiringTests.self)
        )
        XCTAssertEqual(installedCount, 8)

        let fixture = try UITestCatalogFixture.load(from: Bundle(for: AcquiringTests.self))
        for song in fixture.songs {
            let document = try await coordinator.songDocument(id: song.id)
            XCTAssertEqual(document.song.id, song.id)
            XCTAssertFalse(document.sections.isEmpty, song.id)
        }
    }

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

    func testChordTimelinePresentationKeepsAndroidTimelineSemantics() {
        let section = ExtractedSection(
            sectionName: "Timeline",
            chords: [
                ["root": .number(1), "type": .number(5), "beat": .number(0), "duration": .number(1)],
                ["rest": .bool(true), "beat": .number(3), "duration": .number(1)],
                ["root": .number(1), "type": .number(5), "beat": .number(5), "duration": .number(2)]
            ],
            metadata: [
                "keys": .array([
                    .object(["tonic": .string("C"), "scale": .string("major"), "beat": .number(1)]),
                    .object(["tonic": .string("C"), "scale": .string("minor"), "beat": .number(5)])
                ])
            ]
        )

        let presentation = ChordTimelinePresentation(section: section)

        XCTAssertEqual(presentation.visuals.map(\.onset), [1, 3, 5])
        XCTAssertEqual(presentation.visuals.map(\.duration), [1, 1, 2])
        XCTAssertEqual(presentation.visuals[0].display?.symbol, "I", "a later modulation must not relabel earlier chords")
        XCTAssertEqual(presentation.localX(for: presentation.visuals[1]), 120)
        XCTAssertEqual(presentation.width(for: presentation.visuals[2]), 120)
        XCTAssertGreaterThan(
            presentation.localX(for: presentation.visuals[1]),
            presentation.localX(for: presentation.visuals[0]) + presentation.width(for: presentation.visuals[0]),
            "a missing chord interval remains a natural gap"
        )
        XCTAssertNil(presentation.visuals[1].display, "rests are blocks with no numeral")
        XCTAssertTrue(presentation.visuals[1].isRest)
        XCTAssertEqual(presentation.visuals[2].display?.symbol, "i", "the key at onset determines the numeral")
    }

    func testChordTimelinePresentationUsesHalfOpenLatestActiveEventAndFixedPlayhead() {
        let section = ExtractedSection(
            sectionName: "Timeline",
            chords: [
                ["root": .number(1), "type": .number(5), "beat": .number(1), "duration": .number(2)],
                ["root": .number(5), "type": .number(5), "beat": .number(2), "duration": .number(2)]
            ]
        )
        let presentation = ChordTimelinePresentation(section: section)

        XCTAssertEqual(presentation.activeVisual(at: 1)?.sourceIndex, 0)
        XCTAssertEqual(presentation.activeVisual(at: 2)?.sourceIndex, 1)
        XCTAssertNil(presentation.activeVisual(at: 4))

        let containerWidth: CGFloat = 320
        let active = presentation.visuals[1]
        XCTAssertEqual(
            presentation.x(for: active, containerWidth: containerWidth, currentBeat: active.onset),
            containerWidth / 2,
            accuracy: 0.001
        )
        XCTAssertEqual(ChordTimelinePresentation.progressAnimationDuration(reduceMotion: false), 0.12)
        XCTAssertNil(ChordTimelinePresentation.progressAnimationDuration(reduceMotion: true))
    }

    func testMelodyTimelinePresentationUsesAndroidPitchAndTimelineCoordinates() {
        let section = ExtractedSection(
            sectionName: "Timeline",
            notes: .array([
                .object(["sd": .string("1"), "beat": .number(1), "duration": .number(1)]),
                .object(["rest": .bool(true), "beat": .number(2), "duration": .number(1)]),
                .object(["sd": .string("#4"), "beat": .number(4), "duration": .number(0.5), "octave": .number(1)]),
                .object(["sd": .string("5"), "beat": .number(3), "duration": .number(1)]),
                .object(["sd": .string("6"), "beat": .number(4), "duration": .number(1)])
            ])
        )

        let presentation = MelodyTimelinePresentation(section: section)

        XCTAssertEqual(presentation.restCount, 1)
        XCTAssertEqual(presentation.visuals.map(\.sourceIndex), [0, 2, 3, 4])
        XCTAssertEqual(presentation.visuals.map(\.onset), [1, 4, 3, 4])
        XCTAssertEqual(presentation.visuals.map(\.staffDegree), [1, 11, 5, 6])
        XCTAssertEqual(presentation.noteHeight, 5)
        XCTAssertEqual(presentation.localX(for: presentation.visuals[1]), 180)
        XCTAssertEqual(presentation.width(for: presentation.visuals[1]), 30)
        XCTAssertLessThan(
            presentation.y(for: presentation.visuals[1]),
            presentation.y(for: presentation.visuals[3]),
            "higher staff degrees render higher in the lane"
        )
        XCTAssertGreaterThan(
            presentation.localX(for: presentation.visuals[1]),
            presentation.localX(for: presentation.visuals[0]) + presentation.width(for: presentation.visuals[0]),
            "rests and missing events remain blank gaps"
        )
        XCTAssertEqual(
            presentation.x(for: presentation.visuals[1], containerWidth: 320, currentBeat: 4),
            160,
            accuracy: 0.001
        )
    }

    func testPreviewPlaybackGenerationKeepsLatestRequestCurrent() {
        let generation = PreviewPlaybackGeneration()
        let first = generation.begin()
        XCTAssertTrue(generation.isCurrent(first))

        let second = generation.begin()
        XCTAssertFalse(generation.isCurrent(first))
        XCTAssertTrue(generation.isCurrent(second))
        XCTAssertFalse(generation.invalidate(ifCurrent: first))
        XCTAssertTrue(generation.isCurrent(second))

        XCTAssertTrue(generation.invalidate(ifCurrent: second))
        XCTAssertFalse(generation.isCurrent(second))
    }

    func testPreviewPlaybackGenerationStopInvalidatesPendingRequest() {
        let generation = PreviewPlaybackGeneration()
        let request = generation.begin()

        generation.invalidate()

        XCTAssertFalse(generation.isCurrent(request))
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
    func testCatalogReplacementPreservesFavoritesAndCustomPlaylistMembership() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { progressStream([.completed(songCount: 1)]) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 1)
        defer { fixture.cleanup() }
        let slug = "artist__saved-song"
        let customPlaylist = PlaylistRecord(id: "custom", name: "Custom")
        fixture.modelContext.insert(customPlaylist)
        try fixture.modelContext.save()
        XCTAssertTrue(try fixture.userLibrary.toggle(slug: slug))
        XCTAssertTrue(try fixture.userLibrary.toggle(slug: slug, playlistID: customPlaylist.id))

        fixture.store.installCatalog()
        await fixture.store.waitForMaintenance()

        XCTAssertTrue(try fixture.userLibrary.contains(slug: slug))
        XCTAssertTrue(try fixture.userLibrary.contains(slug: slug, playlistID: customPlaylist.id))
        let summaries = Dictionary(uniqueKeysWithValues: try fixture.userLibrary.summaries().map {
            ($0.id, $0.count)
        })
        XCTAssertEqual(summaries[UserLibraryStore.favoritesID], 1)
        XCTAssertEqual(summaries[customPlaylist.id], 1)
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
        second.store.cancelMaintenance()
        await second.store.waitForMaintenance()

        XCTAssertEqual(underlying.downloadCallCount, 1)
        XCTAssertTrue(first.store.maintenanceState.isRunning)
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

    func testAppScopedGateReleasesBeforeForwardingCompletion() async throws {
        let underlying = ScriptedCatalogMaintenanceService(downloads: [
            { progressStream([.completed(songCount: 1)]) },
            { progressStream([.completed(songCount: 2)]) }
        ])
        let maintenance = ExclusiveCatalogMaintenanceService(base: underlying)
        let first = maintenance.downloadAndInstall()
        var iterator = first.events.makeAsyncIterator()

        let firstProgress = try await iterator.next()
        XCTAssertEqual(firstProgress, .completed(songCount: 1))

        let second = maintenance.downloadAndInstall()
        var secondProgress: [CatalogProgress] = []
        for try await progress in second.events { secondProgress.append(progress) }

        XCTAssertEqual(underlying.downloadCallCount, 2)
        XCTAssertEqual(secondProgress, [.completed(songCount: 2)])
    }

    func testDroppingObserverDuringCommitKeepsAppScopedGateUntilSourceTerminal() async throws {
        let pair = AsyncThrowingStream<CatalogProgress, any Error>.makeStream()
        let observerSawInstalling = expectation(description: "observer consumed installing progress")
        let gateReleased = expectation(description: "app-scoped gate released")
        let gateReleaseSignal = OneShotExpectation(gateReleased)
        let underlying = ScriptedCatalogMaintenanceService(
            downloads: [
                { pair.stream },
                { progressStream([.completed(songCount: 2)]) }
            ],
            cancellationDispositions: [.commitInProgress]
        )
        let maintenance = ExclusiveCatalogMaintenanceService(
            base: underlying,
            didRelease: { gateReleaseSignal.fulfill() }
        )
        let first = maintenance.downloadAndInstall()
        let observer = Task {
            do {
                for try await progress in first.events {
                    if progress == .installing {
                        observerSawInstalling.fulfill()
                    }
                }
            } catch {
                // Cancellation of the outer observer is the behavior under test.
            }
        }

        pair.continuation.yield(.installing)
        await fulfillment(of: [observerSawInstalling], timeout: 2)
        observer.cancel()
        _ = await observer.result

        let blocked = maintenance.downloadAndInstall()
        do {
            for try await _ in blocked.events {}
            XCTFail("a dropped observer must not release the gate during commit")
        } catch {
            XCTAssertEqual(
                error.localizedDescription,
                "Another catalog operation is already running in a different window."
            )
        }
        XCTAssertEqual(underlying.downloadCallCount, 1)

        pair.continuation.yield(.completed(songCount: 1))
        pair.continuation.finish()
        await fulfillment(of: [gateReleased], timeout: 2)

        let retry = maintenance.downloadAndInstall()
        var acceptedProgress: [CatalogProgress] = []
        for try await value in retry.events { acceptedProgress.append(value) }

        XCTAssertEqual(underlying.downloadCallCount, 2)
        XCTAssertEqual(acceptedProgress, [.completed(songCount: 2)])
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

    @MainActor
    func testLateCancellationReconcilesToCommitAndConsumesCompletion() async throws {
        let pair = AsyncThrowingStream<CatalogProgress, any Error>.makeStream()
        let maintenance = ScriptedCatalogMaintenanceService(
            downloads: [{ pair.stream }],
            cancellationDispositions: [.commitInProgress]
        )
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 42)
        defer { fixture.cleanup() }

        fixture.store.installCatalog()
        pair.continuation.yield(.validating)
        for _ in 0..<100 {
            if fixture.store.maintenanceState == .running(
                operation: .downloadAndInstall,
                progress: .validating
            ) { break }
            await Task.yield()
        }

        fixture.store.cancelMaintenance()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .running(operation: .downloadAndInstall, progress: .installing)
        )
        XCTAssertFalse(fixture.store.maintenanceState.canCancel)

        pair.continuation.yield(.completed(songCount: 999))
        pair.continuation.finish()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(
            fixture.store.maintenanceState,
            .completed(operation: .downloadAndInstall, songCount: 42)
        )
        XCTAssertEqual(fixture.store.catalogState, .content(42))
    }

    @MainActor
    func testAcceptedCancellationIgnoresBufferedProgressUntilTerminalCancellation() async throws {
        let pair = AsyncThrowingStream<CatalogProgress, any Error>.makeStream()
        let maintenance = ScriptedCatalogMaintenanceService(
            downloads: [{ pair.stream }],
            cancellationDispositions: [.accepted]
        )
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 7)
        defer { fixture.cleanup() }

        fixture.store.installCatalog()
        fixture.store.cancelMaintenance()
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .cancelling(operation: .downloadAndInstall)
        )

        pair.continuation.yield(.validating)
        for _ in 0..<20 { await Task.yield() }
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .cancelling(operation: .downloadAndInstall)
        )

        pair.continuation.finish(throwing: URLError(.cancelled))
        await fixture.store.waitForMaintenance()
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .cancelled(operation: .downloadAndInstall)
        )
        XCTAssertEqual(fixture.store.catalogState, .content(7))
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
    func testBlankSearchShowsRecentsOnlyAfterTheCurrentScopeReceivesFocus() throws {
        let fixture = try makeLibraryStore(maintenance: ScriptedCatalogMaintenanceService())
        defer { fixture.cleanup() }

        XCTAssertFalse(fixture.store.shouldShowRecentContent)

        fixture.store.setSearchFocused(true, for: .songs)
        XCTAssertTrue(fixture.store.shouldShowRecentContent)

        fixture.store.searchScope = .artists
        XCTAssertFalse(fixture.store.shouldShowRecentContent)
        fixture.store.setSearchFocused(true, for: .artists)
        XCTAssertTrue(fixture.store.shouldShowRecentContent)

        fixture.store.query = "Miles"
        XCTAssertFalse(fixture.store.shouldShowRecentContent)
        fixture.store.query = ""
        XCTAssertTrue(fixture.store.shouldShowRecentContent)
    }

    @MainActor
    func testSubmittingSongSearchRunsWithoutWaitingForTheDebounce() async throws {
        let expected = CatalogSong(
            id: "the-proclaimers__500-miles",
            artist: "The Proclaimers",
            title: "500 Miles"
        )
        let fixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            songSuggestions: [expected]
        )
        defer { fixture.cleanup() }

        fixture.store.query = "500 Miles"
        fixture.store.submitSearch()

        for _ in 0..<20 where fixture.store.suggestions != .content([expected]) {
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(fixture.store.suggestions, .content([expected]))
    }

    @MainActor
    func testFailedSecondSuggestionPageRetainsFirstPageAndPublishesPagingError() async throws {
        let fixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            failingSongSuggestionOffset: 20
        )
        defer { fixture.cleanup() }
        let firstPage = (0..<20).map {
            CatalogSong(id: "artist__song-\($0)", artist: "Artist", title: "Song \($0)")
        }
        fixture.store.query = "Song"
        fixture.store.suggestions = .content(firstPage)
        fixture.store.hasMoreSongSuggestions = true

        fixture.store.loadMoreSuggestions()
        for _ in 0..<20 where fixture.store.pagingError == nil {
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(fixture.store.suggestions, .content(firstPage))
        XCTAssertEqual(fixture.store.pagingError, "Test catalog failure.")
        XCTAssertFalse(fixture.store.isLoadingMoreSuggestions)
        XCTAssertTrue(fixture.store.hasMoreSongSuggestions)
        fixture.store.query = ""
    }

    @MainActor
    func testOpeningSongArtistPreservesOriginAndAvoidsDuplicateArtistRoute() async throws {
        let fixture = try makeLibraryStore(maintenance: ScriptedCatalogMaintenanceService())
        defer { fixture.cleanup() }
        let song = CatalogSong(
            id: "the-beatles__help",
            artist: "The-Beatles",
            title: "Help"
        )

        fixture.store.path = [.songDetail(song.id), .quiz(song.id)]
        await fixture.store.openArtist(from: song)
        XCTAssertEqual(fixture.store.path, [.artist("The Beatles")])

        fixture.store.path += [.songDetail(song.id), .quiz(song.id)]
        await fixture.store.openArtist(from: song)
        XCTAssertEqual(fixture.store.path, [.artist("The Beatles")])

        await fixture.store.refreshUserContent()
        XCTAssertEqual(fixture.store.recentArtists, ["The Beatles"])
    }

    @MainActor
    func testLibraryLoadPublishesLoadingUntilPreparationCompletes() async throws {
        let preparationStarted = AsyncStream<Void>.makeStream()
        let preparationRelease = AsyncStream<Void>.makeStream()
        let fixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            catalogCount: 7,
            prepareCatalog: {
                preparationStarted.continuation.yield(())
                preparationStarted.continuation.finish()
                for await _ in preparationRelease.stream { break }
            }
        )
        defer { fixture.cleanup() }
        var startedIterator = preparationStarted.stream.makeAsyncIterator()

        let loadTask = Task { await fixture.store.load() }
        _ = await startedIterator.next()

        XCTAssertEqual(fixture.store.catalogState, .loading)

        preparationRelease.continuation.yield(())
        preparationRelease.continuation.finish()
        await loadTask.value
        XCTAssertEqual(fixture.store.catalogState, .content(7))
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
    func testLibraryLoadCanRetryPreparationFailureAndBecomeReady() async throws {
        var preparationAttempts = 0
        let fixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            catalogCount: 9,
            prepareCatalog: {
                preparationAttempts += 1
                if preparationAttempts == 1 { throw TestCatalogFailure() }
            }
        )
        defer { fixture.cleanup() }

        await fixture.store.load()
        XCTAssertEqual(fixture.store.catalogState, .failure("Test catalog failure."))

        await fixture.store.load()
        XCTAssertEqual(fixture.store.catalogState, .content(9))
        XCTAssertEqual(preparationAttempts, 2)
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
        failingSongSuggestionOffset: Int? = nil,
        songSuggestions: [CatalogSong] = [],
        prepareCatalog: @escaping @MainActor () async throws -> Void = {}
    ) throws -> (
        store: LibraryStore,
        userLibrary: UserLibraryStore,
        modelContext: ModelContext,
        cleanup: () -> Void
    ) {
        let catalog = StubCatalogRepository(
            songCount: catalogCount,
            failsSongCount: catalogCountThrows,
            failingSongSuggestionOffset: failingSongSuggestionOffset,
            songSuggestions: songSuggestions
        )
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: PlaylistRecord.self, PlaylistEntryRecord.self,
            configurations: configuration
        )
        let historySuite = "AcquiringTests.\(UUID().uuidString)"
        let history = HistoryStore(suiteName: historySuite)
        let userLibrary = try UserLibraryStore(context: container.mainContext)
        let store = LibraryStore(
            catalog: catalog,
            maintenance: maintenance,
            history: history,
            userLibrary: userLibrary,
            prepareCatalog: prepareCatalog
        )
        store.catalogState = catalogCount == 0 ? .empty : .content(catalogCount)
        return (
            store,
            userLibrary,
            container.mainContext,
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

private final class TestMaintenanceRunController: @unchecked Sendable {
    private let lock = NSLock()
    private var task: Task<Void, Never>?
    private var isFinished = false

    func attach(_ task: Task<Void, Never>) {
        lock.lock()
        if !isFinished { self.task = task }
        lock.unlock()
    }

    func finish() {
        lock.lock()
        isFinished = true
        task = nil
        lock.unlock()
    }

    func requestCancellation() -> CatalogCancellationDisposition {
        let task: Task<Void, Never>?
        lock.lock()
        if isFinished {
            task = nil
        } else {
            isFinished = true
            task = self.task
            self.task = nil
        }
        lock.unlock()
        guard let task else { return .noOperation }
        task.cancel()
        return .accepted
    }
}

private final class ScriptedCatalogMaintenanceService: CatalogMaintenanceService, @unchecked Sendable {
    typealias Stream = AsyncThrowingStream<CatalogProgress, any Error>

    private let lock = NSLock()
    private var downloads: [@Sendable () -> Stream]
    private var harvests: [@Sendable (URL) -> Stream]
    private var cancellationDispositions: [CatalogCancellationDisposition]
    private var downloadCalls = 0
    private var requestedHarvestURLs: [URL] = []

    init(
        downloads: [@Sendable () -> Stream] = [],
        harvests: [@Sendable (URL) -> Stream] = [],
        cancellationDispositions: [CatalogCancellationDisposition] = []
    ) {
        self.downloads = downloads
        self.harvests = harvests
        self.cancellationDispositions = cancellationDispositions
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

    func downloadAndInstall() -> CatalogMaintenanceRun {
        lock.lock()
        downloadCalls += 1
        let factory = downloads.isEmpty ? nil : downloads.removeFirst()
        lock.unlock()
        return managedRun(factory?() ?? failureStream(TestCatalogFailure()))
    }

    func harvest(url: URL) -> CatalogMaintenanceRun {
        lock.lock()
        requestedHarvestURLs.append(url)
        let factory = harvests.isEmpty ? nil : harvests.removeFirst()
        lock.unlock()
        return managedRun(factory?(url) ?? failureStream(TestCatalogFailure()))
    }

    private func managedRun(_ source: Stream) -> CatalogMaintenanceRun {
        let controller = TestMaintenanceRunController()
        let events = Stream { continuation in
            let task = Task {
                do {
                    for try await progress in source {
                        if case .completed = progress { controller.finish() }
                        continuation.yield(progress)
                    }
                    controller.finish()
                    continuation.finish()
                } catch is CancellationError {
                    controller.finish()
                    continuation.finish()
                } catch {
                    controller.finish()
                    continuation.finish(throwing: error)
                }
            }
            controller.attach(task)
            continuation.onTermination = { _ in
                _ = controller.requestCancellation()
            }
        }
        return CatalogMaintenanceRun(events: events) { [weak self] in
            if let forced = self?.nextCancellationDisposition() {
                return forced
            }
            return controller.requestCancellation()
        }
    }

    private func nextCancellationDisposition() -> CatalogCancellationDisposition? {
        lock.lock()
        defer { lock.unlock() }
        return cancellationDispositions.isEmpty ? nil : cancellationDispositions.removeFirst()
    }
}

private actor StubCatalogRepository: CatalogRepository {
    let count: Int
    let failsSongCount: Bool
    let failingSongSuggestionOffset: Int?
    let songSuggestions: [CatalogSong]

    init(
        songCount: Int,
        failsSongCount: Bool = false,
        failingSongSuggestionOffset: Int? = nil,
        songSuggestions: [CatalogSong] = []
    ) {
        count = songCount
        self.failsSongCount = failsSongCount
        self.failingSongSuggestionOffset = failingSongSuggestionOffset
        self.songSuggestions = songSuggestions
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
    func songSuggestions(query: String, limit: Int, offset: Int) throws -> [CatalogSong] {
        if offset == failingSongSuggestionOffset { throw TestCatalogFailure() }
        guard offset == 0 else { return [] }
        return Array(songSuggestions.prefix(limit))
    }
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

private final class OneShotExpectation: @unchecked Sendable {
    private let expectation: XCTestExpectation
    private let lock = NSLock()
    private var hasFulfilled = false

    init(_ expectation: XCTestExpectation) {
        self.expectation = expectation
    }

    func fulfill() {
        lock.lock()
        guard !hasFulfilled else {
            lock.unlock()
            return
        }
        hasFulfilled = true
        lock.unlock()
        expectation.fulfill()
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
