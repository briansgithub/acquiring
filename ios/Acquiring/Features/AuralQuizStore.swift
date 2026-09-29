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
struct AuralBucketPage {
    var rows: [AuralDisplayRow] = []
    var rankingID: AuralCatalogReader.RankingID?
    var isLoading = false
    var hasMore = false
    var error: String?
}
struct AuralPrimaryGroup: Identifiable {
    let id: String
    let label: String
    let buckets: [AuralCatalogBucket]
}

@MainActor
@Observable
final class AuralQuizStore {
    var state: FeatureState<AuralCatalogInfo> = .loading
    var progressMessage = "Opening the progression catalog…"
    var buckets: [AuralCatalogBucket] = []
    var pages: [String: AuralBucketPage] = [:]
    var childrenByPath: [String: [AuralDisplayRow]] = [:]
    var expandedPaths: Set<String> = []
    var expandedPrimary: Set<String> = []
    var expandedBuckets: Set<String> = []
    var progression = AuralProgressionQuery()
    var minimumPopularityPercent = 80
    var preferPopular = true
    var keepVaried = true
    var favorFavorites = false
    var distinguishInversions = false
    var flatList = false
    var analysis = "relativeMajor"
    var modeFilter = "major"
    var groupingPriority = "none"
    var sortOrder = "mostSongs"
    var browser = AuralBrowserSnapshot()
    let globalBucket = AuralCatalogBucket(length: 0, startingChord: "", label: "All progressions")
    var evidenceText: String?
    var pageError: String?
    var isLoadingGroups = false
    var scrollID: String?
    var reviewRows: [AuralCatalogRow] = []
    var showsReview = false
    private var catalogInfo: AuralCatalogInfo?
    private var frozenQuery = AuralCatalogQuery()
    private var context = ""
    private var isActive = true
    @ObservationIgnored private let environment: AppEnvironment
    @ObservationIgnored private let libraryStore: LibraryStore
    @ObservationIgnored private var loadTask: Task<Void, Never>?
    @ObservationIgnored private var queryGeneration = 0

    init(environment: AppEnvironment, libraryStore: LibraryStore) {
        self.environment = environment
        self.libraryStore = libraryStore
        let restored = environment.auralRestoration.snapshot
        preferPopular = restored.preferPopular
        keepVaried = restored.keepVaried
        favorFavorites = restored.favorFavorites
        distinguishInversions = restored.distinguishInversions
        flatList = restored.flatList
        browser = restored.browser ?? AuralBrowserSnapshot()
        minimumPopularityPercent = min(100,max(0,browser.minimumPopularityPercent ?? 80))
        progression = browser.progression.flatMap { $0.isValid ? $0 : nil } ?? AuralProgressionQuery()
        analysis = browser.analysis
        modeFilter = browser.modeFilter
        if browser.rankingVersion < 2 {
            browser.groupingPriority = "none"
            browser.sortOrder = "mostSongs"
            browser.rankingVersion = 2
        }
        groupingPriority = browser.groupingPriority
        sortOrder = browser.sortOrder
    }

    static let modes = ["major","minor","dorian","phrygian","lydian","mixolydian","locrian","harmonicMinor","phrygianDominant"]
    static func modeLabel(_ mode: String) -> String {
        switch mode { case "harmonicMinor": "Harmonic minor"; case "phrygianDominant": "Phrygian dominant"; default: mode.capitalized }
    }
    var supportsModes: Bool { catalogInfo?.supportsModeAnalysis == true }
    var supportsStartingChords: Bool { catalogInfo?.supportsStartGrouping == true }
    var effectiveAnalysis: String { supportsModes ? analysis : "allModes" }
    var startFirst: Bool { supportsStartingChords && groupingPriority == "start" }
    var isUngrouped: Bool { groupingPriority == "none" }
    var primaryGroups: [AuralPrimaryGroup] {
        if startFirst {
            let grouped = Dictionary(grouping: buckets, by: \.startingChord)
            return grouped.values.compactMap { group in
                guard let first = group.first else { return nil }
                return AuralPrimaryGroup(id: "start:\(first.startingChord)", label: "Starts with \(first.label)",
                                         buckets: group.sorted { $0.length > $1.length })
            }.sorted { AuralCatalogBucket.startingChordBefore($0.buckets[0], $1.buckets[0]) }
        }
        return Dictionary(grouping: buckets, by: \.length).keys.sorted(by: >).map { length in
            AuralPrimaryGroup(id: "length:\(length)", label: "\(length) chords",
                buckets: buckets.filter { $0.length == length }.sorted(by: AuralCatalogBucket.startingChordBefore))
        }
    }

