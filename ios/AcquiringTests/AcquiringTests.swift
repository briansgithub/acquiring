import AcquiringCatalog
import AcquiringAudio
import AcquiringCore
import Foundation
import SwiftData
import XCTest
import UIKit
@testable import Acquiring

final class AcquiringTests: XCTestCase {
    @MainActor
    func testOpeningHelpDuringCollapsePreservesSingBackTargets() async throws {
        let model = VocalPracticeModel(audio: AppAudioSystem())
        let request = SingingTargetRequest(
            first: SingingTargetNote(sourceMIDI: 60, scaleDegreeLabel: "1"),
            second: SingingTargetNote(sourceMIDI: 67, scaleDegreeLabel: "5"),
            requestID: 1
        )
        model.requestSingBack(request)
        model.minimize()
        model.expandForHelp()

        // Cross the delayed collapse cleanup deadline. Help must cancel the
        // cleanup, not merely reopen the dock while the clear is still queued.
        try await Task.sleep(for: .milliseconds(350))
        XCTAssertTrue(model.isExpanded)
        XCTAssertEqual(model.targetRequest, request)
        XCTAssertFalse(model.isManualPracticeActive)
        XCTAssertNil(model.recordingSlot)
        XCTAssertNil(model.listeningSlot)
    }

    @MainActor
    func testQuizInstrumentSessionSeparatesCurrentSelectionFromSavedDefault() throws {
        let suiteName = "AcquiringTests.QuizInstrument.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let preferences = QuizInstrumentPreferences(defaults: defaults)

        XCTAssertEqual(preferences.savedDefault, .clarinet)
        defaults.set("removed-instrument", forKey: QuizInstrumentPreferences.defaultsKey)
        XCTAssertEqual(preferences.savedDefault, .clarinet)
        preferences.savedDefault = .flute

        var applied: [SynthWaveform] = []
        let session = QuizInstrumentSession(preferences: preferences) { applied.append($0) }
        XCTAssertEqual(session.selection, .flute)
        XCTAssertEqual(session.savedDefault, .flute)
        XCTAssertEqual(applied, [.flute])

        session.select(.electricPiano)
        XCTAssertEqual(session.selection, .electricPiano)
        XCTAssertEqual(session.savedDefault, .flute)
        XCTAssertEqual(preferences.savedDefault, .flute)

        session.saveDefault(.electricPiano)
        XCTAssertEqual(session.selection, .electricPiano)
        XCTAssertEqual(session.savedDefault, .electricPiano)
        XCTAssertEqual(preferences.savedDefault, .electricPiano)
        XCTAssertEqual(applied.last, .electricPiano)

        session.saveDefault(.clarinet)
        XCTAssertEqual(session.selection, .clarinet)
        XCTAssertEqual(session.savedDefault, .clarinet)
        XCTAssertEqual(preferences.savedDefault, .clarinet)

        let restarted = QuizInstrumentSession(preferences: preferences)
        XCTAssertEqual(restarted.selection, .clarinet)
        XCTAssertEqual(restarted.savedDefault, .clarinet)
    }

    @MainActor
    func testLifecycleInvalidatesQueuedQuizOwnerAndRetainsPositionForReentry() async throws {
        let audio = AppAudioSystem()
        let configuration = QuizSoundConfiguration(waveform: .triangle)
        let timeline = QuizTimeline(
            durationSeconds: 4,
            events: [QuizEvent(
                onsetSeconds: 0,
                durationSeconds: 4,
                frequenciesHz: [440],
                waveform: .triangle
            )]
        )
        let revision = audio.beginQuizReplacement(
            songID: "song",
            sectionID: "verse",
            tempoPercent: 100,
            soundConfiguration: configuration
        )
        try await audio.loadQuiz(
            timeline,
            songID: "song",
            sectionID: "verse",
            tempoPercent: 100,
            position: .restart,
            revision: revision,
            soundConfiguration: configuration
        )
        let firstOwner = try XCTUnwrap(audio.activateQuizPlaybackOwner(revision: revision))
        XCTAssertTrue(audio.seekQuiz(to: 0.5, revision: revision, owner: firstOwner))

        audio.pauseForAppInactivity()
        do {
            try await audio.playQuiz(revision: revision, owner: firstOwner)
            XCTFail("A play queued by the inactive Quiz must be rejected")
        } catch is CancellationError {
        }

        audio.setSessionInstrument(.flute)
        let reentryConfiguration = configuration.replacing(waveform: .flute)
        XCTAssertEqual(
            audio.restorableQuizRevision(
                songID: "song",
                sectionID: "verse",
                tempoPercent: 100,
                soundConfiguration: reentryConfiguration
            ),
            revision
        )
        let reenteredOwner = try XCTUnwrap(audio.activateQuizPlaybackOwner(revision: revision))
        try await audio.playQuiz(revision: revision, owner: reenteredOwner)
        var states = (await audio.states()).makeAsyncIterator()
        let nextState = await states.next()
        let resumed = try XCTUnwrap(nextState)
        XCTAssertEqual(resumed.phase, .playing)
        let elapsed = resumed.elapsed.components
        let elapsedSeconds = Double(elapsed.seconds) + Double(elapsed.attoseconds) / 1e18
        XCTAssertGreaterThan(elapsedSeconds, 1.9)

        let replacementOwner = try XCTUnwrap(audio.activateQuizPlaybackOwner(revision: revision))
        XCTAssertFalse(audio.pauseQuizForLifecycle(revision: revision, owner: reenteredOwner))
        var replacementStates = (await audio.states()).makeAsyncIterator()
        let nextReplacementState = await replacementStates.next()
        let replacementState = try XCTUnwrap(nextReplacementState)
        XCTAssertEqual(replacementState.phase, .playing)
        XCTAssertTrue(audio.pauseQuizForLifecycle(revision: revision, owner: replacementOwner))
    }

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

