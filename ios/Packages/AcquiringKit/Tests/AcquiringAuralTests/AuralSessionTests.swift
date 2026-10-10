@testable import AcquiringAural
import AcquiringCore
import XCTest

final class AuralSessionTests: XCTestCase {
    private func temporaryFile() throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return directory.appendingPathComponent("session.json")
    }

    func testListeningGateDuplicateSubmissionAndRetryDraft() async throws {
        let file = try temporaryFile()
        let session = AuralSession(fileURL: file)
        _ = try await session.next(defaultInstrument: "piano")
        await session.submit(["I"])
        var state = await session.state()
        XCTAssertEqual(state.progress.attempts, 0)
        await session.played()
        await session.submit(["I"])
        state = await session.state()
        XCTAssertEqual(state.progress.attempts, 0)
        await session.listeningCompleted()
        await session.submit(["I"])
        await session.submit(["V"])
        state = await session.state()
        XCTAssertEqual(state.progress.attempts, 1)
        XCTAssertEqual(state.draft, ["I"])
        XCTAssertTrue(state.answered)
        await session.retry()
        state = await session.state()
        XCTAssertFalse(state.heard)
        XCTAssertFalse(state.answered)
        XCTAssertTrue(state.draft.isEmpty)
        XCTAssertTrue(state.supported)
        let restored = await AuralSession(fileURL: file).state()
        XCTAssertTrue(restored.draft.isEmpty)
        XCTAssertEqual(restored.progress.attempts, 1)
    }

    func testResumePreservesDraftButRequiresListeningAndPractice() async throws {
        let file = try temporaryFile()
        let session = AuralSession(fileURL: file)
        let exercise = try await session.next(defaultInstrument: "piano")
        await session.played()
        await session.listeningCompleted()
        await session.rememberDraft(["V", "I"])
        let restored = AuralSession(fileURL: file)
        let state = await restored.state()
        XCTAssertEqual(state.exercise?.id, exercise.id)
        XCTAssertEqual(state.draft, ["V", "I"])
        XCTAssertFalse(state.heard)
        XCTAssertTrue(state.supported)
        await restored.submit(["V", "I"])
        let blocked = await restored.state()
        XCTAssertEqual(blocked.progress.attempts, 0)
    }

    func testSettingsAreFrozenPerExerciseAndProgressBanksRemainSeparate() async throws {
        let file = try temporaryFile()
        let session = AuralSession(fileURL: file)
        let exercise = try await session.next(defaultInstrument: "piano")
        XCTAssertEqual(exercise.provenance.exampleSettings?.distinguishInversions, false)
        var settings = await session.settings()
        settings.distinguishInversions = true
        await session.setSettings(settings)
        await session.played()
        await session.listeningCompleted()
        await session.submit([])
        let saved = try JSONDecoder().decode(AuralSavedSession.self, from: Data(contentsOf: file))
        XCTAssertEqual(saved.progress.attempts, 1)
        XCTAssertEqual(saved.inversionProgress.attempts, 0)
        _ = try await session.next(defaultInstrument: "piano")
        let state = await session.state()
        XCTAssertEqual(state.progress.attempts, 0)
        XCTAssertEqual(state.exercise?.provenance.exampleSettings?.distinguishInversions, true)
    }

    func testInvalidPendingExerciseKeepsValidProgressAndSourceHistory() async throws {
        let file = try temporaryFile()
        let session = AuralSession(fileURL: file)
        _ = try await session.next(defaultInstrument: "piano")
        await session.listeningCompleted()
        await session.submit([])
        var saved = try JSONDecoder().decode(AuralSavedSession.self, from: Data(contentsOf: file))
        saved.sourceExposures = [AuralSourceExposure(sourceId: "source", songId: "song", at: 1)]
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(saved)) as? [String: Any])
        var current = try XCTUnwrap(json["current"] as? [String: Any])
        current["generatorVersion"] = "obsolete-generator"
        json["current"] = current
        try JSONSerialization.data(withJSONObject: json).write(to: file)
        let restored = AuralSession(fileURL: file)
        let state = await restored.state()
        let sourceIds = await restored.heardSourceIds()
        XCTAssertNil(state.exercise)
        XCTAssertEqual(state.progress.attempts, 1)
        XCTAssertEqual(sourceIds, ["source"])
        XCTAssertFalse(state.storageWarning.isEmpty)
    }

    func testInvalidSourceHistoryIsNotSilentlyTrusted() async throws {
        let file = try temporaryFile()
        var saved = AuralSavedSession()
        saved.sourceExposures = [AuralSourceExposure(sourceId: "", songId: "song", at: 1)]
        try JSONEncoder().encode(saved).write(to: file)
        let restored = AuralSession(fileURL: file)
        let state = await restored.state()
        XCTAssertFalse(state.storageWarning.isEmpty)
        _ = try await restored.next(defaultInstrument: "piano")
        let persisted = try JSONDecoder().decode(AuralSavedSession.self, from: Data(contentsOf: file))
        XCTAssertFalse(persisted.sourceHistoryReliable)
        XCTAssertTrue(persisted.sourceExposures.isEmpty)
    }

    func testIncorrectIndependentAnswerIsLabeledAndRetryBecomesPractice() async throws {
        let file = try temporaryFile()
        var saved = AuralSavedSession()
        // A new session always treats restored examples as practice. Start a fresh
        // adaptive example with prerequisites ready instead of bypassing recovery.
        var ready = AuralCell()
        ready.practice = 4
        ready.practiceCorrect = 4
        saved.progress.cells["dominant-return:guided"] = ready
        saved.progress.cells["dominant-return:compare"] = ready
        try JSONEncoder().encode(saved).write(to: file)
        let session = AuralSession(fileURL: file)
        let exercise = try await session.next(defaultInstrument: "piano")
        XCTAssertEqual(exercise.support, 0)
        await session.played()
        await session.listeningCompleted()
        await session.grade(false)
        var state = await session.state()
        XCTAssertTrue(state.feedback.contains("Independent check saved"))
        XCTAssertEqual(state.progress.recent.last?.independent, true)
        await session.retry()
        await session.played()
        await session.listeningCompleted()
        await session.grade(true)
        state = await session.state()
        XCTAssertTrue(state.feedback.contains("Practice saved"))
        XCTAssertEqual(state.progress.recent.last?.independent, false)
    }

    func testFailedStorageStillAllowsInMemoryPractice() async throws {
        let parent = try temporaryFile()
        try Data("not a directory".utf8).write(to: parent)
        let session = AuralSession(fileURL: parent.appendingPathComponent("session.json"))
        _ = try await session.next(defaultInstrument: "piano")
        await session.listeningCompleted()
        await session.submit([])
        let state = await session.state()
        XCTAssertTrue(state.answered)
        XCTAssertEqual(state.progress.attempts, 1)
        XCTAssertFalse(state.storageWarning.isEmpty)
    }

    func testInstrumentChangeKeepsQuestionAndRequiresFreshListening() async throws {
        let file = try temporaryFile()
        let session = AuralSession(fileURL: file)
        let initial = try await session.next(defaultInstrument: "clarinet")
        await session.played()
        await session.listeningCompleted()
        try await session.setInstrument("triangle")
        let state = await session.state()
        let changed = try XCTUnwrap(state.exercise)
        XCTAssertEqual(changed.id, initial.id)
        XCTAssertEqual(changed.events, initial.events)
        XCTAssertEqual(changed.answerDegrees, initial.answerDegrees)
        XCTAssertNotEqual(changed.fingerprint, initial.fingerprint)
        XCTAssertEqual(changed.instrument, "triangle")
        XCTAssertEqual(changed.provenance.target.instrumentOverride, "triangle")
        XCTAssertFalse(state.heard)
        XCTAssertTrue(state.supported)
        await session.submit([])
        let beforeListening = await session.state()
        XCTAssertEqual(beforeListening.progress.attempts, 0)
        let restored = await AuralSession(fileURL: file).state()
        XCTAssertEqual(restored.exercise?.instrument, "triangle")
        XCTAssertEqual(restored.exercise?.events, initial.events)
    }

    func testNamedSingingCanSelectEachMicrophoneTask() async throws {
        let session = AuralSession(fileURL: try temporaryFile())
        for kind in AuralMicrophoneKind.allCases {
            let exercise = try await session.practice(
                familyId: "dominant-return",
                variantId: "direct",
                mode: .sing,
                microphoneKind: kind,
                defaultInstrument: "clarinet"
            )
            XCTAssertEqual(exercise.microphoneTask?.kind, kind)
            XCTAssertFalse(exercise.microphoneTask?.targetMidis.isEmpty ?? true)
            XCTAssertEqual(exercise.provenance.target.microphoneKind, kind)
        }
    }
}
