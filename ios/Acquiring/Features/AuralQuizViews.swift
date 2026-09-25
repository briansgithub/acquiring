import AcquiringAural
import AcquiringCore
import SwiftUI

struct AuralQuizView: View {
    @State private var model: AuralQuizStore
    @Bindable private var libraryStore: LibraryStore
    private let environment: AppEnvironment

    init(environment: AppEnvironment, libraryStore: LibraryStore) {
        _model = State(initialValue: AuralQuizStore(
            environment: environment,
            libraryStore: libraryStore
        ))
        self.libraryStore = libraryStore
        self.environment = environment
    }

    var body: some View {
        Group {
            switch model.state {
            case .idle, .loading:
                AuralLoadingView(message: model.progressMessage)
            case .empty:
                ContentUnavailableView(
                    "No progressions",
                    systemImage: "ear.trianglebadge.exclamationmark",
                    description: Text("The installed catalog contains no playable sequences.")
                )
            case let .failure(message):
                ContentUnavailableView {
                    Label("Unable to open Aural Quiz", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try Again") { Task { await model.load() } }
                        .buttonStyle(.borderedProminent)
                }
                .accessibilityIdentifier("aural.status.failure")
            case let .content(info):
                catalog(info)
            }
        }
        .navigationTitle("Aural Quiz")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { settingsToolbar }
        .task { await model.load() }
    }

    private func catalog(_ info: AuralCatalogInfo) -> some View {
        List {
            if let warning = environment.auralRestoration.warning {
                Section {
                    Label(warning, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                }
            }
            Section {
                NavigationLink {
                    AuralCurriculumView(
                        environment: environment,
                        libraryStore: libraryStore
                    )
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Guided curriculum")
                                .font(.headline)
                            Text("Hear → recognize → recall → internally hear → reproduce")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "graduationcap")
                    }
                }
                .accessibilityIdentifier("aural.curriculum")
            }

            Section("Catalog filters") {
                Stepper("At least \(model.minimumLength) chords", value: $model.minimumLength, in: 2...64)
                HStack {
                    Text("Maximum")
                    Spacer()
                    TextField("Any", value: $model.maximumLength, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 80)
                }
                Toggle("Prefer popular songs", isOn: $model.preferPopular)
                Toggle("Keep examples varied", isOn: $model.keepVaried)
                Toggle("Favor my favorites", isOn: $model.favorFavorites)
                Toggle("Distinguish inversions", isOn: $model.distinguishInversions)
                Toggle("Flat list", isOn: $model.flatList)
            }

            Section {
                if model.roots.isEmpty, !model.isLoadingPage {
                    ContentUnavailableView(
                        "No matching sequences",
                        systemImage: "music.note.list",
                        description: Text("Change the Roman-numeral search or chord-count filter.")
                    )
                }
                ForEach(model.visibleRows) { node in
                    AuralCatalogRowView(
                        node: node,
                        isExpanded: model.expandedPaths.contains(node.path),
                        flatList: model.flatList,
                        toggle: { Task { await model.toggle(node) } }
                    )
                }
                if model.hasMore {
                    Button {
                        Task { await model.loadNextPage() }
                    } label: {
                        if model.isLoadingPage {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("More progressions", systemImage: "chevron.down")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(model.isLoadingPage)
                    .accessibilityIdentifier("aural.catalog.more")
                }
                if let error = model.pageError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("aural.catalog.error")
                }
            } header: {
                HStack {
                    Text("\(info.sequenceCount.formatted()) observed sequences")
                    Spacer()
                    Button {
                        model.evidenceText = """
                        The catalog contains every confidently normalized contiguous sequence of two or more harmonic states.

                        Adjacent equivalent states are collapsed while retaining their original source spans. Physical-transition coverage is a union of transition identities; longer-window coverage is separate. The curriculum's 80% target never limits catalog discovery.
                        """
                    } label: {
                        Image(systemName: "info.circle")
                    }
                    .accessibilityLabel("About catalog coverage")
                }
            }
        }
        .searchable(text: $model.search, prompt: "Roman numerals")
        .scrollPosition(id: Binding(
            get: { model.flatList ? model.flatScrollPath : model.treeScrollPath },
            set: { model.rememberScroll($0) }
        ))
        .onChange(of: model.search) { _, _ in model.scheduleRestart() }
        .onChange(of: model.minimumLength) { _, _ in model.scheduleRestart() }
        .onChange(of: model.maximumLength) { _, _ in model.scheduleRestart() }
        .onChange(of: model.preferPopular) { _, _ in model.scheduleRestart() }
        .onChange(of: model.keepVaried) { _, _ in model.scheduleRestart() }
        .onChange(of: model.favorFavorites) { _, _ in model.scheduleRestart() }
        .onChange(of: model.distinguishInversions) { _, _ in model.scheduleRestart() }
        .onChange(of: model.flatList) { _, _ in model.scheduleRestart() }
        .sheet(isPresented: Binding(
            get: { model.evidenceText != nil },
            set: { if !$0 { model.evidenceText = nil } }
        )) {
            NavigationStack {
                ScrollView {
                    Text(model.evidenceText ?? "")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
                .navigationTitle("Catalog coverage")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { model.evidenceText = nil }
                    }
                }
            }
        }
        .accessibilityIdentifier("aural.catalog")
    }