    func testHistoryKeepsOrderingLimitAndPreservesArtistIdentity() async throws {
        let suite = "AcquiringTests.\(UUID().uuidString)"
        let history = HistoryStore(suiteName: suite)
        for index in 0..<12 { await history.addSong("song-\(index)") }
        await history.addArtist("The-Beatles")
        await history.addArtist("the beatles")
        await history.addArtist(" Jay-Z ")
        await history.addArtist("jay-z")
        let songs = await history.songSlugs()
        let artists = await history.artists()
        XCTAssertEqual(songs, (2..<12).reversed().map { "song-\($0)" })
        XCTAssertEqual(artists, ["jay-z", "the beatles", "The-Beatles"])
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

    /// The app bundle only needs to prove the shipped contract is present and
    /// decodable, plus a few named chords. Scoring the whole corpus against the
    /// web reference is the SPM suite's job (ChordParityTests), which reads the
    /// same file from contracts/fixtures and ratchets against parity_baseline.json.
    func testSharedChordCorpusRegressionCases() throws {
        struct Fixture: Decodable {
            let id: String
            let json: String
            let key: KeyInfo
            let expectedRoman: String
            let expectedLetter: String
            let expectedMidi: [Int]
            let expectedToneLabels: [String]
        }
        let fixtureURL = try XCTUnwrap(
            Bundle(for: AcquiringTests.self).url(forResource: "corpus_parity", withExtension: "json")
        )
        let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: fixtureURL))
        XCTAssertGreaterThan(fixtures.count, 1000)

        // Named cases only: the borrowed-seventh pair from "Honesty" plus the
        // original hand-written benchmark, which the shipped engine must render
        // exactly.
        let named = Set([
            "Honesty i42(min) in Bb major", "Honesty bVI△7(min) in Bb major",
            "C Major I", "C Major V7", "C Major vii°7", "V7(∆-sub)",
            "iv(min) in C major", "bVII(mix) in C major", "III+△7 (HM)"
        ])
        var checked = 0
        for fixture in fixtures where named.contains(fixture.id) {
            checked += 1
            let chord = try JSONDecoder().decode([String: JSONValue].self, from: Data(fixture.json.utf8))
            XCTAssertEqual(ChordInterpreter.romanSymbol(for: chord, key: fixture.key), fixture.expectedRoman, fixture.id)
            XCTAssertEqual(ChordInterpreter.letterName(for: chord, key: fixture.key), fixture.expectedLetter, fixture.id)
            let notes = ChordInterpreter.chordNotes(for: chord, key: fixture.key)
            XCTAssertEqual(notes, fixture.expectedMidi, fixture.id)
            _ = try XCTUnwrap(ChordInterpreter.resolvedRootMIDI(for: chord, key: fixture.key), fixture.id)
            XCTAssertEqual(
                ChordInterpreter.chordToneLabels(for: chord, key: fixture.key),
                fixture.expectedToneLabels,
                fixture.id
            )
        }
        XCTAssertEqual(checked, named.count, "corpus lost a named regression case")
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
        XCTAssertEqual(
            presentation.noteHeight,
            MelodyTimelinePresentation.laneHeight / 28,
            accuracy: 0.0001
        )
        // Android's lane spans 28 staff steps (+/-2 octaves around degree 0);
        // staffDegree 14 must still land inside the lane, not above its top edge.
        XCTAssertGreaterThanOrEqual(
            MelodyTimelinePresentation.laneHeight / 2 - 14 * presentation.noteHeight,
            0,
            "the melody lane must show the same +/-14 staff-step window as Android"
        )
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
    func testEmptyCatalogAutomaticallyInstallsOnlyOncePerStore() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { failureStream(TestCatalogFailure()) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance)
        defer { fixture.cleanup() }

        await fixture.store.load()
        await fixture.store.waitForMaintenance()
        XCTAssertEqual(maintenance.downloadCallCount, 1)
        XCTAssertEqual(
            fixture.store.maintenanceState,
            .failed(operation: .downloadAndInstall, message: "Test catalog failure.")
        )

