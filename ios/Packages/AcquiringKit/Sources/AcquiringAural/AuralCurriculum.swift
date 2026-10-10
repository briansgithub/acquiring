import AcquiringCore
import Foundation

public struct AuralVariantDefinition: Codable, Equatable, Hashable, Sendable, Identifiable {
    public let id: String
    public let degrees: [String]
}

public struct AuralFamilyDefinition: Codable, Equatable, Hashable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let description: String
    public let prerequisites: [String]
    public let variants: [AuralVariantDefinition]
}

public struct AuralExerciseEvent: Codable, Equatable, Hashable, Sendable {
    public let notes: [Int]
    public let rootMidi: Int
    public let bassMidi: Int
    public let degree: String
    public let functionLabel: String
    public let beats: Double

    public init(
        notes: [Int],
        rootMidi: Int,
        bassMidi: Int,
        degree: String,
        functionLabel: String,
        beats: Double = 2
    ) {
        self.notes = notes
        self.rootMidi = rootMidi
        self.bassMidi = bassMidi
        self.degree = degree
        self.functionLabel = functionLabel
        self.beats = beats
    }
}

public struct AuralOption: Codable, Equatable, Hashable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let degrees: [String]
}

public struct AuralMicrophoneTask: Codable, Equatable, Hashable, Sendable {
    public let kind: AuralMicrophoneKind
    public let label: String
    public let eventIndices: [Int]
    public let targetMidis: [Int]
    public let scaleDegree: Int?
}

public struct AuralTarget: Codable, Equatable, Hashable, Sendable {
    public var familyId: String
    public var skill: AuralSkill
    public var support: Int
    public var transfer: Bool
    public var reason: String
    public var microphoneKind: AuralMicrophoneKind?
    public var variantId: String?
    public var instrumentOverride: String?
    public var octaveShift: Int
    public var pattern: AuralPattern?

    public init(
        familyId: String,
        skill: AuralSkill,
        support: Int = 2,
        transfer: Bool = false,
        reason: String = "",
        microphoneKind: AuralMicrophoneKind? = nil,
        variantId: String? = nil,
        instrumentOverride: String? = nil,
        octaveShift: Int = 0,
        pattern: AuralPattern? = nil
    ) {
        self.familyId = familyId
        self.skill = skill
        self.support = support
        self.transfer = transfer
        self.reason = reason
        self.microphoneKind = microphoneKind
        self.variantId = variantId
        self.instrumentOverride = instrumentOverride
        self.octaveShift = octaveShift
        self.pattern = pattern
    }
}

public struct AuralProvenance: Codable, Equatable, Hashable, Sendable {
    public let generatorVersion: String
    public let seed: UInt64
    public let target: AuralTarget
    public let variantId: String
    public let keyTonic: String
    public let tempo: Int
    public let instrument: String
    public let inversions: [Int]
    public let register: Int
    public let spreads: [Bool]
    public let contextDegrees: [String]
    public var passage: AuralPassage?
    public var exampleSettings: AuralSettings?
    public var fallbackReason: String?
    public var catalogSnapshotId: String?
    public var popularityVersion: String?
    public var selectorVersion: String?
    public var selectorSeed: UInt64?
    public var semitoneShift: Int?
    public var recentSongIds: [String]?
    public var favoriteSongIds: [String]?
    public var heardSourceIds: [String]?
    public var familiar: Bool?
    public var assessment: Bool?
    public var sourceHistoryReliable: Bool?
}

public struct AuralExercise: Codable, Equatable, Hashable, Sendable, Identifiable {
    public let id: String
    public let familyId: String
    public let variantId: String
    public let skill: AuralSkill
    public let support: Int
    public let transfer: Bool
    public let seed: UInt64
    public let generatorVersion: String
    public let keyTonic: String
    public let tempo: Int
    public let instrument: String
    public let events: [AuralExerciseEvent]
    public let context: [AuralExerciseEvent]
    public let fullDegrees: [String]
    public let gapIndex: Int?
    public let options: [AuralOption]
    public let answerDegrees: [String]
    public let answerOptionId: String?
    public let responseType: String
    public let microphoneTask: AuralMicrophoneTask?
    public let fingerprint: String
    public let prompt: String
    public let referenceRequired: Bool
    public let guidance: String
    public var provenance: AuralProvenance
    public var previouslyExposed: Bool
    public var exposureRegistered: Bool
}

public struct AuralCell: Codable, Equatable, Sendable {
    public var practice = 0
    public var practiceCorrect = 0
    public var independentAttempts = 0
    public var independentCorrect = 0
    public var transferCorrect = 0
    public var keys: [String] = []
    public var mastered = false
    public var support = 2
    public var lastAt: Int64 = 0
    public var dueAt: Int64 = 0
    public var lastCorrect: Bool?
    public var streak = 0
    public var recentIndependent: [Bool] = []
    public var microphonePractice: [AuralMicrophoneKind: Int] = [:]
    public var microphoneIndependent: [AuralMicrophoneKind: Int] = [:]
    public init() {}
}

