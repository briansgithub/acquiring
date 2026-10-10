import AcquiringCore
import Foundation

public struct AuralSourceExposure: Codable, Equatable, Hashable, Sendable {
    public let sourceId: String
    public let songId: String
    public let at: Int64
}

public struct AuralPlaybackReturnState: Codable, Equatable, Sendable {
    public let exerciseId: String
    public var draft: [String]
    public var heard: Bool
    public var answered: Bool
    public var guidanceVisible: Bool
    public var plays: Int
    public var attempts: Int
    public var assistance: [String]
    public var feedback: String
    public var passage: AuralPassage?
    public var fromSongs: Bool
}

public struct AuralSavedSession: Codable, Equatable, Sendable {
    public var version = 1
    public var progress = AuralProgress()
    public var inversionProgress = AuralProgress()
    public var serial: UInt64 = 0
    public var microphoneEnabled = true
    public var current: AuralExercise?
    public var settings = AuralSettings()
    public var sourceExposures: [AuralSourceExposure] = []
    public var sourceHistoryReliable = true
    public var playbackReturn: AuralPlaybackReturnState?
    public var heard = false
    public var answered = false
    public var guidanceVisible = false
    public var plays = 0
    public var attempts = 0
    public var assistance: [String] = []
    public var feedback = ""
    public var draft: [String] = []
    public init() {}
}

public struct AuralLessonState: Equatable, Sendable {
    public let exercise: AuralExercise?
    public let progress: AuralProgress
    public let heard: Bool
    public let answered: Bool
    public let guidanceVisible: Bool
    public let supported: Bool
    public let microphoneEnabled: Bool
    public let feedback: String
    public let draft: [String]
    public let storageWarning: String
    public let playbackReturn: AuralPlaybackReturnState?
}