        await fixture.store.load()
        XCTAssertEqual(maintenance.downloadCallCount, 1)
    }

    @MainActor
    func testMissingCatalogNoticeSurvivesFailedManualRetry() async throws {
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { failureStream(TestCatalogFailure()) },
            { failureStream(TestCatalogFailure()) }
        ])
        let fixture = try makeLibraryStore(maintenance: maintenance)
        defer { fixture.cleanup() }

        await fixture.store.load()
        await fixture.store.waitForMaintenance()

        XCTAssertFalse(fixture.store.hasInstalledCatalog)
        XCTAssertTrue(fixture.store.isAutomaticCatalogInstall)
        XCTAssertFalse(fixture.store.isAutomaticCatalogInstallRunning)
        XCTAssertTrue(fixture.store.shouldShowMissingCatalogNotice)

        fixture.store.retryMaintenance()
        await fixture.store.waitForMaintenance()

        XCTAssertEqual(maintenance.downloadCallCount, 2)
        XCTAssertFalse(fixture.store.isAutomaticCatalogInstall)
        XCTAssertTrue(fixture.store.shouldShowMissingCatalogNotice)
    }

    @MainActor
    func testQueuedSearchRunsWhenAutomaticCatalogInstallMakesCatalogReady() async throws {
        let installRelease = AsyncStream<Void>.makeStream()
        let expected = CatalogSong(
            id: "the-proclaimers__500-miles",
            artist: "The Proclaimers",
            title: "500 Miles"
        )
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            {
                AsyncThrowingStream { continuation in
                    let producer = Task {
                        continuation.yield(.connecting)
                        var iterator = installRelease.stream.makeAsyncIterator()
                        _ = await iterator.next()
                        continuation.yield(.completed(songCount: 7))
                        continuation.finish()
                    }
                    continuation.onTermination = { _ in producer.cancel() }
                }
            }
        ])
        let fixture = try makeLibraryStore(
            maintenance: maintenance,
            catalogCount: 0,
            catalogCounts: [0, 7],
            songSuggestions: [expected]
        )
        defer { fixture.cleanup() }

        await fixture.store.load()
        XCTAssertTrue(fixture.store.isAutomaticCatalogInstallRunning)
        XCTAssertFalse(fixture.store.shouldShowMissingCatalogNotice)

        fixture.store.query = "500 Miles"
        fixture.store.submitSearch()
        try await Task.sleep(for: .milliseconds(20))
        XCTAssertEqual(fixture.store.suggestions, .idle)

        installRelease.continuation.yield(())
        installRelease.continuation.finish()
        await fixture.store.waitForMaintenance()
        for _ in 0..<20 where fixture.store.suggestions != .content([expected]) {
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertTrue(fixture.store.hasInstalledCatalog)
        XCTAssertTrue(fixture.store.isAutomaticCatalogInstall)
        XCTAssertFalse(fixture.store.isAutomaticCatalogInstallRunning)
        XCTAssertEqual(fixture.store.suggestions, .content([expected]))
    }

    @MainActor
    func testReadyCatalogDoesNotDownloadOnLaunch() async throws {
        let maintenance = ScriptedCatalogMaintenanceService()
        let fixture = try makeLibraryStore(maintenance: maintenance, catalogCount: 7)
        defer { fixture.cleanup() }

        await fixture.store.load()

        XCTAssertEqual(maintenance.downloadCallCount, 0)
        XCTAssertEqual(fixture.store.catalogState, .content(7))
    }

    @MainActor
    func testCatalogUpdateCheckDistinguishesCurrentAvailableAndUnknownInstalls() async throws {
        let current = CatalogAssetIdentity(eTag: "\"current\"", lastModified: nil, contentLength: 100)
        let newer = CatalogAssetIdentity(eTag: "\"newer\"", lastModified: nil, contentLength: 100)

        let currentFixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            assetMetadata: StubCatalogAssetMetadataService(remote: current, installed: current),
            catalogCount: 7
        )
        defer { currentFixture.cleanup() }
        currentFixture.store.maintenanceState = .running(operation: .downloadAndInstall, progress: .installing)
        await currentFixture.store.checkForCatalogUpdate()
        XCTAssertEqual(currentFixture.store.catalogUpdateState, .idle)
        currentFixture.store.maintenanceState = .idle
        await currentFixture.store.checkForCatalogUpdate()
        XCTAssertEqual(currentFixture.store.catalogUpdateState, .current)

        let updateFixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            assetMetadata: StubCatalogAssetMetadataService(remote: newer, installed: current),
            catalogCount: 7
        )
        defer { updateFixture.cleanup() }
        await updateFixture.store.checkForCatalogUpdate()
        XCTAssertEqual(updateFixture.store.catalogUpdateState, .updateAvailable)

        let legacyFixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            assetMetadata: StubCatalogAssetMetadataService(remote: newer, installed: nil),
            catalogCount: 7
        )
        defer { legacyFixture.cleanup() }
        await legacyFixture.store.checkForCatalogUpdate()
        XCTAssertEqual(legacyFixture.store.catalogUpdateState, .unknown)
    }

    @MainActor
    func testCatalogInstallSupersedesAnInFlightUpdateCheck() async throws {
        let started = AsyncStream<Void>.makeStream()
        let release = AsyncStream<Void>.makeStream()
        let oldIdentity = CatalogAssetIdentity(eTag: "\"old\"", lastModified: nil, contentLength: 100)
        let remoteIdentity = CatalogAssetIdentity(eTag: "\"new\"", lastModified: nil, contentLength: 200)
        let metadata = BlockingCatalogAssetMetadataService(
            remote: remoteIdentity,
            installed: oldIdentity,
            started: started.continuation,
            release: release.stream
        )
        let maintenance = ScriptedCatalogMaintenanceService(downloads: [
            { progressStream([.completed(songCount: 7)]) }
        ])
        let fixture = try makeLibraryStore(
            maintenance: maintenance,
            assetMetadata: metadata,
            catalogCount: 7
        )
        defer { fixture.cleanup() }
        var startedIterator = started.stream.makeAsyncIterator()

        let check = Task { await fixture.store.checkForCatalogUpdate() }
        _ = await startedIterator.next()
        fixture.store.installCatalog()
        await fixture.store.waitForMaintenance()
        release.continuation.yield(())
        release.continuation.finish()
        await check.value

        XCTAssertEqual(fixture.store.catalogUpdateState, .current)
    }

    func testExternalBetaManifestOnlyOffersAFreshNewerExternalBuild() async throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-08T12:00:00Z"))
        let response = try XCTUnwrap(HTTPURLResponse(
            url: ExternalBetaUpdateManifestService.manifestURL,
            statusCode: 200,
            httpVersion: nil,
            headerFields: nil
        ))
        let availableJSON = """
        {"schemaVersion":1,"channel":"external","generatedAt":"2026-09-08T12:00:00Z","validUntil":"2026-09-08T13:00:00Z","externalBuild":{"version":"1.0","build":"42","minimumOSVersion":"17.0","expiresAt":"2026-12-01T12:00:00Z"}}
        """
        let available = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(availableJSON.utf8), response) },
            installedVersion: "1.0",
            installedBuild: "41",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let availableResult = await available.check()
        let validUntil = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-08T13:00:00Z"))
        XCTAssertEqual(
            availableResult,
            ExternalBetaUpdateSnapshot(
                .available(ExternalBetaBuild(version: "1.0", build: "42")),
                validUntil: validUntil
            )
        )

        let staleJSON = availableJSON.replacingOccurrences(of: "2026-09-08T13:00:00Z", with: "2026-09-08T11:00:00Z")
        let stale = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(staleJSON.utf8), response) },
            installedVersion: "1.0",
            installedBuild: "41",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let staleResult = await stale.check()
        XCTAssertEqual(staleResult, ExternalBetaUpdateSnapshot(.unknown))

        let noExternalJSON = availableJSON.replacingOccurrences(
            of: "{\"version\":\"1.0\",\"build\":\"42\",\"minimumOSVersion\":\"17.0\",\"expiresAt\":\"2026-12-01T12:00:00Z\"}",
            with: "null"
        )
        let noExternalRelease = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(noExternalJSON.utf8), response) },
            installedVersion: "1.0",
            installedBuild: "41",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let noExternalResult = await noExternalRelease.check()
        XCTAssertEqual(noExternalResult.state, .noExternalRelease)

        let missingBuildJSON = """
        {"schemaVersion":1,"channel":"external","generatedAt":"2026-09-08T12:00:00Z","validUntil":"2026-09-08T13:00:00Z"}
        """
        let missingBuild = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(missingBuildJSON.utf8), response) },
            installedVersion: "1.0",
            installedBuild: "41",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let missingBuildResult = await missingBuild.check()
        XCTAssertEqual(missingBuildResult, ExternalBetaUpdateSnapshot(.unknown))
    }

    func testExternalBetaManifestDoesNotOfferInternalOrIncompatibleBuilds() async throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-08T12:00:00Z"))
        let response = try XCTUnwrap(HTTPURLResponse(
            url: ExternalBetaUpdateManifestService.manifestURL,
            statusCode: 200,
            httpVersion: nil,
            headerFields: nil
        ))
        let internalJSON = """
        {"schemaVersion":1,"channel":"internal","generatedAt":"2026-09-08T12:00:00Z","validUntil":"2026-09-08T13:00:00Z","externalBuild":{"version":"1.0","build":"42","minimumOSVersion":"17.0","expiresAt":"2026-12-01T12:00:00Z"}}
        """
        let internalManifest = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(internalJSON.utf8), response) },
            installedVersion: "1.0",
            installedBuild: "41",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let internalResult = await internalManifest.check()
        XCTAssertEqual(internalResult, ExternalBetaUpdateSnapshot(.unknown))

        let newerInstalledJSON = internalJSON.replacingOccurrences(of: "\"internal\"", with: "\"external\"")
        let newerInstalled = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(newerInstalledJSON.utf8), response) },
            installedVersion: "1.1",
            installedBuild: "1",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let newerInstalledResult = await newerInstalled.check()
        XCTAssertEqual(newerInstalledResult.state, .installedBuildIsNewer)

        let currentInstalled = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(newerInstalledJSON.utf8), response) },
            installedVersion: "1.0",
            installedBuild: "42",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let currentInstalledResult = await currentInstalled.check()
        XCTAssertEqual(currentInstalledResult.state, .current)

        let dottedBuildJSON = newerInstalledJSON.replacingOccurrences(
            of: "\"build\":\"42\"",
            with: "\"build\":\"1.0.2\""
        )
        let dottedBuild = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(dottedBuildJSON.utf8), response) },
            installedVersion: "1.0",
            installedBuild: "1.0.1",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let dottedBuildResult = await dottedBuild.check()
        XCTAssertEqual(
            dottedBuildResult.state,
            .available(ExternalBetaBuild(version: "1.0", build: "1.0.2"))
        )

        let equivalentVersion = ExternalBetaUpdateManifestService(
            fetchData: { _ in (
                Data(dottedBuildJSON.replacingOccurrences(of: "\"version\":\"1.0\"", with: "\"version\":\"1.0.0\"").utf8),
                response
            ) },
            installedVersion: "1",
            installedBuild: "1.0.2",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let equivalentVersionResult = await equivalentVersion.check()
        XCTAssertEqual(equivalentVersionResult.state, .current)

        let malformedBuild = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(newerInstalledJSON.replacingOccurrences(of: "\"42\"", with: "\"42a\"").utf8), response) },
            installedVersion: "1.0",
            installedBuild: "1",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let malformedBuildResult = await malformedBuild.check()
        XCTAssertEqual(malformedBuildResult.state, .unknown)

        let requiresNewerOSJSON = newerInstalledJSON
            .replacingOccurrences(of: "\"17.0\"", with: "\"18.0\"")
            .replacingOccurrences(of: "2026-12-01T12:00:00Z", with: "2026-09-08T12:30:00Z")
        let requiresNewerOS = ExternalBetaUpdateManifestService(
            fetchData: { _ in (Data(requiresNewerOSJSON.utf8), response) },
            installedVersion: "1.0",
            installedBuild: "1",
            operatingSystemVersion: [17, 0, 0],
            now: { now }
        )
        let newerOSResult = await requiresNewerOS.check()
        let minimumOSValidity = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-08T12:30:00Z"))
        XCTAssertEqual(newerOSResult.state, .unsupportedMinimumOS("18.0"))
        XCTAssertEqual(newerOSResult.validUntil, minimumOSValidity)
    }

    @MainActor
    func testExternalBetaAvailabilityDrivesTheSettingsIndicator() async throws {
        let fixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            externalBetaUpdates: StubExternalBetaUpdateService(
                ExternalBetaUpdateSnapshot(.available(ExternalBetaBuild(version: "1.0", build: "42")))
            ),
            catalogCount: 7
        )
        defer { fixture.cleanup() }

        await fixture.store.refreshUpdateIndicatorsIfNeeded()

        XCTAssertTrue(fixture.store.hasAvailableUpdate)
        XCTAssertEqual(fixture.store.updateIndicatorAccessibilityLabel, "Settings, beta update available")
        XCTAssertEqual(
            fixture.store.externalBetaUpdateState,
            .available(ExternalBetaBuild(version: "1.0", build: "42"))
        )

        let current = CatalogAssetIdentity(eTag: "\"current\"", lastModified: nil, contentLength: 100)
        let updated = CatalogAssetIdentity(eTag: "\"updated\"", lastModified: nil, contentLength: 100)
        let databaseOnly = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            assetMetadata: StubCatalogAssetMetadataService(remote: updated, installed: current),
            externalBetaUpdates: StubExternalBetaUpdateService(),
            catalogCount: 7
        )
        defer { databaseOnly.cleanup() }
        await databaseOnly.store.refreshUpdateIndicatorsIfNeeded()
        XCTAssertEqual(databaseOnly.store.updateIndicatorAccessibilityLabel, "Settings, database update available")

        let both = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            assetMetadata: StubCatalogAssetMetadataService(remote: updated, installed: current),
            externalBetaUpdates: StubExternalBetaUpdateService(
                ExternalBetaUpdateSnapshot(.available(ExternalBetaBuild(version: "1.0", build: "42")))
            ),
            catalogCount: 7
        )
        defer { both.cleanup() }
        await both.store.refreshUpdateIndicatorsIfNeeded()
        XCTAssertEqual(both.store.updateIndicatorAccessibilityLabel, "Settings, database and beta updates available")
    }

    @MainActor
    func testExternalBetaStateExpiresWhileTheLibraryRemainsVisible() async throws {
        let fixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            externalBetaUpdates: ExpiringExternalBetaUpdateService(),
            catalogCount: 7
        )
        defer { fixture.cleanup() }

        await fixture.store.refreshUpdateIndicatorsIfNeeded()
        XCTAssertTrue(fixture.store.hasAvailableUpdate)

        for _ in 0..<200 where fixture.store.externalBetaUpdateState != .unknown {
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(fixture.store.externalBetaUpdateState, .unknown)
        XCTAssertFalse(fixture.store.hasAvailableUpdate)

        await fixture.store.refreshUpdateIndicatorsIfNeeded()
        XCTAssertTrue(fixture.store.hasAvailableUpdate)
    }

    @MainActor
    func testBlankSearchKeepsRecentsVisibleWhenKeyboardIsDismissed() throws {
        let fixture = try makeLibraryStore(maintenance: ScriptedCatalogMaintenanceService())
        defer { fixture.cleanup() }

        for scope in SearchScope.allCases {
            fixture.store.searchScope = scope
            XCTAssertTrue(fixture.store.shouldShowRecentContent)
            fixture.store.setSearchFocused(true, for: scope)
            XCTAssertTrue(fixture.store.shouldShowRecentContent)
            fixture.store.setSearchFocused(false, for: scope)
            XCTAssertTrue(fixture.store.shouldShowRecentContent)

            fixture.store.query = "Miles"
            XCTAssertFalse(fixture.store.shouldShowRecentContent)
            fixture.store.query = "   "
            XCTAssertTrue(fixture.store.shouldShowRecentContent)
            fixture.store.query = ""
            XCTAssertTrue(fixture.store.shouldShowRecentContent)
        }
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
            catalogCount: 1,
            songSuggestions: [expected]
        )
        defer { fixture.cleanup() }
        await fixture.store.load()

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
            catalogCount: 20,
            failingSongSuggestionOffset: 20
        )
        defer { fixture.cleanup() }
        await fixture.store.load()
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
    func testOpeningQuizKeepsEachOriginWithoutInsertingInformation() async throws {
        let fixture = try makeLibraryStore(maintenance: ScriptedCatalogMaintenanceService())
        defer { fixture.cleanup() }
        let song = CatalogSong(id: "the-proclaimers__500-miles", artist: "the-proclaimers", title: "500 Miles")
        let origins: [[AppRoute]] = [[], [.artist("the-proclaimers")], [.allSongs], [.playlist("favorites")]]
        for origin in origins {
            fixture.store.path = origin
            fixture.store.openSong(song)
            XCTAssertEqual(fixture.store.path, origin + [.quiz(song.id)])
        }
    }

    @MainActor
    func testLegacyArtistHistoryResolvesCurrentNamesAndKeepsNewestOrder() async throws {
        let fixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            resolvedArtistNames: ["the proclaimers": "The Proclaimers", "the-proclaimers": "The Proclaimers"]
        )
        defer { fixture.cleanup() }
        await fixture.history.addArtist("the proclaimers")
        await fixture.history.addArtist("Jay-Z")
        await fixture.history.addArtist("the-proclaimers")
        await fixture.store.refreshUserContent()

        XCTAssertEqual(fixture.store.recentArtists, ["The Proclaimers", "Jay-Z"])
        let storedArtists = await fixture.history.artists()
        XCTAssertEqual(storedArtists, ["the-proclaimers", "Jay-Z", "the proclaimers"])
    }

    @MainActor
    func testOpeningSongArtistPreservesOriginAndAvoidsDuplicateArtistRoute() async throws {
        let fixture = try makeLibraryStore(maintenance: ScriptedCatalogMaintenanceService())
        defer { fixture.cleanup() }
        let song = CatalogSong(
            id: "jay-z__empire-state-of-mind",
            artist: "Jay-Z",
            title: "Empire State of Mind"
        )

        fixture.store.path = [.quiz(song.id), .songDetail(song.id)]
        await fixture.store.openArtist(from: song)
        XCTAssertEqual(fixture.store.path, [.artist("Jay-Z")])

        fixture.store.path += [.quiz(song.id), .songDetail(song.id)]
        await fixture.store.openArtist(from: song)
        XCTAssertEqual(fixture.store.path, [.artist("Jay-Z")])

        await fixture.store.refreshUserContent()
        XCTAssertEqual(fixture.store.recentArtists, ["Jay-Z"])
    }

    @MainActor
    func testOpeningArtistFromLegacyRouteAvoidsDuplicateDestination() async throws {
        let fixture = try makeLibraryStore(
            maintenance: ScriptedCatalogMaintenanceService(),
            resolvedArtistNames: ["the proclaimers": "The Proclaimers"]
        )
        defer { fixture.cleanup() }
        let song = CatalogSong(id: "the-proclaimers__500-miles", artist: "The Proclaimers", title: "500 Miles")
        fixture.store.path = [.artist("the proclaimers"), .quiz(song.id)]

        await fixture.store.openArtist(from: song)

        XCTAssertEqual(fixture.store.path, [.artist("the proclaimers")])
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
        XCTAssertTrue(fixture.store.shouldShowMissingCatalogNotice)
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
        assetMetadata: any CatalogAssetMetadataService = StubCatalogAssetMetadataService(),
        externalBetaUpdates: any ExternalBetaUpdateService = StubExternalBetaUpdateService(),
        catalogCount: Int = 0,
        catalogCounts: [Int]? = nil,
        catalogCountThrows: Bool = false,
        failingSongSuggestionOffset: Int? = nil,
        songSuggestions: [CatalogSong] = [],
        resolvedArtistNames: [String: String] = [:],
        prepareCatalog: @escaping @MainActor () async throws -> Void = {}
    ) throws -> (
        store: LibraryStore,
        history: HistoryStore,
        userLibrary: UserLibraryStore,
        modelContext: ModelContext,
        cleanup: () -> Void
    ) {
        let catalog = StubCatalogRepository(
            songCounts: catalogCounts ?? [catalogCount],
            failsSongCount: catalogCountThrows,
            failingSongSuggestionOffset: failingSongSuggestionOffset,
            songSuggestions: songSuggestions,
            resolvedArtistNames: resolvedArtistNames
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
            assetMetadata: assetMetadata,
            externalBetaUpdates: externalBetaUpdates,
            history: history,
            userLibrary: userLibrary,
            prepareCatalog: prepareCatalog
        )
        store.catalogState = catalogCount == 0 ? .empty : .content(catalogCount)
        return (
            store,
            history,
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

private actor StubCatalogAssetMetadataService: CatalogAssetMetadataService {
    private let remoteIdentity: CatalogAssetIdentity?
    private var installedIdentity: CatalogAssetIdentity?

    init(remote: CatalogAssetIdentity? = nil, installed: CatalogAssetIdentity? = nil) {
        remoteIdentity = remote
        installedIdentity = installed
    }

    func remoteAsset() -> CatalogAssetMetadata {
        CatalogAssetMetadata(identity: remoteIdentity, byteCount: remoteIdentity?.contentLength)
    }

    func installedAssetIdentity() -> CatalogAssetIdentity? {
        installedIdentity
    }

    func recordInstalledAsset(_ identity: CatalogAssetIdentity?) {
        installedIdentity = identity
    }
}

private actor StubExternalBetaUpdateService: ExternalBetaUpdateService {
    private let result: ExternalBetaUpdateSnapshot

    init(_ result: ExternalBetaUpdateSnapshot = ExternalBetaUpdateSnapshot(.noExternalRelease)) {
        self.result = result
    }

    func check() -> ExternalBetaUpdateSnapshot { result }
}

private actor ExpiringExternalBetaUpdateService: ExternalBetaUpdateService {
    func check() -> ExternalBetaUpdateSnapshot {
        ExternalBetaUpdateSnapshot(
            .available(ExternalBetaBuild(version: "1.0", build: "42")),
            validUntil: Date().addingTimeInterval(1)
        )
    }
}

private actor BlockingCatalogAssetMetadataService: CatalogAssetMetadataService {
    private let remoteIdentity: CatalogAssetIdentity
    private var installedIdentity: CatalogAssetIdentity?
    private let started: AsyncStream<Void>.Continuation
    private let release: AsyncStream<Void>

    init(
        remote: CatalogAssetIdentity,
        installed: CatalogAssetIdentity?,
        started: AsyncStream<Void>.Continuation,
        release: AsyncStream<Void>
    ) {
        remoteIdentity = remote
        installedIdentity = installed
        self.started = started
        self.release = release
    }

    func remoteAsset() async -> CatalogAssetMetadata {
        started.yield(())
        var iterator = release.makeAsyncIterator()
        _ = await iterator.next()
        return CatalogAssetMetadata(identity: remoteIdentity, byteCount: remoteIdentity.contentLength)
    }

    func installedAssetIdentity() -> CatalogAssetIdentity? {
        installedIdentity
    }

    func recordInstalledAsset(_ identity: CatalogAssetIdentity?) {
        installedIdentity = identity
    }
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
    private var songCounts: [Int]
    let failsSongCount: Bool
    let failingSongSuggestionOffset: Int?
    let songSuggestions: [CatalogSong]
    let resolvedArtistNames: [String: String]

    init(
        songCounts: [Int],
        failsSongCount: Bool = false,
        failingSongSuggestionOffset: Int? = nil,
        songSuggestions: [CatalogSong] = [],
        resolvedArtistNames: [String: String] = [:]
    ) {
        self.songCounts = songCounts
        self.failsSongCount = failsSongCount
        self.failingSongSuggestionOffset = failingSongSuggestionOffset
        self.songSuggestions = songSuggestions
        self.resolvedArtistNames = resolvedArtistNames
    }

    func status() -> CatalogStatus {
        let count = songCounts.first ?? 0
        return count == 0 ? .unavailable : .ready(songCount: count)
    }

    func songCount() throws -> Int {
        if failsSongCount { throw TestCatalogFailure() }
        let count = songCounts.first ?? 0
        if songCounts.count > 1 { songCounts.removeFirst() }
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
    func resolvedArtistName(_ artist: String) -> String? { resolvedArtistNames[artist] }
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

/// Geometry behind the quiz help tooltips: every leader must point at the control
/// it describes without running under another bubble or crossing another leader.
final class QuizHelpLayoutTests: XCTestCase {
    // An iPhone-sized viewport with the insets the overlay applies.
    private let area = CGRect(x: 8, y: 103, width: 386, height: 729)

    private let frames: [QuizHelpTargetID: [CGRect]] = [
        .quizRelativeKey: [CGRect(x: 120, y: 110, width: 44, height: 44)],
        .quizChord: [CGRect(x: 121, y: 190, width: 160, height: 120)],
        .quizNotes: [
            CGRect(x: 16, y: 340, width: 84, height: 74),
            CGRect(x: 108, y: 340, width: 84, height: 74),
            CGRect(x: 200, y: 340, width: 84, height: 74),
            CGRect(x: 292, y: 340, width: 84, height: 74),
            CGRect(x: 16, y: 440, width: 120, height: 60),
        ],
        .vocalOctaveOffset: [CGRect(x: 16, y: 760, width: 86, height: 44)],
        .vocalPitchCards: [
            CGRect(x: 90, y: 760, width: 90, height: 50),
            CGRect(x: 190, y: 760, width: 90, height: 50),
        ],
        .vocalInterval: [CGRect(x: 290, y: 760, width: 90, height: 50)],
    ]

    private let sizes: [QuizHelpTargetID: CGSize] = [
        .quizNotes: CGSize(width: 195, height: 56),
        .quizChord: CGSize(width: 130, height: 32),
        .quizRelativeKey: CGSize(width: 150, height: 32),
        .vocalOctaveOffset: CGSize(width: 195, height: 48),
        .vocalPitchCards: CGSize(width: 175, height: 48),
        .vocalInterval: CGSize(width: 130, height: 32),
    ]

    /// Root-only hides the Roman-numeral card, so its hint drops out entirely.
    private var rootOnlyFrames: [QuizHelpTargetID: [CGRect]] {
        frames.filter { $0.key != .quizChord }
    }

    /// Accessibility text sizes widen every bubble to 270pt, leaving room for
    /// only one column — the tightest layout the engine has to survive.
    private var accessibilitySizes: [QuizHelpTargetID: CGSize] {
        sizes.mapValues { CGSize(width: 270, height: $0.height * 1.6) }
    }

    private func placements(
        frames: [QuizHelpTargetID: [CGRect]]? = nil,
        sizes: [QuizHelpTargetID: CGSize]? = nil
    ) -> [QuizHelpLayoutEngine.Placement] {
        QuizHelpLayoutEngine(area: area, frames: frames ?? self.frames, sizes: sizes ?? self.sizes).placements()
    }

    func testEveryTargetKeepsOneLeaderPerAnchor() {
        let placements = self.placements()
        XCTAssertEqual(Set(placements.map(\.id)), Set(frames.keys))
        for placement in placements {
            XCTAssertEqual(placement.leaders.count, frames[placement.id]?.count)
        }
    }

    func testArrowTipsLandOnTheEdgeOfTheDescribedElement() {
        for placement in placements() {
            for (leader, anchor) in zip(placement.leaders, frames[placement.id] ?? []) {
                XCTAssertTrue(anchor.insetBy(dx: -0.5, dy: -0.5).contains(leader.tip),
                              "\(placement.id) tip \(leader.tip) is off its anchor \(anchor)")
                XCTAssertFalse(anchor.insetBy(dx: 0.5, dy: 0.5).contains(leader.tip),
                               "\(placement.id) tip \(leader.tip) sits inside its anchor \(anchor)")
                XCTAssertNotNil(leader.direction, "\(placement.id) has a zero-length leader")
            }
        }
    }

    func testLeadersStayClearOfOtherBubblesAndLeaders() {
        assertLeadersStayClear(placements(), "Full")
        assertLeadersStayClear(placements(frames: rootOnlyFrames), "Root-only")
        // Accessibility text sizes are deliberately not asserted here: six 270pt
        // bubbles leave a single column, so some leaders must pass a neighbour.
        // The scorer still minimizes them; `testBubblesStayInsideTheAreaAndDoNotOverlap`
        // keeps that layout legible.
    }

    private func assertLeadersStayClear(
        _ placements: [QuizHelpLayoutEngine.Placement],
        _ layout: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        for (index, placement) in placements.enumerated() {
            for other in placements where other.id != placement.id {
                for leader in placement.leaders {
                    XCTAssertFalse(leader.intersects(other.frame),
                                   "\(layout): \(placement.id) leader passes under \(other.id)", file: file, line: line)
                }
            }
            for other in placements.dropFirst(index + 1) {
                for leader in placement.leaders where other.leaders.contains(where: leader.crosses) {
                    XCTAssertTrue(false, "\(layout): \(placement.id) crosses \(other.id)", file: file, line: line)
                }
            }
        }
    }

    func testBubblesStayInsideTheAreaAndDoNotOverlap() {
        for (layout, placements) in [
            ("Full", placements()),
            ("Root-only", placements(frames: rootOnlyFrames)),
            ("accessibility text", placements(sizes: accessibilitySizes)),
        ] {
            for (index, placement) in placements.enumerated() {
                XCTAssertTrue(area.insetBy(dx: -0.5, dy: -0.5).contains(placement.frame),
                              "\(layout): \(placement.id) escapes the layout area")
                for other in placements.dropFirst(index + 1) {
                    XCTAssertFalse(placement.frame.intersects(other.frame),
                                   "\(layout): \(placement.id) overlaps \(other.id)")
                }
            }
        }
    }

    func testSegmentsCrossDetectsTouchingAndProperIntersections() {
        let cross = QuizHelpGeometry.segmentsCross
        XCTAssertTrue(cross(CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 10),
                            CGPoint(x: 0, y: 10), CGPoint(x: 10, y: 0)))
        XCTAssertTrue(cross(CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 0),
                            CGPoint(x: 5, y: 0), CGPoint(x: 5, y: 10)))
        XCTAssertTrue(cross(CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 0),
                            CGPoint(x: 4, y: 0), CGPoint(x: 20, y: 0)))
        XCTAssertFalse(cross(CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 0),
                             CGPoint(x: 0, y: 5), CGPoint(x: 10, y: 5)))
        XCTAssertFalse(cross(CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 10),
                             CGPoint(x: 20, y: 0), CGPoint(x: 30, y: 10)))
    }

    func testSegmentRectIntersectionCoversCrossingAndContainedEnds() {
        let rect = CGRect(x: 10, y: 10, width: 20, height: 20)
        XCTAssertTrue(QuizHelpGeometry.segment(CGPoint(x: 0, y: 20), CGPoint(x: 40, y: 20), intersects: rect))
        XCTAssertTrue(QuizHelpGeometry.segment(CGPoint(x: 20, y: 20), CGPoint(x: 100, y: 100), intersects: rect))
        XCTAssertFalse(QuizHelpGeometry.segment(CGPoint(x: 0, y: 0), CGPoint(x: 5, y: 40), intersects: rect))
        XCTAssertFalse(QuizHelpGeometry.segment(CGPoint(x: 0, y: 0), CGPoint(x: 40, y: 0), intersects: rect))
        XCTAssertFalse(QuizHelpGeometry.segment(CGPoint(x: 0, y: 0), CGPoint(x: 40, y: 40), intersects: .null))
    }
}