public struct AuralExposure: Codable, Equatable, Sendable {
    public let fingerprint: String
    public let id: String
    public let at: Int64
}

public struct AuralAttemptRecord: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let familyId: String
    public let skill: AuralSkill
    public let correct: Bool
    public let independent: Bool
    public let technicalUncertainty: Bool
    public let at: Int64
    public let seed: UInt64
    public let generatorVersion: String
    public let fingerprint: String
    public let key: String
    public let variantId: String
    public let support: Int
    public let transfer: Bool
    public let assistance: [String]
    public let plays: Int
    public let attempt: Int
    public let microphoneKind: AuralMicrophoneKind?
    public let requestedVariantId: String?
    public let instrumentOverride: String?
    public let octaveShift: Int
    public let sourceId: String?
}

public struct AuralProgress: Codable, Equatable, Sendable {
    public var version = 1
    public var cells: [String: AuralCell] = [:]
    public var attempts = 0
    public var recent: [AuralAttemptRecord] = []
    public var exposures: [AuralExposure] = []
    public init() {}
}

public enum AuralCurriculum {
    public static let generatorVersion = "ios-aural-1"
    public static let day: Int64 = 86_400_000
    public static let maximumRecent = 120
    public static let maximumExposures = 512
    public static let recentWindow = 8
    public static let microphoneKinds = AuralMicrophoneKind.allCases
    public static let degrees = ["I", "ii", "iii", "IV", "V", "vi", "vii°", "V/V"]
    public static let keys = ["C", "G", "F", "D", "Bb", "A", "Eb", "E", "Ab", "B", "Db", "Gb"]

    public static let families: [AuralFamilyDefinition] = [
        family("dominant-return", "Dominant return", "Hear dominant tension return to tonic.", [], [
            variant("direct", "V", "I"), variant("departure", "I", "V", "I")
        ]),
        family("plagal-return", "Plagal return", "Compare a gentler subdominant return with the dominant return.", ["dominant-return"], [
            variant("direct", "IV", "I"), variant("departure", "I", "IV", "I")
        ]),
        family("predominant-cadence", "Preparing the dominant", "Add a predominant before the familiar dominant–tonic fragment.", ["dominant-return", "plagal-return"], [
            variant("supertonic", "ii", "V", "I"), variant("subdominant", "IV", "V", "I"),
            variant("departure", "I", "ii", "V", "I")
        ]),
        family("deceptive-return", "Deceptive return", "Hear dominant arrive at relative minor instead of tonic.", ["dominant-return"], [
            variant("direct", "V", "vi"), variant("prepared", "ii", "V", "vi"),
            variant("departure", "I", "V", "vi")
        ]),
        family("relative-motion", "Relative motion", "Connect tonic and relative minor, then return through familiar functions.", ["plagal-return", "deceptive-return"], [
            variant("direct", "I", "vi"), variant("return", "I", "vi", "IV", "I"),
            variant("cadence", "vi", "ii", "V", "I")
        ]),
        family("secondary-dominant", "A dominant of the dominant", "Hear an altered chord intensify the approach to dominant.", ["predominant-cadence", "relative-motion"], [
            variant("direct", "V/V", "V", "I"), variant("departure", "I", "V/V", "V", "I")
        ])
    ]

    public static func normalize(_ progress: AuralProgress) -> AuralProgress {
        guard progress.version == 1 else { return AuralProgress() }
        var result = progress
        result.attempts = min(1_000_000, max(0, result.attempts))
        result.cells = result.cells.filter { key, _ in
            let pieces = key.split(separator: ":", maxSplits: 1).map(String.init)
            return pieces.count == 2 && knownFamily(pieces[0]) && AuralSkill(rawValue: pieces[1]) != nil
        }.mapValues { $0 }
        for key in result.cells.keys {
            guard let skill = AuralSkill(rawValue: key.split(separator: ":").last.map(String.init) ?? "") else {
                result.cells[key] = nil
                continue
            }
            result.cells[key] = clean(result.cells[key] ?? AuralCell(), skill: skill)
        }
        result.exposures = Array(result.exposures.filter {
            !$0.fingerprint.isEmpty && $0.fingerprint.count <= 200
                && !$0.id.isEmpty && $0.id.count <= 200 && $0.at >= 0
        }.suffix(maximumExposures))
        result.recent = Array(result.recent.filter {
            knownFamily($0.familyId) && keys.contains($0.key)
                && (0...2).contains($0.support)
        }.suffix(maximumRecent))
        return result
    }

    public static func cell(_ progress: AuralProgress, familyId: String, skill: AuralSkill) -> AuralCell {
        clean(progress.cells["\(familyId):\(skill.rawValue)"] ?? AuralCell(), skill: skill)
    }

