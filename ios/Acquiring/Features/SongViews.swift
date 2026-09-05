import AcquiringAudio
import AcquiringCore
import Foundation
import SwiftUI

struct SongDetailView: View {
    let songID: String
    let onOpenArtist: (CatalogSong) -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var state: FeatureState<SongDocument> = .loading
    @State private var tab: SongDetailTab = .info
    @State private var selectedSectionID: String?
    @State private var showsLetterNames = false
    @State private var arpeggiatesChords = false
    @State private var arpeggioStepMilliseconds = 80.0
    @State private var audioError: String?

    var body: some View {
        Group {
            switch state {
            case .idle, .loading:
                ProgressView("Opening song…")
                    .accessibilityIdentifier("songDetail.status.loading")
            case .empty:
                ContentUnavailableView(
                    "No song data",
                    systemImage: "questionmark.music.note",
                    description: Text("This song has no playable sections.")
                )
                .accessibilityIdentifier("songDetail.status.empty")
            case let .failure(message):
                ContentUnavailableView {
                    Label("Unable to open song", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try Again") { Task { await load() } }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("songDetail.retry")
                }
                .accessibilityIdentifier("songDetail.status.failure")
            case let .content(document):
                detail(document)
            }
        }
        .navigationTitle("Song")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: AppRoute.quiz(songID)) {
                    Label("Quiz", systemImage: "questionmark.music.note")
                }
                .accessibilityIdentifier("songDetail.quiz")
                .accessibilityHint("Returns to this song's quiz")
            }
        }
        .task(id: songID) { await load() }
        .onAppear { synchronizeRememberedSection() }
        .onChange(of: environment.quizContinuity) { _, _ in
            synchronizeRememberedSection()
        }
        .onDisappear {
            Task { await environment.audio.stop(channel: .preview) }
        }
        .alert("Audio", isPresented: audioAlertBinding) {
            Button("OK") { audioError = nil }
        } message: {
            Text(audioError ?? "")
        }
    }

    private var audioAlertBinding: Binding<Bool> {
        Binding(
            get: { audioError != nil },
            set: { if !$0 { audioError = nil } }
        )
    }

    private func detail(_ document: SongDocument) -> some View {
        let sections = document.orderedSections.map { SongDetailSection(id: $0.key, section: $0.section) }
        let selected = sections.first(where: { $0.id == selectedSectionID }) ?? sections.first

        return VStack(spacing: 0) {
            SongDetailHeader(
                song: document.song,
                section: selected?.section,
                onOpenArtist: onOpenArtist
            )
            if sections.count > 1 {
                Picker("Section", selection: selectedSectionBinding(sections: sections)) {
                    ForEach(sections) { entry in
                        Text(entry.section.safeSectionName).tag(entry.id)
                    }
                }
                .pickerStyle(.menu)
                .padding(.horizontal)
                .padding(.bottom, 8)
                .accessibilityIdentifier("songDetail.section")
            }

            Picker("Song detail tab", selection: $tab) {
                ForEach(SongDetailTab.allCases) { tab in
                    Text(tab.title).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.bottom, 8)
            .accessibilityIdentifier("songDetail.tab")

            if let selected {
                switch tab {
                case .info:
                    SongInfoView(
                        song: document.song,
                        section: selected.section,
                        allSections: sections,
                        onPreview: { chord in preview(chord) }
                    )
                case .chords:
                    SongChordsView(
                        section: selected.section,
                        showsLetterNames: $showsLetterNames,
                        arpeggiates: $arpeggiatesChords,
                        arpeggioStepMilliseconds: $arpeggioStepMilliseconds,
                        onPreview: { chord in
                            preview(
                                chord,
                                arpeggiates: arpeggiatesChords,
                                arpeggioStepMilliseconds: Int(arpeggioStepMilliseconds.rounded())
                            )
                        }
                    )
                }
            }
        }
    }

    private func selectedSectionBinding(
        sections: [SongDetailSection]
    ) -> Binding<String> {
        Binding(
            get: { selectedSectionID ?? sections.first?.id ?? "" },
            set: {
                guard selectedSectionID != $0 else { return }
                selectedSectionID = $0
                let continuity = environment.rememberQuizSection(songID: songID, sectionID: $0)
                _ = environment.audio.beginQuizReplacement(
                    songID: songID,
                    sectionID: $0,
                    tempoPercent: continuity.tempoPercent
                )
            }
        )
    }

    private func load() async {
        state = .loading
        do {
            let document = try await environment.catalog.songDocument(id: songID)
            guard !document.orderedSections.isEmpty else {
                state = .empty
                selectedSectionID = nil
                return
            }
            let firstSectionID = document.orderedSections[0].key
            let rememberedSectionID = environment.quizContinuity(for: songID)?.sectionID
            selectedSectionID = rememberedSectionID.flatMap { rememberedID in
                document.orderedSections.contains { $0.key == rememberedID }
                    ? rememberedID
                    : nil
            } ?? firstSectionID
            state = .content(document)
        } catch {
            state = .failure(error.localizedDescription)
        }
    }

    private func synchronizeRememberedSection() {
        guard case let .content(document) = state,
              let rememberedID = environment.quizContinuity(for: songID)?.sectionID,
              document.orderedSections.contains(where: { $0.key == rememberedID })
        else { return }
        selectedSectionID = rememberedID
    }

    private func preview(
        _ chord: SongDetailChord,
        arpeggiates: Bool = false,
        arpeggioStepMilliseconds: Int = 80
    ) {
        guard !chord.isRest, !chord.notes.isEmpty else { return }
        Task {
            do {
                try await environment.audio.play(
                    PreviewRequest(
                        frequenciesHz: chord.notes.map { MusicTheory.frequency(midi: Double($0)) },
                        duration: .milliseconds(450),
                        arpeggiates: arpeggiates,
                        arpeggioStep: .milliseconds(arpeggioStepMilliseconds),
                        waveform: .sawtooth
                    )
                )
            } catch is CancellationError {
            } catch {
                audioError = error.localizedDescription
            }
        }
    }
}

private enum SongDetailTab: CaseIterable, Hashable, Identifiable {
    case info
    case chords

    var id: Self { self }
    var title: String { self == .info ? "Info" : "Chords" }
}

private struct SongDetailHeader: View {
    let song: CatalogSong
    let section: ExtractedSection?
    let onOpenArtist: (CatalogSong) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(song.displayTitle)
                .font(.title2.bold())
                .multilineTextAlignment(.leading)
            if !(song.artist?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "").isEmpty {
                Button { onOpenArtist(song) } label: {
                    Text(song.displayArtist)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open songs by \(song.displayArtist)")
                .accessibilityIdentifier("songDetail.artist")
            } else {
                Text(song.displayArtist)
                    .foregroundStyle(.secondary)
            }
            if let section {
                Text(section.safeSectionName.uppercased())
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tint)
                    .padding(.top, 3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }
}

private struct SongDetailSection: Identifiable {
    let id: String
    let section: ExtractedSection
}

private struct SongInfoView: View {
    let song: CatalogSong
    let section: ExtractedSection
    let allSections: [SongDetailSection]
    let onPreview: (SongDetailChord) -> Void

    private var chords: [SongDetailChord] { SongDetailPresentation.progression(in: section) }
    private var uniqueChords: [SongDetailChord] { SongDetailPresentation.uniqueChords(in: section) }
    private var meters: [[String: JSONValue]] { SongDetailPresentation.metadataObjects("meters", in: section) }
    private var tempos: [[String: JSONValue]] { SongDetailPresentation.metadataObjects("tempos", in: section) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                DetailGroup("Overview") {
                    DetailRow("Key", SongDetailPresentation.keyLabel(section.keys.first?.key))
                    DetailRow("Tempo", "\(section.bpm.rounded().formatted()) BPM")
                    if let beatsPerMeasure = meters.first?["numBeats"]?.intValue {
                        DetailRow("Beats / measure", beatsPerMeasure.formatted())
                    }
                    if let duration = SongDetailPresentation.durationLabel(section: section) {
                        DetailRow("Length", duration)
                    }
                    if let beats = SongDetailPresentation.totalBeats(section: section) {
                        DetailRow("Beats", SongDetailPresentation.beatsAndBarsLabel(beats: beats, meters: meters))
                    }
                    DetailRow("Chords", "\(chords.count) (\(uniqueChords.count) unique)")
                    DetailRow("Melody notes", SongDetailPresentation.melodyLabel(section: section))
                }

                if !chords.isEmpty {
                    DetailGroup("Progression") {
                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: 72), spacing: 8)],
                            spacing: 8
                        ) {
                            ForEach(chords) { chord in
                                InfoProgressionPill(chord: chord, onPreview: onPreview)
                            }
                        }
                    }
                }

                if section.keys.count > 1 {
                    DetailGroup("Key changes") {
                        ForEach(Array(section.keys.enumerated()), id: \.offset) { _, change in
                            DetailRow(
                                "Beat \(SongDetailPresentation.formatBeat(change.beat))",
                                SongDetailPresentation.keyLabel(change.key)
                            )
                        }
                    }
                }

                if tempos.count > 1 {
                    DetailGroup("Tempo changes") {
                        ForEach(Array(tempos.enumerated()), id: \.offset) { _, change in
                            DetailRow(
                                "Beat \(SongDetailPresentation.formatBeat(change["beat"]?.doubleValue ?? 1))",
                                "\((change["bpm"]?.doubleValue ?? 120).rounded().formatted()) BPM"
                            )
                        }
                    }
                }

                if meters.count > 1 {
                    DetailGroup("Meter changes") {
                        ForEach(Array(meters.enumerated()), id: \.offset) { _, change in
                            DetailRow(
                                "Beat \(SongDetailPresentation.formatBeat(change["beat"]?.doubleValue ?? 1))",
                                "\((change["numBeats"]?.intValue ?? 4).formatted()) beats / measure"
                            )
                        }
                    }
                }

                if allSections.count > 1 {
                    DetailGroup("Sections") {
                        ForEach(allSections) { entry in
                            DetailRow(entry.section.safeSectionName, "")
                        }
                    }
                }

                DetailGroup("Source") {
                    if !section.safeNumericID.isEmpty {
                        DetailRow("Hooktheory ID", section.safeNumericID)
                    }
                    DetailRow("Slug", song.id)
                    if !section.safeSongInfo.isEmpty {
                        DetailRow("Song", section.safeSongInfo)
                    }
                    HStack(spacing: 16) {
                        if let url = song.url {
                            Link("Open on Hooktheory ↗", destination: url)
                                .accessibilityIdentifier("songDetail.hooktheoryLink")
                        }
                        if let url = SongDetailPresentation.youtubeURL(section: section) {
                            Link("YouTube ↗", destination: url)
                        }
                    }
                    .font(.subheadline.weight(.medium))
                    .padding(.top, 6)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 28)
        }
        .accessibilityIdentifier("songDetail.info")
    }
}

