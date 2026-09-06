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
        let hardware = AudioHardwareOperations(startEngine: { engine in
            engines.append(ObjectIdentifier(engine))
            if engines.count == 1 { throw error }
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
        XCTAssertEqual(engines.count, 2)
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
        XCTAssertEqual(attempts, 2)
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
    private func loadQuiz(_ audio: AppAudioSystem) async throws -> (UInt64, AppAudioSystem.QuizPlaybackOwner, QuizSoundConfiguration) {
        let configuration = QuizSoundConfiguration(waveform: .triangle)
        let revision = audio.beginQuizReplacement(songID: "fixture", sectionID: "verse", tempoPercent: 100, soundConfiguration: configuration)
        try await audio.loadQuiz(QuizTimeline(durationSeconds: 4, events: [QuizEvent(onsetSeconds: 0, durationSeconds: 4, frequenciesHz: [440], waveform: .triangle)]), songID: "fixture", sectionID: "verse", tempoPercent: 100, position: .restart, revision: revision, soundConfiguration: configuration)
        let owner = try XCTUnwrap(audio.activateQuizPlaybackOwner(revision: revision))
        XCTAssertTrue(audio.seekQuiz(to: 0.5, revision: revision, owner: owner))
        return (revision, owner, configuration)
    }
}