    public static func familyUnlocked(_ progress: AuralProgress, familyId: String) -> Bool {
        guard let family = families.first(where: { $0.id == familyId }) else {
            return Self.patternExpression.matches(familyId)
        }
        return family.prerequisites.allSatisfy { evidenced(progress, familyId: $0, skill: .identify) }
    }

    public static func skillUnlocked(
        _ progress: AuralProgress,
        familyId: String,
        skill: AuralSkill
    ) -> Bool {
        guard familyUnlocked(progress, familyId: familyId),
              let index = AuralSkill.allCases.firstIndex(of: skill) else { return false }
        if index == 0 { return true }
        if index == 1 { return cell(progress, familyId: familyId, skill: .guided).practiceCorrect >= 4 }
        return evidenced(progress, familyId: familyId, skill: AuralSkill.allCases[index - 1])
    }

    public static func selectTarget(
        progress: AuralProgress,
        seed: UInt64,
        now: Int64 = Int64(Date().timeIntervalSince1970 * 1_000),
        microphoneEnabled: Bool = true
    ) -> AuralTarget {
        let progress = normalize(progress)
        var random = AuralRandom(seed: seed ^ UInt64(progress.attempts))
        struct Candidate {
            let familyId: String
            let skill: AuralSkill
            let cell: AuralCell
        }
        let available = families.flatMap { family in
            AuralSkill.allCases.compactMap { skill -> Candidate? in
                guard (microphoneEnabled || skill != .reproduce),
                      skillUnlocked(progress, familyId: family.id, skill: skill) else { return nil }
                return Candidate(familyId: family.id, skill: skill, cell: cell(progress, familyId: family.id, skill: skill))
            }
        }
        precondition(!available.isEmpty)
        let pending = available.filter { !$0.cell.mastered && $0.skill != .guided }
        let unstarted = available.filter { $0.skill == .guided && $0.cell.practiceCorrect < 4 }
        let due = available.filter { $0.skill != .guided && $0.cell.independentAttempts > 0 && $0.cell.dueAt <= now }
        let weak = available.filter { $0.skill != .guided && $0.cell.lastCorrect == false }
        let selected: (Candidate, String)
        if progress.attempts.isMultiple(of: 5), let due = due.min(by: { $0.cell.dueAt < $1.cell.dueAt }) {
            selected = (due, "Revisit an older or uncertain skill.")
        } else if progress.attempts.isMultiple(of: 4), let first = unstarted.first {
            selected = (first, "Introduce a related family with guidance.")
        } else if progress.attempts.isMultiple(of: 3), !weak.isEmpty {
            selected = (weak[random.index(weak.count)], "Strengthen a weak prerequisite before building on it.")
        } else if !pending.isEmpty {
            let frontiers = pending.filter { target in
                !pending.contains { other in
                    other.familyId == target.familyId
                        && AuralSkill.allCases.firstIndex(of: other.skill)! > AuralSkill.allCases.firstIndex(of: target.skill)!
                }
            }
            let pool = progress.attempts % 3 == 1 ? pending : frontiers
            selected = (pool[random.index(pool.count)], "Build the next aural skill with gradually fading help.")
        } else if let first = unstarted.first {
            selected = (first, "Establish the sound of a new relationship.")
        } else {
            let nonGuided = available.filter { $0.skill != .guided }
            let pool = nonGuided.isEmpty ? available : nonGuided
            selected = (pool[random.index(pool.count)], "Maintain fluent hearing with spaced review.")
        }
        let chosen = selected.0
        let microphoneKind: AuralMicrophoneKind? = chosen.skill == .reproduce
            ? microphoneKinds.first(where: { chosen.cell.microphonePractice[$0, default: 0] == 0 })
                ?? microphoneKinds.min(by: {
                    chosen.cell.microphoneIndependent[$0, default: 0]
                        < chosen.cell.microphoneIndependent[$1, default: 0]
                })
            : nil
        let needsIntroduction = microphoneKind.map {
            chosen.cell.microphonePractice[$0, default: 0] == 0
        } ?? false
        let support = needsIntroduction ? max(1, chosen.cell.support) : chosen.cell.support
        let transfer = support == 0 && chosen.cell.independentCorrect >= 2
            && (progress.attempts.isMultiple(of: 3)
                || chosen.cell.independentCorrect >= 4 && chosen.cell.transferCorrect < 2)
        return AuralTarget(
            familyId: chosen.familyId,
            skill: chosen.skill,
            support: support,
            transfer: transfer,
            reason: needsIntroduction
                ? "Learn this singing task with support before testing it independently."
                : transfer ? "Test the relationship in an unfamiliar realization." : selected.1,
            microphoneKind: microphoneKind
        )
    }

