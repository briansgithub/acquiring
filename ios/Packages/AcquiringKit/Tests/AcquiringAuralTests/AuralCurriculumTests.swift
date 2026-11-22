import AcquiringAural
import AcquiringAudio
import AcquiringCore
import XCTest

final class AuralCurriculumTests: XCTestCase {
    func testAdaptivePerfectLearnerReachesEveryFamilyAndSkill() throws {
        var progress = AuralProgress()
        var families = Set<String>()
        var skills = Set<AuralSkill>()
        for seed in 1...700 {
            let target = AuralCurriculum.selectTarget(progress: progress, seed: UInt64(seed), now: 1_000)
            XCTAssertTrue(AuralCurriculum.familyUnlocked(progress, familyId: target.familyId))
            XCTAssertTrue(AuralCurriculum.skillUnlocked(progress, familyId: target.familyId, skill: target.skill))
            let generated = try AuralCurriculum.generate(target, seed: UInt64(seed))
            let begun = AuralCurriculum.beginExercise(progress: progress, exercise: generated)
            progress = AuralCurriculum.record(progress: begun.0, exercise: begun.1, correct: true, now: 1_000)
            families.insert(target.familyId)
            skills.insert(target.skill)
        }
        XCTAssertEqual(families, Set(AuralCurriculum.families.map(\.id)))
        XCTAssertEqual(skills, Set(AuralSkill.allCases))
        XCTAssertTrue(progress.cells.values.contains { $0.mastered })
        XCTAssertLessThanOrEqual(progress.recent.count, 120)
        XCTAssertLessThanOrEqual(progress.exposures.count, 512)
    }

    func testSupportFadesButPrerequisitesRequireIndependentEvidence() {
        var progress = AuralProgress()
        var cell = AuralCell()
        cell.practice = 4
        cell.practiceCorrect = 4
        progress.cells["dominant-return:guided"] = cell
        XCTAssertTrue(AuralCurriculum.skillUnlocked(progress, familyId: "dominant-return", skill: .compare))
        cell.practiceCorrect = 2
        progress.cells["dominant-return:compare"] = cell
        XCTAssertEqual(AuralCurriculum.cell(progress, familyId: "dominant-return", skill: .compare).support, 1)
        cell.practiceCorrect = 4
        progress.cells["dominant-return:compare"] = cell
        XCTAssertEqual(AuralCurriculum.cell(progress, familyId: "dominant-return", skill: .compare).support, 0)
        XCTAssertFalse(AuralCurriculum.skillUnlocked(progress, familyId: "dominant-return", skill: .identify))
        cell.independentAttempts = 3
        cell.independentCorrect = 2
        cell.recentIndependent = [true, false, true]
        progress.cells["dominant-return:compare"] = cell
        XCTAssertTrue(AuralCurriculum.skillUnlocked(progress, familyId: "dominant-return", skill: .identify))
        cell.recentIndependent = [false, false, true]
        progress.cells["dominant-return:compare"] = cell
        XCTAssertFalse(AuralCurriculum.skillUnlocked(progress, familyId: "dominant-return", skill: .identify))
    }

    func testNormalizationRecomputesMasteryFromEvidence() {
        var progress = AuralProgress()
        var cell = AuralCell()
        cell.mastered = true
        cell.support = 0
        progress.cells["dominant-return:identify"] = cell
        var normalized = AuralCurriculum.normalize(progress)
        XCTAssertFalse(normalized.cells["dominant-return:identify"]!.mastered)
        XCTAssertEqual(normalized.cells["dominant-return:identify"]!.support, 2)
        cell.independentAttempts = 6
        cell.independentCorrect = 6
        cell.recentIndependent = Array(repeating: true, count: 6)
        cell.keys = ["C", "D", "E"]
        cell.transferCorrect = 2
        progress.cells["dominant-return:identify"] = cell
        normalized = AuralCurriculum.normalize(progress)
        XCTAssertTrue(normalized.cells["dominant-return:identify"]!.mastered)
        cell.transferCorrect = 1
        progress.cells["dominant-return:identify"] = cell
        XCTAssertFalse(AuralCurriculum.normalize(progress).cells["dominant-return:identify"]!.mastered)
    }