private struct InfoProgressionPill: View {
    let chord: SongDetailChord
    let onPreview: (SongDetailChord) -> Void

    var body: some View {
        Group {
            if chord.isRest {
                Text("Rest")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 64, minHeight: 50)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 6)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
                    .accessibilityLabel("Rest at beat \(SongDetailPresentation.formatBeat(chord.beat))")
            } else {
                Button { onPreview(chord) } label: {
                    VStack(spacing: 4) {
                        FittedRomanNumeral(
                            display: RomanNumeralDisplay(
                                symbol: chord.roman,
                                borrowed: chord.source["borrowed"]
                            ),
                            maximumFontSize: 20,
                            minimumFontSize: 11
                        )
                        .frame(width: 58, height: 28)
                        Text(chord.letter.isEmpty ? chord.roman : chord.letter)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .frame(minWidth: 64)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 6)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Play \(chord.letter.isEmpty ? chord.roman : chord.letter) at beat \(SongDetailPresentation.formatBeat(chord.beat))")
            }
        }
    }
}

private struct SongChordsView: View {
    let section: ExtractedSection
    @Binding var showsLetterNames: Bool
    @Binding var arpeggiates: Bool
    @Binding var arpeggioStepMilliseconds: Double
    let onPreview: (SongDetailChord) -> Void

    private var chords: [SongDetailChord] { SongDetailPresentation.uniqueChords(in: section) }
    private var key: KeyInfo { section.keys.first?.key ?? KeyInfo(tonic: "C", scale: "major") }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Scale: \(SongDetailPresentation.scaleNoteLabels(for: key).joined(separator: ", "))")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.tint)
                    Text("Key: \(SongDetailPresentation.keyLabel(key))")
                        .font(.subheadline)
                }
                .accessibilityIdentifier("songDetail.chords.key")

                Toggle("Show letter names", isOn: $showsLetterNames)
                    .accessibilityIdentifier("songDetail.chords.letters")
                Toggle("Arpeggiate", isOn: $arpeggiates)
                    .accessibilityIdentifier("songDetail.chords.arpeggiate")
                if arpeggiates {
                    VStack(alignment: .leading, spacing: 4) {
                        LabeledContent("Speed", value: "\(Int(arpeggioStepMilliseconds.rounded())) ms")
                        Slider(value: $arpeggioStepMilliseconds, in: 30...1_000, step: 1)
                            .accessibilityIdentifier("songDetail.chords.arpeggioSpeed")
                            .accessibilityLabel("Chord arpeggio speed")
                    }
                }

                if chords.isEmpty {
                    ContentUnavailableView(
                        "No chords in this section",
                        systemImage: "music.note",
                        description: Text("Rest events are not shown in the chord inventory.")
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                } else {
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 112), spacing: 12)],
                        spacing: 12
                    ) {
                        ForEach(chords) { chord in
                            Button { onPreview(chord) } label: {
                                VStack(spacing: 7) {
                                    FittedRomanNumeral(
                                        display: RomanNumeralDisplay(
                                            symbol: chord.roman,
                                            borrowed: chord.source["borrowed"]
                                        ),
                                        maximumFontSize: 28,
                                        minimumFontSize: 12
                                    )
                                    .frame(height: 38)
                                    if showsLetterNames {
                                        Text(chord.letter.isEmpty ? chord.roman : chord.letter)
                                            .font(.caption.weight(.medium))
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.8)
                                    }
                                }
                                .frame(maxWidth: .infinity, minHeight: 68)
                                .padding(8)
                                .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Play \(chord.letter.isEmpty ? chord.roman : chord.letter)")
                        }
                    }
                }
            }
            .padding()
        }
        .accessibilityIdentifier("songDetail.chords")
    }
}

private struct DetailGroup<Content: View>: View {
    let title: String
    let content: Content

    init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.top, 20)
                .padding(.bottom, 6)
            Divider()
            content
        }
    }
}

private struct DetailRow: View {
    let label: String
    let value: String

    init(_ label: String, _ value: String) {
        self.label = label
        self.value = value
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 16) {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            if !value.isEmpty {
                Text(value)
                    .multilineTextAlignment(.trailing)
                    .fontWeight(.medium)
            }
        }
        .font(.subheadline)
        .padding(.vertical, 7)
    }
}

private struct SongDetailChord: Identifiable {
    let id: String
    let source: [String: JSONValue]
    let beat: Double
    let key: KeyInfo
    let isRest: Bool
    let roman: String
    let letter: String
    let notes: [Int]
}

private enum SongDetailPresentation {
    static func progression(in section: ExtractedSection) -> [SongDetailChord] {
        section.chords.enumerated()
            .sorted {
                let lhs = $0.element["beat"]?.doubleValue ?? 1
                let rhs = $1.element["beat"]?.doubleValue ?? 1
                return lhs == rhs ? $0.offset < $1.offset : lhs < rhs
            }
            .map { index, chord in
                displayChord(chord, section: section, id: "progression-\(index)")
            }
    }

    static func uniqueChords(in section: ExtractedSection) -> [SongDetailChord] {
        var seen = Set<String>()
        return progression(in: section).filter { chord in
            guard !chord.isRest, !chord.notes.isEmpty, chord.roman != "—" else { return false }
            return seen.insert(inventorySignature(for: chord)).inserted
        }
    }

    static func metadataObjects(_ key: String, in section: ExtractedSection) -> [[String: JSONValue]] {
        section.metadata?[key]?.arrayValue?.compactMap(\.objectValue) ?? []
    }

    static func keyLabel(_ key: KeyInfo?) -> String {
        guard let key else { return "Unknown" }
        return "\(key.tonic) \(prettyScale(key.scale))"
    }

    static func scaleNoteLabels(for key: KeyInfo) -> [String] {
        let scale: String
        switch key.scale.lowercased() {
        case "ionian": scale = "major"
        case "aeolian": scale = "minor"
        default: scale = key.scale
        }
        return (1...7).map { degree in
            MusicTheory.noteLabel(degree: degree, tonic: key.tonic, scale: scale)
        }
    }

    static func totalBeats(section: ExtractedSection) -> Double? {
        guard let endBeat = section.endBeat else { return nil }
        let beats = max(endBeat - 1, 0)
        return beats > 0 ? beats : nil
    }