    public static func generate(_ target: AuralTarget, seed: UInt64) throws -> AuralExercise {
        if let pattern = target.pattern {
            return try generatePattern(target, pattern: pattern, seed: seed)
        }
        guard let family = families.first(where: { $0.id == target.familyId }),
              (0...2).contains(target.support),
              (0...1).contains(target.octaveShift) else {
            throw AuralCatalogError.invalidSchema("unknown or unsupported curriculum target")
        }
        var random = AuralRandom(seed: seed)
        let candidates = target.support == 2 ? Array(family.variants.prefix(1)) : family.variants
        let randomVariant = candidates[random.index(candidates.count)]
        let variant = target.variantId.flatMap { id in family.variants.first(where: { $0.id == id }) }
            ?? randomVariant
        if target.variantId != nil, variant.id != target.variantId {
            throw AuralCatalogError.invalidSchema("unknown named progression")
        }
        let keyPool = target.support == 2 ? Array(keys.prefix(3))
            : target.support == 1 ? Array(keys.prefix(6)) : keys
        let tonic = keyPool[random.index(keyPool.count)]
        let tempoPool = target.support == 2 ? [66, 72]
            : target.support == 1 ? [66, 72, 80]
            : target.transfer ? [60, 84, 96] : [66, 72, 80, 88]
        let tempo = tempoPool[random.index(tempoPool.count)]
        let instrumentPool = target.support == 2 ? ["sine"]
            : target.support == 1 ? ["sine", "triangle"] : ["sine", "triangle", "soft"]
        let instrument = target.instrumentOverride ?? instrumentPool[random.index(instrumentPool.count)]
        let registerPool = target.support == 2 ? [0]
            : target.support == 1 ? [0, 0, 1] : [-1, 0, 1]
        let register = registerPool[random.index(registerPool.count)] + target.octaveShift
        let inversions = variant.degrees.map { _ in
            target.support == 2 ? 0 : target.support == 1
                ? [0, 0, 1][random.index(3)] : random.index(3)
        }
        let spreads = variant.degrees.map { _ in
            target.support == 0 && (target.transfer || random.next() > 0.65)
        }
        let events = try variant.degrees.enumerated().map {
            try buildEvent($0.element, tonic: tonic, inversion: inversions[$0.offset], register: register, spread: spreads[$0.offset])
        }
        let contextChoices = target.support > 0 ? [["I"]]
            : target.transfer ? [["I", "IV", "V", "I"], ["I", "ii", "V", "I"]]
            : [["I"], ["I", "V", "I"]]
        let contextDegrees = contextChoices[random.index(contextChoices.count)]
        let context = try contextDegrees.map {
            try buildEvent($0, tonic: tonic, inversion: 0, register: register, spread: false)
        }
        return try finishExercise(
            target: target,
            seed: seed,
            family: family,
            variant: variant,
            tonic: tonic,
            tempo: tempo,
            instrument: instrument,
            register: register,
            inversions: inversions,
            spreads: spreads,
            events: events,
            contextDegrees: contextDegrees,
            context: context,
            random: &random
        )
    }

    public static func beginExercise(
        progress: AuralProgress,
        exercise: AuralExercise,
        now: Int64 = Int64(Date().timeIntervalSince1970 * 1_000)
    ) -> (AuralProgress, AuralExercise) {
        var progress = normalize(progress)
        var exercise = exercise
        exercise.previouslyExposed = progress.exposures.contains { $0.fingerprint == exercise.fingerprint }
        exercise.exposureRegistered = true
        progress.exposures = Array((progress.exposures + [
            AuralExposure(fingerprint: exercise.fingerprint, id: exercise.id, at: now)
        ]).suffix(maximumExposures))
        return (progress, exercise)
    }

    public static func evaluate(_ exercise: AuralExercise, response: [String]) -> Bool {
        switch exercise.responseType {
        case "choice": response.count == 1 && response.first == exercise.answerOptionId
        case "sequence": response == exercise.answerDegrees
        default: false
        }
    }