    @ToolbarContentBuilder
    private var settingsToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            NavigationLink {
                CatalogSettingsView(store: libraryStore)
            } label: {
                Label("Settings", systemImage: "gearshape")
            }
            .accessibilityIdentifier("aural.settings")
        }
    }
}

private struct AuralLoadingView: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
            Text(message)
                .font(.headline)
                .multilineTextAlignment(.center)
            Text("The catalog stays offline after installation.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("aural.status.loading")
    }
}

private struct AuralCatalogRowView: View {
    let node: AuralDisplayRow
    let isExpanded: Bool
    let flatList: Bool
    let toggle: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            if !flatList {
                Button(action: toggle) {
                    Image(systemName: isExpanded ? "chevron.down.circle.fill" : "chevron.right.circle")
                        .font(.system(size: 32))
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(.plain)
                .disabled(node.row.length <= 2)
                .opacity(node.row.length <= 2 ? 0.28 : 1)
                .accessibilityLabel(isExpanded ? "Collapse \(node.path)" : "Expand \(node.path)")
                .accessibilityHint("Shows the two endpoint subsequences")
            }
            NavigationLink(value: AppRoute.auralPattern(node.row.pattern)) {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(node.path)
                            .font(.caption.monospacedDigit().weight(.bold))
                            .foregroundStyle(.secondary)
                        AuralRomanSequence(labels: node.row.labels, mode: node.row.mode)
                    }
                    Text(
                        "\(node.row.length) chords · \(node.row.occurrenceCount.formatted()) occurrences · \(node.row.songCount.formatted()) songs · \(node.row.sectionCount.formatted()) sections"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                "\(node.path), \(node.row.labels.joined(separator: ", ")), \(node.row.length) chords, \(node.row.occurrenceCount) occurrences, \(node.row.songCount) songs, \(node.row.sectionCount) sections"
            )
        }
        .listRowInsets(EdgeInsets(
            top: 4,
            leading: CGFloat(max(0, node.path.split(separator: ".").count - 1)) * 18 + 12,
            bottom: 4,
            trailing: 12
        ))
    }
}

struct AuralRomanSequence: View {
    let labels: [String]
    let mode: String?
    var revealsAnswer = true

