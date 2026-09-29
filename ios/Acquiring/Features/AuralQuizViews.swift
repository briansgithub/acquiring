import AcquiringAural
import AcquiringCore
import SwiftUI

struct AuralQuizView: View {
    @State private var model: AuralQuizStore
    @State private var popularityDraft: Double
    @Bindable private var libraryStore: LibraryStore
    private let environment: AppEnvironment

    init(environment: AppEnvironment, libraryStore: LibraryStore) {
        let store = AuralQuizStore(
            environment: environment,
            libraryStore: libraryStore
        )
        _model = State(initialValue: store)
        _popularityDraft = State(initialValue: Double(store.minimumPopularityPercent))
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
        .onDisappear { model.suspend() }
    }

    private func catalog(_ info: AuralCatalogInfo) -> some View {
        List {
            Section {
                NavigationLink {
                    AuralCurriculumView(environment:environment,libraryStore:libraryStore)
                } label: { Label("Guided curriculum",systemImage:"graduationcap") }
            }
            Section {
                AuralProgressionBuilder(model:model)
            }
            Section("Mode handling") {
                Picker("Mode handling",selection:$model.analysis) {
                    Text("Relative major").tag("relativeMajor").disabled(!model.supportsModes)
                    Text("Mixed Modes").tag("allModes")
                    Text("Filter by mode").tag("filterMode").disabled(!model.supportsModes)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("aural.analysis")
                if !model.supportsModes {
                    Text("This catalog uses Mixed Modes. Update the catalog to enable Relative major and mode filtering.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if model.effectiveAnalysis == "filterMode" {
                    Picker("Source mode",selection:$model.modeFilter) {
                        ForEach(AuralQuizStore.modes,id:\.self) { mode in Text(AuralQuizStore.modeLabel(mode)).tag(mode) }
                    }
                }
                Picker("Sort", selection: $model.sortOrder) {
                    Text("Most songs").tag("mostSongs")
                    Text("Recommended").tag("recommended")
                    Text("Longest first").tag("longest")
                    Text("Shortest first").tag("shortest")
                }
                .accessibilityIdentifier("aural.sortOrder")
                Picker("Group first",selection:$model.groupingPriority) {
                    Text("None").tag("none")
                    Text("Length").tag("length")
                    Text("Starting chord").tag("start").disabled(!model.supportsStartingChords)
                }
                .accessibilityIdentifier("aural.groupingPriority")
                if !model.supportsStartingChords {
                    Text("Update the progression catalog to group by starting chord.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Section("Song popularity") {
                Text("Minimum: \(Int(popularityDraft))%")
                Slider(value: $popularityDraft, in: 0...100, step: 1, onEditingChanged: { editing in
                    if !editing {
                        let threshold = Int(popularityDraft)
                        if model.minimumPopularityPercent != threshold {
                            model.minimumPopularityPercent = threshold
                            model.scheduleRestart()
                        }
                    }
                })
                .accessibilityIdentifier("aural.minimumPopularity")
                .accessibilityLabel("Minimum song popularity")
                .accessibilityValue("\(Int(popularityDraft)) percent")
                Text(info.scoredSongCount == 0
                     ? "No scored songs are installed; this filter has no matches."
                     : "Only songs with a measured score at or above this percentage are included.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Catalog preferences") {
                Toggle("Prefer popular songs",isOn:$model.preferPopular)
                Toggle("Keep examples varied",isOn:$model.keepVaried)
                Toggle("Favor my favorites",isOn:$model.favorFavorites)
                Toggle("Distinguish inversions",isOn:$model.distinguishInversions)
                Toggle("Show subsequences",isOn:Binding(get:{!model.flatList},set:{model.flatList = !$0}))
            }
            if model.isLoadingGroups { ProgressView("Loading progression groups…") }
            if let error = model.pageError { Text(error).foregroundStyle(.orange) }
            if model.isUngrouped { bucketContents(model.globalBucket) }
            ForEach(model.isUngrouped ? [] : model.primaryGroups) { group in
                Button { model.togglePrimary(group) } label: {
                    Label(group.label,systemImage:model.expandedPrimary.contains(group.id) ? "chevron.down" : "chevron.right")
                        .font(.headline).frame(maxWidth:.infinity,alignment:.leading)
                }
                .buttonStyle(.plain)
                .accessibilityValue(model.expandedPrimary.contains(group.id) ? "Expanded" : "Collapsed")
                .id(group.id)
                if model.expandedPrimary.contains(group.id) {
                    ForEach(group.buckets) { bucket in
                        Button { Task { await model.toggleBucket(bucket) } } label: {
                            Label(model.startFirst ? "\(bucket.length) chords" : "Starts with \(bucket.label)",
                                  systemImage:model.expandedBuckets.contains(bucket.id) ? "chevron.down" : "chevron.right")
                                .padding(.leading,16).frame(maxWidth:.infinity,alignment:.leading)
                        }
                        .buttonStyle(.plain)
                        .accessibilityValue(model.expandedBuckets.contains(bucket.id) ? "Expanded" : "Collapsed")
                        .id("bucket:\(bucket.id)")
                        if model.expandedBuckets.contains(bucket.id) { bucketContents(bucket) }
                    }
                }
            }
        }
        .scrollPosition(id:Binding(get:{model.scrollID},set:{model.rememberScroll($0)}))
        .onChange(of:model.progression) { _,_ in model.scheduleRestart() }
        .onChange(of:model.analysis) { _,_ in model.scheduleRestart() }
        .onChange(of:model.modeFilter) { _,_ in model.scheduleRestart() }
        .onChange(of:model.preferPopular) { _,_ in model.scheduleRestart() }
        .onChange(of:model.keepVaried) { _,_ in model.scheduleRestart() }
        .onChange(of:model.favorFavorites) { _,_ in model.scheduleRestart() }
        .onChange(of:model.distinguishInversions) { _, enabled in
            if !enabled && model.progression.chords.contains(where: { $0.inversion != nil }) {
                var next=model.progression
                next.chords = next.chords.map { var chord=$0; chord.inversion=nil; return chord }
                model.progression=next
            } else { model.scheduleRestart() }
        }
        .onChange(of:model.flatList) { _,_ in model.persist() }
        .onChange(of:model.sortOrder) { _,_ in model.scheduleRestart() }
        .onChange(of:model.groupingPriority) { _,_ in model.regroup() }
        .sheet(isPresented:$model.showsReview) {
            NavigationStack {
                if let first = model.reviewRows.first {
                    AuralPracticeView(pattern:first.pattern,mode:.recognize,environment:environment,
                        favoriteSongIds:libraryStore.userContent.favoriteSlugs,libraryStore:libraryStore,
                        reviewPool:model.reviewRows,minimumPopularityPercent:model.minimumPopularityPercent)
                        .navigationTitle("Subgroup review")
                        .toolbar { ToolbarItem(placement:.confirmationAction) { Button("Done") { model.showsReview=false } } }
                }
            }
        }
        .accessibilityIdentifier("aural.catalog")
    }

    @ViewBuilder
    private func bucketContents(_ bucket: AuralCatalogBucket) -> some View {
        let page = model.pages[bucket.id]
        if !model.isUngrouped {
            Button("Review this subgroup") { model.review(bucket) }
                .disabled(page?.rows.isEmpty != false || model.isLoadingGroups)
        }
        ForEach(model.visibleRows(bucket)) { node in
            AuralCatalogRowView(node:node,isExpanded:model.expandedPaths.contains(node.path),
                flatList:model.flatList,toggle:{Task { await model.toggle(node) }})
                .id(node.id)
        }
        if page?.isLoading == true { ProgressView("Loading sequences…") }
        if let error = page?.error {
            Text(error).foregroundStyle(.orange)
            Button("Retry") { Task { await model.loadNextPage(bucket) } }
        } else if page?.hasMore == true {
            Button("More") { Task { await model.loadNextPage(bucket) } }.disabled(page?.isLoading == true)
        } else if page?.isLoading == false, page?.rows.isEmpty == true {
            Text("No matching sequences").foregroundStyle(.secondary)
        }
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

private struct AuralProgressionBuilder: View {
    @Bindable var model: AuralQuizStore
    @State private var editIndex: Int?
    @State private var showsMore = false
    @State private var variants: [AuralChordVariant]?
    @State private var visibleVariants = 30
    private let numerals = ["I", "II", "III", "IV", "V", "VI", "VII"]

    var body: some View {
        VStack(alignment:.leading,spacing:8) {
            HStack {
                Text("Find consecutive chords").font(.headline)
                Spacer()
                if !model.progression.chords.isEmpty {
                    Button("Clear all") { model.progression = AuralProgressionQuery() }
                        .accessibilityIdentifier("aural.search.clear")
                }
            }
            if model.progression.chords.isEmpty {
                Text("Add a chord to filter sequences").font(.caption).foregroundStyle(.secondary)
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing:6) {
                        ForEach(Array(model.progression.chords.enumerated()),id:\.offset) { index,chord in
                            Button(chord.label) { editIndex=index; showsMore=false }
                                .buttonStyle(.bordered)
                                .accessibilityLabel("Chord \(index+1), \(chord.label). Edit chord")
                                .accessibilityIdentifier("aural.search.chord.\(index)")
                        }
                    }
                }
            }
            ScrollView(.horizontal) {
                HStack(spacing:6) {
                    ForEach(1...7,id:\.self) { degree in
                        Button(numerals[degree-1]) {
                            var next=model.progression
                            next.chords.append(AuralChordConstraint(degree:degree))
                            model.progression=next
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(model.progression.chords.count >= 32)
                        .accessibilityLabel("Add degree \(numerals[degree-1]), any quality")
                        .accessibilityIdentifier("aural.search.degree.\(degree)")
                    }
                }
            }
            Text("Find these chords in order, anywhere in a sequence.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .sheet(isPresented:Binding(get:{editIndex != nil},set:{if !$0 {editIndex=nil}})) { editor }
    }

    private func replace(_ index:Int,_ chord:AuralChordConstraint) {
        var next=model.progression
        next.chords[index]=chord
        model.progression=next
    }

    @ViewBuilder private var editor: some View {
        if let index=editIndex, model.progression.chords.indices.contains(index) {
            let chord=model.progression.chords[index]
            NavigationStack {
                ScrollView {
                    VStack(alignment:.leading,spacing:14) {
                        Text("Accidental").font(.headline)
                        HStack {
                            ForEach(["♭","","♯"],id:\.self) { value in
                                Button(value.isEmpty ? "Natural" : value == "♭" ? "Flat" : "Sharp") { var changed=chord;changed.accidental=value;changed.exact=nil;changed.inversion=nil;replace(index,changed);showsMore=false }
                                    .buttonStyle(.bordered)
                                    .tint(chord.accidental == value ? Color.accentColor : Color.gray)
                            }
                        }
                        Text("Chord family").font(.headline)
                        ScrollView(.horizontal) {
                            HStack {
                                ForEach(["any","major","minor","7","maj7","m7"],id:\.self) { value in
                                    Button(value == "any" ? "Any" : value.capitalized) { var changed=chord;changed.family=value;changed.exact=nil;changed.inversion=nil;replace(index,changed);showsMore=false }
                                        .buttonStyle(.bordered)
                                        .tint(chord.exact == nil && chord.family == value ? Color.accentColor : Color.gray)
                                }
                            }
                        }
                        Button(showsMore ? "Hide more options" : "More options") { showsMore.toggle();variants=nil;visibleVariants=30 }
                            .accessibilityIdentifier("aural.search.more")
                        if showsMore {
                            Group {
                                if let variants {
                                    if variants.isEmpty { Text("No chord forms in this catalog").foregroundStyle(.secondary) }
                                    ForEach(Array(variants.prefix(visibleVariants))) { variant in
                                        Button(variant.label) {
                                            var changed=chord
                                            changed.exact=variant.root
                                            changed.inversion=model.distinguishInversions && variant.label != variant.root ? variant.label : nil
                                            changed.family="any"
                                            replace(index,changed)
                                            editIndex=nil
                                        }
                                            .buttonStyle(.bordered)
                                    }
                                    if visibleVariants < variants.count { Button("More chords") { visibleVariants += 30 } }
                                } else { ProgressView("Loading chord forms…") }
                            }
                            .task(id:"\(chord.degree)|\(chord.accidental)|\(model.analysis)|\(model.modeFilter)|\(model.distinguishInversions)") {
                                let loaded=await model.chordVariants(for:chord)
                                if !Task.isCancelled { variants=loaded }
                            }
                        }
                        HStack {
                            if index > 0 { Button("Move left") { var next=model.progression;next.chords.swapAt(index,index-1);model.progression=next;editIndex=index-1 } }
                            if index < model.progression.chords.count-1 { Button("Move right") { var next=model.progression;next.chords.swapAt(index,index+1);model.progression=next;editIndex=index+1 } }
                            Spacer()
                            Button("Remove chord",role:.destructive) { var next=model.progression;next.chords.remove(at:index);model.progression=next;editIndex=nil }
                        }
                    }
                    .padding()
                }
                .navigationTitle("Edit chord \(index+1)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.confirmationAction) { Button("Done") { editIndex=nil } } }
            }
            .presentationDetents([.medium,.large])
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
                        Text(node.row.outline)
                            .font(.caption.monospacedDigit().weight(.bold))
                            .foregroundStyle(.secondary)
                        AuralRomanSequence(labels: node.row.labels, mode: node.row.mode)
                    }
                    Text(
                        "\(node.row.length) chords · \(node.row.globalSongCount.formatted()) songs overall · \(node.row.songCount.formatted()) matching"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                "\(node.path), \(node.row.labels.joined(separator: ", ")), \(node.row.length) chords, \(node.row.globalSongCount) songs overall, \(node.row.songCount) matching songs"
            )
        }
        .listRowInsets(EdgeInsets(
            top: 4,
            leading: CGFloat(min(4, max(0, node.row.outline.split(separator: ".").count - 1))) * 18 + 28,
            bottom: 4,
            trailing: 12
        ))
    }
}

struct AuralRomanSequence: View {
    let labels: [String]
    let mode: String?
    var revealsAnswer = true
    var outlined = false

    static func chordColor(_ label: String) -> Color {
        let numeral = String(label.drop(while: { "♭♯#b".contains($0) }).prefix(while: { "ivIV".contains($0) })).uppercased()
        let colors: [String: UInt32] = ["I":0xFF0000,"II":0xFFB014,"III":0xEFE600,"IV":0x00D300,"V":0x4800FF,"VI":0xB800E5,"VII":0xFF00CB]
        guard let rgb = colors[numeral] else { return .secondary }
        return Color(red:Double((rgb >> 16) & 255)/255,green:Double((rgb >> 8) & 255)/255,blue:Double(rgb & 255)/255)
    }

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
                    .foregroundStyle(revealsAnswer ? Self.chordColor(label) : .secondary)
                    .padding(outlined ? 8 : 0)
                    .overlay {
                        if outlined { RoundedRectangle(cornerRadius:8).stroke(revealsAnswer ? Self.chordColor(label) : .secondary,lineWidth:2) }
                    }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(revealsAnswer ? labels.joined(separator: ", then ") : "Answer hidden")
    }
}

struct AuralPatternView: View {
    let pattern: AuralPattern
    let minimumPopularityPercent: Int
    let environment: AppEnvironment
    @Bindable var libraryStore: LibraryStore
    @State private var selectedTab: AuralDetailTab
    @State private var evidence: String?
    @State private var showsFullProgression = false

    init(pattern: AuralPattern, environment: AppEnvironment, libraryStore: LibraryStore) {
        self.pattern = pattern
        self.environment = environment
        self.libraryStore = libraryStore
        let restored = environment.auralRestoration.snapshot
        minimumPopularityPercent = min(100,max(0,restored.browser?.minimumPopularityPercent ?? 80))
        _selectedTab = State(initialValue:
            restored.selectedPattern?.id == pattern.id ? restored.selectedTab : .recognize
        )
    }

    var body: some View {
        VStack(spacing: 12) {
            progressionHeader
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
                        libraryStore: libraryStore,
                        minimumPopularityPercent: minimumPopularityPercent
                    )
                case .recall:
                    AuralPracticeView(
                        pattern: pattern,
                        mode: .recall,
                        environment: environment,
                        favoriteSongIds: libraryStore.userContent.favoriteSlugs,
                        libraryStore: libraryStore,
                        minimumPopularityPercent: minimumPopularityPercent
                    )
                case .sing:
                    AuralPracticeView(
                        pattern: pattern,
                        mode: .sing,
                        environment: environment,
                        favoriteSongIds: libraryStore.userContent.favoriteSlugs,
                        libraryStore: libraryStore,
                        minimumPopularityPercent: minimumPopularityPercent
                    )
                case .songs:
                    AuralSongsView(
                        pattern: pattern,
                        environment: environment,
                        libraryStore: libraryStore,
                        minimumPopularityPercent: minimumPopularityPercent
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

    private var progressionHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            if pattern.labels.count > 8 {
                Text("\(pattern.labels.count) chords")
                    .font(.headline)
                if !showsFullProgression {
                    ScrollView(.horizontal) {
                        HStack(spacing: 4) {
                            AuralRomanSequence(labels: Array(pattern.labels.prefix(4)), mode: pattern.mode)
                            Text("…").foregroundStyle(.secondary)
                        }
                        .fixedSize(horizontal: true, vertical: false)
                    }
                }
                Button(showsFullProgression ? "Hide full progression" : "Show full progression") {
                    showsFullProgression.toggle()
                }
                .font(.subheadline)
            }
            if pattern.labels.count <= 8 || showsFullProgression {
                ScrollView(.horizontal) {
                    AuralRomanSequence(labels: pattern.labels, mode: pattern.mode)
                        .fixedSize(horizontal: true, vertical: false)
                }
                .accessibilityIdentifier("aural.pattern.progression")
            }
        }
        .font(.title3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
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
    let minimumPopularityPercent: Int

    init(pattern: AuralPattern, environment: AppEnvironment, libraryStore: LibraryStore,
         minimumPopularityPercent: Int) {
        self.minimumPopularityPercent = minimumPopularityPercent
        _model = State(initialValue: AuralSongsModel(
            pattern: pattern,
            environment: environment,
            libraryStore: libraryStore,
            minimumPopularityPercent: minimumPopularityPercent
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
                    description: Text("No supporting songs meet the \(minimumPopularityPercent)% popularity cutoff.")
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
        libraryStore: LibraryStore,
        reviewPool: [AuralCatalogRow] = [],
        minimumPopularityPercent: Int? = nil
    ) {
        self.mode = mode
        self.libraryStore = libraryStore
        _model = State(initialValue: AuralLessonModel(
            pattern: pattern,
            mode: mode,
            environment: environment,
            favoriteSongIds: favoriteSongIds,
            reviewPool: reviewPool,
            minimumPopularityPercent: minimumPopularityPercent
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
                        AuralRomanSequence(labels: exercise.fullDegrees, mode: model.modeName, outlined:true)
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
                        HStack {
                            if model.draft == [option.id] { Image(systemName:"checkmark").accessibilityHidden(true) }
                            AuralRomanSequence(labels: option.degrees, mode: model.modeName, outlined:model.draft == [option.id])
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(model.draft == [option.id] ? .isSelected : [])
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
                                .overlay(Capsule().stroke(AuralRomanSequence.chordColor(token),lineWidth:2))
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