    public static func record(
        progress: AuralProgress,
        exercise: AuralExercise,
        correct: Bool,
        assistance: [String] = [],
        plays: Int = 1,
        attempt: Int = 1,
        technicalUncertainty: Bool = false,
        now: Int64 = Int64(Date().timeIntervalSince1970 * 1_000)
    ) -> AuralProgress {
        precondition(knownFamily(exercise.familyId))
        var progress = normalize(progress)
        let old = cell(progress, familyId: exercise.familyId, skill: exercise.skill)
        let alreadyGraded = progress.recent.contains {
            $0.id == exercise.id && !$0.technicalUncertainty
        }
        let exposed = exercise.exposureRegistered
            ? exercise.previouslyExposed
            : progress.exposures.contains { $0.fingerprint == exercise.fingerprint }
        let kind = exercise.microphoneTask?.kind
        let microphoneReady = exercise.skill != .reproduce
            || kind.map { old.microphonePractice[$0, default: 0] > 0 } == true
        let independent = !technicalUncertainty
            && exercise.provenance.target.variantId == nil
            && exercise.skill != .guided
            && exercise.support == 0
            && assistance.isEmpty
            && plays == 1 && attempt == 1
            && !exposed && !alreadyGraded && microphoneReady
        var updated = old
        if technicalUncertainty {
            // Preserve the cell: uncertainty is not a musical attempt.
        } else if independent {
            let streak = correct ? old.streak + 1 : 0
            let days = min(30, Int(pow(2, Double(min(max(streak - 1, 0), 5)))))
            let interval = correct ? Int64(days) * day : day / 25
            updated.independentAttempts += 1
            if correct {
                updated.independentCorrect += 1
                if exercise.transfer { updated.transferCorrect += 1 }
                if !updated.keys.contains(exercise.keyTonic) { updated.keys.append(exercise.keyTonic) }
                if let kind { updated.microphoneIndependent[kind, default: 0] += 1 }
            }
            updated.lastCorrect = correct
            updated.lastAt = now
            updated.dueAt = now + interval
            updated.streak = streak
            updated.recentIndependent = Array((updated.recentIndependent + [correct]).suffix(recentWindow))
        } else {
            let success = correct && !alreadyGraded && attempt == 1
            updated.practice += 1
            if success {
                updated.practiceCorrect += 1
                if let kind { updated.microphonePractice[kind, default: 0] += 1 }
            }
        }
        updated = clean(updated, skill: exercise.skill)
        if !technicalUncertainty {
            progress.cells["\(exercise.familyId):\(exercise.skill.rawValue)"] = updated
            progress.attempts += 1
        }
        if !exercise.exposureRegistered,
           !progress.exposures.contains(where: { $0.fingerprint == exercise.fingerprint }) {
            progress.exposures = Array((progress.exposures + [
                AuralExposure(fingerprint: exercise.fingerprint, id: exercise.id, at: now)
            ]).suffix(maximumExposures))
        }
        let attemptRecord = AuralAttemptRecord(
            id: exercise.id,
            familyId: exercise.familyId,
            skill: exercise.skill,
            correct: correct,
            independent: independent,
            technicalUncertainty: technicalUncertainty,
            at: now,
            seed: exercise.seed,
            generatorVersion: exercise.generatorVersion,
            fingerprint: exercise.fingerprint,
            key: exercise.keyTonic,
            variantId: exercise.variantId,
            support: exercise.support,
            transfer: exercise.transfer,
            assistance: Array(assistance.prefix(20)),
            plays: min(1_000, max(0, plays)),
            attempt: min(1_000, max(0, attempt)),
            microphoneKind: exercise.provenance.target.microphoneKind,
            requestedVariantId: exercise.provenance.target.variantId,
            instrumentOverride: exercise.provenance.target.instrumentOverride,
            octaveShift: exercise.provenance.target.octaveShift,
            sourceId: exercise.provenance.passage?.sourceId
        )
        progress.recent = Array((progress.recent + [attemptRecord]).suffix(maximumRecent))
        return progress
    }

    public static func selectPracticeSkill(
        progress: AuralProgress,
        familyId: String,
        variantId: String,
        mode: AuralMode
    ) -> AuralSkill {
        let skills = mode.skills
        let history = progress.recent.filter {
            $0.familyId == familyId && !$0.technicalUncertainty
        }
        if mode == .recognize,
           !history.contains(where: { $0.variantId == variantId && $0.correct }),
           cell(progress, familyId: familyId, skill: .identify).independentCorrect == 0 {
            return .guided
        }
        if let recent = history.last(where: { skills.contains($0.skill) }), !recent.correct {
            return recent.skill
        }
        return skills.first(where: {
            let cell = cell(progress, familyId: familyId, skill: $0)
            return cell.practiceCorrect + cell.independentCorrect < 4
        }) ?? skills.min { left, right in
            (history.lastIndex(where: { $0.skill == left }) ?? -1)
                < (history.lastIndex(where: { $0.skill == right }) ?? -1)
        }!
    }