    func load() async {
        isActive = true
        state = .loading
        do {
            do { try await environment.auralCatalog.prepare() }
            catch {
                _ = try await environment.auralInstaller.ensureInstalled { [weak self] progress in
                    Task { @MainActor in self?.progressMessage = progress.message }
                }
                try await environment.auralCatalog.reload()
            }
            catalogInfo = try await environment.auralCatalog.info()
            if let catalogInfo { state = .content(catalogInfo) }
            await restartRanking(restoring: true)
        } catch is CancellationError { return }
        catch { state = .failure(error.localizedDescription) }
    }

    func forceUpdate() async {
        do {
            _ = try await environment.auralInstaller.ensureInstalled(force: true)
            try await environment.auralCatalog.reload()
            await load()
        } catch { pageError = error.localizedDescription }
    }

    func scheduleRestart() {
        queryGeneration &+= 1
        loadTask?.cancel()
        isLoadingGroups = true
        persist()
        loadTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(250)); try Task.checkCancellation() }
            catch { return }
            await self?.restartRanking()
        }
    }

    func restartRanking(restoring: Bool = false) async {
        queryGeneration &+= 1
        let generation = queryGeneration
        isLoadingGroups = true
        let oldIDs = pages.values.compactMap(\.rankingID)
        buckets = []; pages = [:]; childrenByPath = [:]; expandedPaths = []
        expandedPrimary = []; expandedBuckets = []; pageError = nil
        for id in oldIDs { await environment.auralCatalog.closeRanking(id) }
        var settings = AuralSettings()
        settings.popularity = preferPopular; settings.variety = keepVaried
        settings.favorites = favorFavorites; settings.distinguishInversions = distinguishInversions
        settings.flatList = flatList; settings.analysis = effectiveAnalysis; settings.modeFilter = modeFilter
        await environment.auralSession.setSettings(settings)
        let recent = await environment.auralSession.recentSongIds()
        let query = AuralCatalogQuery(view: settings.view, progression: progression,
            minimumPopularityPercent: minimumPopularityPercent,
            preferPopular: preferPopular, keepVaried: keepVaried, favorFavorites: favorFavorites,
            favoriteSongIds: libraryStore.userContent.favoriteSlugs, recentSongIds: recent,
            sourceMode: effectiveAnalysis == "filterMode" ? modeFilter : nil, sortOrder: sortOrder)
        let progressionIdentity = (try? JSONEncoder().encode(progression))?.base64EncodedString() ?? ""
        let newContext = "\(catalogInfo?.snapshotId ?? "")|\(query.view)|\(query.sourceMode ?? "")|\(progressionIdentity)|\(preferPopular)|\(keepVaried)|\(favorFavorites)|\(minimumPopularityPercent)|\(sortOrder)"
        do {
            let result = try await environment.auralCatalog.buckets(query)
            guard generation == queryGeneration, isActive, !Task.isCancelled else { return }
            frozenQuery = query; buckets = result; context = newContext
            if isUngrouped {
                let restoringGlobal = restoring && browser.context == context && browser.activeBucket == globalBucket.id
                browser.activeBucket = globalBucket.id
                await loadNextPage(globalBucket, restorePages: restoringGlobal ? max(1,browser.pageCount) : 1, internalRestore: true)
                scrollID = restoringGlobal ? browser.scrollID : nil
            } else if restoring, browser.context == context {
                if let bucket = buckets.first(where: { $0.id == browser.activeBucket }) {
                    expandedBuckets.insert(bucket.id)
                    let primary = primaryID(bucket)
                    expandedPrimary.insert(primary); browser.activePrimary = primary
                    await loadNextPage(bucket, restorePages: max(1,browser.pageCount), internalRestore: true)
                    scrollID = browser.scrollID
                } else if primaryGroups.contains(where: { $0.id == browser.activePrimary }) {
                    expandedPrimary.insert(browser.activePrimary)
                }
            } else {
                browser.activeBucket = ""; browser.activePrimary = ""; browser.pageCount = 1; scrollID = nil
            }
            isLoadingGroups = false
            persist()
        } catch is CancellationError { return }
        catch { if generation == queryGeneration { isLoadingGroups = false; pageError = error.localizedDescription } }
    }

    private func primaryID(_ bucket: AuralCatalogBucket) -> String {
        startFirst ? "start:\(bucket.startingChord)" : "length:\(bucket.length)"
    }
    func regroup() {
        if isUngrouped {
            if !browser.activeBucket.isEmpty && browser.activeBucket != globalBucket.id {
                browser.lastGroupedBucket = browser.activeBucket
            }
            expandedPrimary = []; expandedBuckets = []
            browser.activePrimary = ""
            browser.activeBucket = globalBucket.id
            scrollID = nil
            if pages[globalBucket.id] == nil { Task { await loadNextPage(globalBucket) } }
            persist()
            return
        }
        if browser.activeBucket == globalBucket.id { browser.activeBucket = browser.lastGroupedBucket }
        if let bucket = buckets.first(where: { $0.id == browser.activeBucket }) {
            let parent = primaryID(bucket)
            expandedPrimary = [parent]; expandedBuckets.insert(bucket.id)
            browser.activePrimary = parent
            scrollID = "bucket:\(bucket.id)"
        } else { expandedPrimary = []; browser.activePrimary = ""; scrollID = nil }
        persist()
    }
    func togglePrimary(_ group: AuralPrimaryGroup) {
        guard !isLoadingGroups else { return }
        if expandedPrimary.remove(group.id) == nil {
            expandedPrimary.insert(group.id); browser.activePrimary = group.id
        } else if browser.activePrimary == group.id { browser.activePrimary = ""; browser.activeBucket = "" }
        persist()
    }
    func toggleBucket(_ bucket: AuralCatalogBucket) async {
        guard !isLoadingGroups else { return }
        if expandedBuckets.remove(bucket.id) == nil {
            expandedBuckets.insert(bucket.id); browser.activeBucket = bucket.id
            browser.activePrimary = primaryID(bucket)
            if pages[bucket.id] == nil { await loadNextPage(bucket) }
        } else if browser.activeBucket == bucket.id { browser.activeBucket = "" }
        persist()
    }
    func loadNextPage(_ bucket: AuralCatalogBucket, restorePages: Int = 1, internalRestore: Bool = false) async {
        guard pages[bucket.id]?.isLoading != true, isActive, !isLoadingGroups || internalRestore else { return }
        let generation = queryGeneration
        var page = pages[bucket.id] ?? AuralBucketPage()
        page.isLoading = true; page.error = nil; pages[bucket.id] = page
        var id = page.rankingID
        do {
            if id == nil {
                var query = frozenQuery
                if bucket.length > 0 { query.minimumLength = bucket.length; query.maximumLength = bucket.length }
                query.startingChord = bucket.startingChord.isEmpty ? nil : bucket.startingChord
                id = try await environment.auralCatalog.beginRanking(query)
            }
            guard let ranking = id else { return }
            guard generation == queryGeneration, isActive, !Task.isCancelled else {
                await environment.auralCatalog.closeRanking(ranking); return
            }
            page.rankingID = ranking
            for _ in 0..<restorePages {
                let loaded = try await environment.auralCatalog.page(ranking,limit:30)
                guard generation == queryGeneration, isActive, !Task.isCancelled else {
                    await environment.auralCatalog.closeRanking(ranking); return
                }
                let start = page.rows.count
                page.rows += loaded.rows.enumerated().map { offset, source in
                    var row = source; row.outline = "\(start + offset + 1)"
                    let path = "\(bucket.id)/\(row.id)"
                    return AuralDisplayRow(id:path,path:path,row:row)
                }
                page.hasMore = loaded.hasMore
                if !loaded.hasMore { break }
            }
            page.isLoading = false; pages[bucket.id] = page
            persist()
        } catch {
            if generation != queryGeneration || !isActive {
                if let id { await environment.auralCatalog.closeRanking(id) }
                return
            }
            page.rankingID = id; page.isLoading = false; page.error = error.localizedDescription
            pages[bucket.id] = page
        }
    }
    func visibleRows(_ bucket: AuralCatalogBucket) -> [AuralDisplayRow] {
        var result: [AuralDisplayRow] = []
        func append(_ nodes: [AuralDisplayRow]) {
            for node in nodes {
                result.append(node)
                if !flatList, expandedPaths.contains(node.path) { append(childrenByPath[node.path] ?? []) }
            }
        }
        append(pages[bucket.id]?.rows ?? [])
        return result
    }
    func toggle(_ node: AuralDisplayRow) async {
        guard node.row.length > 2, !flatList, !isLoadingGroups else { return }
        if expandedPaths.remove(node.path) != nil { return }
        let generation = queryGeneration
        do {
            let children = try await environment.auralCatalog.children(of: node.row.pattern,query:frozenQuery)
            guard generation == queryGeneration, isActive else { return }
            childrenByPath[node.path] = children.enumerated().map { index, source in
                var row = source; row.outline = "\(node.row.outline).\(index+1)"
                let path = "\(node.path)/\(row.id)"
                return AuralDisplayRow(id:path,path:path,row:row)
            }
            expandedPaths.insert(node.path)
        } catch { if generation == queryGeneration { pageError = error.localizedDescription } }
    }
    func review(_ bucket: AuralCatalogBucket) {
        guard !isLoadingGroups else { return }
        reviewRows = Array((pages[bucket.id]?.rows ?? []).prefix(30).map(\.row))
        showsReview = !reviewRows.isEmpty
    }
    func chordVariants(for chord: AuralChordConstraint) async -> [AuralChordVariant] {
        (try? await environment.auralCatalog.chordVariants(query: frozenQuery, degree: chord.degree, accidental: chord.accidental)) ?? []
    }
    func rememberScroll(_ id: String?) { scrollID = id; if !isLoadingGroups { persist() } }
    func persist() {
        browser.progression = progression
        browser.minimumPopularityPercent = minimumPopularityPercent
        browser.analysis = analysis; browser.modeFilter = modeFilter; browser.groupingPriority = groupingPriority
        browser.sortOrder = sortOrder; browser.rankingVersion = 2
        browser.context = context; browser.scrollID = scrollID
        if let page = pages[browser.activeBucket] { browser.pageCount = max(1,(page.rows.count+29)/30) }
        environment.auralRestoration.updateCatalog(search:"",minimumLength:2,maximumLength:nil,
            preferPopular:preferPopular,keepVaried:keepVaried,favorFavorites:favorFavorites,
            distinguishInversions:distinguishInversions,flatList:flatList,expanded:[:],treeScrollPath:nil,flatScrollPath:nil)
        environment.auralRestoration.updateBrowser(browser)
    }
    func suspend() {
        persist(); isActive = false; queryGeneration &+= 1; loadTask?.cancel()
        let ids = pages.values.compactMap(\.rankingID)
        pages = [:]
        Task { for id in ids { await environment.auralCatalog.closeRanking(id) } }
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

    private(set) var pattern: AuralPattern?
    let familyId: String?
    let variantId: String?
    private(set) var mode: AuralMode
    private var reviewPool: [AuralCatalogRow] = []
    private let minimumPopularityPercent: Int?

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
        favoriteSongIds: Set<String>,
        reviewPool: [AuralCatalogRow] = [],
        minimumPopularityPercent: Int? = nil
    ) {
        self.pattern = pattern
        familyId = nil
        variantId = nil
        self.mode = mode
        self.environment = environment
        self.favoriteSongIds = favoriteSongIds
        self.reviewPool = Array(reviewPool.prefix(30))
        self.minimumPopularityPercent = minimumPopularityPercent
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
        minimumPopularityPercent = nil
    }

    func start() async {
        isPreparing = true
        defer { isPreparing = false }
        do {
            if !reviewPool.isEmpty {
                guard let choice = await environment.auralSession.reviewPattern(reviewPool) else {
                    errorMessage = "No progressions in this subgroup are due for review."
                    return
                }
                pattern = choice.0; mode = choice.1
            }
            let restored = await environment.auralSession.state()
            let expectedFamily = pattern?.id ?? familyId
            if let current = restored.exercise,
               current.familyId == expectedFamily,
               current.skill.mode == mode, !restored.answered, reviewPool.isEmpty {
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
                    assessment: !reviewPool.isEmpty,
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
                    seed: exercise.seed,
                    minimumPopularityPercent: minimumPopularityPercent
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
        draft = [option.id]
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
    let minimumPopularityPercent: Int
    @ObservationIgnored private let environment: AppEnvironment
    @ObservationIgnored private let libraryStore: LibraryStore

    init(pattern: AuralPattern, environment: AppEnvironment, libraryStore: LibraryStore,
         minimumPopularityPercent: Int) {
        self.pattern = pattern
        self.minimumPopularityPercent = minimumPopularityPercent
        self.environment = environment
        self.libraryStore = libraryStore
        scrollSongId = environment.auralRestoration.snapshot.songsScrollId
    }

    func load() async {
        state = .loading
        do {
            let songs = try await environment.auralCatalog.songs(for: pattern,
                minimumPopularityPercent: minimumPopularityPercent)
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
                songId: song.id,
                minimumPopularityPercent: minimumPopularityPercent
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
