import AcquiringAural
import AcquiringAudio
import AcquiringCore
import XCTest

final class AuralCurriculumTests: XCTestCase {
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
}