    static func durationLabel(section: ExtractedSection) -> String? {
        guard let beats = totalBeats(section: section), section.bpm > 0 else { return nil }
        let seconds = Int((beats / section.bpm * 60).rounded())
        return "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }

    static func beatsAndBarsLabel(beats: Double, meters: [[String: JSONValue]]) -> String {
        let beatLabel = formatBeat(beats)
        guard let perBar = meters.first?["numBeats"]?.doubleValue, perBar > 0 else { return beatLabel }
        return "\(beatLabel) · \(Int(ceil(beats / perBar))) bars"
    }

    static func melodyLabel(section: ExtractedSection) -> String {
        let notes = section.melodyNotes
        guard !notes.isEmpty else { return "None — chords only" }
        return "\(notes.filter { !$0.isRest }.count) sounded / \(notes.count) total"
    }

    static func youtubeURL(section: ExtractedSection) -> URL? {
        guard let id = section.metadata?["youtube"]?.objectValue?["id"]?.stringValue,
              !id.isEmpty
        else { return nil }
        return URL(string: "https://www.youtube.com/watch?v=\(id)")
    }

    static func formatBeat(_ beat: Double) -> String {
        beat.rounded() == beat ? Int(beat).formatted() : String(format: "%.2f", beat)
            .trimmingCharacters(in: CharacterSet(charactersIn: "0"))
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
    }

    private static func displayChord(
        _ chord: [String: JSONValue],
        section: ExtractedSection,
        id: String
    ) -> SongDetailChord {
        let beat = chord["beat"]?.doubleValue ?? 1
        let key = section.key(at: beat)
        let isRest = chord["isRest"]?.boolValue == true || chord["rest"]?.boolValue == true
        guard !isRest, (chord["root"]?.intValue ?? 0) > 0 else {
            return SongDetailChord(
                id: id,
                source: chord,
                beat: beat,
                key: key,
                isRest: isRest,
                roman: isRest ? "Rest" : "—",
                letter: "",
                notes: []
            )
        }
        let roman = ChordInterpreter.romanSymbol(for: chord, key: key)
        let displayRoman = roman.isEmpty || roman == "Rest" ? "—" : roman
        return SongDetailChord(
            id: id,
            source: chord,
            beat: beat,
            key: key,
            isRest: false,
            roman: displayRoman,
            letter: ChordInterpreter.letterName(for: chord, key: key),
            notes: ChordInterpreter.chordNotes(for: chord, key: key)
        )
    }

    private static func inventorySignature(for chord: SongDetailChord) -> String {
        let raw = rawSignature(for: chord.source)
        let onsetKey = "\(chord.key.tonic)_\(chord.key.scale)"
        let display = "\(chord.roman)_\(chord.letter)"
        let voicing = chord.notes.map(String.init).joined(separator: ",")
        return "\(raw)_\(onsetKey)_\(display)_\(voicing)"
    }

    private static func rawSignature(for chord: [String: JSONValue]) -> String {
        let root = chord["root"]?.intValue ?? 0
        let type = chord["type"]?.intValue ?? 5
        let inversion = chord["inversion"]?.intValue ?? 0
        let applied = chord["applied"]?.intValue ?? 0
        let borrowed = chord["borrowed"].map { String(describing: $0) } ?? ""
        let alterations = chord["alterations"].map { String(describing: $0) } ?? ""
        let suspensions = chord["suspensions"].map { String(describing: $0) } ?? ""
        return "\(root)_\(type)_\(inversion)_\(applied)_\(borrowed)_\(alterations)_\(suspensions)"
    }

    private static func prettyScale(_ scale: String) -> String {
        switch scale.lowercased() {
        case "major", "ionian": "Major"
        case "minor", "aeolian": "Minor"
        default: scale.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

private struct SongDetailInfoPreview: View {
    private let song = CatalogSong(
        id: "sample-artist__sample-song",
        artist: "Sample Artist",
        title: "Sample Song",
        url: URL(string: "https://www.hooktheory.com/theorytab/view/sample-artist/sample-song")!
    )

    private let section = ExtractedSection(
        numericId: .number(42),
        sectionName: "Verse",
        sectionIndex: 0,
        songInfo: "Sample Song by Sample Artist",
        chords: [
            ["root": .number(1), "type": .number(5), "beat": .number(1)],
            ["root": .number(5), "type": .number(5), "beat": .number(5)]
        ],
        notes: .array([
            .object(["sd": .string("1"), "beat": .number(1), "duration": .number(1), "octave": .number(0)]),
            .object(["sd": .string("3"), "beat": .number(2), "duration": .number(1), "octave": .number(0)])
        ]),
        metadata: [
            "keys": .array([.object(["tonic": .string("C"), "scale": .string("major"), "beat": .number(1)])]),
            "tempos": .array([.object(["bpm": .number(120), "beat": .number(1)])]),
            "meters": .array([.object(["numBeats": .number(4), "beat": .number(1)])]),
            "endBeat": .number(9),
            "youtube": .object(["id": .string("dQw4w9WgXcQ")])
        ]
    )

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                SongDetailHeader(song: song, section: section, onOpenArtist: { _ in })
                SongInfoView(
                    song: song,
                    section: section,
                    allSections: [SongDetailSection(id: "verse", section: section)],
                    onPreview: { _ in }
                )
            }
            .navigationTitle("Song")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

#Preview("Song Detail — Info") {
    SongDetailInfoPreview()
        .preferredColorScheme(.dark)
}

struct QuizView: View {
    let songID: String
    let onOpenArtist: (CatalogSong) -> Void
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var state: FeatureState<SongDocument> = .loading
    @State private var selectedSectionID: String?
    @State private var sectionLoadTask: Task<Void, Never>?
    @State private var sectionLoadGeneration = 0
    @State private var sectionLoadStatus: QuizSectionLoadStatus = .idle
    @State private var activeQuizRevision: UInt64?
    @State private var restartLoadRevision: UInt64?
    @State private var transportObservationGeneration = 0
    @State private var mode: QuizDisplayMode = .full
    @State private var progress = 0.0
    @State private var transportPhase: TransportPhase = .stopped
    @State private var playbackCommandPending = false
    @State private var playbackCommandTask: Task<Void, Never>?
    @State private var seekGeneration = 0
    @State private var timelineScrub: QuizTimelineScrub?
    @State private var timelineInertiaTask: Task<Void, Never>?
    @State private var timelineInertiaGeneration = 0
    @State private var error: String?
    @State private var usesRelativeIonianContext = false
    @State private var tempoPercent = 100.0

    private var playing: Bool {
        transportPhase == .playing || transportPhase == .buffering
    }

    var body: some View {
        Group {
            switch state {
            case .idle, .loading:
                ProgressView("Preparing quiz…")
                    .accessibilityIdentifier("quiz.status.loading")
            case .empty:
                ContentUnavailableView("No quiz data", systemImage: "questionmark.music.note")
                    .accessibilityIdentifier("quiz.status.empty")
            case let .failure(message):
                ContentUnavailableView {
                    Label("Unable to open quiz", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try Again") { Task { await load() } }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("quiz.retry")
                }
                .accessibilityIdentifier("quiz.status.failure")
            case let .content(document):
                quiz(document)
            }
        }
        .navigationTitle("Quiz")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: songID) { await load() }
        .task(id: transportObservationGeneration) { await observeTransport() }
        .onDisappear {
            finishTimelineScrub(resumingIfNeeded: true)
            cancelSectionLoad()
            cancelPlaybackCommand()
        }
        .onChange(of: mode) { _, mode in
            environment.rememberQuizSettings(songID: songID, mode: mode)
        }
        .onChange(of: usesRelativeIonianContext) { _, enabled in
            environment.rememberQuizSettings(
                songID: songID,
                usesRelativeIonianContext: enabled
            )
        }
        .alert("Audio", isPresented: errorAlertBinding) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }

    private var errorAlertBinding: Binding<Bool> {
        Binding(
            get: { error != nil },
            set: { if !$0 { error = nil } }
        )
    }

    private func quiz(_ document: SongDocument) -> some View {
        let sections = document.orderedSections.map { QuizSection(id: $0.key, section: $0.section) }
        let selected = sections.first(where: { $0.id == selectedSectionID }) ?? sections.first

        return VStack(spacing: 12) {
            if let selected {
                QuizHeader(
                    song: document.song,
                    initialKey: selected.section.keys.first?.key ?? KeyInfo(tonic: "C", scale: "major"),
                    currentKey: selected.section.key(at: currentBeat(in: selected.section)),
                    mode: mode,
                    usesRelativeIonianContext: $usesRelativeIonianContext,
                    onOpenArtist: onOpenArtist,
                    onInfo: { dismiss() }
                )

                if sections.count > 1 {
                    Picker("Quiz section", selection: sectionBinding(sections: sections)) {
                        ForEach(sections) { entry in
                            Text(entry.section.safeSectionName).tag(entry.id)
                        }
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("quiz.section")
                    .accessibilityValue(selected.section.safeSectionName)
                }

                Text(sectionLoadStatus.label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("quiz.section.status")

                Picker("Quiz mode", selection: $mode) {
                    ForEach(QuizDisplayMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("quiz.mode")

                switch mode {
                case .full:
                    fullQuiz(selected.section, sectionID: selected.id)
                case .rootOnly:
                    RootOnlyQuizSurface(
                        key: selected.section.key(at: currentBeat(in: selected.section))
                    )
                }
            }
        }
        .padding()
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func sectionBinding(sections: [QuizSection]) -> Binding<String> {
        Binding(
            get: { selectedSectionID ?? sections.first?.id ?? "" },
            set: { selectSection($0, sections: sections) }
        )
    }

    private func selectSection(
        _ id: String,
        sections: [QuizSection]
    ) {
        guard let selected = sections.first(where: { $0.id == id }) else { return }
        guard selectedSectionID != id else { return }
        finishTimelineScrub(resumingIfNeeded: false)
        cancelPlaybackCommand()
        selectedSectionID = id
        environment.rememberQuizSection(songID: songID, sectionID: id)
        progress = 0
        scheduleSectionLoad(selected.section, id: selected.id, position: .restart)
    }

    private func fullQuiz(_ section: ExtractedSection, sectionID: String) -> some View {
        let beat = currentBeat(in: section)
        return ZStack(alignment: .topLeading) {
            VStack(spacing: 20) {
                VStack(spacing: 0) {
                    MelodyTimelineView(
                        section: section,
                        currentBeat: beat,
                        usesRelativeIonianContext: usesRelativeIonianContext,
                        isPlaying: playing,
                        seekGeneration: seekGeneration,
                        isSeekEnabled: canSeek,
                        onSeek: { requestTimelineTap(to: $0, in: section) },
                        onDragStart: { beginTimelineDrag(in: section, sectionID: sectionID) },
                        onDragChange: updateTimelineDrag,
                        onDragEnd: endTimelineDrag,
                        onDragCancel: cancelTimelineDrag
                    )
                    .frame(height: MelodyTimelinePresentation.laneHeight)
                    .accessibilityIdentifier("quiz.timeline")
                    ChordTimelineView(
                        section: section,
                        currentBeat: beat,
                        isPlaying: playing,
                        seekGeneration: seekGeneration,
                        isSeekEnabled: canSeek,
                        onSeek: { requestTimelineTap(to: $0, in: section) },
                        onDragStart: { beginTimelineDrag(in: section, sectionID: sectionID) },
                        onDragChange: updateTimelineDrag,
                        onDragEnd: endTimelineDrag,
                        onDragCancel: cancelTimelineDrag
                    )
                    .frame(height: ChordTimelinePresentation.laneHeight)
                    .accessibilityIdentifier("quiz.chordTimeline")
                }
                HStack(spacing: 12) {
                    Button("Back 1 beat") {
                        requestDiscreteSeek(to: beat - 1, in: section)
                    }
                    .disabled(!canSeek || beat <= PlaybackTiming.firstBeat)
                    .accessibilityIdentifier("quiz.seekBack")
                    .accessibilityHint("Moves the playhead back one beat")

                    Text("Beat \(beat.formatted(.number.precision(.fractionLength(0...2))))")
                        .font(.subheadline.monospacedDigit())
                        .frame(minWidth: 82)
                        .accessibilityLabel("Current position")
                        .accessibilityValue("Beat \(beat.formatted(.number.precision(.fractionLength(0...2))))")

                    Button("Forward 1 beat") {
                        requestDiscreteSeek(to: beat + 1, in: section)
                    }
                    .disabled(!canSeek || beat >= playbackEndBeat(in: section))
                    .accessibilityIdentifier("quiz.seekForward")
                    .accessibilityHint("Moves the playhead forward one beat")
                }
                chordCard(section)
                    .accessibilityIdentifier("quiz.chordCard")
                HStack {
                    Button(action: requestPlaybackReset) {
                        Label("Reset", systemImage: "arrow.counterclockwise")
                    }
                    .buttonStyle(.bordered)
                    .disabled(
                        !sectionLoadStatus.isReady
                            || playbackCommandPending
                            || transportPhase == .buffering
                    )
                    .accessibilityIdentifier("quiz.reset")
                    .accessibilityLabel("Reset quiz playback")
                    .accessibilityHint("Stops playback and returns to the beginning")
                    Spacer()
                }
                VStack(spacing: 6) {
                    HStack {
                        LabeledContent(
                            "Tempo",
                            value: tempoPercent == 0
                                ? "0% — pauses playback"
                                : "\(Int(tempoPercent))%"
                        )
                        Spacer()
                        Button("Reset") {
                            setTempo(100, sectionID: sectionID)
                        }
                        .accessibilityIdentifier("quiz.tempoReset")
                        .accessibilityLabel("Reset quiz tempo to 100 percent")
                        .disabled(tempoPercent == 100)
                    }
                    Slider(
                        value: Binding(
                            get: { tempoPercent },
                            set: { newValue in
                                setTempo(newValue, sectionID: sectionID)
                            }
                        ),
                        in: 0...200,
                        step: 1
                    )
                        .accessibilityIdentifier("quiz.tempo")
                        .accessibilityLabel("Quiz tempo")
                        .accessibilityValue("\(Int(tempoPercent)) percent")
                        .accessibilityHint(tempoPercent == 0 ? "Playback is paused" : "Adjusts playback speed")
                }
            }
            DraggableQuizTransportHost {
                QuizTransportButton(
                    phase: transportPhase,
                    isReady: sectionLoadStatus.isReady,
                    isPlaybackEnabled: tempoPercent > 0,
                    commandPending: playbackCommandPending || timelineScrub != nil,
                    action: requestPlaybackToggle
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func setTempo(
        _ newValue: Double,
        sectionID: String
    ) {
        let normalizedTempo = QuizPlaybackConfiguration.normalizedTempoPercent(newValue)
        guard tempoPercent != normalizedTempo else { return }
        finishTimelineScrub(resumingIfNeeded: true)
        guard sectionLoadStatus.isReady,
              selectedSectionID == sectionID,
              let revision = activeQuizRevision,
              let updatedRevision = environment.audio.updateQuizTempo(
                  songID: songID,
                  sectionID: sectionID,
                  tempoPercent: normalizedTempo,
                  revision: revision
              )
        else { return }
        tempoPercent = normalizedTempo
        activeQuizRevision = updatedRevision
        environment.rememberQuizSettings(songID: songID, tempoPercent: normalizedTempo)
    }

    private func chordCard(_ section: ExtractedSection) -> some View {
        let active = activeChord(in: section)
        let key = active.map { section.key(at: $0.beat) } ?? section.keys[0].key
        let contextKey = RelativeIonianContext.key(for: section.keys[0].key)
        let symbol = active.map {
            usesRelativeIonianContext
                ? ChordInterpreter.relativeIonianRomanSymbol(for: $0.chord, key: key, contextKey: contextKey)
                : ChordInterpreter.romanSymbol(for: $0.chord, key: key)
        } ?? "—"
        let rootDegree = active
            .flatMap { ChordInterpreter.resolvedRoot(for: $0.chord, key: key)?.pitch }
            .map {
                usesRelativeIonianContext
                    ? RelativeIonianContext.degreeLabel(for: $0, contextKey: contextKey)
                    : MusicTheory.degreeLabel(midi: $0.midiNote, key: key)
            } ?? ""
        return GroupBox("Chord") {
            HStack(spacing: 12) {
                FittedRomanNumeral(
                    display: RomanNumeralDisplay(symbol: symbol, borrowed: active?.chord["borrowed"]),
                    maximumFontSize: 64,
                    minimumFontSize: 14
                )
                .frame(width: 210, height: 90)
                if !rootDegree.isEmpty {
                    FittedScaleDegree(rootDegree, maximumFontSize: 48, minimumFontSize: 14)
                        .frame(width: 70, height: 90)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func activeChord(in section: ExtractedSection) -> (chord: [String: JSONValue], beat: Double)? {
        let beat = currentBeat(in: section)
        guard let chord = QuizIntervals.activeChord(section: section, at: beat) else { return nil }
        return (chord, chord["beat"]?.doubleValue ?? 1)
    }

    private func currentBeat(in section: ExtractedSection) -> Double {
        PlaybackTiming.firstBeat + min(max(progress, 0), 1)
            * (playbackEndBeat(in: section) - PlaybackTiming.firstBeat)
    }

    private var canSeek: Bool {
        sectionLoadStatus.isReady
            && !playbackCommandPending
            && transportPhase != .buffering
            && activeQuizRevision != nil
    }

    private func requestSeek(to targetBeat: Double, in section: ExtractedSection) {
        guard canSeek, let revision = activeQuizRevision else { return }
        let endBeat = playbackEndBeat(in: section)
        let boundedBeat = min(max(targetBeat, PlaybackTiming.firstBeat), endBeat)
        let span = endBeat - PlaybackTiming.firstBeat
        guard span > 0 else { return }
        let targetProgress = (boundedBeat - PlaybackTiming.firstBeat) / span
        guard environment.audio.seekQuiz(to: targetProgress, revision: revision) else { return }
        progress = targetProgress
        seekGeneration &+= 1
        // Cancel the stream that could still be holding an observation from
        // before this synchronous seek, then subscribe from the fresh snapshot.
        transportObservationGeneration &+= 1
    }

    private func requestTimelineTap(to targetBeat: Double, in section: ExtractedSection) {
        if timelineScrub?.isCoasting == true {
            // A tap during inertia is a stop gesture, not a second seek.
            finishTimelineScrub(resumingIfNeeded: true)
            return
        }
        if timelineScrub != nil {
            finishTimelineScrub(resumingIfNeeded: true)
        }
        requestSeek(to: targetBeat, in: section)
    }

    private func requestDiscreteSeek(to targetBeat: Double, in section: ExtractedSection) {
        if timelineScrub != nil {
            finishTimelineScrub(resumingIfNeeded: true)
        }
        requestSeek(to: targetBeat, in: section)
    }

    private func beginTimelineDrag(in section: ExtractedSection, sectionID: String) {
        guard canSeek, let revision = activeQuizRevision,
              selectedSectionID == sectionID else { return }

        cancelTimelineInertia()
        let beat = currentBeat(in: section)
        if var scrub = timelineScrub {
            guard scrub.revision == revision, scrub.sectionID == sectionID else {
                finishTimelineScrub(resumingIfNeeded: false)
                return
            }
            scrub.originBeat = beat
            scrub.beat = beat
            scrub.lastTranslation = 0
            scrub.lastSampleTime = nil
            scrub.velocityBeatsPerSecond = 0
            scrub.isCoasting = false
            timelineScrub = scrub
            return
        }

        guard let shouldResume = environment.audio.pauseQuizForScrubbing(revision: revision) else {
            return
        }
        timelineScrub = QuizTimelineScrub(
            revision: revision,
            sectionID: sectionID,
            originBeat: beat,
            beat: beat,
            shouldResume: shouldResume
        )
        // Replace any observation that might still contain a sample captured
        // immediately before the synchronous pause.
        transportObservationGeneration &+= 1
    }

    private func updateTimelineDrag(translationX: CGFloat, time: Date) {
        guard var scrub = timelineScrub,
              scrub.revision == activeQuizRevision,
              scrub.sectionID == selectedSectionID,
              sectionLoadStatus.isReady else { return }

        if let previousTime = scrub.lastSampleTime {
            let elapsed = time.timeIntervalSince(previousTime)
            if elapsed > 0.001, elapsed < 0.25 {
                let fingerDelta = Double(translationX - scrub.lastTranslation)
                let instantaneous = -fingerDelta
                    / Double(ChordTimelinePresentation.pointsPerBeat)
                    / elapsed
                scrub.velocityBeatsPerSecond = scrub.velocityBeatsPerSecond == 0
                    ? instantaneous
                    : scrub.velocityBeatsPerSecond * 0.25 + instantaneous * 0.75
            } else if elapsed >= 0.25 {
                // A held finger has no release momentum, even if an earlier
                // movement sample was fast.
                scrub.velocityBeatsPerSecond = 0
            }
        }
        scrub.lastTranslation = translationX
        scrub.lastSampleTime = time
        let targetBeat = scrub.originBeat
            - Double(translationX / ChordTimelinePresentation.pointsPerBeat)
        scrub.beat = seekTimelineScrub(to: targetBeat, scrub: scrub)
        timelineScrub = scrub
    }

    private func endTimelineDrag() {
        guard var scrub = timelineScrub else { return }
        let endBeat = timelineEndBeat(for: scrub)
        let velocity = min(max(scrub.velocityBeatsPerSecond, -20), 20)
        guard abs(velocity) > 0.5,
              scrub.beat > PlaybackTiming.firstBeat,
              scrub.beat < endBeat else {
            finishTimelineScrub(resumingIfNeeded: true)
            return
        }

        scrub.isCoasting = true
        timelineScrub = scrub
        timelineInertiaGeneration &+= 1
        let generation = timelineInertiaGeneration
        timelineInertiaTask = Task { @MainActor in
            var coastBeat = scrub.beat
            var coastVelocity = velocity
            let clock = ContinuousClock()
            let start = clock.now
            var previous = start
            let maximumDuration = 2.5
            let decayRate = 4.2

            while true {
                do {
                    try await Task.sleep(for: .milliseconds(16))
                } catch {
                    return
                }
                let now = clock.now
                let elapsedBeforeFrame = start.duration(to: previous).secondsValue
                let totalElapsed = start.duration(to: now).secondsValue
                let frameDuration = min(
                    previous.duration(to: now).secondsValue,
                    max(maximumDuration - elapsedBeforeFrame, 0)
                )
                previous = now
                guard !Task.isCancelled,
                      timelineInertiaGeneration == generation,
                      let current = timelineScrub,
                      current.isCoasting,
                      current.revision == activeQuizRevision,
                      current.sectionID == selectedSectionID else { return }

                guard frameDuration > 0 else { break }

                let decay = exp(-decayRate * frameDuration)
                coastBeat += coastVelocity * (1 - decay) / decayRate
                coastVelocity *= decay
                var updated = current
                updated.velocityBeatsPerSecond = coastVelocity
                updated.beat = seekTimelineScrub(to: coastBeat, scrub: updated)
                timelineScrub = updated

                if updated.beat <= PlaybackTiming.firstBeat
                    || updated.beat >= timelineEndBeat(for: updated)
                    || abs(coastVelocity) < 0.05
                    || totalElapsed >= maximumDuration {
                    break
                }
            }

            guard timelineInertiaGeneration == generation else { return }
            timelineInertiaTask = nil
            finishTimelineScrub(resumingIfNeeded: true)
        }
    }

    private func cancelTimelineDrag() {
        finishTimelineScrub(resumingIfNeeded: true)
    }

    private func seekTimelineScrub(to targetBeat: Double, scrub: QuizTimelineScrub) -> Double {
        let endBeat = timelineEndBeat(for: scrub)
        let boundedBeat = min(max(targetBeat, PlaybackTiming.firstBeat), endBeat)
        let span = endBeat - PlaybackTiming.firstBeat
        guard span > 0 else { return scrub.beat }
        progress = (boundedBeat - PlaybackTiming.firstBeat) / span
        seekGeneration &+= 1
        return boundedBeat
    }

    private func timelineEndBeat(for scrub: QuizTimelineScrub) -> Double {
        guard case let .content(document) = state,
              let section = document.orderedSections.first(where: { $0.key == scrub.sectionID })?.section
        else { return PlaybackTiming.firstBeat }
        return playbackEndBeat(in: section)
    }

    private func cancelTimelineInertia() {
        timelineInertiaGeneration &+= 1
        timelineInertiaTask?.cancel()
        timelineInertiaTask = nil
    }

    private func finishTimelineScrub(resumingIfNeeded: Bool) {
        cancelTimelineInertia()
        guard let scrub = timelineScrub else { return }
        timelineScrub = nil
        guard resumingIfNeeded,
              scrub.revision == activeQuizRevision,
              scrub.sectionID == selectedSectionID,
              sectionLoadStatus.isReady else { return }

        let endBeat = timelineEndBeat(for: scrub)
        let span = endBeat - PlaybackTiming.firstBeat
        guard span > 0 else { return }
        let targetProgress = (min(max(scrub.beat, PlaybackTiming.firstBeat), endBeat)
            - PlaybackTiming.firstBeat) / span
        guard environment.audio.seekQuiz(to: targetProgress, revision: scrub.revision) else { return }
        progress = targetProgress
        seekGeneration &+= 1
        // Resume observation from the one committed engine position rather
        // than replaying transport samples captured before or during the drag.
        transportObservationGeneration &+= 1

        guard scrub.shouldResume else { return }
        do {
            try environment.audio.resumeQuizAfterScrubbing(revision: scrub.revision)
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Audio and both visual lanes must cover the same beats. Silent metadata
    // tails and explicit rests do not extend a section that has sounded events.
    private func playbackEndBeat(in section: ExtractedSection) -> Double {
        let melodyEnds = section.melodyNotes.compactMap {
            PlaybackTiming.eventEndBeat(beat: $0.beat, duration: $0.duration, isRest: $0.isRest)
        }
        let chordEnds = section.chords.compactMap { chord in
            PlaybackTiming.eventEndBeat(
                beat: chord["beat"]?.doubleValue ?? 1,
                duration: chord["duration"]?.doubleValue ?? 1,
                isRest: chord["isRest"]?.boolValue == true || chord["rest"]?.boolValue == true
            )
        }
        return PlaybackTiming.endBeat(metadata: section.endBeat, audibleEnds: melodyEnds + chordEnds)
    }

    private func requestPlaybackToggle() {
        guard sectionLoadStatus.isReady, !playbackCommandPending,
              tempoPercent > 0,
              transportPhase != .buffering,
              timelineScrub == nil,
              let revision = activeQuizRevision else { return }
        let shouldPause = playing
        // Latch synchronously, before the Task starts, so repeated taps cannot
        // enqueue duplicate commands against the same published state.
        playbackCommandPending = true
        playbackCommandTask = Task { @MainActor in
            defer {
                playbackCommandPending = false
                playbackCommandTask = nil
            }
            do {
                try Task.checkCancellation()
                if shouldPause {
                    await environment.audio.pauseQuiz(revision: revision)
                } else {
                    try await environment.audio.playQuiz(revision: revision)
                }
            } catch is CancellationError {
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func requestPlaybackReset() {
        guard sectionLoadStatus.isReady, !playbackCommandPending,
              transportPhase != .buffering,
              let revision = activeQuizRevision else { return }
        finishTimelineScrub(resumingIfNeeded: false)
        playbackCommandPending = true
        playbackCommandTask = Task { @MainActor in
            defer {
                playbackCommandPending = false
                playbackCommandTask = nil
            }
            guard !Task.isCancelled else { return }
            await environment.audio.resetQuiz(revision: revision)
        }
    }

    private func cancelPlaybackCommand() {
        playbackCommandTask?.cancel()
        playbackCommandTask = nil
        playbackCommandPending = false
    }

    private func load() async {
        cancelSectionLoad()
        do {
            let document = try await environment.catalog.songDocument(id: songID)
            guard !Task.isCancelled else { return }
            guard let selected = document.orderedSections.first else {
                state = .empty
                selectedSectionID = nil
                return
            }
            let remembered = environment.quizContinuity(for: songID)
            let restored = document.orderedSections.first { $0.key == remembered?.sectionID }
                ?? selected
            let continuity = environment.rememberQuizSection(
                songID: songID,
                sectionID: restored.key
            )
            selectedSectionID = restored.key
            mode = continuity.mode
            tempoPercent = continuity.tempoPercent
            usesRelativeIonianContext = continuity.usesRelativeIonianContext
            state = .content(document)
            if let revision = environment.audio.restorableQuizRevision(
                songID: songID,
                sectionID: restored.key,
                tempoPercent: tempoPercent
            ) {
                activeQuizRevision = revision
                sectionLoadStatus = .ready(restored.section.safeSectionName)
            } else {
                scheduleSectionLoad(restored.section, id: restored.key, position: .restart)
            }
        } catch { state = .failure(error.localizedDescription) }
    }

    private func scheduleSectionLoad(
        _ section: ExtractedSection,
        id: String,
        position: QuizLoadPosition
    ) {
        switch position {
        case .restart:
            finishTimelineScrub(resumingIfNeeded: false)
        case .preserveProgress:
            break
        @unknown default:
            finishTimelineScrub(resumingIfNeeded: false)
        }
        sectionLoadTask?.cancel()
        sectionLoadGeneration &+= 1
        let generation = sectionLoadGeneration
        let tempoPercent = tempoPercent
        let revision: UInt64
        switch position {
        case .restart:
            revision = environment.audio.beginQuizReplacement(
                songID: songID,
                sectionID: id,
                tempoPercent: tempoPercent
            )
            restartLoadRevision = revision
            transportObservationGeneration &+= 1
            transportPhase = .stopped
            progress = 0
        case .preserveProgress:
            revision = environment.audio.beginQuizReload(
                songID: songID,
                sectionID: id,
                tempoPercent: tempoPercent
            )
            restartLoadRevision = nil
        @unknown default:
            revision = environment.audio.beginQuizReplacement(
                songID: songID,
                sectionID: id,
                tempoPercent: tempoPercent
            )
            restartLoadRevision = revision
            transportObservationGeneration &+= 1
            transportPhase = .stopped
            progress = 0
        }
        activeQuizRevision = revision
        let timeline = timeline(for: section)
        sectionLoadStatus = .loading(section.safeSectionName)

        sectionLoadTask = Task { @MainActor [environment] in
            do {
                try Task.checkCancellation()
                try await environment.audio.loadQuiz(
                    timeline,
                    songID: songID,
                    sectionID: id,
                    tempoPercent: tempoPercent,
                    position: position,
                    revision: revision
                )
                try Task.checkCancellation()
                guard isCurrentSectionLoad(generation, id: id, revision: revision) else { return }
                if restartLoadRevision == revision {
                    restartLoadRevision = nil
                    transportPhase = .paused
                    progress = 0
                }
                sectionLoadStatus = .ready(section.safeSectionName)
                sectionLoadTask = nil
            } catch is CancellationError {
                // A newer section superseded this load.
            } catch {
                guard isCurrentSectionLoad(generation, id: id, revision: revision) else { return }
                if restartLoadRevision == revision { restartLoadRevision = nil }
                sectionLoadStatus = .failed(section.safeSectionName)
                self.error = error.localizedDescription
                sectionLoadTask = nil
            }
        }
    }

    private func isCurrentSectionLoad(_ generation: Int, id: String, revision: UInt64) -> Bool {
        sectionLoadGeneration == generation
            && selectedSectionID == id
            && activeQuizRevision == revision
    }

    private func cancelSectionLoad() {
        sectionLoadTask?.cancel()
        sectionLoadTask = nil
        sectionLoadGeneration &+= 1
        sectionLoadStatus = .idle
    }

    private func observeTransport() async {
        let observationGeneration = transportObservationGeneration
        for await value in await environment.audio.states() {
            guard !Task.isCancelled,
                  observationGeneration == transportObservationGeneration
            else { return }
            // A replacement publishes its own stopped/paused states, but an
            // existing stream can still have old progress buffered. Keep the
            // new section pinned to its beginning until its revision commits.
            guard restartLoadRevision == nil else { continue }
            // While a drag or coast owns the visual position, engine samples
            // remain paused at the pre-scrub beat until the single final seek.
            guard timelineScrub == nil else { continue }
            let duration = value.duration.secondsValue
            transportPhase = value.phase
            progress = duration > 0 ? min(max(value.elapsed.secondsValue / duration, 0), 1) : 0
            if value.phase == .failed, let message = value.errorDescription {
                error = message
            }
        }
    }

    private func timeline(for section: ExtractedSection) -> AcquiringAudio.QuizTimeline {
        // Keep event coordinates at the section's native tempo. The renderer's
        // musical clock applies live tempo independently, so this source-time
        // mapping also remains stable for future beat subdivisions.
        let beatsPerSecond = max(section.bpm, 1) / 60
        let melodyEvents = section.melodyNotes.compactMap { note -> QuizEvent? in
            guard PlaybackTiming.eventEndBeat(
                beat: note.beat, duration: note.duration, isRest: note.isRest
            ) != nil else { return nil }
            let onset = PlaybackTiming.normalize(beat: note.beat)
            let key = section.key(at: onset)
            let midi = MusicTheory.midiNote(scaleDegree: note.sd, octave: note.octave, key: key)
            return QuizEvent(
                onsetSeconds: max((onset - PlaybackTiming.firstBeat) / beatsPerSecond, 0),
                durationSeconds: note.duration / beatsPerSecond,
                frequenciesHz: [MusicTheory.frequency(midi: Double(midi))],
                waveform: .sawtooth,
                gain: 0.5
            )
        }
        let chordEvents = section.chords.compactMap { chord -> QuizEvent? in
            let onset = PlaybackTiming.normalize(beat: chord["beat"]?.doubleValue ?? 1)
            let duration = chord["duration"]?.doubleValue ?? 1
            let isRest = chord["isRest"]?.boolValue == true || chord["rest"]?.boolValue == true
            guard PlaybackTiming.eventEndBeat(
                beat: onset, duration: duration, isRest: isRest
            ) != nil else { return nil }
            let key = section.key(at: onset)
            let notes = ChordInterpreter.chordNotes(for: chord, key: key).filter { $0 > 0 }
            guard !notes.isEmpty else { return nil }
            return QuizEvent(
                onsetSeconds: max((onset - PlaybackTiming.firstBeat) / beatsPerSecond, 0),
                durationSeconds: duration / beatsPerSecond,
                frequenciesHz: notes.map { MusicTheory.frequency(midi: Double($0)) },
                waveform: .sawtooth,
                gain: 0.5
            )
        }
        let duration = (playbackEndBeat(in: section) - PlaybackTiming.firstBeat) / beatsPerSecond
        return AcquiringAudio.QuizTimeline(durationSeconds: duration, events: melodyEvents + chordEvents)
    }
}

private enum QuizSectionLoadStatus: Equatable {
    case idle
    case loading(String)
    case ready(String)
    case failed(String)

    var isReady: Bool {
        if case .ready = self { return true }
        return false
    }

    var label: String {
        switch self {
        case .idle: "Preparing section"
        case let .loading(name): "Loading \(name)"
        case let .ready(name): "\(name) ready"
        case let .failed(name): "Couldn't load \(name)"
        }
    }
}

private struct QuizTransportButton: View {
    let phase: TransportPhase
    let isReady: Bool
    let isPlaybackEnabled: Bool
    let commandPending: Bool
    let action: () -> Void

    private var isBusy: Bool { commandPending || phase == .buffering }

    private var title: String {
        if !isReady { return "Preparing…" }
        if isBusy { return phase == .playing ? "Pausing…" : "Starting…" }
        return phase == .playing ? "Pause" : "Play"
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isBusy {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: phase == .playing ? "pause.fill" : "play.fill")
                }
                Text(title)
            }
            .frame(minWidth: 100)
        }
        .buttonStyle(.borderedProminent)
        .disabled(!isReady || !isPlaybackEnabled || isBusy)
        .accessibilityIdentifier("quiz.play")
        .accessibilityLabel(title)
        .accessibilityHint(
            isReady && !isPlaybackEnabled
                ? "Set tempo above zero percent to play"
                : ""
        )
    }
}

#Preview("Quiz Play and Pause") {
    VStack(spacing: 16) {
        QuizTransportButton(phase: .paused, isReady: false, isPlaybackEnabled: true, commandPending: false, action: {})
        QuizTransportButton(phase: .paused, isReady: true, isPlaybackEnabled: true, commandPending: false, action: {})
        QuizTransportButton(phase: .buffering, isReady: true, isPlaybackEnabled: true, commandPending: true, action: {})
        QuizTransportButton(phase: .playing, isReady: true, isPlaybackEnabled: true, commandPending: false, action: {})
    }
    .padding()
    .preferredColorScheme(.dark)
}

private struct QuizSection: Identifiable {
    let id: String
    let section: ExtractedSection
}

private struct QuizTimelineScrub {
    let revision: UInt64
    let sectionID: String
    var originBeat: Double
    var beat: Double
    let shouldResume: Bool
    var lastTranslation: CGFloat = 0
    var lastSampleTime: Date?
    var velocityBeatsPerSecond = 0.0
    var isCoasting = false
}

private struct QuizHeader: View {
    let song: CatalogSong
    let initialKey: KeyInfo
    let currentKey: KeyInfo
    let mode: QuizDisplayMode
    @Binding var usesRelativeIonianContext: Bool
    let onOpenArtist: (CatalogSong) -> Void
    let onInfo: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(mode == .full ? song.displayTitle : "Root focus")
                    .font(.headline)
                    .lineLimit(1)

                if mode == .full,
                   let artist = song.artist?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !artist.isEmpty {
                    Text(" by ")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button(song.displayArtist) { onOpenArtist(song) }
                        .buttonStyle(.plain)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                        .accessibilityIdentifier("quiz.artist")
                }

                Spacer(minLength: 12)
                Button("Info", action: onInfo)
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("quiz.info")
            }

            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Initial: \(SongDetailPresentation.keyLabel(initialKey))")
                    Text("Current: \(SongDetailPresentation.keyLabel(currentKey))")
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                Spacer(minLength: 8)

                Toggle("Lock in Major", isOn: $usesRelativeIonianContext)
                    .toggleStyle(.switch)
                    .font(.caption)
                    .accessibilityHint("Shows chord degrees against the relative major key")
                    .accessibilityIdentifier("quiz.lockInMajor")
            }
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct RootOnlyQuizSurface: View {
    let key: KeyInfo

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Root-only", systemImage: "music.note")
                .font(.headline)
            Text("Focus on the current tonic while keeping the selected section and key context.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Current root: \(key.tonic)")
                .font(.title3.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityIdentifier("quiz.rootOnly.content")
    }
}

private struct QuizShellPreview: View {
    @State private var usesRelativeIonianContext = false

    var body: some View {
        VStack(spacing: 16) {
            QuizHeader(
                song: CatalogSong(id: "preview", artist: "Sample Artist", title: "Seed Song"),
                initialKey: KeyInfo(tonic: "C", scale: "major"),
                currentKey: KeyInfo(tonic: "D", scale: "major"),
                mode: .full,
                usesRelativeIonianContext: $usesRelativeIonianContext,
                onOpenArtist: { _ in },
                onInfo: {}
            )
            RootOnlyQuizSurface(key: KeyInfo(tonic: "D", scale: "major"))
        }
        .padding()
    }
}

#Preview("Quiz Shell") {
    QuizShellPreview()
}

private extension Duration {
    var secondsValue: Double {
        let parts = components
        return Double(parts.seconds) + Double(parts.attoseconds) / 1e18
    }
}

struct MelodyTimelineVisual: Identifiable, Equatable {
    let sourceIndex: Int
    let onset: Double
    let duration: Double
    let staffDegree: Int
    let accessibilityPitch: String

    var id: Int { sourceIndex }

    func isActive(at beat: Double) -> Bool {
        duration > 0 && beat >= onset && beat < onset + duration
    }
}

struct MelodyTimelinePresentation: Equatable {
    static let laneHeight: CGFloat = 88

    let visuals: [MelodyTimelineVisual]
    let restCount: Int

    init(section: ExtractedSection, usesRelativeIonianContext: Bool = false) {
        let initialKey = section.key(at: PlaybackTiming.firstBeat)
        let contextKey = RelativeIonianContext.key(for: initialKey)
        restCount = section.melodyNotes.filter(\.isRest).count
        visuals = section.melodyNotes.enumerated().compactMap { sourceIndex, note in
            guard !note.isRest else { return nil }
            let onset = PlaybackTiming.normalize(beat: note.beat)
            let rawStaffDegree = MusicTheory.rawDegree(note.sd) + note.octave * 7
            return MelodyTimelineVisual(
                sourceIndex: sourceIndex,
                onset: onset,
                duration: note.duration,
                staffDegree: usesRelativeIonianContext
                    ? RelativeIonianContext.staffDegree(
                        scaleDegree: note.sd,
                        relativeOctave: note.octave,
                        sourceKey: section.key(at: onset),
                        contextKey: contextKey
                    ) ?? rawStaffDegree
                    : rawStaffDegree,
                accessibilityPitch: note.octave == 0 ? note.sd : "\(note.sd), octave \(note.octave)"
            )
        }
        // Preserve payload order. SwiftUI paints later source events over earlier
        // ones, matching Android's deterministic overlap behavior.
    }

    var noteHeight: CGFloat {
        min(max(Self.laneHeight / 28, 5), 10)
    }

    func localX(for visual: MelodyTimelineVisual) -> CGFloat {
        CGFloat(visual.onset - PlaybackTiming.firstBeat) * ChordTimelinePresentation.pointsPerBeat
    }

    func width(for visual: MelodyTimelineVisual) -> CGFloat {
        CGFloat(visual.duration) * ChordTimelinePresentation.pointsPerBeat
    }

    func y(for visual: MelodyTimelineVisual) -> CGFloat {
        Self.laneHeight / 2 - CGFloat(visual.staffDegree) * noteHeight
    }

    func translation(containerWidth: CGFloat, currentBeat: Double) -> CGFloat {
        containerWidth / 2 - CGFloat(currentBeat - PlaybackTiming.firstBeat) * ChordTimelinePresentation.pointsPerBeat
    }

    func x(for visual: MelodyTimelineVisual, containerWidth: CGFloat, currentBeat: Double) -> CGFloat {
        translation(containerWidth: containerWidth, currentBeat: currentBeat) + localX(for: visual)
    }
}

private struct MelodyTimelineView: View {
    let section: ExtractedSection
    let currentBeat: Double
    let usesRelativeIonianContext: Bool
    let isPlaying: Bool
    let seekGeneration: Int
    let isSeekEnabled: Bool
    let onSeek: (Double) -> Void
    let onDragStart: () -> Void
    let onDragChange: (CGFloat, Date) -> Void
    let onDragEnd: () -> Void
    let onDragCancel: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var displayedBeat: Double?
    @State private var dragIsActive = false
    @GestureState private var dragGestureIsRecognized = false

    init(
        section: ExtractedSection,
        currentBeat: Double,
        usesRelativeIonianContext: Bool,
        isPlaying: Bool = false,
        seekGeneration: Int = 0,
        isSeekEnabled: Bool = false,
        onSeek: @escaping (Double) -> Void = { _ in },
        onDragStart: @escaping () -> Void = {},
        onDragChange: @escaping (CGFloat, Date) -> Void = { _, _ in },
        onDragEnd: @escaping () -> Void = {},
        onDragCancel: @escaping () -> Void = {}
    ) {
        self.section = section
        self.currentBeat = currentBeat
        self.usesRelativeIonianContext = usesRelativeIonianContext
        self.isPlaying = isPlaying
        self.seekGeneration = seekGeneration
        self.isSeekEnabled = isSeekEnabled
        self.onSeek = onSeek
        self.onDragStart = onDragStart
        self.onDragChange = onDragChange
        self.onDragEnd = onDragEnd
        self.onDragCancel = onDragCancel
    }

    private var presentation: MelodyTimelinePresentation {
        MelodyTimelinePresentation(
            section: section,
            usesRelativeIonianContext: usesRelativeIonianContext
        )
    }

    var body: some View {
        GeometryReader { proxy in
            let visualBeat = displayedBeat ?? currentBeat
            let translation = presentation.translation(
                containerWidth: proxy.size.width,
                currentBeat: visualBeat
            )

            ZStack(alignment: .topLeading) {
                ZStack(alignment: .topLeading) {
                    ForEach(presentation.visuals) { visual in
                        if presentation.width(for: visual) > 0 {
                            Rectangle()
                                .fill(
                                    visual.isActive(at: currentBeat)
                                        ? Color.indigo
                                        : Color.indigo.opacity(0.6)
                                )
                                .frame(
                                    width: presentation.width(for: visual),
                                    height: presentation.noteHeight
                                )
                                .offset(
                                    x: presentation.localX(for: visual),
                                    y: presentation.y(for: visual)
                                )
                        }
                    }
                }
                .frame(
                    width: proxy.size.width,
                    height: proxy.size.height,
                    alignment: .topLeading
                )
                .transaction { $0.animation = nil }
                .offset(x: translation)

                Rectangle()
                    .fill(.white)
                    .frame(width: 2, height: MelodyTimelinePresentation.laneHeight)
                    .offset(x: proxy.size.width / 2 - 1)
                    .accessibilityHidden(true)
            }
            .frame(
                width: proxy.size.width,
                height: proxy.size.height,
                alignment: .topLeading
            )
            .contentShape(Rectangle())
            .gesture(
                SpatialTapGesture()
                    .onEnded { value in
                        guard isSeekEnabled else { return }
                        let targetBeat = visualBeat + Double(
                            (value.location.x - proxy.size.width / 2)
                                / ChordTimelinePresentation.pointsPerBeat
                        )
                        onSeek(targetBeat)
                    }
                    .exclusively(before:
                        DragGesture(minimumDistance: 6, coordinateSpace: .local)
                            .updating($dragGestureIsRecognized) { _, recognized, _ in
                                recognized = true
                            }
                            .onChanged { value in
                                guard isSeekEnabled else { return }
                                if !dragIsActive {
                                    dragIsActive = true
                                    onDragStart()
                                }
                                onDragChange(value.translation.width, value.time)
                            }
                            .onEnded { value in
                                guard dragIsActive else { return }
                                onDragChange(value.translation.width, value.time)
                                dragIsActive = false
                                onDragEnd()
                            }
                    )
            )
        }
        .background(.black.opacity(0.3), in: RoundedRectangle(cornerRadius: 12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue("Beat \(currentBeat.formatted(.number.precision(.fractionLength(0...2))))")
        .accessibilityHint(
            isSeekEnabled
                ? "Swipe up or down to move one beat."
                : "Seeking is unavailable while this section is loading."
        )
        .accessibilityAdjustableAction { direction in
            guard isSeekEnabled else { return }
            switch direction {
            case .increment:
                onSeek(currentBeat + 1)
            case .decrement:
                onSeek(currentBeat - 1)
            @unknown default:
                break
            }
        }
        .onAppear { displayedBeat = currentBeat }
        .onDisappear { cancelActiveDragIfNeeded() }
        .onChange(of: dragGestureIsRecognized) { wasRecognized, isRecognized in
            if wasRecognized, !isRecognized {
                cancelActiveDragIfNeeded()
            }
        }
        .onChange(of: currentBeat) { oldBeat, newBeat in
            updateDisplayedBeat(from: oldBeat, to: newBeat)
        }
        .onChange(of: seekGeneration) { _, _ in
            updateDisplayedBeatImmediately()
        }
        .onChange(of: isPlaying) { _, isPlaying in
            guard !isPlaying else { return }
            updateDisplayedBeatImmediately()
        }
        .onChange(of: reduceMotion) { _, reduceMotion in
            guard reduceMotion else { return }
            updateDisplayedBeatImmediately()
        }
        .onChange(of: section.id) { _, _ in
            cancelActiveDragIfNeeded()
            updateDisplayedBeatImmediately()
        }
    }

    private var accessibilityLabel: String {
        let notes = presentation.visuals.count
        let rests = presentation.restCount
        let noteNoun = notes == 1 ? "note" : "notes"
        let restPhrase = rests == 1 ? "rest is" : "rests are"
        let eventText = "\(notes) pitched \(noteNoun)"
        let restText = rests == 0 ? "gaps are blank" : "\(rests) \(restPhrase) blank"
        let beatText = currentBeat.formatted(.number.precision(.fractionLength(0...2)))
        let activePitches = presentation.visuals
            .filter { $0.isActive(at: currentBeat) }
            .map(\.accessibilityPitch)
        let activeText = activePitches.isEmpty
            ? "No active note"
            : "Active pitches \(activePitches.joined(separator: ", "))"
        return "Melody timeline. \(eventText); \(restText). \(activeText). Current beat \(beatText)"
    }

    private func updateDisplayedBeat(from oldBeat: Double, to newBeat: Double) {
        if isPlaying, !reduceMotion, newBeat > oldBeat {
            withAnimation(.linear(duration: ChordTimelinePresentation.defaultProgressAnimationDuration)) {
                displayedBeat = newBeat
            }
        } else {
            updateDisplayedBeatImmediately()
        }
    }

    private func updateDisplayedBeatImmediately() {
        var transaction = Transaction()
        transaction.animation = nil
        withTransaction(transaction) {
            displayedBeat = currentBeat
        }
    }

    private func cancelActiveDragIfNeeded() {
        guard dragIsActive else { return }
        dragIsActive = false
        onDragCancel()
    }
}

struct ChordTimelineVisual: Identifiable, Equatable {
    let sourceIndex: Int
    let onset: Double
    let duration: Double
    let display: RomanNumeralDisplay?
    let isRest: Bool

    var id: Int { sourceIndex }

    func isActive(at beat: Double) -> Bool {
        duration > 0 && beat >= onset && beat < onset + duration
    }

    var accessibilityDescription: String {
        if isRest { return "Rest" }
        return display?.accessibilityLabel ?? "Chord"
    }
}

struct ChordTimelinePresentation: Equatable {
    static let pointsPerBeat: CGFloat = 60
    static let laneHeight: CGFloat = 40
    static let defaultProgressAnimationDuration = 0.12

    let visuals: [ChordTimelineVisual]

    init(section: ExtractedSection) {
        visuals = section.chords.enumerated().map { sourceIndex, chord in
            let onset = PlaybackTiming.normalize(beat: chord["beat"]?.doubleValue ?? 1)
            let duration = chord["duration"]?.doubleValue ?? 1
            let isRest = chord["isRest"]?.boolValue == true || chord["rest"]?.boolValue == true
            let display: RomanNumeralDisplay?
            if isRest {
                display = nil
            } else {
                let onsetKey = section.key(at: onset)
                let symbol = ChordInterpreter.romanSymbol(for: chord, key: onsetKey)
                display = RomanNumeralDisplay(symbol: symbol, borrowed: chord["borrowed"])
            }
            return ChordTimelineVisual(
                sourceIndex: sourceIndex,
                onset: onset,
                duration: duration,
                display: display,
                isRest: isRest
            )
        }
        .sorted {
            $0.onset == $1.onset ? $0.sourceIndex < $1.sourceIndex : $0.onset < $1.onset
        }
    }

    func localX(for visual: ChordTimelineVisual) -> CGFloat {
        CGFloat(visual.onset - PlaybackTiming.firstBeat) * Self.pointsPerBeat
    }

    func width(for visual: ChordTimelineVisual) -> CGFloat {
        max(CGFloat(visual.duration) * Self.pointsPerBeat, 0)
    }

    func translation(containerWidth: CGFloat, currentBeat: Double) -> CGFloat {
        containerWidth / 2 - CGFloat(currentBeat - PlaybackTiming.firstBeat) * Self.pointsPerBeat
    }

    func x(for visual: ChordTimelineVisual, containerWidth: CGFloat, currentBeat: Double) -> CGFloat {
        translation(containerWidth: containerWidth, currentBeat: currentBeat) + localX(for: visual)
    }

    func activeVisual(at beat: Double) -> ChordTimelineVisual? {
        visuals.last(where: { $0.isActive(at: beat) })
    }

    static func progressAnimationDuration(reduceMotion: Bool) -> Double? {
        reduceMotion ? nil : defaultProgressAnimationDuration
    }
}

private struct ChordTimelineView: View {
    let section: ExtractedSection
    let currentBeat: Double
    let isPlaying: Bool
    let seekGeneration: Int
    let isSeekEnabled: Bool
    let onSeek: (Double) -> Void
    let onDragStart: () -> Void
    let onDragChange: (CGFloat, Date) -> Void
    let onDragEnd: () -> Void
    let onDragCancel: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var displayedBeat: Double?
    @State private var dragIsActive = false
    @GestureState private var dragGestureIsRecognized = false

    init(
        section: ExtractedSection,
        currentBeat: Double,
        isPlaying: Bool = false,
        seekGeneration: Int = 0,
        isSeekEnabled: Bool = false,
        onSeek: @escaping (Double) -> Void = { _ in },
        onDragStart: @escaping () -> Void = {},
        onDragChange: @escaping (CGFloat, Date) -> Void = { _, _ in },
        onDragEnd: @escaping () -> Void = {},
        onDragCancel: @escaping () -> Void = {}
    ) {
        self.section = section
        self.currentBeat = currentBeat
        self.isPlaying = isPlaying
        self.seekGeneration = seekGeneration
        self.isSeekEnabled = isSeekEnabled
        self.onSeek = onSeek
        self.onDragStart = onDragStart
        self.onDragChange = onDragChange
        self.onDragEnd = onDragEnd
        self.onDragCancel = onDragCancel
    }

    private var presentation: ChordTimelinePresentation {
        ChordTimelinePresentation(section: section)
    }

    var body: some View {
        GeometryReader { proxy in
            let active = presentation.activeVisual(at: currentBeat)
            let visualBeat = displayedBeat ?? currentBeat
            let translation = presentation.translation(
                containerWidth: proxy.size.width,
                currentBeat: visualBeat
            )

            ZStack(alignment: .topLeading) {
                ZStack(alignment: .topLeading) {
                    ForEach(presentation.visuals) { visual in
                        if presentation.width(for: visual) > 0 {
                            let isActive = active?.id == visual.id
                            RoundedRectangle(cornerRadius: 5)
                                .fill(isActive ? Color.indigo.opacity(0.82) : Color.white.opacity(0.16))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 5)
                                        .stroke(
                                            isActive ? Color.white : Color.white.opacity(0.42),
                                            lineWidth: isActive ? 2 : 1
                                        )
                                }
                                .overlay {
                                    if let display = visual.display {
                                        FittedRomanNumeral(
                                            display: display,
                                            maximumFontSize: 18,
                                            minimumFontSize: 8,
                                            color: .white
                                        )
                                        .padding(.horizontal, 2)
                                        .accessibilityHidden(true)
                                    }
                                }
                                .frame(
                                    width: presentation.width(for: visual),
                                    height: ChordTimelinePresentation.laneHeight
                                )
                                .offset(x: presentation.localX(for: visual))
                        }
                    }
                }
                .frame(
                    width: proxy.size.width,
                    height: proxy.size.height,
                    alignment: .topLeading
                )
                .transaction { $0.animation = nil }
                .offset(x: translation)

                Rectangle()
                    .fill(.white)
                    .frame(width: 2, height: ChordTimelinePresentation.laneHeight)
                    .offset(x: proxy.size.width / 2 - 1)
                    .accessibilityHidden(true)
            }
            .frame(
                width: proxy.size.width,
                height: proxy.size.height,
                alignment: .topLeading
            )
            .background(.black.opacity(0.3), in: RoundedRectangle(cornerRadius: 8))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .contentShape(Rectangle())
            .gesture(
                SpatialTapGesture()
                    .onEnded { value in
                        guard isSeekEnabled else { return }
                        let targetBeat = visualBeat + Double(
                            (value.location.x - proxy.size.width / 2)
                                / ChordTimelinePresentation.pointsPerBeat
                        )
                        onSeek(targetBeat)
                    }
                    .exclusively(before:
                        DragGesture(minimumDistance: 6, coordinateSpace: .local)
                            .updating($dragGestureIsRecognized) { _, recognized, _ in
                                recognized = true
                            }
                            .onChanged { value in
                                guard isSeekEnabled else { return }
                                if !dragIsActive {
                                    dragIsActive = true
                                    onDragStart()
                                }
                                onDragChange(value.translation.width, value.time)
                            }
                            .onEnded { value in
                                guard dragIsActive else { return }
                                onDragChange(value.translation.width, value.time)
                                dragIsActive = false
                                onDragEnd()
                            }
                    )
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabel(for: active))
            .accessibilityValue("Beat \(currentBeat.formatted(.number.precision(.fractionLength(0...2))))")
            .accessibilityHint(
                isSeekEnabled
                    ? "Swipe up or down to move one beat."
                    : "Seeking is unavailable while this section is loading."
            )
            .accessibilityAdjustableAction { direction in
                guard isSeekEnabled else { return }
                switch direction {
                case .increment:
                    onSeek(currentBeat + 1)
                case .decrement:
                    onSeek(currentBeat - 1)
                @unknown default:
                    break
                }
            }
        }
        .onAppear { displayedBeat = currentBeat }
        .onDisappear { cancelActiveDragIfNeeded() }
        .onChange(of: dragGestureIsRecognized) { wasRecognized, isRecognized in
            if wasRecognized, !isRecognized {
                cancelActiveDragIfNeeded()
            }
        }
        .onChange(of: currentBeat) { oldBeat, newBeat in
            updateDisplayedBeat(from: oldBeat, to: newBeat)
        }
        .onChange(of: seekGeneration) { _, _ in
            updateDisplayedBeatImmediately()
        }
        .onChange(of: isPlaying) { _, isPlaying in
            guard !isPlaying else { return }
            updateDisplayedBeatImmediately()
        }
        .onChange(of: reduceMotion) { _, reduceMotion in
            guard reduceMotion else { return }
            updateDisplayedBeatImmediately()
        }
        .onChange(of: section.id) { _, _ in
            cancelActiveDragIfNeeded()
            updateDisplayedBeatImmediately()
        }
    }

    private func accessibilityLabel(for active: ChordTimelineVisual?) -> String {
        let event = active?.accessibilityDescription ?? "No active chord"
        return "Chord timeline. \(event). Current beat \(currentBeat.formatted(.number.precision(.fractionLength(0...2))))"
    }

    private func updateDisplayedBeat(from oldBeat: Double, to newBeat: Double) {
        if isPlaying, !reduceMotion, newBeat > oldBeat {
            withAnimation(.linear(duration: ChordTimelinePresentation.defaultProgressAnimationDuration)) {
                displayedBeat = newBeat
            }
        } else {
            updateDisplayedBeatImmediately()
        }
    }

    private func updateDisplayedBeatImmediately() {
        var transaction = Transaction()
        transaction.animation = nil
        withTransaction(transaction) {
            displayedBeat = currentBeat
        }
    }

    private func cancelActiveDragIfNeeded() {
        guard dragIsActive else { return }
        dragIsActive = false
        onDragCancel()
    }
}

private struct TimelinePairPreview: View {
    @State private var currentBeat = 1.0
    @State private var isPlaying = false

    private let section = ExtractedSection(
        sectionName: "Timeline geometry preview",
        chords: [
            ["root": .number(1), "type": .number(5), "beat": .number(1), "duration": .number(2)],
            ["root": .number(5), "type": .number(5), "beat": .number(3), "duration": .number(2)],
            ["root": .number(6), "type": .number(5), "beat": .number(5), "duration": .number(2)]
        ],
        notes: .array([
            .object(["sd": .string("1"), "beat": .number(1), "duration": .number(2)]),
            .object(["sd": .string("5"), "beat": .number(2), "duration": .number(2)]),
            .object(["rest": .bool(true), "beat": .number(4), "duration": .number(1)]),
            .object(["sd": .string("6"), "beat": .number(5), "duration": .number(2)])
        ]),
        metadata: [
            "keys": .array([
                .object(["tonic": .string("E"), "scale": .string("major"), "beat": .number(1)])
            ])
        ]
    )

    var body: some View {
        VStack(spacing: 12) {
            VStack(spacing: 0) {
                MelodyTimelineView(
                    section: section,
                    currentBeat: currentBeat,
                    usesRelativeIonianContext: false,
                    isPlaying: isPlaying
                )
                .frame(height: MelodyTimelinePresentation.laneHeight)
                ChordTimelineView(section: section, currentBeat: currentBeat, isPlaying: isPlaying)
                    .frame(height: ChordTimelinePresentation.laneHeight)
            }
            Toggle("Playing", isOn: $isPlaying)
            Slider(value: $currentBeat, in: 1...7, step: 0.25) {
                Text("Current beat")
            }
        }
        .padding()
    }
}

#Preview("Timeline Pair") {
    TimelinePairPreview()
        .preferredColorScheme(.dark)
}
