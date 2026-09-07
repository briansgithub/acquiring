import AcquiringAudio
import AcquiringCore
import AVFoundation
import XCTest
@testable import Acquiring

final class AudioDiagnosticsTests: XCTestCase {
    private let startupError = NSError(domain: "com.apple.coreaudio.avfaudio", code: 2003329396)

    @MainActor
    func testReportPreservesOriginalFailureAndRecoveryAcrossRestartWithoutPrivateErrorData() throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("report.json")
        let store = AudioDiagnostics(fileURL: file)
        for index in 0..<150 {
            store.record(.init(operation: "event.\(index)", state: [:]))
        }
        let underlying = NSError(domain: "NSOSStatusErrorDomain", code: -50)
        let error = NSError(domain: startupError.domain, code: startupError.code, userInfo: [
            NSUnderlyingErrorKey: underlying,
            NSLocalizedDescriptionKey: "PRIVATE SONG AND DEVICE NAME",
            "recording": Data([1, 2, 3])
        ])
        store.record(.init(operation: "quiz.engineStart.failed", state: ["deviceModel": "iPhone15,2"], error: error))
        store.beginRecovery()
        store.record(.init(operation: "recovery.deactivate.failed", state: [:], error: underlying))
        store.isRecovering = false
        for _ in 0..<150 { store.record(.init(operation: "app.didBecomeActive", state: [:])) }
        let restarted = AudioDiagnostics(fileURL: file)
        let report = try XCTUnwrap(restarted.report)
        XCTAssertEqual(report.failure?.operation, "quiz.engineStart.failed")
        XCTAssertEqual(report.failure?.errors.map(\.code), [2003329396, -50])
        XCTAssertEqual(report.precedingEvents.count, AudioDiagnostics.eventLimit)
        XCTAssertEqual(report.subsequentEvents.count, AudioDiagnostics.eventLimit)
        XCTAssertEqual(report.recoveryEvents.first?.operation, "recovery.deactivate.failed")
        let json = try String(contentsOf: restarted.export(), encoding: .utf8)
        XCTAssertFalse(json.contains("PRIVATE SONG"))
        XCTAssertFalse(json.contains("recording"))
        XCTAssertNil(store.persistenceError)
    }

    @MainActor
    func testExplicitRecoveryReplacesFailedEngineOnceAndPreservesQuizPositionAndSettings() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let diagnostics = AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json"))
        var engines: [ObjectIdentifier] = []
        var activations: [Bool] = []
        let error = startupError
        // Starts 1 and 2 are the Play tap and its automatic rebuild-and-retry; the
        // injected outage has to outlast both so the explicit reset stays the
        // visible recovery this test is about. Start 3 is the reset's own retry.
        let hardware = AudioHardwareOperations(startEngine: { engine in
            engines.append(ObjectIdentifier(engine))
            if engines.count <= 2 { throw error }
        }, setSessionActive: { activations.append($0) }, isAppActive: { true })
        let audio = AppAudioSystem(diagnostics: diagnostics, hardware: hardware)
        let (revision, owner, configuration) = try await loadQuiz(audio)
        do {
            try await audio.playQuiz(revision: revision, owner: owner)
            XCTFail("Injected startup failure should propagate")
        } catch { XCTAssertEqual((error as NSError).code, 2003329396) }
        try await audio.resetAudioAndRetryQuiz(revision: revision, owner: owner)
        var states = (await audio.states()).makeAsyncIterator()
        let state = await states.next()
        XCTAssertEqual(state?.phase, .playing)
        XCTAssertEqual(state?.elapsed, .seconds(2))
        XCTAssertEqual(engines.count, 3)
        XCTAssertNotEqual(engines.first, engines.last)
        XCTAssertTrue(activations.contains(false))
        XCTAssertEqual(audio.restorableQuizRevision(songID: "fixture", sectionID: "verse", tempoPercent: 100, soundConfiguration: configuration), revision)
        XCTAssertEqual(diagnostics.report?.failure?.operation, "quiz.engineStart.failed")
        XCTAssertTrue(diagnostics.report?.subsequentEvents.contains { $0.operation == "recovery.retry.succeeded" } == true)
        await audio.stop()
    }

    @MainActor
    func testRepeatedStartupFailureStopsAfterOneRecoveryAttempt() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let diagnostics = AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json"))
        var attempts = 0
        let error = startupError
        let audio = AppAudioSystem(diagnostics: diagnostics, hardware: .init(startEngine: { _ in
            attempts += 1
            throw error
        }, setSessionActive: { _ in }, isAppActive: { true }))
        let (revision, owner, _) = try await loadQuiz(audio)
        do { try await audio.playQuiz(revision: revision, owner: owner) } catch { }
        do {
            try await audio.resetAudioAndRetryQuiz(revision: revision, owner: owner)
            XCTFail("Recovery must propagate repeated startup failure")
        } catch { XCTAssertEqual((error as NSError).code, 2003329396) }
        // The Play tap now costs two starts, not one: the initial attempt plus a
        // single automatic rebuild-and-retry. The reset's own retry is the third.
        XCTAssertEqual(attempts, 3)
        XCTAssertEqual(diagnostics.report?.failure?.operation, "quiz.engineStart.failed")
        XCTAssertTrue(diagnostics.report?.subsequentEvents.contains { $0.operation == "recovery.retry.failed" } == true)
        var states = (await audio.states()).makeAsyncIterator()
        let state = await states.next()
        XCTAssertEqual(state?.phase, .failed)
        XCTAssertEqual(state?.elapsed, .seconds(2))
        await audio.stop()
    }

    @MainActor
    func testInactivityDuringRecoveryPreventsRetry() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        var active = true
        var attempts = 0
        let audio = AppAudioSystem(diagnostics: AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json")), hardware: .init(
            startEngine: { _ in attempts += 1 },
            setSessionActive: { value in if !value { active = false } },
            isAppActive: { active }
        ))
        let (revision, owner, _) = try await loadQuiz(audio)
        do {
            try await audio.resetAudioAndRetryQuiz(revision: revision, owner: owner)
            XCTFail("Backgrounding must prevent a late restart")
        } catch is CancellationError { }
        XCTAssertEqual(attempts, 0)
        await audio.stop()
    }

    @MainActor
    func testNavigationDuringRecoveryPreventsRetry() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        var attempts = 0
        var onDeactivate: (() -> Void)?
        let audio = AppAudioSystem(diagnostics: AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json")), hardware: .init(startEngine: { _ in
            attempts += 1
        }, setSessionActive: { active in
            if !active { onDeactivate?() }
        }, isAppActive: { true }))
        let (revision, owner, _) = try await loadQuiz(audio)
        onDeactivate = { audio.pauseForAppInactivity() }
        do {
            try await audio.resetAudioAndRetryQuiz(revision: revision, owner: owner)
            XCTFail("Navigation invalidates recovery ownership")
        } catch is CancellationError { }
        XCTAssertEqual(attempts, 0)
        onDeactivate = nil
        await audio.stop()
    }

    @MainActor
    func testRecoveryCancelsPendingMicrophoneAcquisitionBeforeDeactivation() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let diagnostics = AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json"))
        let (requests, started) = AsyncStream<Bool>.makeStream()
        var permission: CheckedContinuation<Bool, Never>?
        var captureWasCleared = false
        let audio = AppAudioSystem(diagnostics: diagnostics, hardware: .init(
            startEngine: { _ in },
            setSessionActive: { active in
                if !active {
                    // The cleanup snapshot is persisted before deactivation.
                    captureWasCleared = diagnostics.report?.subsequentEvents.last?.state["microphonePending"] == "false"
                }
            },
            requestRecordPermission: {
                await withCheckedContinuation { permission = $0; started.yield(true) }
            },
            isAppActive: { true }
        ))
        let (revision, owner, _) = try await loadQuiz(audio)
        diagnostics.record(.init(operation: "fixture.failure", state: [:], error: startupError))
        let acquisition = Task { try await audio.acquireMicrophone(owner: .singingTool, profile: .standard) }
        var iterator = requests.makeAsyncIterator()
        _ = await iterator.next()
        try await audio.resetAudioAndRetryQuiz(revision: revision, owner: owner)
        permission?.resume(returning: true)
        do { _ = try await acquisition.value; XCTFail("Pending capture must not resume after reset") }
        catch is CancellationError { }
        XCTAssertTrue(captureWasCleared)
        await audio.stop()
    }

    @MainActor
    func testTaskCancellationBetweenRecoveryStagesPreventsRetry() async throws {
        var retried = false
        let task = Task { @MainActor in
            try await AudioRecoveryExperiment.run(isCurrent: { true }, steps: [
                .init(name: "deactivate", run: { withUnsafeCurrentTask { $0?.cancel() } }),
                .init(name: "retry", run: { retried = true })
            ], record: { _, _ in })
        }
        do { try await task.value; XCTFail("Cancellation should propagate") }
        catch is CancellationError { }
        XCTAssertFalse(retried)
    }

    @MainActor
    func testDeactivationFailureIsReportedAndDoesNotProceedToRebuildOrRetry() async throws {
        var rebuilt = false
        var reported: [Int] = []
        let error = startupError
        do {
            try await AudioRecoveryExperiment.run(isCurrent: { true }, steps: [
                .init(name: "deactivate", run: { throw error }),
                .init(name: "rebuild", run: { rebuilt = true })
            ], record: { _, error in if let error { reported.append((error as NSError).code) } })
            XCTFail("Deactivation failure must propagate")
        } catch { XCTAssertEqual((error as NSError).code, 2003329396) }
        XCTAssertFalse(rebuilt)
        XCTAssertEqual(reported, [2003329396])
    }

    @MainActor
    func testPlaybackStartReplacesAnEngineThatInstantiatedTheInputNode() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let diagnostics = AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json"))
        var engines: [ObjectIdentifier] = []
        let audio = AppAudioSystem(diagnostics: diagnostics, hardware: .init(
            startEngine: { engines.append(ObjectIdentifier($0)) },
            setSessionActive: { _ in },
            isAppActive: { true }
        ))
        let (revision, owner, _) = try await loadQuiz(audio)
        // Reaching the poisoned state is the whole precondition: an engine that has
        // read its input node cannot start again under .playback on real hardware.
        audio.instantiateInputNodeForTesting()
        diagnostics.record(.init(operation: "fixture.failure", state: [:], error: startupError))
        try await audio.playQuiz(revision: revision, owner: owner)
        let operations = diagnostics.report?.subsequentEvents.map(\.operation) ?? []
        XCTAssertTrue(operations.contains("engine.replaceBeforePlaybackStart"))
        XCTAssertTrue(operations.contains("engine.rebuild.succeeded"))
        XCTAssertTrue(operations.contains("quiz.engineStart.succeeded"))
        // Replaced before starting, so the start itself never had to fail or retry.
        XCTAssertEqual(engines.count, 1)
        XCTAssertFalse(operations.contains("quiz.engineStart.failed"))
        let started = diagnostics.report?.subsequentEvents.first { $0.operation == "quiz.engineStart.succeeded" }
        XCTAssertEqual(started?.state["engineInputNodeInstantiated"], "false")
        await audio.stop()
    }

    @MainActor
    func testPlaybackStartLeavesACleanEngineAloneAndArmsNoSampleRateReset() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let diagnostics = AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json"))
        var engines: [ObjectIdentifier] = []
        let audio = AppAudioSystem(diagnostics: diagnostics, hardware: .init(
            startEngine: { engines.append(ObjectIdentifier($0)) },
            setSessionActive: { _ in },
            isAppActive: { true }
        ))
        let (revision, owner, _) = try await loadQuiz(audio)
        diagnostics.record(.init(operation: "fixture.failure", state: [:], error: startupError))
        try await audio.playQuiz(revision: revision, owner: owner)
        let operations = diagnostics.report?.subsequentEvents.map(\.operation) ?? []
        // A user who never sings must pay nothing: no rebuild, and no session call
        // to undo a capture preference that was never set.
        XCTAssertFalse(operations.contains("engine.replaceBeforePlaybackStart"))
        XCTAssertFalse(operations.contains("engine.rebuild.begin"))
        XCTAssertFalse(operations.contains("session.resetPlaybackSampleRate"))
        XCTAssertEqual(engines.count, 1)
        let started = diagnostics.report?.subsequentEvents.first { $0.operation == "quiz.engineStart.succeeded" }
        XCTAssertEqual(started?.state["engineInputNodeInstantiated"], "false")
        await audio.stop()
    }

    @MainActor
    func testSingleStartFailureRecoversSilentlyWithoutSurfacingAnError() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let diagnostics = AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json"))
        var attempts = 0
        let error = startupError
        let audio = AppAudioSystem(diagnostics: diagnostics, hardware: .init(startEngine: { _ in
            attempts += 1
            if attempts == 1 { throw error }
        }, setSessionActive: { _ in }, isAppActive: { true }))
        let (revision, owner, _) = try await loadQuiz(audio)
        // The field failure with no alert: one start fails, the rebuild cures it,
        // and the listener simply hears the quiz.
        try await audio.playQuiz(revision: revision, owner: owner)
        XCTAssertEqual(attempts, 2)
        var states = (await audio.states()).makeAsyncIterator()
        let state = await states.next()
        XCTAssertEqual(state?.phase, .playing)
        let operations = diagnostics.report?.subsequentEvents.map(\.operation) ?? []
        XCTAssertTrue(operations.contains("quiz.engineStart.retryAfterRebuild.succeeded"))
        await audio.stop()
    }

    @MainActor
    func testAutomaticRetryIsBoundedToOneRebuildPerStartAttempt() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let diagnostics = AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json"))
        var attempts = 0
        let error = startupError
        let audio = AppAudioSystem(diagnostics: diagnostics, hardware: .init(startEngine: { _ in
            attempts += 1
            throw error
        }, setSessionActive: { _ in }, isAppActive: { true }))
        let (revision, owner, _) = try await loadQuiz(audio)
        do {
            try await audio.playQuiz(revision: revision, owner: owner)
            XCTFail("A start that fails twice must surface to the listener")
        } catch {
            // The first failure is the one worth showing; it describes the state the
            // rebuild was trying to cure.
            XCTAssertEqual((error as NSError).code, 2003329396)
        }
        // The bound the DEBUG injection budget is sized against. If this number
        // changes, AppAudioSystem.automaticEngineStartRetries changed with it.
        XCTAssertEqual(attempts, 2)
        let operations = diagnostics.report?.subsequentEvents.map(\.operation) ?? []
        XCTAssertTrue(operations.contains("quiz.engineStart.retryAfterRebuild.failed"))
        await audio.stop()
    }

    @MainActor
    func testAutomaticRetryIsRefusedWhileTheAppIsInactive() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        var attempts = 0
        let error = startupError
        let audio = AppAudioSystem(diagnostics: AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json")), hardware: .init(startEngine: { _ in
            attempts += 1
            throw error
        }, setSessionActive: { _ in }, isAppActive: { false }))
        let (revision, owner, _) = try await loadQuiz(audio)
        do { try await audio.playQuiz(revision: revision, owner: owner) } catch { }
        // Rebuilding a graph for an app on its way to the background would race the
        // system tearing the session down anyway.
        XCTAssertEqual(attempts, 1)
        await audio.stop()
    }

    @MainActor
    func testForegroundingRetiresAStaleResumeLatchWithoutResuming() async throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let diagnostics = AudioDiagnostics(fileURL: directory.appendingPathComponent("report.json"))
        let audio = AppAudioSystem(diagnostics: diagnostics, hardware: .init(
            startEngine: { _ in },
            setSessionActive: { _ in },
            isAppActive: { true }
        ))
        let (revision, owner, _) = try await loadQuiz(audio)
        try await audio.playQuiz(revision: revision, owner: owner)
        diagnostics.record(.init(operation: "fixture.failure", state: [:], error: startupError))
        // iOS never guarantees the matching .ended, so the latch this sets can
        // otherwise stand indefinitely and authorize a later, unrelated one.
        audio.handleInterruptionBegan()
        audio.handleAppBecameActive()
        let operations = diagnostics.report?.subsequentEvents.map(\.operation) ?? []
        XCTAssertTrue(operations.contains("session.staleResumeRetired"))
        var states = (await audio.states()).makeAsyncIterator()
        // Retiring the latch must not double as a resume.
        let state = await states.next()
        XCTAssertEqual(state?.phase, .paused)
        await audio.stop()
    }

    @MainActor
    private func loadQuiz(_ audio: AppAudioSystem) async throws -> (UInt64, AppAudioSystem.QuizPlaybackOwner, QuizSoundConfiguration) {
        let configuration = QuizSoundConfiguration(waveform: .triangle)
        let revision = audio.beginQuizReplacement(songID: "fixture", sectionID: "verse", tempoPercent: 100, soundConfiguration: configuration)
        try await audio.loadQuiz(QuizTimeline(durationSeconds: 4, events: [QuizEvent(onsetSeconds: 0, durationSeconds: 4, frequenciesHz: [440], waveform: .triangle)]), songID: "fixture", sectionID: "verse", tempoPercent: 100, position: .restart, revision: revision, soundConfiguration: configuration)
        let owner = try XCTUnwrap(audio.activateQuizPlaybackOwner(revision: revision))
        XCTAssertTrue(audio.seekQuiz(to: 0.5, revision: revision, owner: owner))
        return (revision, owner, configuration)
    }
}
