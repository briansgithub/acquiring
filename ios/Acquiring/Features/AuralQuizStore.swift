import AcquiringAural
import AcquiringAudio
import AcquiringCore
import Foundation
import Observation

struct AuralDisplayRow: Identifiable, Hashable {
    let id: String
    let path: String
    var row: AuralCatalogRow
}

@MainActor
@Observable
final class AuralQuizStore {
    var state: FeatureState<AuralCatalogInfo> = .loading
    var progressMessage = "Opening the progression catalog…"
    var roots: [AuralDisplayRow] = []
    var childrenByPath: [String: [AuralDisplayRow]] = [:]
    var expandedPaths: Set<String> = []
    var isLoadingPage = false
    var hasMore = false
    var pageError: String?
    var search = ""
    var minimumLength = 2
    var maximumLength: Int?
    var preferPopular = true
    var keepVaried = true
    var favorFavorites = false
    var distinguishInversions = false
    var flatList = false
    var selectedPattern: AuralPattern?
    var selectedMode: AuralMode = .recognize
    var selectedDetailTab: AuralDetailTab = .recognize
    var evidenceText: String?
    var treeScrollPath: String?
    var flatScrollPath: String?
    private var recentSongIds: [String] = []

    @ObservationIgnored private let environment: AppEnvironment
    @ObservationIgnored private let libraryStore: LibraryStore
    @ObservationIgnored private var rankingID: AuralCatalogReader.RankingID?
    @ObservationIgnored private var loadTask: Task<Void, Never>?
    @ObservationIgnored private var queryGeneration = 0
    @ObservationIgnored private var isRestoringExpansion = false

    init(environment: AppEnvironment, libraryStore: LibraryStore) {
        self.environment = environment
        self.libraryStore = libraryStore
        let restored = environment.auralRestoration.snapshot
        search = restored.search
        minimumLength = restored.minimumLength
        maximumLength = restored.maximumLength
        preferPopular = restored.preferPopular
        keepVaried = restored.keepVaried
        favorFavorites = restored.favorFavorites
        distinguishInversions = restored.distinguishInversions
        flatList = restored.flatList
        treeScrollPath = restored.treeScrollPath
        flatScrollPath = restored.flatScrollPath
    }

    var query: AuralCatalogQuery {
        AuralCatalogQuery(
            view: distinguishInversions ? "harmony_bass" : "harmony",
            search: search,
            minimumLength: minimumLength,
            maximumLength: maximumLength,
            preferPopular: preferPopular,
            keepVaried: keepVaried,
            favorFavorites: favorFavorites,
            flatList: flatList,
            favoriteSongIds: libraryStore.userContent.favoriteSlugs,
            recentSongIds: recentSongIds
        )
    }

    var visibleRows: [AuralDisplayRow] {
        guard !flatList else { return roots }
        var result: [AuralDisplayRow] = []
        func append(_ nodes: [AuralDisplayRow]) {
            for node in nodes {
                result.append(node)
                if expandedPaths.contains(node.path), let children = childrenByPath[node.path] {
                    append(children)
                }
            }
        }
        append(roots)
        return result
    }

    func load() async {
        loadTask?.cancel()
        state = .loading
        progressMessage = "Opening the progression catalog…"
        do {
            do {
                try await environment.auralCatalog.prepare()
            } catch {
                _ = try await environment.auralInstaller.ensureInstalled { [weak self] progress in
                    Task { @MainActor in self?.progressMessage = progress.message }
                }
                try await environment.auralCatalog.reload()
            }
            let info = try await environment.auralCatalog.info()
            state = .content(info)
            recentSongIds = await environment.auralSession.recentSongIds()
            await restartRanking()
        } catch is CancellationError {
            return
        } catch {
            state = .failure(error.localizedDescription)
        }
    }

    func forceUpdate() async {
        state = .loading
        progressMessage = "Checking Aural Quiz data…"
        do {
            _ = try await environment.auralInstaller.ensureInstalled(force: true) { [weak self] progress in
                Task { @MainActor in self?.progressMessage = progress.message }
            }
            try await environment.auralCatalog.reload()
            state = .content(try await environment.auralCatalog.info())
            recentSongIds = await environment.auralSession.recentSongIds()
            await restartRanking()
        } catch {
            state = .failure(error.localizedDescription)
        }
    }