    private static func finishExercise(
        target: AuralTarget,
        seed: UInt64,
        family: AuralFamilyDefinition,
        variant: AuralVariantDefinition,
        tonic: String,
        tempo: Int,
        instrument: String,
        register: Int,
        inversions: [Int],
        spreads: [Bool],
        events: [AuralExerciseEvent],
        contextDegrees: [String],
        context: [AuralExerciseEvent],
        random: inout AuralRandom
    ) throws -> AuralExercise {
        let gap = target.skill == .audiate ? events.indices.last
            : target.skill == .complete ? random.index(events.count) : nil
        let answerDegrees = gap.map { [variant.degrees[$0]] } ?? variant.degrees
        let responseType = target.skill == .guided ? "guided"
            : target.skill == .reproduce ? "microphone"
            : [.compare, .identify].contains(target.skill) ? "choice" : "sequence"
        let options: [AuralOption]
        if responseType == "choice" {
            let count = target.skill == .compare || target.support == 2 ? 1
                : target.support == 1 ? 2 : 3
            let alternatives = random.shuffled(alternatives(to: variant.degrees, familyId: family.id))
            options = random.shuffled([variant.degrees] + Array(alternatives.prefix(count)))
                .enumerated().map {
                    AuralOption(id: "option-\($0.offset + 1)", label: $0.element.joined(separator: " → "), degrees: $0.element)
                }
        } else {
            options = []
        }
        let microphone = target.skill == .reproduce
            ? microphoneTask(target: target, events: events, tonic: tonic, random: &random)
            : nil
        let answerOption = options.first(where: { $0.degrees == variant.degrees })?.id
        let soundIdentity = ["SINE": "sine", "TRIANGLE": "triangle", "WARM_ORGAN": "soft"][instrument] ?? instrument
        let musicalIdentity = [
            family.id, variant.id, tonic, String(tempo), soundIdentity,
            events.map { $0.notes.map(String.init).joined(separator: ",") }.joined(separator: ";"),
            context.map { $0.notes.map(String.init).joined(separator: ",") }.joined(separator: ";")
        ].joined(separator: "|")
        let fingerprint = "realization-\(AuralIdentity.digest(musicalIdentity).prefix(16))"
        let id = "aural-\(AuralIdentity.digest("\(generatorVersion)|\(target.familyId)|\(target.skill.rawValue)|\(target.support)|\(target.transfer)|\(seed)").prefix(16))"
        let prompt: String
        switch target.skill {
        case .guided: prompt = "Listen for changing tension and arrival."
        case .compare: prompt = "Which relationship matches what you heard?"
        case .identify: prompt = "Identify the progression you heard."
        case .recall: prompt = "Listen once, then rebuild the progression."
        case .complete: prompt = "Restore the missing harmony from memory."
        case .audiate: prompt = "Internally hear the silent ending, then answer."
        case .reproduce: prompt = microphone?.label ?? "Reproduce the target pitch."
        }
        return AuralExercise(
            id: id,
            familyId: family.id,
            variantId: variant.id,
            skill: target.skill,
            support: target.support,
            transfer: target.support == 0 && target.transfer,
            seed: seed,
            generatorVersion: generatorVersion,
            keyTonic: tonic,
            tempo: tempo,
            instrument: instrument,
            events: events,
            context: context,
            fullDegrees: variant.degrees,
            gapIndex: gap,
            options: options,
            answerDegrees: answerDegrees,
            answerOptionId: answerOption,
            responseType: responseType,
            microphoneTask: microphone,
            fingerprint: fingerprint,
            prompt: prompt,
            referenceRequired: [.complete, .audiate].contains(target.skill),
            guidance: "\(variant.degrees.joined(separator: " → ")). \(family.description)",
            provenance: AuralProvenance(
                generatorVersion: generatorVersion,
                seed: seed,
                target: target,
                variantId: variant.id,
                keyTonic: tonic,
                tempo: tempo,
                instrument: instrument,
                inversions: inversions,
                register: register,
                spreads: spreads,
                contextDegrees: contextDegrees
            ),
            previouslyExposed: false,
            exposureRegistered: false
        )
    }

    private static func generatePattern(
        _ target: AuralTarget,
        pattern: AuralPattern,
        seed: UInt64
    ) throws -> AuralExercise {
        var random = AuralRandom(seed: seed)
        let mode = pattern.mode ?? "major"
        let tonicPool = ["C", "D", "Eb", "F", "G", "A", "Bb"]
        let tonic = tonicPool[random.index(tonicPool.count)]
        let tempoPool = [66, 72, 80, 88]
        let tempo = tempoPool[random.index(tempoPool.count)]
        guard pattern.tokens.count == pattern.labels.count else {
            throw AuralCatalogError.invalidSchema("pattern labels and tokens differ")
        }
        let events = try zip(pattern.tokens, pattern.labels).map {
            try buildTokenEvent(
                tokenJSON: $0.0,
                label: $0.1,
                tonic: tonic,
                register: 1,
                expectedMode: mode,
                distinguishesBass: pattern.view.hasSuffix("harmony_bass")
            )
        }
        let family = AuralFamilyDefinition(
            id: pattern.id,
            label: pattern.labels.joined(separator: " → "),
            description: "Practice this observed structural pattern.",
            prerequisites: [],
            variants: [AuralVariantDefinition(id: pattern.id, degrees: pattern.labels)]
        )
        return try finishExercise(
            target: target,
            seed: seed,
            family: family,
            variant: family.variants[0],
            tonic: tonic,
            tempo: tempo,
            instrument: target.instrumentOverride ?? "CLARINET",
            register: 1,
            inversions: [Int](repeating: 0, count: events.count),
            spreads: [Bool](repeating: false, count: events.count),
            events: events,
            contextDegrees: ["I"],
            context: [try buildEvent("I", tonic: tonic, inversion: 0, register: 1, spread: false, mode: mode)],
            random: &random
        )
    }

