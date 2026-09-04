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
        .task(id: songID) { await load() }
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
            set: { selectedSectionID = $0 }
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
            selectedSectionID = document.orderedSections.first?.key
            state = .content(document)
        } catch {
            state = .failure(error.localizedDescription)
        }
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
    @State private var mode: QuizDisplayMode = .full
    @State private var progress = 0.0
    @State private var playing = false
    @State private var error: String?
    @State private var usesRelativeIonianContext = false
    @State private var tempoPercent = 100.0

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
        .task { await observeTransport() }
        .onDisappear { cancelSectionLoad() }
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
        selectedSectionID = id
        progress = 0
        scheduleSectionLoad(selected.section, id: selected.id, position: .restart)
    }

    private func fullQuiz(_ section: ExtractedSection, sectionID: String) -> some View {
        VStack(spacing: 20) {
            MelodyTimelineView(section: section, progress: progress)
                .frame(height: 120)
                .accessibilityIdentifier("quiz.timeline")
                .accessibilityLabel("Melody timeline, \(Int(progress * 100)) percent")
            chordCard(section)
                .accessibilityIdentifier("quiz.chordCard")
            Button(playing ? "Pause" : "Play", systemImage: playing ? "pause.fill" : "play.fill") {
                Task { await togglePlayback() }
            }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("quiz.play")
            VStack(spacing: 6) {
                HStack {
                    LabeledContent("Tempo", value: "\(Int(tempoPercent))%")
                    Spacer()
                    Button("Reset") { tempoPercent = 100 }
                        .accessibilityIdentifier("quiz.tempoReset")
                        .disabled(tempoPercent == 100)
                }
                Slider(value: $tempoPercent, in: 0...200, step: 1)
                    .accessibilityIdentifier("quiz.tempo")
                    .accessibilityLabel("Quiz tempo")
                    .onChange(of: tempoPercent) { _, _ in
                        scheduleSectionLoad(section, id: sectionID, position: .preserveProgress)
                    }
            }
        }
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
        let metadataEnd = section.endBeat ?? 1
        let melodyEnd = section.melodyNotes.map { $0.beat + $0.duration }.max() ?? 1
        let audibleEnd = max(metadataEnd, melodyEnd)
        return 1 + min(max(progress, 0), 1) * max(audibleEnd - 1, 0)
    }

    private func togglePlayback() async {
        do {
            if playing {
                await environment.audio.pause()
            } else {
                try await environment.audio.play()
            }
            playing.toggle()
        } catch { self.error = error.localizedDescription }
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
            selectedSectionID = selected.key
            state = .content(document)
            scheduleSectionLoad(selected.section, id: selected.key, position: .restart)
        } catch { state = .failure(error.localizedDescription) }
    }

    private func scheduleSectionLoad(
        _ section: ExtractedSection,
        id: String,
        position: QuizLoadPosition
    ) {
        sectionLoadTask?.cancel()
        sectionLoadGeneration &+= 1
        let generation = sectionLoadGeneration
        let timeline = timeline(for: section)
        sectionLoadStatus = .loading(section.safeSectionName)

        sectionLoadTask = Task { @MainActor [environment] in
            do {
                try Task.checkCancellation()
                try await environment.audio.load(timeline, position: position)
                try Task.checkCancellation()
                guard isCurrentSectionLoad(generation, id: id) else { return }
                sectionLoadStatus = .ready(section.safeSectionName)
                sectionLoadTask = nil
            } catch is CancellationError {
                // A newer section superseded this load.
            } catch {
                guard isCurrentSectionLoad(generation, id: id) else { return }
                sectionLoadStatus = .failed(section.safeSectionName)
                self.error = error.localizedDescription
                sectionLoadTask = nil
            }
        }
    }

    private func isCurrentSectionLoad(_ generation: Int, id: String) -> Bool {
        sectionLoadGeneration == generation && selectedSectionID == id
    }

    private func cancelSectionLoad() {
        sectionLoadTask?.cancel()
        sectionLoadTask = nil
        sectionLoadGeneration &+= 1
        sectionLoadStatus = .idle
    }

    private func observeTransport() async {
        for await value in await environment.audio.states() {
            playing = value.phase == .playing || value.phase == .buffering
            let duration = value.duration.secondsValue
            progress = duration > 0 ? min(max(value.elapsed.secondsValue / duration, 0), 1) : 0
        }
    }

    private func timeline(for section: ExtractedSection) -> AcquiringAudio.QuizTimeline {
        let beatsPerSecond = max(section.bpm * tempoPercent / 100, 1) / 60
        let events = section.melodyNotes.compactMap { note -> QuizEvent? in
            guard !note.isRest else { return nil }
            let key = section.key(at: note.beat)
            let midi = MusicTheory.midiNote(scaleDegree: note.sd, octave: note.octave, key: key)
            return QuizEvent(
                onsetSeconds: max((note.beat - 1) / beatsPerSecond, 0),
                durationSeconds: max(note.duration / beatsPerSecond, 0.05),
                frequenciesHz: [MusicTheory.frequency(midi: Double(midi))],
                waveform: .sawtooth,
                gain: 1
            )
        }
        let metadataDuration = section.endBeat.map { max(($0 - 1) / beatsPerSecond, 0) } ?? 0
        let duration = events.map { $0.onsetSeconds + $0.durationSeconds }.max()
            ?? (metadataDuration > 0 ? metadataDuration : 1)
        return AcquiringAudio.QuizTimeline(durationSeconds: max(duration, 0.1), events: events)
    }
}

private enum QuizDisplayMode: String, CaseIterable, Hashable, Identifiable {
    case full
    case rootOnly

    var id: Self { self }

    var title: String {
        switch self {
        case .full: "Full"
        case .rootOnly: "Root-only"
        }
    }
}

private enum QuizSectionLoadStatus: Equatable {
    case idle
    case loading(String)
    case ready(String)
    case failed(String)

    var label: String {
        switch self {
        case .idle: "Preparing section"
        case let .loading(name): "Loading \(name)"
        case let .ready(name): "\(name) ready"
        case let .failed(name): "Couldn't load \(name)"
        }
    }
}

private struct QuizSection: Identifiable {
    let id: String
    let section: ExtractedSection
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

private struct MelodyTimelineView: View {
    let section: ExtractedSection
    let progress: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Canvas { context, size in
            let notes = section.melodyNotes.filter { !$0.isRest }
            let maxBeat = max(notes.map { $0.beat + $0.duration }.max() ?? 1, 1)
            for note in notes {
                let x = (note.beat - 1) / maxBeat * size.width
                let width = max(note.duration / maxBeat * size.width - 2, 3)
                let rect = CGRect(x: x, y: size.height * 0.3, width: width, height: size.height * 0.4)
                context.fill(Path(roundedRect: rect, cornerRadius: 3), with: .color(.indigo))
            }
            let cursorX = size.width * progress
            context.stroke(Path(CGRect(x: cursorX, y: 0, width: 1, height: size.height)), with: .color(.white), lineWidth: 2)
        }
        .animation(reduceMotion ? nil : .linear(duration: 0.12), value: progress)
        .background(.black.opacity(0.3), in: RoundedRectangle(cornerRadius: 12))
    }
}