public actor AuralSession {
    private let fileURL: URL
    private var saved: AuralSavedSession
    private var storageWarning = ""

    public init(fileURL: URL) {
        self.fileURL = fileURL
        do {
            let data = try Data(contentsOf: fileURL)
            let decoded = try JSONDecoder().decode(AuralSavedSession.self, from: data)
            guard decoded.version == 1 else {
                throw AuralCatalogError.invalidSchema("unsupported session version")
            }
            var restored = decoded
            restored.progress = AuralCurriculum.normalize(decoded.progress)
            restored.inversionProgress = AuralCurriculum.normalize(decoded.inversionProgress)
            let validExposures = decoded.sourceExposures.filter {
                    !$0.sourceId.isEmpty && $0.sourceId.count <= 1_000
                        && !$0.songId.isEmpty && $0.at >= 0
                }
            restored.sourceHistoryReliable = decoded.sourceHistoryReliable
                && validExposures.count == decoded.sourceExposures.count
            restored.sourceExposures = Array(validExposures.suffix(512))
            restored.plays = min(1_000, max(0, restored.plays))
            restored.attempts = min(1_000, max(0, restored.attempts))
            restored.draft = Array(restored.draft.prefix(256))
            if let current = restored.current {
                do {
                    let regenerated = try AuralCurriculum.generate(
                        current.provenance.target,
                        seed: current.seed
                    )
                    guard current.generatorVersion == regenerated.generatorVersion else {
                        throw AuralCatalogError.invalidSchema("unfinished exercise generator changed")
                    }
                    var safe = regenerated
                    if let passage = current.provenance.passage {
                        safe = try Self.withPassage(safe, passage: passage)
                    }
                    safe.previouslyExposed = true
                    safe.exposureRegistered = true
                    safe.provenance = current.provenance
                    safe.provenance.exampleSettings = current.provenance.exampleSettings ?? restored.settings
                    restored.current = safe
                    if restored.playbackReturn?.exerciseId != safe.id {
                        restored.playbackReturn = nil
                    }
                    restored.assistance.append("resumed-example")
                    if !restored.answered {
                        if restored.playbackReturn == nil { restored.heard = false }
                        restored.feedback = "Resumed example. This counts as supported practice."
                    }
                } catch {
                    restored.current = nil
                    restored.playbackReturn = nil
                    restored.heard = false
                    restored.answered = false
                    restored.draft = []
                    storageWarning = "The unfinished example could not be restored. Your learning progress and listening history were kept."
                }
            }
            if !restored.sourceHistoryReliable {
                storageWarning = "Some listening history could not be restored. Progress was kept; song examples count as supported practice."
            }
            saved = restored
        } catch CocoaError.fileReadNoSuchFile {
            saved = AuralSavedSession()
        } catch {
            var recovered = AuralSavedSession()
            recovered.sourceHistoryReliable = false
            if let data = try? Data(contentsOf: fileURL),
               let rawObject = try? JSONSerialization.jsonObject(with: data),
               let object = rawObject as? [String: Any] {
                let decoder = JSONDecoder()
                func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
                    guard let value = object[key],
                          JSONSerialization.isValidJSONObject(value),
                          let field = try? JSONSerialization.data(withJSONObject: value)
                    else { return nil }
                    return try? decoder.decode(type, from: field)
                }
                recovered.progress = AuralCurriculum.normalize(
                    decode(AuralProgress.self, key: "progress") ?? AuralProgress()
                )
                recovered.inversionProgress = AuralCurriculum.normalize(
                    decode(AuralProgress.self, key: "inversionProgress") ?? AuralProgress()
                )
                recovered.settings = decode(AuralSettings.self, key: "settings") ?? AuralSettings()
                recovered.serial = (object["serial"] as? NSNumber)?.uint64Value ?? 0
                recovered.microphoneEnabled = object["microphoneEnabled"] as? Bool ?? true
            }
            saved = recovered
            storageWarning = "Some saved settings or listening history could not be read. Valid learning progress was kept; restored examples count as supported practice."
        }
    }

    public func state() -> AuralLessonState {
        let exercise = saved.current
        let progress = progress(for: exercise?.provenance.exampleSettings ?? saved.settings)
        let supported = exercise == nil
            || exercise!.support > 0
            || exercise!.provenance.target.variantId != nil
            || exercise!.previouslyExposed
            || !saved.assistance.isEmpty
            || saved.plays > 1
            || saved.attempts > 1
        return AuralLessonState(
            exercise: exercise,
            progress: progress,
            heard: saved.heard,
            answered: saved.answered,
            guidanceVisible: saved.guidanceVisible,
            supported: supported,
            microphoneEnabled: saved.microphoneEnabled,
            feedback: saved.feedback,
            draft: saved.draft,
            storageWarning: storageWarning,
            playbackReturn: saved.playbackReturn
        )
    }

    @discardableResult
    public func next(defaultInstrument: String) throws -> AuralExercise {
        saved.serial = saved.serial == .max ? 1 : saved.serial + 1
        let seed = sessionSeed(saved.serial)
        var target = AuralCurriculum.selectTarget(
            progress: progress(),
            seed: seed,
            microphoneEnabled: saved.microphoneEnabled
        )
        target.instrumentOverride = defaultInstrument
        target.octaveShift = 1
        return try start(target, seed: seed)
    }

    @discardableResult
    public func practice(
        familyId: String,
        variantId: String,
        mode: AuralMode,
        microphoneKind: AuralMicrophoneKind? = nil,
        defaultInstrument: String
    ) throws -> AuralExercise {
        saved.serial = saved.serial == .max ? 1 : saved.serial + 1
        let skill = AuralCurriculum.selectPracticeSkill(
            progress: progress(),
            familyId: familyId,
            variantId: variantId,
            mode: mode
        )
        let cell = AuralCurriculum.cell(progress(), familyId: familyId, skill: skill)
        return try start(
            AuralTarget(
                familyId: familyId,
                skill: skill,
                support: cell.support,
                microphoneKind: skill == .reproduce ? microphoneKind ?? leastPracticedMicrophone(familyId) : nil,
                variantId: variantId,
                instrumentOverride: defaultInstrument,
                octaveShift: 1
            ),
            seed: sessionSeed(saved.serial)
        )
    }

    @discardableResult
    public func practicePattern(
        _ pattern: AuralPattern,
        mode: AuralMode,
        microphoneKind: AuralMicrophoneKind? = nil,
        assessment: Bool = false,
        defaultInstrument: String
    ) throws -> AuralExercise {
        saved.settings.distinguishInversions = pattern.view.hasSuffix("harmony_bass")
        saved.serial = saved.serial == .max ? 1 : saved.serial + 1
        let skills: [AuralSkill] = switch mode {
        case .recognize: [.guided, .compare, .identify]
        case .recall: [.recall, .complete, .audiate]
        case .sing: [.reproduce]
        }
        let skill = skills.first {
            AuralCurriculum.cell(progress(), familyId: pattern.id, skill: $0).practiceCorrect < 4
        } ?? skills[Int(saved.serial % UInt64(skills.count))]
        let cell = AuralCurriculum.cell(progress(), familyId: pattern.id, skill: skill)
        var target = AuralTarget(
            familyId: pattern.id,
            skill: skill,
            support: cell.support,
            transfer: cell.support == 0,
            microphoneKind: skill == .reproduce ? microphoneKind ?? leastPracticedMicrophone(pattern.id) : nil,
            variantId: assessment ? nil : pattern.id,
            instrumentOverride: defaultInstrument,
            octaveShift: 1,
            pattern: pattern
        )
        if !assessment { target.reason = "Selected progression practice." }
        let exercise = try start(target, seed: sessionSeed(saved.serial))
        if !assessment {
            saved.assistance.append("selected-pattern")
            save()
        }
        return exercise
    }

    public func reviewPattern(_ rows: [AuralCatalogRow]) -> (AuralPattern, AuralMode)? {
        let modes: [AuralMode] = saved.microphoneEnabled ? [.recognize,.recall,.sing] : [.recognize,.recall]
        let candidates: [(AuralPattern,AuralMode,AuralCell)] = rows.flatMap { row in
            modes.compactMap { mode in
                guard mode == .recognize || AuralCurriculum.cell(progress(),familyId:row.id,skill:.identify).independentCorrect >= 2 else { return nil }
                let skill: AuralSkill = mode == .recognize ? .identify : mode == .recall ? .recall : .reproduce
                return (row.pattern,mode,AuralCurriculum.cell(progress(),familyId:row.id,skill:skill))
            }
        }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let due = candidates.filter { $0.2.independentAttempts > 0 && $0.2.dueAt <= now }.min { $0.2.dueAt < $1.2.dueAt }
        let weak = candidates.first { $0.2.lastCorrect == false }
        let learning = candidates.filter { !$0.2.mastered }
        let selected = due ?? weak ?? (learning.isEmpty ? nil : learning[Int(saved.serial % UInt64(learning.count))])
        return selected.map { ($0.0,$0.1) }
    }

    public func applyPassage(
        _ passage: AuralPassage,
        catalogSnapshotId: String,
        popularityVersion: String?,
        context: AuralSelectionContext,
        seed: UInt64
    ) throws {
        guard var exercise = saved.current,
              passage.patternId == exercise.familyId || passage.patternId == exercise.provenance.target.pattern?.id
        else { throw AuralCatalogError.missingSource(passage.sourceId) }
        guard passage.events.count == exercise.events.count,
              passage.events.allSatisfy({ !$0.notes.isEmpty && $0.notes.allSatisfy({ (1...127).contains($0) }) })
        else { throw AuralCatalogError.invalidSchema("source passage does not match the exercise") }
        exercise = try Self.withPassage(exercise, passage: passage)
        exercise.provenance.catalogSnapshotId = catalogSnapshotId
        exercise.provenance.popularityVersion = popularityVersion
        exercise.provenance.selectorVersion = "aural-selector-2"
        exercise.provenance.selectorSeed = seed & 0xffff_ffff
        exercise.provenance.semitoneShift = 12
        exercise.provenance.recentSongIds = context.recentSongIds
        exercise.provenance.favoriteSongIds = context.favoriteSongIds.sorted()
        exercise.provenance.heardSourceIds = context.heardSourceIds.sorted()
        exercise.provenance.familiar = AuralExposureIndex(context.heardSourceIds).contains(passage.sourceId)
        exercise.provenance.assessment = context.assessment
        exercise.provenance.sourceHistoryReliable = saved.sourceHistoryReliable
        exercise.previouslyExposed = exercise.provenance.familiar == true || !saved.sourceHistoryReliable
        saved.current = exercise
        save()
    }

    public func settings() -> AuralSettings {
        saved.settings
    }

    public func markCorpusFallback(_ message: String) {
        saved.current?.provenance.fallbackReason = message
        save()
    }

    public func listeningStarted() {
        guard let passage = saved.current?.provenance.passage else { return }
        saved.sourceExposures.removeAll { $0.sourceId == passage.sourceId }
        saved.sourceExposures.append(AuralSourceExposure(
            sourceId: passage.sourceId,
            songId: passage.songId,
            at: now()
        ))
        saved.sourceExposures = Array(saved.sourceExposures.suffix(512))
        save()
    }

    public func played() {
        guard saved.current != nil, !saved.answered else { return }
        if saved.plays > 0 { saved.assistance.append("replay") }
        saved.plays += 1
        saved.feedback = ""
        save()
    }

    public func listeningCompleted() {
        guard saved.current != nil, !saved.answered else { return }
        saved.heard = true
        save()
    }

    public func exposureReached() {
        listeningStarted()
    }

    public func hint() {
        guard saved.current != nil, !saved.answered else { return }
        saved.assistance.append("guidance")
        saved.guidanceVisible = true
        save()
    }

    public func assistedChunk() {
        saved.assistance.append("chunked-listening")
        save()
    }

    public func interrupted(
        _ message: String = "Playback or recording stopped. Listen again; this counts as supported practice."
    ) {
        guard saved.current != nil, !saved.answered else { return }
        saved.assistance.append("interruption")
        saved.heard = false
        saved.feedback = message
        save()
    }

    public func submit(_ response: [String]) {
        guard let exercise = saved.current, saved.heard, !saved.answered else { return }
        saved.draft = Array(response.prefix(256))
        grade(exercise.responseType == "guided" || AuralCurriculum.evaluate(exercise, response: response))
    }

    public func grade(_ correct: Bool, technicalUncertainty: Bool = false) {
        guard let exercise = saved.current, saved.heard, !saved.answered else { return }
        if technicalUncertainty {
            let next = AuralCurriculum.record(
                progress: progress(for: exercise.provenance.exampleSettings ?? saved.settings),
                exercise: exercise,
                correct: false,
                assistance: saved.assistance,
                plays: saved.plays,
                attempt: saved.attempts + 1,
                technicalUncertainty: true
            )
            setProgress(next, settings: exercise.provenance.exampleSettings ?? saved.settings)
            saved.feedback = "Pitch was uncertain. Try again; this was not counted as a musical mistake."
            save()
            return
        }
        saved.attempts += 1
        let settings = exercise.provenance.exampleSettings ?? saved.settings
        let updatedProgress = AuralCurriculum.record(
                progress: progress(for: settings),
                exercise: exercise,
                correct: correct,
                assistance: saved.assistance,
                plays: saved.plays,
                attempt: saved.attempts
            )
        setProgress(updatedProgress, settings: settings)
        let evidenceLabel = updatedProgress.recent.last?.independent == true ? "Independent check" : "Practice"
        saved.answered = true
        saved.guidanceVisible = true
        saved.feedback = exercise.responseType == "guided"
            ? "Listening complete. Practice saved."
            : correct ? "Correct. \(evidenceLabel) saved."
            : "Not quite. Hear the model again. \(evidenceLabel) saved."
        save()
    }

    public func retry() {
        guard saved.answered else { return }
        saved.assistance.append("assisted-retry")
        saved.answered = false
        saved.heard = false
        saved.draft = []
        saved.playbackReturn?.draft = []
        saved.feedback = "Listen again and try with support."
        save()
    }

    public func exploringPlayback(
        draft: [String],
        passage: AuralPassage?,
        fromSongs: Bool
    ) {
        guard let exercise = saved.current else { return }
        saved.assistance.append("source-playback")
        listeningStarted()
        saved.playbackReturn = AuralPlaybackReturnState(
            exerciseId: exercise.id,
            draft: draft,
            heard: saved.heard,
            answered: saved.answered,
            guidanceVisible: saved.guidanceVisible,
            plays: saved.plays,
            attempts: saved.attempts,
            assistance: saved.assistance,
            feedback: saved.feedback,
            passage: passage,
            fromSongs: fromSongs
        )
        save()
    }

    public func rememberDraft(_ draft: [String]) {
        saved.draft = Array(draft.prefix(256))
        if saved.playbackReturn?.exerciseId == saved.current?.id {
            saved.playbackReturn?.draft = saved.draft
        }
        save()
    }

    public func rememberExerciseDraft(_ draft: [String]) {
        saved.draft = Array(draft.prefix(256))
        save()
    }

    public func clearPlaybackReturn() {
        saved.playbackReturn = nil
        save()
    }

    public func setSettings(_ settings: AuralSettings) {
        saved.settings = settings
        save()
    }

    /// Regenerate the same target with the newly saved sound before it is graded.
    public func setInstrument(_ instrument: String) throws {
        guard let old = saved.current, !saved.answered, old.instrument != instrument else { return }
        var target = old.provenance.target
        target.instrumentOverride = instrument
        var replacement = try AuralCurriculum.generate(target, seed: old.seed)
        if let passage = old.provenance.passage {
            replacement = try Self.withPassage(replacement, passage: passage)
            replacement.provenance.catalogSnapshotId = old.provenance.catalogSnapshotId
            replacement.provenance.popularityVersion = old.provenance.popularityVersion
            replacement.provenance.selectorVersion = old.provenance.selectorVersion
            replacement.provenance.selectorSeed = old.provenance.selectorSeed
            replacement.provenance.semitoneShift = old.provenance.semitoneShift
            replacement.provenance.recentSongIds = old.provenance.recentSongIds
            replacement.provenance.favoriteSongIds = old.provenance.favoriteSongIds
            replacement.provenance.heardSourceIds = old.provenance.heardSourceIds
            replacement.provenance.familiar = old.provenance.familiar
            replacement.provenance.assessment = old.provenance.assessment
            replacement.provenance.sourceHistoryReliable = old.provenance.sourceHistoryReliable
        } else {
            let settings = old.provenance.exampleSettings ?? saved.settings
            let (progress, registered) = AuralCurriculum.beginExercise(
                progress: progress(for: settings), exercise: replacement
            )
            setProgress(progress, settings: settings)
            replacement = registered
        }
        replacement.provenance.exampleSettings = old.provenance.exampleSettings ?? saved.settings
        replacement.provenance.fallbackReason = old.provenance.fallbackReason
        replacement.previouslyExposed = old.previouslyExposed || replacement.previouslyExposed
        if old.provenance.passage != nil { replacement.exposureRegistered = true }
        if saved.heard || saved.plays > 0 { saved.assistance.append("instrument-change") }
        saved.current = replacement
        saved.heard = false
        saved.plays = 0
        saved.playbackReturn = nil
        saved.feedback = "Sound changed. Listen again before answering."
        save()
    }

    public func setMicrophoneEnabled(_ enabled: Bool) {
        saved.microphoneEnabled = enabled
        save()
    }

    public func recentSongIds() -> [String] {
        var seen: Set<String> = []
        return saved.sourceExposures.reversed().compactMap {
            seen.insert($0.songId).inserted ? $0.songId : nil
        }.prefix(10).map { $0 }
    }

    public func heardSourceIds() -> Set<String> {
        Set(saved.sourceExposures.map(\.sourceId))
    }

    private func start(_ target: AuralTarget, seed: UInt64) throws -> AuralExercise {
        var generated = try AuralCurriculum.generate(target, seed: seed)
        generated.provenance.exampleSettings = saved.settings
        let (progress, exercise) = AuralCurriculum.beginExercise(
            progress: progress(),
            exercise: generated
        )
        setProgress(progress, settings: saved.settings)
        saved.current = exercise
        saved.heard = false
        saved.answered = false
        saved.guidanceVisible = exercise.support == 2
        saved.plays = 0
        saved.attempts = 0
        saved.assistance = []
        saved.feedback = ""
        saved.draft = []
        saved.playbackReturn = nil
        save()
        return exercise
    }

    private func progress(for settings: AuralSettings? = nil) -> AuralProgress {
        (settings ?? saved.settings).distinguishInversions
            ? saved.inversionProgress : saved.progress
    }

    private func setProgress(_ progress: AuralProgress, settings: AuralSettings) {
        if settings.distinguishInversions {
            saved.inversionProgress = progress
        } else {
            saved.progress = progress
        }
    }

    private func leastPracticedMicrophone(_ familyId: String) -> AuralMicrophoneKind {
        let cell = AuralCurriculum.cell(progress(), familyId: familyId, skill: .reproduce)
        return AuralMicrophoneKind.allCases.min {
            cell.microphonePractice[$0, default: 0] + cell.microphoneIndependent[$0, default: 0]
                < cell.microphonePractice[$1, default: 0] + cell.microphoneIndependent[$1, default: 0]
        } ?? .root
    }

    private func save() {
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let data = try JSONEncoder().encode(saved)
            try data.write(to: fileURL, options: .atomic)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var file = fileURL
            try? file.setResourceValues(values)
            storageWarning = ""
        } catch {
            storageWarning = "Progress could not be saved. You can continue for this visit."
        }
    }

    private func sessionSeed(_ serial: UInt64) -> UInt64 {
        UInt64(Date().timeIntervalSinceReferenceDate * 1_000_000) ^ serial &* 991
    }

    private func now() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1_000)
    }

    private static func withPassage(
        _ exercise: AuralExercise,
        passage: AuralPassage
    ) throws -> AuralExercise {
        func converted(_ event: AuralEvent, degree: String) throws -> AuralExerciseEvent {
            let shifted = try event.shifted(12)
            return AuralExerciseEvent(
                notes: shifted.notes,
                rootMidi: shifted.rootMidi,
                bassMidi: shifted.bassMidi,
                degree: degree,
                functionLabel: "source harmony",
                beats: shifted.beats
            )
        }
        var result = exercise
        result.provenance.passage = passage
        result.provenance.exampleSettings = exercise.provenance.exampleSettings
        let transformedEvents = try zip(passage.events, exercise.fullDegrees).enumerated().map {
            let index = $0.offset
            let source = $0.element.0
            let degree = $0.element.1
            guard source.degree == degree else {
                throw AuralCatalogError.invalidSchema("source labels do not match the target")
            }
            if let pattern = exercise.provenance.target.pattern {
                let token = try JSONDecoder().decode(
                    AuralToken.self,
                    from: Data(pattern.tokens[index].utf8)
                )
                let tonic = pitchClass(passage.keyTonic)
                guard token.mode == passage.keyScale,
                      source.rootMidi % 12 == (tonic + token.rootPc) % 12,
                      Set(source.notes.map { $0 % 12 })
                        == Set(token.intervals.map { (source.rootMidi + $0) % 12 })
                else {
                    throw AuralCatalogError.invalidSchema("source harmony does not match its structural token")
                }
                if pattern.view.hasSuffix("harmony_bass") {
                    guard let bass = token.bassInterval,
                          (source.bassMidi - source.rootMidi + 120) % 12 == bass
                    else { throw AuralCatalogError.invalidSchema("source inversion does not match") }
                }
            }
            return try converted(source, degree: degree)
        }
        let transformedContext = try passage.context.map {
            try converted($0, degree: $0.degree)
        }
        let microphoneTask = exercise.microphoneTask.map { task in
            let targets: [Int]
            switch task.kind {
            case .scaleDegree:
                // Dynamic corpus scale-degree parity is intentionally tonic-only.
                targets = transformedContext.first.map { [$0.rootMidi] } ?? task.targetMidis
            case .bass:
                targets = task.eventIndices.compactMap {
                    transformedEvents.indices.contains($0) ? transformedEvents[$0].bassMidi : nil
                }
            case .root, .rootSequence:
                targets = task.eventIndices.compactMap {
                    transformedEvents.indices.contains($0) ? transformedEvents[$0].rootMidi : nil
                }
            }
            return AuralMicrophoneTask(
                kind: task.kind,
                label: task.label,
                eventIndices: task.eventIndices,
                targetMidis: targets,
                scaleDegree: task.scaleDegree
            )
        }
        // Codable value types are immutable at the public boundary. Rebuild
        // below to substitute only verified source events and context.
        return AuralExercise(
            id: "\(exercise.id)-\(AuralIdentity.digest(passage.occurrenceId).prefix(16))",
            familyId: exercise.familyId,
            variantId: exercise.variantId,
            skill: exercise.skill,
            support: exercise.support,
            transfer: exercise.transfer,
            seed: exercise.seed,
            generatorVersion: exercise.generatorVersion,
            keyTonic: canonicalTonic(passage.keyTonic),
            tempo: exercise.tempo,
            instrument: exercise.instrument,
            events: transformedEvents,
            context: transformedContext,
            fullDegrees: exercise.fullDegrees,
            gapIndex: exercise.gapIndex,
            options: exercise.options,
            answerDegrees: exercise.answerDegrees,
            answerOptionId: exercise.answerOptionId,
            responseType: exercise.responseType,
            microphoneTask: microphoneTask,
            fingerprint: "source-\(AuralIdentity.digest(passage.sourceId))",
            prompt: exercise.prompt,
            referenceRequired: exercise.referenceRequired,
            guidance: exercise.guidance,
            provenance: result.provenance,
            previouslyExposed: exercise.previouslyExposed,
            exposureRegistered: true
        )
    }

    private static func pitchClass(_ tonic: String) -> Int {
        [
            "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
            "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
            "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11
        ][tonic] ?? 0
    }

    private static func canonicalTonic(_ tonic: String) -> String {
        ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][pitchClass(tonic)]
    }
}