    var body: some View {
        HStack(spacing: 5) {
            ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                if index > 0 {
                    Image(systemName: "arrow.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
                Text(revealsAnswer ? label : "—")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(revealsAnswer ? QuizModeColor.readout(for: mode ?? "") : .secondary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(revealsAnswer ? labels.joined(separator: ", then ") : "Answer hidden")
    }
}

struct AuralPatternView: View {
    let pattern: AuralPattern
    let environment: AppEnvironment
    @Bindable var libraryStore: LibraryStore
    @State private var selectedTab: AuralDetailTab
    @State private var evidence: String?

    init(pattern: AuralPattern, environment: AppEnvironment, libraryStore: LibraryStore) {
        self.pattern = pattern
        self.environment = environment
        self.libraryStore = libraryStore
        let restored = environment.auralRestoration.snapshot
        _selectedTab = State(initialValue:
            restored.selectedPattern?.id == pattern.id ? restored.selectedTab : .recognize
        )
    }

    var body: some View {
        VStack(spacing: 12) {
            AuralRomanSequence(labels: pattern.labels, mode: pattern.mode)
                .font(.title3)
                .padding(.horizontal)
            Picker("Learning activity", selection: $selectedTab) {
                ForEach(AuralDetailTab.allCases) { tab in Text(tab.title).tag(tab) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .accessibilityIdentifier("aural.pattern.tabs")
            Group {
                switch selectedTab {
                case .recognize:
                    AuralPracticeView(
                        pattern: pattern,
                        mode: .recognize,
                        environment: environment,
                        favoriteSongIds: libraryStore.userContent.favoriteSlugs,
                        libraryStore: libraryStore
                    )
                case .recall:
                    AuralPracticeView(
                        pattern: pattern,
                        mode: .recall,
                        environment: environment,
                        favoriteSongIds: libraryStore.userContent.favoriteSlugs,
                        libraryStore: libraryStore
                    )
                case .sing:
                    AuralPracticeView(
                        pattern: pattern,
                        mode: .sing,
                        environment: environment,
                        favoriteSongIds: libraryStore.userContent.favoriteSlugs,
                        libraryStore: libraryStore
                    )
                case .songs:
                    AuralSongsView(
                        pattern: pattern,
                        environment: environment,
                        libraryStore: libraryStore
                    )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle("Aural Quiz")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    Task {
                        evidence = try? await environment.auralCatalog.evidenceText(for: pattern)
                    }
                } label: {
                    Label("About this progression", systemImage: "info.circle")
                }
                NavigationLink {
                    CatalogSettingsView(store: libraryStore)
                } label: {
                    Label("Settings", systemImage: "gearshape")
                }
            }
        }
        .sheet(isPresented: Binding(
            get: { evidence != nil },
            set: { if !$0 { evidence = nil } }
        )) {
            NavigationStack {
                ScrollView { Text(evidence ?? "").padding() }
                    .navigationTitle("Coverage evidence")
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Done") { evidence = nil }
                        }
                    }
            }
        }
        .onAppear {
            environment.auralRestoration.select(pattern: pattern, tab: selectedTab)
        }
        .onChange(of: selectedTab) { _, tab in
            environment.auralRestoration.select(pattern: pattern, tab: tab)
        }
    }
}

private struct AuralActivityPlaceholder: View {
    let title: String
    let detail: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: "ear")
        } description: {
            Text(detail)
        }
    }
}

private struct AuralSongsView: View {
    @State private var model: AuralSongsModel

    init(pattern: AuralPattern, environment: AppEnvironment, libraryStore: LibraryStore) {
        _model = State(initialValue: AuralSongsModel(
            pattern: pattern,
            environment: environment,
            libraryStore: libraryStore
        ))
    }