    private static func microphoneTask(
        target: AuralTarget,
        events: [AuralExerciseEvent],
        tonic: String,
        random: inout AuralRandom
    ) -> AuralMicrophoneTask {
        let kind = target.microphoneKind
            ?? (target.support == 2 ? .root : microphoneKinds[random.index(microphoneKinds.count)])
        let index = random.index(events.count)
        let indices = kind == .rootSequence ? Array(events.indices) : [index]
        let degrees = [1, 3, 5]
        let scaleDegree = degrees[random.index(degrees.count)]
        let targetMidis: [Int]
        if kind == .scaleDegree {
            targetMidis = [48 + target.octaveShift * 12 + pitchClass(tonic) + [0, 4, 7][degrees.firstIndex(of: scaleDegree)!]]
        } else {
            targetMidis = indices.map { kind == .bass ? events[$0].bassMidi : events[$0].rootMidi }
        }
        let label: String
        switch kind {
        case .rootSequence: label = "Sing the chord roots in order. Any comfortable octave is accepted."
        case .scaleDegree: label = "Sing scale degree \(scaleDegree) in the established key. Any comfortable octave is accepted."
        case .bass: label = "Sing the lowest sounding note of chord \(index + 1). Any comfortable octave is accepted."
        case .root: label = "Sing the chord root of chord \(index + 1). Any comfortable octave is accepted."
        }
        return AuralMicrophoneTask(
            kind: kind,
            label: label,
            eventIndices: kind == .scaleDegree ? [] : indices,
            targetMidis: targetMidis,
            scaleDegree: kind == .scaleDegree ? scaleDegree : nil
        )
    }

    private static func buildEvent(
        _ degree: String,
        tonic: String,
        inversion: Int,
        register: Int,
        spread: Bool,
        mode: String = "major"
    ) throws -> AuralExerciseEvent {
        let normalized = degree.replacingOccurrences(of: "⁶", with: "")
            .replacingOccurrences(of: "⁶₄", with: "")
        let shape: (offset: Int, intervals: [Int], function: String)
        switch normalized {
        case "I", "i": shape = (0, normalized == "i" ? [0, 3, 7] : [0, 4, 7], "tonic")
        case "ii", "ii°": shape = (2, normalized.contains("°") ? [0, 3, 6] : [0, 3, 7], "predominant")
        case "iii": shape = (4, [0, 3, 7], "tonic")
        case "IV", "iv": shape = (5, normalized == "iv" ? [0, 3, 7] : [0, 4, 7], "predominant")
        case "V": shape = (7, [0, 4, 7], "dominant")
        case "vi": shape = (9, [0, 3, 7], "tonic")
        case "vii°": shape = (11, [0, 3, 6], "dominant")
        case "V/V": shape = (2, [0, 4, 7], "secondary dominant")
        default:
            // Dynamic catalog labels retain exact token identity; a stable triad
            // is only an initial generated model until a source passage replaces it.
            let offset = abs(degree.unicodeScalars.reduce(0) { $0 + Int($1.value) }) % 12
            shape = (offset, mode == "minor" ? [0, 3, 7] : [0, 4, 7], "observed harmony")
        }
        let root = 48 + pitchClass(tonic) + shape.offset + register * 12
        var notes = shape.intervals.map { root + $0 }
        for _ in 0..<min(max(inversion, 0), notes.count) {
            notes.append(notes.removeFirst() + 12)
        }
        if spread, !notes.isEmpty { notes[notes.count - 1] += 12 }
        notes.sort()
        guard notes.allSatisfy({ (1...127).contains($0) }) else {
            throw AuralCatalogError.invalidSchema("generated harmony is out of MIDI range")
        }
        return AuralExerciseEvent(
            notes: notes,
            rootMidi: root,
            bassMidi: notes[0],
            degree: degree,
            functionLabel: shape.function
        )
    }

    private static func buildTokenEvent(
        tokenJSON: String,
        label: String,
        tonic: String,
        register: Int,
        expectedMode: String,
        distinguishesBass: Bool
    ) throws -> AuralExerciseEvent {
        let token = try JSONDecoder().decode(AuralToken.self, from: Data(tokenJSON.utf8))
        guard token.mode == expectedMode,
              !token.intervals.isEmpty,
              token.intervals.count <= 16,
              token.intervals.allSatisfy({ (0...48).contains($0) })
        else { throw AuralCatalogError.invalidSchema("unsupported structural token") }
        let root = 48 + pitchClass(tonic) + token.rootPc + register * 12
        var notes = token.intervals.map { root + $0 }
        if distinguishesBass, let bassInterval = token.bassInterval {
            guard let bassIndex = token.intervals.firstIndex(where: {
                (($0 - bassInterval) % 12 + 12) % 12 == 0
            }) else { throw AuralCatalogError.invalidSchema("token bass is not a chord tone") }
            let bass = root + token.intervals[bassIndex]
            for index in notes.indices where index != bassIndex {
                while notes[index] <= bass { notes[index] += 12 }
            }
        }
        notes.sort()
        guard notes.allSatisfy({ (1...127).contains($0) }) else {
            throw AuralCatalogError.invalidSchema("structural token is out of MIDI range")
        }
        let function = label.contains("V") ? "dominant"
            : label.contains("ii") || label.contains("IV") ? "predominant" : "observed harmony"
        return AuralExerciseEvent(
            notes: notes,
            rootMidi: root,
            bassMidi: notes[0],
            degree: label,
            functionLabel: function
        )
    }