    func testNamedProgressionAndAssistanceNeverEarnIndependentEvidence() throws {
        var named = AuralTarget(
            familyId: "dominant-return",
            skill: .identify,
            support: 0,
            transfer: true,
            variantId: "direct",
            octaveShift: 1
        )
        var exercise = try AuralCurriculum.generate(named, seed: 41)
        var progress = AuralCurriculum.beginExercise(
            progress: AuralProgress(),
            exercise: exercise
        ).0
        progress = AuralCurriculum.record(
            progress: progress,
            exercise: exercise,
            correct: true
        )
        var cell = AuralCurriculum.cell(progress, familyId: named.familyId, skill: named.skill)
        XCTAssertEqual(cell.independentCorrect, 0)
        XCTAssertEqual(cell.practiceCorrect, 1)

        named.variantId = nil
        exercise = try AuralCurriculum.generate(named, seed: 42)
        progress = AuralCurriculum.beginExercise(progress: progress, exercise: exercise).0
        progress = AuralCurriculum.record(
            progress: progress,
            exercise: exercise,
            correct: true,
            assistance: ["source-playback"]
        )
        cell = AuralCurriculum.cell(progress, familyId: named.familyId, skill: named.skill)
        XCTAssertEqual(cell.independentCorrect, 0)
        XCTAssertEqual(cell.practiceCorrect, 2)
    }

    func testTechnicalUncertaintyDoesNotIncrementMusicalAttempts() throws {
        let target = AuralTarget(
            familyId: "dominant-return",
            skill: .identify,
            support: 0,
            octaveShift: 1
        )
        let exercise = try AuralCurriculum.generate(target, seed: 88)
        let progress = AuralCurriculum.record(
            progress: AuralProgress(),
            exercise: exercise,
            correct: false,
            technicalUncertainty: true
        )
        let cell = AuralCurriculum.cell(progress, familyId: target.familyId, skill: target.skill)
        XCTAssertEqual(progress.attempts, 0)
        XCTAssertEqual(cell.independentAttempts, 0)
        XCTAssertEqual(cell.practice, 0)
        XCTAssertTrue(progress.recent.last?.technicalUncertainty == true)
    }

    func testAudioPlanUsesTwentyMillisecondOverlapAndPreservesSilentTail() throws {
        let exercise = try AuralCurriculum.generate(
            AuralTarget(
                familyId: "dominant-return",
                skill: .recall,
                support: 0,
                octaveShift: 1
            ),
            seed: 12
        )
        let plan = try AuralAudioPlanner.plan(exercise: exercise, waveform: .clarinet)
        let events = AuralAudioPlanner.promptEvents(exercise)
        XCTAssertTrue(events.last?.notes.isEmpty == true)
        XCTAssertEqual(events.last?.beats, 2)
        let firstProgression = plan.timeline.events[1]
        let source = exercise.events[0]
        XCTAssertEqual(
            firstProgression.durationSeconds,
            source.beats * 60 / Double(exercise.tempo) + 0.020,
            accuracy: 0.000_001
        )
    }

    func testPitchAssessmentSeparatesUncertaintyFromWrongStablePitch() {
        let silence = (0..<100).map {
            AuralPitchFrame(timeMilliseconds: Int64($0 * 40), midi: nil)
        }
        XCTAssertEqual(
            AuralPitchAssessor.assess(frames: silence, targetMidis: [60]).status,
            .uncertain
        )
        let wrong = (0..<20).map {
            AuralPitchFrame(
                timeMilliseconds: Int64($0 * 40),
                midi: 61,
                confidence: 0.99
            )
        }
        XCTAssertEqual(
            AuralPitchAssessor.assess(frames: wrong, targetMidis: [60]).status,
            .incorrect
        )
    }

    func testOrderedRootsWithholdVerdictUntilAllNotesAndRetryUnclearNote() {
        var capture = AuralSequenceCapture()
        XCTAssertEqual(capture.accept(.incorrect, noteCount: 3), .continueWith(1))
        XCTAssertEqual(capture.accept(.uncertain, noteCount: 3), .retryCurrent)
        XCTAssertEqual(capture.results, [false])
        XCTAssertEqual(capture.accept(.correct, noteCount: 3), .continueWith(2))
        XCTAssertEqual(capture.accept(.correct, noteCount: 3), .complete(false))

        var successful = AuralSequenceCapture()
        XCTAssertEqual(successful.accept(.correct, noteCount: 2), .continueWith(1))
        XCTAssertEqual(successful.accept(.correct, noteCount: 2), .complete(true))
    }

    func testSparseRealPitchReadingsCannotMasqueradeAsStableVoice() {
        let frames = (0..<100).map { index in
            AuralPitchFrame(
                timeMilliseconds: Int64(index * 40),
                midi: index == 0 ? 60 : nil,
                confidence: 0.99
            )
        }
        XCTAssertEqual(AuralPitchAssessor.assess(frames: frames, targetMidis: [60]).status, .uncertain)
    }

    func testSavedCamelCaseInstrumentStillPlaysAfterDefaultChanges() {
        XCTAssertEqual(AuralAudioPlanner.waveform("churchOrgan", fallback: .triangle), .churchOrgan)
        XCTAssertEqual(AuralAudioPlanner.waveform("electricPiano", fallback: .sine), .electricPiano)
    }
}