    func restartRanking() async {
        queryGeneration &+= 1
        let generation = queryGeneration
        var settings = AuralSettings()
        settings.popularity = preferPopular
        settings.variety = keepVaried
        settings.favorites = favorFavorites
        settings.distinguishInversions = distinguishInversions
        settings.flatList = flatList
        await environment.auralSession.setSettings(settings)
        if let rankingID { await environment.auralCatalog.closeRanking(rankingID) }
        rankingID = nil
        roots = []
        childrenByPath = [:]
        expandedPaths = []
        pageError = nil
        do {
            let id = try await environment.auralCatalog.beginRanking(query)
            guard generation == queryGeneration else {
                await environment.auralCatalog.closeRanking(id)
                return
            }
            rankingID = id
            await loadNextPage(generation: generation)
        } catch {
            pageError = error.localizedDescription
        }
    }

    func scheduleRestart() {
        persistCatalogState()
        loadTask?.cancel()
        loadTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(250)) }
            catch { return }
            await self?.restartRanking()
        }
    }

    func loadNextPage(generation: Int? = nil) async {
        guard !isLoadingPage, let rankingID else { return }
        let expected = generation ?? queryGeneration
        isLoadingPage = true
        defer { isLoadingPage = false }
        do {
            let page = try await environment.auralCatalog.page(rankingID, limit: 30)
            guard expected == queryGeneration else { return }
            let start = roots.count
            roots += page.rows.enumerated().map { offset, source in
                var row = source
                row.outline = "\(start + offset + 1)"
                return AuralDisplayRow(id: row.outline, path: row.outline, row: row)
            }
            hasMore = page.hasMore
            pageError = nil
            await restoreExpansionIfNeeded()
        } catch is CancellationError {
            return
        } catch {
            pageError = error.localizedDescription
        }
    }

    func toggle(_ node: AuralDisplayRow) async {
        guard node.row.length > 2, !flatList else { return }
        if expandedPaths.remove(node.path) != nil {
            persistCatalogState()
            return
        }
        expandedPaths.insert(node.path)
        guard childrenByPath[node.path] == nil else { return }
        do {
            let children = try await environment.auralCatalog.children(of: node.row.pattern, query: query)
            childrenByPath[node.path] = children.enumerated().map { offset, source in
                var row = source
                row.outline = "\(node.path).\(offset + 1)"
                return AuralDisplayRow(id: row.outline, path: row.outline, row: row)
            }
            persistCatalogState()
        } catch {
            expandedPaths.remove(node.path)
            pageError = error.localizedDescription
        }
    }

    func select(_ node: AuralDisplayRow) {
        selectedPattern = node.row.pattern
        selectedDetailTab = .recognize
    }

    func rememberScroll(_ path: String?) {
        if flatList { flatScrollPath = path } else { treeScrollPath = path }
        persistCatalogState()
    }

    func loadEvidence(for pattern: AuralPattern) async {
        do { evidenceText = try await environment.auralCatalog.evidenceText(for: pattern) }
        catch { evidenceText = error.localizedDescription }
    }

    private func restoreExpansionIfNeeded() async {
        guard !isRestoringExpansion else { return }
        let saved = environment.auralRestoration.snapshot.expandedPatternPaths
        guard !saved.isEmpty else { return }
        isRestoringExpansion = true
        defer { isRestoringExpansion = false }
        for path in saved.keys.sorted(by: {
            $0.split(separator: ".").count < $1.split(separator: ".").count
        }) {
            guard !expandedPaths.contains(path),
                  let node = visibleRows.first(where: { $0.path == path && $0.row.id == saved[path]?.id })
            else { continue }
            await toggle(node)
        }
    }

    private func persistCatalogState() {
        var expanded: [String: AuralPattern] = [:]
        for node in visibleRows where expandedPaths.contains(node.path) {
            expanded[node.path] = node.row.pattern
        }
        environment.auralRestoration.updateCatalog(
            search: search,
            minimumLength: minimumLength,
            maximumLength: maximumLength,
            preferPopular: preferPopular,
            keepVaried: keepVaried,
            favorFavorites: favorFavorites,
            distinguishInversions: distinguishInversions,
            flatList: flatList,
            expanded: expanded,
            treeScrollPath: treeScrollPath,
            flatScrollPath: flatScrollPath
        )
    }
}