    private static func alternatives(to degrees: [String], familyId: String) -> [[String]] {
        var choices = families.flatMap(\.variants).map(\.degrees).filter { $0.count == degrees.count }
        for index in degrees.indices {
            var changed = degrees
            changed[index] = switch changed[index] {
            case "V/V": "ii"
            case "V": "IV"
            case "I": "vi"
            case "vi": "I"
            default: "V"
            }
            choices.append(changed)
        }
        var seen: Set<[String]> = []
        return choices.filter {
            $0 != degrees && (familyId == "secondary-dominant" || !$0.contains("V/V"))
                && seen.insert($0).inserted
        }
    }

    private static func clean(_ source: AuralCell, skill: AuralSkill) -> AuralCell {
        var cell = source
        cell.independentAttempts = min(1_000_000, max(0, cell.independentAttempts))
        cell.independentCorrect = min(cell.independentAttempts, max(0, cell.independentCorrect))
        cell.practice = min(1_000_000, max(0, cell.practice))
        cell.practiceCorrect = min(cell.practice, max(0, cell.practiceCorrect))
        cell.transferCorrect = min(cell.independentCorrect, max(0, cell.transferCorrect))
        cell.keys = Array(cell.keys.filter(keys.contains).uniqued().prefix(min(cell.independentCorrect, keys.count)))
        cell.lastAt = max(0, cell.lastAt)
        cell.dueAt = max(0, cell.dueAt)
        cell.streak = min(cell.independentCorrect, max(0, cell.streak))
        cell.recentIndependent = Array(cell.recentIndependent.suffix(min(cell.independentAttempts, recentWindow)))
        cell.microphonePractice = cell.microphonePractice.filter { microphoneKinds.contains($0.key) }
            .mapValues { min(cell.practice, max(0, $0)) }
        cell.microphoneIndependent = cell.microphoneIndependent.filter { microphoneKinds.contains($0.key) }
            .mapValues { min(cell.independentCorrect, max(0, $0)) }
        cell.support = cell.practiceCorrect < 2 ? 2 : cell.practiceCorrect < 4 ? 1 : 0
        let accuracy = cell.recentIndependent.isEmpty ? 0
            : Double(cell.recentIndependent.filter { $0 }.count) / Double(cell.recentIndependent.count)
        cell.mastered = cell.independentCorrect >= 6
            && cell.recentIndependent.count >= 6
            && accuracy >= 0.8
            && cell.keys.count >= 3
            && cell.transferCorrect >= 2
            && (skill != .reproduce
                || microphoneKinds.allSatisfy { cell.microphoneIndependent[$0, default: 0] > 0 })
        return cell
    }

    private static func evidenced(
        _ progress: AuralProgress,
        familyId: String,
        skill: AuralSkill
    ) -> Bool {
        let cell = cell(progress, familyId: familyId, skill: skill)
        let accuracy = cell.recentIndependent.isEmpty ? 0
            : Double(cell.recentIndependent.filter { $0 }.count) / Double(cell.recentIndependent.count)
        return cell.independentCorrect >= 2 && accuracy >= 0.6
    }

    private static func knownFamily(_ id: String) -> Bool {
        families.contains(where: { $0.id == id }) || patternExpression.matches(id)
    }

    private static let patternExpression = try! NSRegularExpression(
        pattern: #"^p_[0-9a-f]{12}_[0-9]+_[0-9a-f]{32}$"#
    )

    private static func family(
        _ id: String,
        _ label: String,
        _ description: String,
        _ prerequisites: [String],
        _ variants: [AuralVariantDefinition]
    ) -> AuralFamilyDefinition {
        AuralFamilyDefinition(
            id: id,
            label: label,
            description: description,
            prerequisites: prerequisites,
            variants: variants
        )
    }

    private static func variant(_ id: String, _ degrees: String...) -> AuralVariantDefinition {
        AuralVariantDefinition(id: id, degrees: degrees)
    }

    private static func pitchClass(_ tonic: String) -> Int {
        [
            "C": 0, "Db": 1, "C#": 1, "D": 2, "Eb": 3, "D#": 3, "E": 4,
            "F": 5, "Gb": 6, "F#": 6, "G": 7, "Ab": 8, "G#": 8,
            "A": 9, "Bb": 10, "A#": 10, "B": 11
        ][tonic] ?? 0
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen: Set<Element> = []
        return filter { seen.insert($0).inserted }
    }
}

private extension NSRegularExpression {
    func matches(_ value: String) -> Bool {
        firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) != nil
    }
}