    var body: some View {
        Group {
            switch model.state {
            case .idle, .loading:
                ProgressView("Loading supporting songs…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .empty:
                ContentUnavailableView(
                    "No supporting songs",
                    systemImage: "music.note.slash",
                    description: Text("No exact source is available for this progression.")
                )
            case let .failure(message):
                ContentUnavailableView {
                    Label("Unable to load songs", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try Again") { Task { await model.load() } }
                }
            case let .content(songs):
                List(songs) { song in
                    Button {
                        Task { await model.open(song) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(song.title)
                                    .font(.headline)
                                Text(song.artist)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if model.openingSongId == song.id {
                                ProgressView()
                            } else {
                                Text(popularityLabel(song.popularity))
                                    .font(.subheadline.monospacedDigit())
                                    .foregroundStyle(song.popularity == nil ? .secondary : .primary)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(model.openingSongId != nil)
                    .accessibilityLabel(
                        "\(song.title), by \(song.artist), popularity \(popularityLabel(song.popularity))"
                    )
                }
                .scrollPosition(id: Binding(
                    get: { model.scrollSongId },
                    set: { model.rememberScroll($0) }
                ))
                .accessibilityIdentifier("aural.songs")
            }
        }
        .task { await model.load() }
        .alert("Unable to open Playback", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    private func popularityLabel(_ score: Double?) -> String {
        guard let score else { return "No data" }
        return (score * 100).formatted(.number.precision(.fractionLength(1)))
    }
}

private struct AuralPracticeView: View {
    @State private var model: AuralLessonModel
    let mode: AuralMode
    @Bindable var libraryStore: LibraryStore
    @Environment(\.scenePhase) private var scenePhase

    init(
        pattern: AuralPattern,
        mode: AuralMode,
        environment: AppEnvironment,
        favoriteSongIds: Set<String>,
        libraryStore: LibraryStore
    ) {
        self.mode = mode
        self.libraryStore = libraryStore
        _model = State(initialValue: AuralLessonModel(
            pattern: pattern,
            mode: mode,
            environment: environment,
            favoriteSongIds: favoriteSongIds
        ))
    }

    init(
        familyId: String,
        variantId: String,
        mode: AuralMode,
        environment: AppEnvironment,
        libraryStore: LibraryStore
    ) {
        self.mode = mode
        self.libraryStore = libraryStore
        _model = State(initialValue: AuralLessonModel(
            familyId: familyId,
            variantId: variantId,
            mode: mode,
            environment: environment
        ))
    }

    var body: some View {
        Group {
            if model.isPreparing || model.lesson == nil, model.errorMessage == nil {
                ProgressView("Preparing \(mode.title)…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = model.errorMessage, model.lesson == nil {
                ContentUnavailableView {
                    Label("Unable to prepare exercise", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try Again") { Task { await model.start() } }
                }
            } else if let lesson = model.lesson, let exercise = lesson.exercise {
                exerciseView(exercise, lesson: lesson)
            }
        }
        .task { if model.lesson == nil { await model.start() } }
        .onAppear { model.resumedAfterPlayback() }
        .onDisappear {
            if !model.isOpeningPlayback {
                Task { await model.stop(markInterrupted: true) }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { Task { await model.stop(markInterrupted: true) } }
        }
    }

    private func exerciseView(_ exercise: AuralExercise, lesson: AuralLessonState) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(exercise.prompt)
                        .font(.headline)
                    Spacer()
                    Label(
                        lesson.supported ? "Supported practice" : "Independent check",
                        systemImage: lesson.supported ? "lifepreserver" : "checkmark.shield"
                    )
                    .font(.caption)
                    .foregroundStyle(lesson.supported ? .secondary : .green)
                    .accessibilityHint(
                        lesson.supported
                            ? "This attempt cannot earn independent mastery evidence"
                            : "Eligibility is enforced by the learning engine"
                    )
                }
                if let passage = exercise.provenance.passage {
                    HStack {
                        Label(
                            "\(passage.title) · \(passage.artist) · \(passage.sectionName)",
                            systemImage: "music.note"
                        )
                        .font(.subheadline)
                        Spacer()
                        Button("Open in Playback") {
                            Task { await model.openPlayback(using: libraryStore) }
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("aural.openPlayback")
                    }
                    if passage.keyTonic != exercise.keyTonic {
                        Text("Source key: \(passage.keyTonic) \(passage.keyScale) · Quiz model: \(exercise.keyTonic)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Button {
                    model.listen()
                } label: {
                    Label(model.isListening ? "Listening…" : "Listen", systemImage: "speaker.wave.2.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.isListening)
                .accessibilityIdentifier("aural.exercise.listen")

                if exercise.events.count > 4 {
                    VStack(spacing: 8) {
                        HStack {
                        Button("Previous chunk") {
                            model.chunkIndex = max(0, model.chunkIndex - 1)
                        }
                        .disabled(model.chunkIndex == 0 || model.isListening)
                            Spacer()
                            Text("Chunk \(model.chunkIndex + 1) of \(model.chunkCount)")
                                .font(.caption.monospacedDigit())
                            Spacer()
                        Button("Next chunk") {
                            model.chunkIndex = min(model.chunkCount - 1, model.chunkIndex + 1)
                        }
                            .disabled(model.chunkIndex >= model.chunkCount - 1 || model.isListening)
                        }
                        Button("Practice these chords") {
                            model.listen(chunked: true)
                        }
                        .buttonStyle(.bordered)
                        .disabled(model.isListening)
                    }
                    .accessibilityElement(children: .contain)
                }

                if lesson.guidanceVisible || lesson.answered {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Explanation")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        AuralRomanSequence(labels: exercise.fullDegrees, mode: model.modeName)
                        Text(exercise.guidance)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    AuralRomanSequence(
                        labels: exercise.fullDegrees,
                        mode: model.modeName,
                        revealsAnswer: false
                    )
                }

                responseControls(exercise, lesson: lesson)

                if !lesson.feedback.isEmpty {
                    Text(lesson.feedback)
                        .font(.subheadline.weight(.semibold))
                        .accessibilityIdentifier("aural.exercise.feedback")
                }
                if let error = model.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                }
                if !lesson.storageWarning.isEmpty {
                    Label(lesson.storageWarning, systemImage: "externaldrive.badge.exclamationmark")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
                if let fallback = exercise.provenance.fallbackReason {
                    Label(fallback, systemImage: "music.note.house")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                HStack {
                    if !lesson.guidanceVisible, !lesson.answered {
                        Button {
                            Task { await model.hint() }
                        } label: {
                            Label("Hint", systemImage: "lightbulb")
                        }
                    }
                    Spacer()
                    if lesson.answered {
                        Button("Try with support") { Task { await model.retry() } }
                            .buttonStyle(.bordered)
                        Button("Next") { Task { await model.next() } }
                            .buttonStyle(.borderedProminent)
                    }
                }
            }
            .padding()
        }
        .accessibilityIdentifier("aural.exercise")
    }

    @ViewBuilder
    private func responseControls(_ exercise: AuralExercise, lesson: AuralLessonState) -> some View {
        switch exercise.responseType {
        case "guided":
            Button("Guided listening complete") {
                Task { await model.completeGuided() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!lesson.heard || lesson.answered)
        case "choice":
            VStack(alignment: .leading, spacing: 8) {
                Text("Choose")
                    .font(.caption.weight(.semibold))
                ForEach(exercise.options) { option in
                    Button {
                        Task { await model.choose(option) }
                    } label: {
                        AuralRomanSequence(labels: option.degrees, mode: model.modeName)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .buttonStyle(.bordered)
                    .disabled(!lesson.heard || lesson.answered)
                }
            }
        case "sequence":
            VStack(alignment: .leading, spacing: 10) {
                Text("Your order")
                    .font(.caption.weight(.semibold))
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(Array(model.draft.enumerated()), id: \.offset) { _, token in
                            Text(token)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(.quaternary, in: Capsule())
                        }
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 56))]) {
                    ForEach(model.vocabulary, id: \.self) { token in
                        Button(token) { model.append(token) }
                            .buttonStyle(.bordered)
                    }
                }
                HStack {
                    Button("Remove last") { model.removeLast() }
                        .disabled(model.draft.isEmpty)
                    Spacer()
                    Button("Check order") { Task { await model.submitSequence() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(!lesson.heard || model.draft.isEmpty || lesson.answered)
                }
            }
        case "microphone":
            AuralSingControls(model: model, exercise: exercise, lesson: lesson)
        default:
            EmptyView()
        }
    }
}

private struct AuralSingControls: View {
    @Bindable var model: AuralLessonModel
    let exercise: AuralExercise
    let lesson: AuralLessonState
    @State private var showsAssessmentInfo = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let task = exercise.microphoneTask {
                HStack(alignment: .top) {
                    Image(systemName: icon(task.kind))
                        .font(.title2)
                        .frame(width: 32)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title(task.kind))
                            .font(.headline)
                        Text(task.label)
                            .font(.subheadline)
                    }
                    Spacer()
                    Button {
                        showsAssessmentInfo = true
                    } label: {
                        Image(systemName: "info.circle")
                    }
                    .accessibilityLabel("About singing assessment")
                }
                if task.kind == .rootSequence {
                    ScrollView(.horizontal) {
                        HStack {
                            ForEach(Array(task.eventIndices.enumerated()), id: \.offset) { index, event in
                                Label("\(index + 1)", systemImage: "music.note")
                                    .padding(8)
                                    .background(
                                        index == model.captureTargetIndex
                                            ? Color.accentColor.opacity(0.35)
                                            : Color.secondary.opacity(0.15),
                                        in: Circle()
                                    )
                                    .accessibilityLabel("Root \(index + 1), chord \(event + 1)")
                            }
                        }
                    }
                }
                Button {
                    model.isRecording ? model.cancelCapture() : model.capturePitch()
                } label: {
                    Label(
                        model.isRecording ? "Stop recording" : "Record for 4 seconds",
                        systemImage: model.isRecording ? "stop.circle.fill" : "mic.circle.fill"
                    )
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!lesson.heard || lesson.answered)
                .accessibilityIdentifier("aural.sing.record")
                if model.isRecording {
                    ProgressView()
                        .accessibilityLabel("Listening for a stable pitch")
                }
                if let assessment = model.pitchAssessment {
                    Label(assessment.reason, systemImage: assessmentIcon(assessment.status))
                        .foregroundStyle(assessmentColor(assessment.status))
                        .accessibilityIdentifier("aural.sing.assessment")
                }
            } else {
                Label("This exercise has no valid pitch target.", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
            }
        }
        .sheet(isPresented: $showsAssessmentInfo) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Aural Quiz compares stable pitch classes and sequence order. Comfortable octave equivalents are accepted.")
                        Text("It does not assess vocal rhythm or exact register. Silence, unstable or insufficient detection, permission failures, and capture errors are technical uncertainty—not musical mistakes.")
                        if exercise.provenance.target.pattern != nil {
                            Text("For dynamic corpus patterns, scale-degree tasks currently use narrower generated support than root, bass, and ordered-root tasks.")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding()
                }
                .navigationTitle("Singing assessment")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { showsAssessmentInfo = false }
                    }
                }
            }
        }
    }

    private func title(_ kind: AuralMicrophoneKind) -> String {
        switch kind {
        case .root: "Chord root"
        case .bass: "Actual bass"
        case .scaleDegree: "Scale degree"
        case .rootSequence: "Roots in order"
        }
    }

    private func icon(_ kind: AuralMicrophoneKind) -> String {
        switch kind {
        case .root: "r.circle"
        case .bass: "arrow.down.to.line.compact"
        case .scaleDegree: "number.circle"
        case .rootSequence: "arrow.right.circle"
        }
    }

    private func assessmentIcon(_ status: AuralPitchStatus) -> String {
        switch status {
        case .correct: "checkmark.circle.fill"
        case .incorrect: "xmark.circle.fill"
        case .uncertain: "questionmark.circle.fill"
        }
    }

    private func assessmentColor(_ status: AuralPitchStatus) -> Color {
        switch status {
        case .correct: .green
        case .incorrect: .red
        case .uncertain: .orange
        }
    }
}

struct AuralCurriculumView: View {
    let environment: AppEnvironment
    @Bindable var libraryStore: LibraryStore
    @State private var progress = AuralProgress()

    var body: some View {
        List(AuralCurriculum.families) { family in
            let unlocked = AuralCurriculum.familyUnlocked(progress, familyId: family.id)
            NavigationLink {
                AuralFamilyView(
                    family: family,
                    environment: environment,
                    libraryStore: libraryStore
                )
            } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Label(
                        family.label,
                        systemImage: unlocked ? "ear.fill" : "lock.fill"
                    )
                    .font(.headline)
                    Text(family.description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    let mastered = AuralSkill.allCases.filter {
                        AuralCurriculum.cell(progress, familyId: family.id, skill: $0).mastered
                    }.count
                    ProgressView(value: Double(mastered), total: Double(AuralSkill.allCases.count))
                        .accessibilityLabel("\(mastered) of \(AuralSkill.allCases.count) skills mastered")
                }
                .padding(.vertical, 5)
            }
            .disabled(!unlocked)
        }
        .navigationTitle("Guided curriculum")
        .navigationBarTitleDisplayMode(.inline)
        .task { progress = (await environment.auralSession.state()).progress }
    }
}

private struct AuralFamilyView: View {
    let family: AuralFamilyDefinition
    let environment: AppEnvironment
    @Bindable var libraryStore: LibraryStore

    var body: some View {
        List(family.variants) { variant in
            NavigationLink {
                AuralGuidedVariantView(
                    family: family,
                    variant: variant,
                    environment: environment,
                    libraryStore: libraryStore
                )
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    AuralRomanSequence(labels: variant.degrees, mode: "major")
                    Text("Named progression practice")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
            }
        }
        .navigationTitle(family.label)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct AuralGuidedVariantView: View {
    let family: AuralFamilyDefinition
    let variant: AuralVariantDefinition
    let environment: AppEnvironment
    @Bindable var libraryStore: LibraryStore
    @State private var mode = AuralMode.recognize

    var body: some View {
        VStack(spacing: 10) {
            AuralRomanSequence(labels: variant.degrees, mode: "major")
                .padding(.horizontal)
            Picker("Learning activity", selection: $mode) {
                ForEach(AuralMode.allCases, id: \.self) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            AuralPracticeView(
                familyId: family.id,
                variantId: variant.id,
                mode: mode,
                environment: environment,
                libraryStore: libraryStore
            )
            .id(mode)
        }
        .navigationTitle(family.label)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AuralDataSettingsSection: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var state: FeatureState<AuralCatalogInfo> = .loading
    @State private var isUpdating = false

    var body: some View {
        Section("Aural Quiz data") {
            switch state {
            case .idle, .loading:
                ProgressView("Reading installed data…")
            case .empty:
                Text("Not installed")
            case let .failure(message):
                Label(message, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
            case let .content(info):
                LabeledContent("Sequences", value: info.sequenceCount.formatted())
                LabeledContent(
                    "Popularity",
                    value: "\(info.scoredSongCount.formatted()) of \(info.popularitySongCount.formatted()) songs"
                )
                if let attribution = info.attribution {
                    LabeledContent("Source", value: attribution)
                }
                if let measuredAt = info.measuredAt {
                    LabeledContent("Measured", value: measuredAt.formatted(date: .abbreviated, time: .omitted))
                }
                if let scoringVersion = info.scoringVersion {
                    LabeledContent("Scoring", value: scoringVersion)
                } else {
                    LabeledContent("Scoring", value: "Unknown version")
                }
                Text("Catalog \(info.snapshotId.prefix(12))…")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }
            Button(isUpdating ? "Updating…" : "Check and reinstall Aural data") {
                Task { await update() }
            }
            .disabled(isUpdating)
        }
        .task { await refresh() }
    }

    private func refresh() async {
        do {
            try await environment.auralCatalog.prepare()
            state = .content(try await environment.auralCatalog.info())
        } catch {
            state = .failure(error.localizedDescription)
        }
    }

    private func update() async {
        isUpdating = true
        defer { isUpdating = false }
        do {
            _ = try await environment.auralInstaller.ensureInstalled(force: true)
            try await environment.auralCatalog.reload()
            state = .content(try await environment.auralCatalog.info())
        } catch {
            state = .failure(error.localizedDescription)
        }
    }
}