enum AuralDetailTab: String, CaseIterable, Identifiable, Codable {
    case recognize
    case recall
    case sing
    case songs

    var id: Self { self }
    var title: String { rawValue.capitalized }
}

@MainActor
@Observable
final class AuralLessonModel {
    private(set) var lesson: AuralLessonState?
    private(set) var isListening = false
    private(set) var isPreparing = false
    private(set) var isRecording = false
    private(set) var pitchAssessment: AuralPitchAssessment?
    private(set) var captureTargetIndex = 0
    private(set) var isOpeningPlayback = false
    var draft: [String] = []
    var errorMessage: String?
    var chunkIndex = 0

    let pattern: AuralPattern?
    let familyId: String?
    let variantId: String?
    let mode: AuralMode

    @ObservationIgnored private let environment: AppEnvironment
    @ObservationIgnored private let favoriteSongIds: Set<String>
    @ObservationIgnored private var playbackTask: Task<Void, Never>?
    @ObservationIgnored private var recordingTask: Task<Void, Never>?
    @ObservationIgnored private var activeLease: MicrophoneLease?
    @ObservationIgnored private var latestPitch: PitchReading?
    @ObservationIgnored private var pitchStreamError: String?
    @ObservationIgnored private var generation = 0

    init(
        pattern: AuralPattern,
        mode: AuralMode,
        environment: AppEnvironment,
        favoriteSongIds: Set<String>
    ) {
        self.pattern = pattern
        familyId = nil
        variantId = nil
        self.mode = mode
        self.environment = environment
        self.favoriteSongIds = favoriteSongIds
    }

    init(
        familyId: String,
        variantId: String,
        mode: AuralMode,
        environment: AppEnvironment
    ) {
        pattern = nil
        self.familyId = familyId
        self.variantId = variantId
        self.mode = mode
        self.environment = environment
        favoriteSongIds = []
    }

    func start() async {
        isPreparing = true
        defer { isPreparing = false }
        do {
            let restored = await environment.auralSession.state()
            let expectedFamily = pattern?.id ?? familyId
            if let current = restored.exercise,
               current.familyId == expectedFamily,
               current.skill.mode == mode {
                lesson = restored
                draft = restored.draft
                errorMessage = nil
                return
            }
            let prior = (await environment.auralSession.state()).exercise
            let exercise: AuralExercise
            if let pattern {
                exercise = try await environment.auralSession.practicePattern(
                    pattern,
                    mode: mode,
                    defaultInstrument: environment.quizInstrument.selection.rawValue
                )
            } else if let familyId, let variantId {
                exercise = try await environment.auralSession.practice(
                    familyId: familyId,
                    variantId: variantId,
                    mode: mode,
                    defaultInstrument: environment.quizInstrument.selection.rawValue
                )
            } else {
                throw AuralCatalogError.invalidSchema("missing learning target")
            }
            if let pattern {
            var context = AuralSelectionContext()
            context.recentSongIds = await environment.auralSession.recentSongIds()
            context.heardSourceIds = await environment.auralSession.heardSourceIds()
            context.favoriteSongIds = favoriteSongIds
            context.assessment = exercise.support == 0
            if exercise.support > 0, prior?.familyId == pattern.id {
                context.supportedOccurrenceId = prior?.provenance.passage?.occurrenceId
            }
            do {
                let passage = try await environment.auralCatalog.passage(
                    for: pattern,
                    settings: await environment.auralSession.settings(),
                    context: context,
                    seed: exercise.seed
                )
                let info = try await environment.auralCatalog.info()
                try await environment.auralSession.applyPassage(
                    passage,
                    catalogSnapshotId: info.snapshotId,
                    popularityVersion: info.popularitySnapshotId,
                    context: context,
                    seed: exercise.seed
                )
            } catch {
                await environment.auralSession.markCorpusFallback(
                    "No eligible source passage; using a generated example for the same target."
                )
            }
            }
            lesson = await environment.auralSession.state()
            draft = lesson?.draft ?? []
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func listen(chunked: Bool = false) {
        guard let exercise = lesson?.exercise else { return }
        let requestedChunk = chunkIndex
        generation &+= 1
        let expected = generation
        playbackTask?.cancel()
        playbackTask = Task { [weak self] in
            guard let self else { return }
            do {
                let events: [AuralExerciseEvent]?
                if chunked {
                    events = AuralAudioPlanner.chunk(exercise, index: requestedChunk)
                    guard events?.isEmpty == false else {
                        throw AuralCatalogError.invalidSchema("That practice chunk is unavailable.")
                    }
                    await environment.auralSession.assistedChunk()
                } else {
                    events = nil
                }
                let plan = try AuralAudioPlanner.plan(
                    exercise: exercise,
                    waveform: environment.quizInstrument.selection,
                    events: events
                )
                isListening = true
                try await environment.audio.load(plan.timeline, position: .restart)
                try await environment.audio.play()
                await environment.auralSession.played()
                lesson = await environment.auralSession.state()
                if plan.exposureSeconds <= 0 {
                    await environment.auralSession.exposureReached()
                }
                let states = await environment.audio.states()
                var sawPlaying = false
                var exposureReached = plan.exposureSeconds <= 0
                var priorElapsed = 0.0
                for await transport in states {
                    try Task.checkCancellation()
                    guard expected == generation else { return }
                    let elapsed = Self.seconds(transport.elapsed)
                    if transport.phase == .playing {
                        sawPlaying = true
                        if !exposureReached, elapsed >= plan.exposureSeconds {
                            exposureReached = true
                            await environment.auralSession.exposureReached()
                        }
                        let reachedEnd = elapsed >= max(0, plan.durationSeconds - 0.04)
                            || priorElapsed > plan.durationSeconds * 0.5
                                && elapsed + 0.04 < priorElapsed
                        if reachedEnd {
                            if !exposureReached {
                                await environment.auralSession.exposureReached()
                            }
                            await environment.audio.stop()
                            if !chunked {
                                await environment.auralSession.listeningCompleted()
                                lesson = await environment.auralSession.state()
                            }
                            isListening = false
                            return
                        }
                        priorElapsed = elapsed
                    } else if transport.phase == .failed {
                        throw AuralCatalogError.integrity(
                            transport.errorDescription ?? "Audio playback failed."
                        )
                    } else if sawPlaying
                                && (transport.phase == .paused || transport.phase == .stopped) {
                        await environment.auralSession.interrupted()
                        lesson = await environment.auralSession.state()
                        isListening = false
                        return
                    }
                }
            } catch is CancellationError {
                if expected == generation { isListening = false }
            } catch {
                if expected == generation {
                    isListening = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    func stop(markInterrupted: Bool) async {
        generation &+= 1
        playbackTask?.cancel()
        playbackTask = nil
        recordingTask?.cancel()
        recordingTask = nil
        if let activeLease {
            environment.audio.releaseMicrophone(activeLease)
            self.activeLease = nil
        }
        latestPitch = nil
        isRecording = false
        isListening = false
        await environment.audio.stop()
        if markInterrupted, lesson?.exercise != nil, lesson?.answered == false {
            await environment.auralSession.interrupted()
            lesson = await environment.auralSession.state()
        }
    }

    func hint() async {
        await environment.auralSession.hint()
        lesson = await environment.auralSession.state()
    }

    func append(_ token: String) {
        guard lesson?.answered == false else { return }
        draft.append(token)
        Task { await environment.auralSession.rememberExerciseDraft(draft) }
    }

    func removeLast() {
        guard lesson?.answered == false, !draft.isEmpty else { return }
        draft.removeLast()
        Task { await environment.auralSession.rememberExerciseDraft(draft) }
    }

    func choose(_ option: AuralOption) async {
        await environment.auralSession.submit([option.id])
        lesson = await environment.auralSession.state()
    }

    func submitSequence() async {
        await environment.auralSession.submit(draft)
        lesson = await environment.auralSession.state()
    }

    func completeGuided() async {
        await environment.auralSession.submit([])
        lesson = await environment.auralSession.state()
    }

    func retry() async {
        await environment.auralSession.retry()
        lesson = await environment.auralSession.state()
        draft = []
        captureTargetIndex = 0
        pitchAssessment = nil
    }

    func next() async {
        await stop(markInterrupted: false)
        pitchAssessment = nil
        captureTargetIndex = 0
        await start()
    }

    func openPlayback(using libraryStore: LibraryStore) async {
        guard let passage = lesson?.exercise?.provenance.passage else {
            errorMessage = "The exact source passage is unavailable."
            return
        }
        await environment.auralSession.exploringPlayback(
            draft: draft,
            passage: passage,
            fromSongs: false
        )
        await stop(markInterrupted: false)
        isOpeningPlayback = true
        libraryStore.path.append(.auralPlayback(AuralPlaybackRequest(
            passage: passage,
            fromSongs: false
        )))
    }

    func resumedAfterPlayback() {
        isOpeningPlayback = false
    }

    func capturePitch() {
        guard let task = lesson?.exercise?.microphoneTask,
              !task.targetMidis.isEmpty,
              lesson?.heard == true,
              !isRecording else { return }
        recordingTask?.cancel()
        pitchAssessment = nil
        recordingTask = Task { [weak self] in
            guard let self else { return }
            await environment.audio.stop()
            do {
                let lease = try await environment.audio.acquireMicrophone(
                    owner: .auralQuiz,
                    profile: .standard
                )
                guard !Task.isCancelled else {
                    environment.audio.releaseMicrophone(lease)
                    return
                }
                activeLease = lease
                isRecording = true
                latestPitch = nil
                pitchStreamError = nil
                let reader = Task { @MainActor [weak self] in
                    do {
                        for try await reading in lease.readings {
                            guard !Task.isCancelled else { return }
                            self?.latestPitch = reading
                        }
                    } catch is CancellationError {
                        return
                    } catch {
                        self?.pitchStreamError = error.localizedDescription
                    }
                }
                var frames: [AuralPitchFrame] = []
                let clock = ContinuousClock()
                let start = clock.now
                for _ in 0..<100 {
                    try Task.checkCancellation()
                    let elapsed = start.duration(to: clock.now)
                    let milliseconds = Int64(
                        Double(elapsed.components.seconds) * 1_000
                            + Double(elapsed.components.attoseconds) / 1_000_000_000_000_000
                    )
                    if let error = pitchStreamError {
                        frames.append(AuralPitchFrame(
                            timeMilliseconds: milliseconds,
                            midi: nil,
                            error: error
                        ))
                        break
                    } else if let latestPitch {
                        frames.append(AuralPitchFrame(
                            timeMilliseconds: milliseconds,
                            reading: latestPitch
                        ))
                    } else {
                        frames.append(AuralPitchFrame(timeMilliseconds: milliseconds, midi: nil))
                    }
                    try await Task.sleep(for: .milliseconds(40))
                }
                reader.cancel()
                environment.audio.releaseMicrophone(lease)
                activeLease = nil
                isRecording = false
                let targetIndex = min(captureTargetIndex, max(0, task.targetMidis.count - 1))
                var assessment = AuralPitchAssessor.assess(
                    frames: frames,
                    targetMidis: [task.targetMidis[targetIndex]]
                )
                switch assessment.status {
                case .correct:
                    if task.kind == .rootSequence, targetIndex + 1 < task.targetMidis.count {
                        captureTargetIndex += 1
                        assessment = AuralPitchAssessment(
                            status: .correct,
                            reason: "Note \(targetIndex + 1) matched. Record note \(targetIndex + 2) next.",
                            cents: assessment.cents
                        )
                    } else {
                        await environment.auralSession.grade(true)
                    }
                case .incorrect:
                    await environment.auralSession.grade(false)
                case .uncertain:
                    await environment.auralSession.grade(false, technicalUncertainty: true)
                }
                pitchAssessment = assessment
                lesson = await environment.auralSession.state()
            } catch is CancellationError {
                if let activeLease { environment.audio.releaseMicrophone(activeLease) }
                activeLease = nil
                isRecording = false
            } catch {
                if let activeLease { environment.audio.releaseMicrophone(activeLease) }
                activeLease = nil
                isRecording = false
                let assessment = AuralPitchAssessment(
                    status: .uncertain,
                    reason: error.localizedDescription
                )
                pitchAssessment = assessment
                await environment.auralSession.grade(false, technicalUncertainty: true)
                lesson = await environment.auralSession.state()
            }
        }
    }

    func cancelCapture() {
        recordingTask?.cancel()
    }

    var vocabulary: [String] {
        guard let exercise = lesson?.exercise else { return [] }
        return Array(Set(AuralCurriculum.degrees + exercise.fullDegrees)).sorted()
    }

    var modeName: String? { pattern?.mode ?? "major" }

    var chunkCount: Int {
        guard let count = lesson?.exercise?.events.count else { return 0 }
        return max(1, (count + 3) / 4)
    }

    private static func seconds(_ duration: Duration) -> Double {
        let components = duration.components
        return Double(components.seconds)
            + Double(components.attoseconds) / 1_000_000_000_000_000_000
    }
}

@MainActor
@Observable
final class AuralSongsModel {
    private(set) var state: FeatureState<[AuralPatternSong]> = .loading
    private(set) var openingSongId: String?
    var errorMessage: String?
    var scrollSongId: String?

    let pattern: AuralPattern
    @ObservationIgnored private let environment: AppEnvironment
    @ObservationIgnored private let libraryStore: LibraryStore

    init(pattern: AuralPattern, environment: AppEnvironment, libraryStore: LibraryStore) {
        self.pattern = pattern
        self.environment = environment
        self.libraryStore = libraryStore
        scrollSongId = environment.auralRestoration.snapshot.songsScrollId
    }

    func load() async {
        state = .loading
        do {
            let songs = try await environment.auralCatalog.songs(for: pattern)
            state = songs.isEmpty ? .empty : .content(songs)
        } catch {
            state = .failure(error.localizedDescription)
        }
    }

    func open(_ song: AuralPatternSong) async {
        guard openingSongId == nil else { return }
        openingSongId = song.id
        defer { openingSongId = nil }
        do {
            let exercise = try await environment.auralSession.practicePattern(
                pattern,
                mode: .recognize,
                defaultInstrument: environment.quizInstrument.selection.rawValue
            )
            var context = AuralSelectionContext()
            context.recentSongIds = await environment.auralSession.recentSongIds()
            context.heardSourceIds = await environment.auralSession.heardSourceIds()
            context.favoriteSongIds = libraryStore.userContent.favoriteSlugs
            context.assessment = false
            let settings = await environment.auralSession.settings()
            let passage = try await environment.auralCatalog.passage(
                for: pattern,
                settings: settings,
                context: context,
                seed: exercise.seed,
                songId: song.id
            )
            let info = try await environment.auralCatalog.info()
            try await environment.auralSession.applyPassage(
                passage,
                catalogSnapshotId: info.snapshotId,
                popularityVersion: info.popularitySnapshotId,
                context: context,
                seed: exercise.seed
            )
            await environment.auralSession.exploringPlayback(
                draft: [],
                passage: passage,
                fromSongs: true
            )
            await environment.audio.stop()
            libraryStore.path.append(.auralPlayback(AuralPlaybackRequest(
                passage: passage,
                fromSongs: true
            )))
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func rememberScroll(_ id: String?) {
        scrollSongId = id
        environment.auralRestoration.rememberSongsScroll(id)
    }
}
