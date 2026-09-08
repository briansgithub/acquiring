import AcquiringAudio
import AcquiringCore
import Combine
import Foundation
import QuartzCore
import SwiftUI
import UIKit

struct SongDetailView: View {
    let songID: String
    let onOpenArtist: (CatalogSong) -> Void
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var state: FeatureState<SongDocument> = .loading
    @State private var tab: SongDetailTab = .info
    @State private var selectedSectionID: String?
    @State private var showsLetterNames = false
    @State private var audioError: String?
    @State private var showsAudioDiagnostics = false
    @State private var audioRecoveryTask: Task<Void, Never>?
    @State private var transitionPreviewTask: Task<Void, Never>?

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
                if case .content = state {
                    FavoriteSongButton(songID: songID, confirmationBelow: true)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { dismiss() } label: {
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
            audioRecoveryTask?.cancel()
            transitionPreviewTask?.cancel()
            environment.vocalPractice.cancelActivity()
            Task { await environment.audio.stop(channel: .preview) }
        }
        .alert("Audio", isPresented: audioAlertBinding) {
            Button("Share Audio Diagnostics") { showsAudioDiagnostics = true }
            Button("Reset Audio and Retry") {
                audioError = nil
                audioRecoveryTask?.cancel()
                audioRecoveryTask = Task { @MainActor in
                    do { try await environment.audio.resetAudioAndRetryPreview() }
                    catch is CancellationError { }
                    catch { audioError = error.localizedDescription }
                }
            }
            Button("OK", role: .cancel) { audioError = nil }
        } message: {
            Text([audioError, environment.audio.diagnostics.persistenceError].compactMap { $0 }.joined(separator: "\n"))
        }
        .sheet(isPresented: $showsAudioDiagnostics) {
            AudioDiagnosticsSheet(audio: environment.audio)
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
                        onPreview: { chord in preview(chord) },
                        onPreviewTone: { midi in previewTone(midi) },
                        onPreviewTransition: { transition in
                            previewTransition(transition, arpeggiates: false)
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
                environment.vocalPractice.cancelActivity()
                environment.vocalPractice.enterSong(songID: songID, sectionID: $0)
                selectedSectionID = $0
                let continuity = environment.rememberQuizSection(songID: songID, sectionID: $0)
                _ = environment.audio.beginQuizReplacement(
                    songID: songID,
                    sectionID: $0,
                    tempoPercent: continuity.tempoPercent,
                    soundConfiguration: continuity.playbackConfiguration.soundConfiguration
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
            environment.vocalPractice.enterSong(songID: songID, sectionID: selectedSectionID ?? firstSectionID)
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
        playPreview(
            midi: chord.notes,
            arpeggiates: arpeggiates,
            arpeggioStepMilliseconds: arpeggioStepMilliseconds
        )
    }

    private func previewTone(_ midi: Int) {
        playPreview(midi: [midi])
    }

    /// Plays a transition as the two chords in order. `AppAudioSystem.play` returns once the buffer
    /// is scheduled rather than when it finishes, and each call invalidates the previous preview
    /// generation, so the second chord has to wait out the first — the same shape as
    /// `playQuizCardPreview`'s note groups.
    private func previewTransition(_ transition: ChordTransition, arpeggiates: Bool) {
        let chords = [transition.from, transition.to].filter { !$0.notes.isEmpty }
        guard !chords.isEmpty else { return }
        transitionPreviewTask?.cancel()
        environment.vocalPractice.cancelActivity()
        let arpeggioStepMilliseconds = 80
        transitionPreviewTask = Task {
            do {
                for (index, chord) in chords.enumerated() {
                    try Task.checkCancellation()
                    try await environment.audio.play(
                        PreviewRequest(
                            frequenciesHz: chord.notes.map { MusicTheory.frequency(midi: Double($0)) },
                            duration: .milliseconds(450),
                            arpeggiates: arpeggiates,
                            arpeggioStep: .milliseconds(arpeggioStepMilliseconds),
                            waveform: .clarinet
                        )
                    )
                    if index < chords.count - 1 {
                        let spread = arpeggiates ? arpeggioStepMilliseconds * max(chord.notes.count - 1, 0) : 0
                        try await Task.sleep(for: .milliseconds(450 + spread))
                    }
                }
            } catch is CancellationError {
            } catch {
                audioError = error.localizedDescription
            }
        }
    }

    private func playPreview(
        midi: [Int],
        arpeggiates: Bool = false,
        arpeggioStepMilliseconds: Int = 80
    ) {
        environment.vocalPractice.cancelActivity()
        Task {
            do {
                try await environment.audio.play(
                    PreviewRequest(
                        frequenciesHz: midi.map { MusicTheory.frequency(midi: Double($0)) },
                        duration: .milliseconds(450),
                        arpeggiates: arpeggiates,
                        arpeggioStep: .milliseconds(arpeggioStepMilliseconds),
                        waveform: .clarinet
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
                    if let complexity = song.complexityRating {
                        DetailRow(
                            "Complexity score",
                            "\(complexity.formatted(.number.precision(.fractionLength(0...1)))) / 100"
                        )
                    }
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
                    DetailRow("Song", "\(song.displayTitle) by \(song.displayArtist)")
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
    let onPreview: (SongDetailChord) -> Void
    let onPreviewTone: (Int) -> Void
    let onPreviewTransition: (ChordTransition) -> Void
    @State private var selectedChordID: String?
    @State private var rootOnlyTransitions = false

    private var chords: [SongDetailChord] { SongDetailPresentation.uniqueChords(in: section) }
    private var key: KeyInfo { section.keys.first?.key ?? KeyInfo(tonic: "C", scale: "major") }

    /// The most recently tapped chord, falling back to the first of the inventory so the
    /// tone row is populated on arrival. Resolving by id also drops a stale selection when
    /// the section changes underneath us.
    private var selectedChord: SongDetailChord? {
        chords.first { $0.id == selectedChordID } ?? chords.first
    }

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
                chordTones

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
                            let isSelected = chord.id == selectedChord?.id
                            Button {
                                selectedChordID = chord.id
                                onPreview(chord)
                            } label: {
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
                                .overlay {
                                    RoundedRectangle(cornerRadius: 12)
                                        .strokeBorder(.tint, lineWidth: isSelected ? 2 : 0)
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Play \(chord.letter.isEmpty ? chord.roman : chord.letter)")
                            .accessibilityAddTraits(isSelected ? [.isSelected] : [])
                        }
                    }

                    ChordTransitionsSection(
                        section: section,
                        showsLetterNames: showsLetterNames,
                        rootOnly: $rootOnlyTransitions,
                        onPlay: onPreviewTransition
                    )
                }
            }
            .padding()
        }
        .onChange(of: section) { _, _ in selectedChordID = nil }
        .accessibilityIdentifier("songDetail.chords")
    }

    /// The selected chord's tones, sharing the quiz cards' labeling and wrapping.
    /// Tap previews one tone; sing-back and persistent practice stay quiz-only.
    @ViewBuilder
    private var chordTones: some View {
        if let chord = selectedChord, !chord.notes.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Chord tones · \(chord.letter.isEmpty ? chord.roman : chord.letter)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ChordToneCardLayout(tones: chord.notes, labels: chord.toneLabels) { index, tone, label in
                    ChordTonePreviewCard(label: label, index: index) { onPreviewTone(tone) }
                }
            }
            .accessibilityIdentifier("songDetail.chords.tones")
        }
    }
}

private struct ChordTonePreviewCard: View {
    let label: String
    let index: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            FittedScaleDegree(label, maximumFontSize: 28, minimumFontSize: 11, color: .white)
                .frame(maxWidth: .infinity, minHeight: 34)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(.tint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Play chord tone \(label)")
        .accessibilityHint("Plays a preview")
        .accessibilityIdentifier("songDetail.chords.tone.\(index)")
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

struct SongDetailChord: Identifiable {
    let id: String
    let source: [String: JSONValue]
    let beat: Double
    let key: KeyInfo
    let isRest: Bool
    let roman: String
    let letter: String
    let notes: [Int]
    /// Reference root for degree labels, so an inverted chord still labels from its root.
    let rootPositionRootMIDI: Int?
    let toneLabels: [String]
}

enum SongDetailPresentation {
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
                notes: [],
                rootPositionRootMIDI: nil,
                toneLabels: []
            )
        }
        let interpreted = ChordInterpreter.interpret(chord, key: key)
        let roman = interpreted.roman
        let displayRoman = roman.isEmpty || roman == "Rest" ? "—" : roman
        return SongDetailChord(
            id: id,
            source: chord,
            beat: beat,
            key: key,
            isRest: false,
            roman: displayRoman,
            letter: interpreted.letter,
            notes: interpreted.midi,
            rootPositionRootMIDI: interpreted.rootMidi,
            toneLabels: interpreted.toneLabels
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
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(QuizNavigationPreference.edgeSwipeBackKey, store: QuizNavigationPreference.defaults)
    private var enablesEdgeSwipeBack = false
    @State private var state: FeatureState<SongDocument> = .loading
    @State private var selectedSectionID: String?
    @State private var sectionLoadTask: Task<Void, Never>?
    @State private var sectionLoadGeneration = 0
    @State private var sectionLoadStatus: QuizSectionLoadStatus = .idle
    @State private var activeQuizRevision: UInt64?
    @State private var playbackOwner: AppAudioSystem.QuizPlaybackOwner?
    @State private var restartLoadRevision: UInt64?
    @State private var transportObservationGeneration = 0
    @State private var mode: QuizDisplayMode = .full
    @State private var progress = 0.0
    @State private var transportSampleTimestamp = CACurrentMediaTime()
    @State private var transportPhase: TransportPhase = .stopped
    @State private var playbackCommandPending = false
    @State private var playbackCommandTask: Task<Void, Never>?
    @State private var seekGeneration = 0
    @State private var timelineScrub: QuizTimelineScrub?
    @State private var timelineInertiaTask: Task<Void, Never>?
    @State private var timelineInertiaGeneration = 0
    @State private var error: String?
    @State private var showsAudioDiagnostics = false
    @State private var isNavigationTitleExpanded = false
    @State private var usesRelativeIonianContext = false
    @Environment(\.quizHelpState) private var quizHelp
    @State private var tempoPercent = 100.0
    @State private var soundConfiguration = QuizSoundConfiguration()
    @State private var quizCardPreviewTask: Task<Void, Never>?
    @State private var quizCardPreviewGeneration = 0
    @State private var practiceTargets: QuizPracticeTargets?
    @State private var notationFontStyle: QuizNotationFontStyle = .palatino

    // Retain the temporary sampler for future comparisons, hidden in normal use.
    private let showsFontSampler = ProcessInfo.processInfo.arguments.contains("--preview-notation-fonts")

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
        .navigationTitle(navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .simultaneousGesture(
            TapGesture().onEnded {
                if isNavigationTitleExpanded {
                    isNavigationTitleExpanded = false
                }
            }
        )
        .overlay(alignment: .top) {
            if isNavigationTitleExpanded {
                Text(navigationTitle)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(maxWidth: 680)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .shadow(color: .black.opacity(0.12), radius: 6, y: 3)
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier("quiz.songTitle.expanded")
            }
        }
        .background(QuizNavigationGestureGuard(enablesEdgeSwipeBack: enablesEdgeSwipeBack))
        .quizNotationFontStyle(notationFontStyle)
        .toolbar {
            ToolbarItem(placement: .principal) {
                if case .content = state {
                    Button { isNavigationTitleExpanded = true } label: {
                        Text(navigationTitle)
                            .font(.headline)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(navigationTitle)
                    .accessibilityHint("Shows the full song title and artist. Tap the screen to collapse it.")
                    .accessibilityIdentifier("quiz.songTitle")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if showsFontSampler, case .content = state {
                    QuizFontSamplerMenu(selection: $notationFontStyle)
                        .equatable()
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                }
            }
        }
        .task(id: songID) { await load() }
        .task(id: transportObservationGeneration) { await observeTransport() }
        .onDisappear {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                environment.vocalPractice.leaveQuiz()
            }
            cancelPlaybackCommand()
            finishTimelineScrub(resumingIfNeeded: false)
            cancelSectionLoad()
            if let revision = activeQuizRevision, let playbackOwner {
                _ = environment.audio.cancelQuizCardPreview(revision: revision, owner: playbackOwner)
                _ = environment.audio.pauseQuizForLifecycle(revision: revision, owner: playbackOwner)
            }
            playbackOwner = nil
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                activatePlaybackOwnerIfReady()
            } else {
                cancelPlaybackCommand()
                finishTimelineScrub(resumingIfNeeded: false)
                playbackOwner = nil
            }
        }
        .onChange(of: usesRelativeIonianContext) { _, enabled in
            cancelQuizCardPreview()
            environment.vocalPractice.handleTransportDiscontinuity()
            environment.rememberQuizSettings(
                songID: songID,
                usesRelativeIonianContext: enabled
            )
        }
        .onChange(of: soundConfiguration) { _, _ in updatePracticeContext() }
        .onChange(of: environment.quizInstrument.selection) { _, waveform in
            guard waveform != soundConfiguration.waveform,
                  let sectionID = selectedSectionID
            else { return }
            _ = setSoundConfiguration(
                soundConfiguration.replacing(waveform: waveform),
                sectionID: sectionID
            )
        }
        .onChange(of: transportPhase) { _, _ in updatePracticeContext() }
        // Scrub start and end have to reach the practice model the moment they happen: a drag
        // sweeps the playhead across runs the singer never sang, and the model suppresses
        // scoring only while it knows a scrub is in progress.
        .onChange(of: timelineScrub != nil) { _, _ in updatePracticeContext() }
        .alert("Audio", isPresented: errorAlertBinding) {
            Button("Share Audio Diagnostics") { showsAudioDiagnostics = true }
            Button("Reset Audio and Retry") { requestAudioRecovery() }
            Button("OK", role: .cancel) { error = nil }
        } message: {
            Text([error, environment.audio.diagnostics.persistenceError].compactMap { $0 }.joined(separator: "\n"))
        }
        .sheet(isPresented: $showsAudioDiagnostics) {
            AudioDiagnosticsSheet(audio: environment.audio)
        }
    }

    private var errorAlertBinding: Binding<Bool> {
        Binding(
            get: { error != nil },
            set: { if !$0 { error = nil } }
        )
    }

    private var navigationTitle: String {
        guard case let .content(document) = state else { return "Quiz" }
        return "\(document.song.displayTitle) by \(document.song.displayArtist)"
    }

    private func quiz(_ document: SongDocument) -> some View {
        let sections = document.orderedSections.map { QuizSection(id: $0.key, section: $0.section) }
        let selected = sections.first(where: { $0.id == selectedSectionID }) ?? sections.first

        return GeometryReader { viewport in
            // Keep fixed-size cards reachable when the expanded dock leaves less
            // room. Only the dashboard scrolls; transport stays above the dock.
            let maximumControlType: DynamicTypeSize = viewport.size.height >= 760 ? .xxxLarge : .large
            Group {
                VStack(spacing: 4) {
                    if let selected {
                        QuizHeader(
                            initialKey: selected.section.key(at: PlaybackTiming.firstBeat),
                            currentKey: selected.section.key(at: currentBeat(in: selected.section)),
                            usesRelativeIonianContext: $usesRelativeIonianContext,
                            quizHelp: quizHelp,
                            monitoringSelection: mode == .rootOnly ? .simpleRoot : .melody
                        )

                        ViewThatFits(in: .vertical) {
                            quizSurface(selected.section, sectionID: selected.id)
                                .fixedSize(horizontal: false, vertical: true)
                            ScrollView {
                                quizSurface(selected.section, sectionID: selected.id)
                            }
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            .dynamicTypeSize(...maximumControlType)
        }
        // Reserve the visible transport rows before measuring the dashboard viewport.
        // The parent scene reserves the separate, expandable singing dock.
        .safeAreaInset(edge: .bottom, spacing: 4) {
            if let selected {
                HStack {
                    transportControls(sectionID: selected.id, sections: sections)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
                .background(.bar)
                .dynamicTypeSize(...DynamicTypeSize.large)
            }
        }
    }

    private func sectionBinding(sections: [QuizSection]) -> Binding<String> {
        Binding(
            get: { selectedSectionID ?? sections.first?.id ?? "" },
            set: { selectSection($0, sections: sections) }
        )
    }

    private func setMode(_ newMode: QuizDisplayMode, sectionID: String) {
        guard mode != newMode,
              sectionLoadStatus.isReady,
              sectionLoadTask == nil,
              !playbackCommandPending,
              transportPhase != .buffering,
              selectedSectionID == sectionID
        else { return }
        cancelQuizCardPreview()
        environment.vocalPractice.stopPersistentPractice()
        environment.vocalPractice.handleTransportDiscontinuity()
        let configuration = QuizSoundConfiguration(
            waveform: soundConfiguration.waveform,
            melodyChordBalance: soundConfiguration.melodyChordBalance,
            transposeSemitones: soundConfiguration.transposeSemitones,
            arpeggioOption: soundConfiguration.arpeggioOption,
            chordMode: newMode == .full ? .full : .rootOnly
        )
        guard setSoundConfiguration(configuration, sectionID: sectionID) else { return }
        mode = newMode
        environment.rememberQuizSettings(songID: songID, mode: newMode)
    }

    private func selectSection(
        _ id: String,
        sections: [QuizSection]
    ) {
        guard let selected = sections.first(where: { $0.id == id }) else { return }
        guard selectedSectionID != id else { return }
        cancelQuizCardPreview()
        finishTimelineScrub(resumingIfNeeded: false)
        cancelPlaybackCommand()
        environment.vocalPractice.cancelActivity()
        environment.vocalPractice.enterSong(songID: songID, sectionID: id)
        practiceTargets = nil
        selectedSectionID = id
        environment.rememberQuizSection(songID: songID, sectionID: id)
        progress = 0
        scheduleSectionLoad(selected.section, id: selected.id, position: .restart)
    }

    private func quizSurface(
        _ section: ExtractedSection,
        sectionID: String
    ) -> some View {
        let beat = currentBeat(in: section)
        return VStack(spacing: 4) {
                if mode == .full {
                    QuizTimelinePairView(
                    section: section,
                    sectionID: sectionID,
                    currentBeat: beat,
                    sourceTimestamp: transportSampleTimestamp,
                    endBeat: playbackEndBeat(in: section),
                    tempoPercent: tempoPercent,
                    usesRelativeIonianContext: usesRelativeIonianContext,
                    isPlaying: transportPhase == .playing && timelineScrub == nil,
                    seekGeneration: seekGeneration,
                    isSeekEnabled: canSeek,
                    onSeek: { requestTimelineTap(to: $0, in: section) },
                    onDragStart: { beginTimelineDrag(in: section, sectionID: sectionID) },
                    onDragChange: updateTimelineDrag,
                    onDragEnd: endTimelineDrag,
                    onDragCancel: cancelTimelineDrag
                    )
                    .environment(\.quizLaneTint, laneTint(in: section, at: beat))
                }
                quizCards(section: section, sectionID: sectionID, beat: beat)
                if mode != .full {
                    rootOnlySeekControl(section: section, sectionID: sectionID)
                }
                playbackKnobs(sectionID: sectionID)
        }
        .frame(maxWidth: .infinity, alignment: .top)
    }

    /// The lanes are a lighter wash of whatever color the key readout above them is
    /// wearing. Locking in major retunes the readout's own reference key, so the
    /// lanes follow major rather than the source mode they were written in.
    private func laneTint(in section: ExtractedSection, at beat: Double) -> Color {
        QuizModeColor.lane(for: usesRelativeIonianContext ? "major" : section.key(at: beat).scale)
    }

    private func quizCards(
        section: ExtractedSection,
        sectionID: String,
        beat: Double
    ) -> some View {
        QuizCardsView(
                section: section,
                beat: beat,
                rootOnly: mode == .rootOnly,
                usesRelativeIonianContext: usesRelativeIonianContext,
                isPreviewEnabled: sectionLoadStatus.isReady && timelineScrub == nil,
                compact: true,
                isTessituraEnabled: environment.vocalPractice.comfortablePitchMIDI != nil,
                onPreview: { midiNotes, duration in
                    requestQuizCardPreview(midiNotes: midiNotes, duration: duration)
                },
                onIntervalPreview: { midiNotes in
                    requestQuizCardPreview(
                        midiNotes: midiNotes,
                        asInterval: true,
                        duration: .milliseconds(450)
                    )
                },
                onSingBack: { request in
                    cancelQuizCardPreview()
                    cancelPlaybackCommand()
                    finishTimelineScrub(resumingIfNeeded: false)
                    environment.vocalPractice.requestSingBack(request)
                },
                onPracticeContext: { targets in
                    practiceTargets = targets
                    updatePracticeContext()
                }
            )
            .frame(maxWidth: .infinity)
    }

    private func transportControls(sectionID: String, sections: [QuizSection]) -> some View {
        VStack(spacing: QuizTransportLayout.spacing) {
            HStack(spacing: QuizTransportLayout.spacing) {
                FavoriteSongButton(songID: songID)
                    .buttonStyle(QuizIconButtonStyle())
                instrumentSelector(sectionID: sectionID)
                transposeSelector(sectionID: sectionID)
                Button(action: requestPlaybackReset) {
                    Image(systemName: "arrow.counterclockwise")
                }
                .buttonStyle(QuizIconButtonStyle())
                .disabled(!sectionLoadStatus.isReady || playbackCommandPending || transportPhase == .buffering)
                .accessibilityIdentifier("quiz.reset")
                .accessibilityLabel("Reset quiz playback")
                .accessibilityHint("Stops playback and returns to the beginning")
                QuizTransportButton(
                    phase: transportPhase,
                    isReady: sectionLoadStatus.isReady,
                    isPlaybackEnabled: tempoPercent > 0,
                    commandPending: playbackCommandPending || timelineScrub != nil,
                    action: requestPlaybackToggle,
                    compact: true
                )
            }
            if !environment.vocalPractice.isExpanded {
                HStack(spacing: QuizTransportLayout.spacing) {
                    NavigationLink(value: AppRoute.songDetail(songID)) {
                        Image(systemName: "info.circle")
                    }
                    .buttonStyle(QuizIconButtonStyle())
                    .accessibilityLabel("Song information")
                    .accessibilityIdentifier("quiz.info")
                    QuizSelectorMenu(
                        identityContext: "\(songID):\(sectionID):mode",
                        options: QuizDisplayMode.allCases.map {
                            QuizSelectorOption(id: $0.rawValue, title: $0.title)
                        },
                        selectedID: mode.rawValue,
                        caption: nil,
                        selectedDisplayTitle: mode == .full ? "Full" : "Root",
                        selectedAccessibilityValue: mode.title,
                        usesSubheadline: false,
                        width: QuizTransportLayout.modeSelectorWidth,
                        expandsToAvailableWidth: false,
                        accessibilityIdentifier: "quiz.mode",
                        accessibilityLabel: "Quiz mode",
                        isEnabled: sectionLoadStatus.isReady && !playbackCommandPending,
                        onSelect: { id in
                            guard let selectedMode = QuizDisplayMode(rawValue: id) else { return }
                            setMode(selectedMode, sectionID: sectionID)
                        }
                    )
                    QuizSelectorMenu(
                        identityContext: "\(songID):section",
                        options: sections.map {
                            QuizSelectorOption(id: $0.id, title: $0.section.safeSectionName)
                        },
                        selectedID: sectionID,
                        caption: nil,
                        selectedDisplayTitle: nil,
                        selectedAccessibilityValue: nil,
                        usesSubheadline: true,
                        width: nil,
                        expandsToAvailableWidth: true,
                        accessibilityIdentifier: "quiz.section",
                        accessibilityLabel: "Quiz section",
                        isEnabled: true,
                        onSelect: { id in selectSection(id, sections: sections) }
                    )
                    // Bottom-anchored menus otherwise place the first section nearest the trigger.
                    .menuOrder(.fixed)
                }
            }
        }
        .frame(width: QuizTransportLayout.width)
        .buttonStyle(.plain)
        .fixedSize(horizontal: false, vertical: true)
    }

    private func rootOnlySeekControl(section: ExtractedSection, sectionID: String) -> some View {
        let endBeat = playbackEndBeat(in: section)
        return VStack(alignment: .leading, spacing: 6) {
            Slider(
                value: Binding(
                    get: { currentBeat(in: section) },
                    set: { updateRootOnlySeek(to: $0, in: section, sectionID: sectionID) }
                ),
                in: PlaybackTiming.firstBeat...endBeat,
                onEditingChanged: { isEditing in
                    if isEditing {
                        cancelQuizCardPreview()
                        beginTimelineDrag(in: section, sectionID: sectionID)
                    } else {
                        finishTimelineScrub(resumingIfNeeded: true)
                    }
                }
            )
            .disabled(!canSeek || endBeat <= PlaybackTiming.firstBeat)
            .accessibilityIdentifier("quiz.rootSeek")
            .accessibilityLabel("Quiz position")
            .accessibilityValue("Beat \(currentBeat(in: section).formatted(.number.precision(.fractionLength(0...2))))")
            .accessibilityHint("Adjusts the current beat")
        }
    }

    private func updateRootOnlySeek(
        to targetBeat: Double,
        in section: ExtractedSection,
        sectionID: String
    ) {
        guard selectedSectionID == sectionID, canSeek else { return }
        cancelQuizCardPreview()
        if var scrub = timelineScrub,
           scrub.revision == activeQuizRevision,
           scrub.sectionID == sectionID {
            scrub.beat = seekTimelineScrub(to: targetBeat, scrub: scrub)
            timelineScrub = scrub
        } else {
            // VoiceOver can adjust a Slider without a begin/end editing pair.
            requestSeek(to: targetBeat, in: section)
        }
    }

    private func requestQuizCardPreview(
        midiNotes: [Int],
        asInterval: Bool = false,
        duration: Duration
    ) {
        guard !midiNotes.isEmpty,
              midiNotes.allSatisfy({ (0...127).contains($0) }),
              sectionLoadStatus.isReady,
              activeQuizRevision != nil,
              timelineScrub == nil
        else { return }
        environment.vocalPractice.cancelActivity()
        cancelQuizCardPreview()
        quizCardPreviewGeneration &+= 1
        let generation = quizCardPreviewGeneration
        quizCardPreviewTask = Task { @MainActor [environment] in
            defer {
                if quizCardPreviewGeneration == generation {
                    quizCardPreviewTask = nil
                }
            }
            do {
                try Task.checkCancellation()
                guard quizCardPreviewGeneration == generation else { return }
                try await environment.audio.playQuizCardPreview(
                    midiNotes: midiNotes,
                    asInterval: asInterval,
                    duration: duration
                )
            } catch is CancellationError {
            } catch {
                guard quizCardPreviewGeneration == generation else { return }
                self.error = error.localizedDescription
            }
        }
    }

    private func cancelQuizCardPreview() {
        quizCardPreviewGeneration &+= 1
        quizCardPreviewTask?.cancel()
        quizCardPreviewTask = nil
        environment.audio.cancelQuizCardPreview()
    }

    private func updatePracticeContext() {
        guard let targets = practiceTargets,
              let sectionID = selectedSectionID,
              case let .content(document) = state,
              let section = document.orderedSections.first(where: { $0.key == sectionID })?.section
        else { return }
        environment.vocalPractice.updateContext(
            songID: songID,
            sectionID: sectionID,
            transpose: soundConfiguration.transposeSemitones,
            root: targets.root,
            melody: targets.melody,
            chordTones: targets.chordTones,
            melodyRuns: targets.melodyRuns,
            isPlaying: transportPhase == .playing && timelineScrub == nil,
            isScrubbing: timelineScrub != nil,
            beat: currentBeat(in: section),
            // The same rate the timeline projects its playhead with, so the marker and the
            // run being scored underneath it advance together.
            beatsPerSecond: max(section.bpm, 1) / 60 * max(tempoPercent, 0) / 100,
            endBeat: playbackEndBeat(in: section)
        )
    }

    private func setTempo(
        _ newValue: Double,
        sectionID: String
    ) {
        let normalizedTempo = QuizPlaybackConfiguration.normalizedTempoPercent(newValue)
        guard tempoPercent != normalizedTempo else { return }
        cancelQuizCardPreview()
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

    private func instrumentSelector(sectionID: String) -> some View {
        QuizSelectorMenu(
                identityContext: "\(songID):\(sectionID):instrument",
                options: SynthWaveform.allCases.map { waveform in
                    QuizSelectorOption(
                        id: waveform.rawValue,
                        title: waveform.displayName,
                        groupTitle: [.sawtooth, .sine, .square, .triangle].contains(waveform)
                            ? "Waveforms"
                            : "Synths"
                    )
                },
                selectedID: soundConfiguration.waveform.rawValue,
                caption: nil,
                selectedDisplayTitle: "",
                selectedAccessibilityValue: soundConfiguration.waveform.displayName,
                usesSubheadline: false,
                systemImage: "pianokeys",
                width: 44,
                expandsToAvailableWidth: false,
                accessibilityIdentifier: "quiz.instrument",
                accessibilityLabel: "Quiz instrument",
                isEnabled: sectionLoadStatus.isReady && !playbackCommandPending && timelineScrub == nil,
                onSelect: { id in
                    guard let waveform = SynthWaveform(rawValue: id) else { return }
                    changeInstrument(waveform, sectionID: sectionID)
                }
            )
            .menuOrder(.fixed)
    }

    private func transposeSelector(sectionID: String) -> some View {
        QuizTransposeSelector(selectedValue: soundConfiguration.transposeSemitones) { semitones in
            changeTranspose(semitones, sectionID: sectionID)
        }
        .disabled(!sectionLoadStatus.isReady || playbackCommandPending || timelineScrub != nil)
    }

    private func changeInstrument(_ waveform: SynthWaveform, sectionID: String) {
        let didApply = setSoundConfiguration(
            QuizSoundConfiguration(
                waveform: waveform,
                melodyChordBalance: soundConfiguration.melodyChordBalance,
                transposeSemitones: soundConfiguration.transposeSemitones,
                arpeggioOption: soundConfiguration.arpeggioOption,
                chordMode: soundConfiguration.chordMode
            ),
            sectionID: sectionID
        )
        if didApply { environment.selectQuizInstrument(waveform) }
    }

    private func changeTranspose(_ semitones: Int, sectionID: String) {
        _ = setSoundConfiguration(
            QuizSoundConfiguration(
                waveform: soundConfiguration.waveform,
                melodyChordBalance: soundConfiguration.melodyChordBalance,
                transposeSemitones: min(max(semitones, -12), 12),
                arpeggioOption: soundConfiguration.arpeggioOption,
                chordMode: soundConfiguration.chordMode
            ),
            sectionID: sectionID
        )
    }

    private func playbackKnobs(sectionID: String) -> some View {
        HStack(alignment: .center, spacing: 6) {
            tempoKnob(sectionID: sectionID)
                .frame(width: 96)
            arpeggioKnob(sectionID: sectionID)
                .frame(width: 96)
            mixKnob(sectionID: sectionID)
                .frame(width: 96)
        }
        .disabled(!sectionLoadStatus.isReady || playbackCommandPending || timelineScrub != nil)
        .frame(maxWidth: .infinity)
    }

    private func tempoKnob(sectionID: String) -> some View {
        PlaybackKnob(
            title: "Tempo",
            value: Binding(
                get: { tempoPercent },
                set: { setTempo($0, sectionID: sectionID) }
            ),
            range: 0...200,
            valueLabel: tempoPercent == 0 ? "0% · Paused" : "\(Int(tempoPercent))%",
            accessibilityValue: tempoPercent == 0 ? "0 percent, playback paused" : "\(Int(tempoPercent)) percent",
            resetValue: 100,
            identifier: "quiz.tempo",
            compact: true
        )
    }

    private func arpeggioKnob(sectionID: String) -> some View {
        let options = QuizArpeggioOption.allCases
        return PlaybackKnob(
            title: "Arpeggiate",
            value: Binding(
                get: { Double(options.firstIndex(of: soundConfiguration.arpeggioOption) ?? 3) },
                set: { value in
                    guard value.isFinite else { return }
                    let index = Int(min(max(value.rounded(), 0), Double(options.count - 1)))
                    _ = setSoundConfiguration(
                        QuizSoundConfiguration(
                            waveform: soundConfiguration.waveform,
                            melodyChordBalance: soundConfiguration.melodyChordBalance,
                            transposeSemitones: soundConfiguration.transposeSemitones,
                            arpeggioOption: options[index],
                            chordMode: soundConfiguration.chordMode
                        ),
                        sectionID: sectionID
                    )
                }
            ),
            range: 0...Double(options.count - 1),
            valueLabel: soundConfiguration.arpeggioOption == .off
                ? "Off" : "\(soundConfiguration.arpeggioOption.displayName) cycles / beat",
            accessibilityValue: arpeggioAccessibilityValue(soundConfiguration.arpeggioOption),
            ringLabels: options.map { $0 == .off ? "Off" : $0.displayName },
            ringLabelRadius: 0.5,
            resetValue: Double(options.firstIndex(of: .off) ?? 3),
            identifier: "quiz.arpeggio",
            compact: true
        )
    }

    private func mixKnob(sectionID: String) -> some View {
        PlaybackKnob(
            title: "Mel. / Chord Mix",
            value: Binding(
                get: { soundConfiguration.melodyChordBalance },
                set: { balance in
                    _ = setSoundConfiguration(
                        QuizSoundConfiguration(
                            waveform: soundConfiguration.waveform,
                            melodyChordBalance: balance,
                            transposeSemitones: soundConfiguration.transposeSemitones,
                            arpeggioOption: soundConfiguration.arpeggioOption,
                            chordMode: soundConfiguration.chordMode
                        ),
                        sectionID: sectionID
                    )
                }
            ),
            range: 0...1,
            step: 0.01,
            valueLabel: balanceLabel(soundConfiguration.melodyChordBalance),
            showValueLabel: false,
            accessibilityValue: balanceAccessibilityValue(soundConfiguration.melodyChordBalance),
            resetValue: 0.5,
            identifier: "quiz.balance",
            compact: true
        )
    }

    private func arpeggioAccessibilityValue(_ option: QuizArpeggioOption) -> String {
        option == .off ? "Off" : "\(option.displayName) cycles per beat"
    }

    private func setSoundConfiguration(
        _ configuration: QuizSoundConfiguration,
        sectionID: String
    ) -> Bool {
        guard soundConfiguration != configuration else { return true }
        cancelQuizCardPreview()
        finishTimelineScrub(resumingIfNeeded: true)
        guard sectionLoadStatus.isReady,
              selectedSectionID == sectionID,
              let revision = activeQuizRevision,
              let updatedRevision = environment.audio.updateQuizSoundConfiguration(
                  songID: songID,
                  sectionID: sectionID,
                  soundConfiguration: configuration,
                  revision: revision
              )
        else {
            error = "The sound setting could not be applied. Reopen this song and try again."
            return false
        }
        soundConfiguration = configuration
        activeQuizRevision = updatedRevision
        environment.rememberQuizSettings(songID: songID, soundConfiguration: configuration)
        return true
    }

    private func balanceLabel(_ melodyBalance: Double) -> String {
        let melody = Int((melodyBalance * 100).rounded())
        return "\(melody) / \(100 - melody)"
    }

    private func balanceAccessibilityValue(_ melodyBalance: Double) -> String {
        let melody = Int((melodyBalance * 100).rounded())
        switch melody {
        case 0: return "0 percent melody, 100 percent chords, chords only"
        case 100: return "100 percent melody, 0 percent chords, melody only"
        default: return "\(melody) percent melody, \(100 - melody) percent chords"
        }
    }

    private func transposeNumber(_ semitones: Int) -> String {
        semitones > 0 ? "+\(semitones)" : "\(semitones)"
    }

    private func transposeLabel(_ semitones: Int) -> String {
        "\(transposeNumber(semitones)) semitones"
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
            && playbackOwner != nil
    }

    private func requestSeek(to targetBeat: Double, in section: ExtractedSection) {
        environment.vocalPractice.handleTransportDiscontinuity()
        guard canSeek, let revision = activeQuizRevision, let playbackOwner else { return }
        cancelQuizCardPreview()
        let endBeat = playbackEndBeat(in: section)
        let boundedBeat = min(max(targetBeat, PlaybackTiming.firstBeat), endBeat)
        let span = endBeat - PlaybackTiming.firstBeat
        guard span > 0 else { return }
        let targetProgress = (boundedBeat - PlaybackTiming.firstBeat) / span
        guard environment.audio.seekQuiz(
            to: targetProgress,
            revision: revision,
            owner: playbackOwner
        ) else { return }
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

    private func beginTimelineDrag(in section: ExtractedSection, sectionID: String) {
        guard canSeek, let revision = activeQuizRevision, let playbackOwner,
              selectedSectionID == sectionID else { return }

        cancelQuizCardPreview()
        environment.vocalPractice.handleTransportDiscontinuity()
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

        guard let shouldResume = environment.audio.pauseQuizForScrubbing(
            revision: revision,
            owner: playbackOwner
        ) else {
            return
        }
        timelineScrub = QuizTimelineScrub(
            revision: revision,
            owner: playbackOwner,
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
        guard environment.audio.seekQuiz(
            to: targetProgress,
            revision: scrub.revision,
            owner: scrub.owner
        ) else { return }
        progress = targetProgress
        seekGeneration &+= 1
        // Resume observation from the one committed engine position rather
        // than replaying transport samples captured before or during the drag.
        transportObservationGeneration &+= 1

        guard scrub.shouldResume else { return }
        do {
            try environment.audio.resumeQuizAfterScrubbing(
                revision: scrub.revision,
                owner: scrub.owner
            )
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

    private func requestAudioRecovery() {
        guard scenePhase == .active, sectionLoadStatus.isReady,
              let revision = activeQuizRevision, let playbackOwner else { return }
        error = nil
        cancelPlaybackCommand()
        playbackCommandPending = true
        playbackCommandTask = Task { @MainActor in
            defer {
                playbackCommandPending = false
                playbackCommandTask = nil
            }
            do { try await environment.audio.resetAudioAndRetryQuiz(revision: revision, owner: playbackOwner) }
            catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }

    private func requestPlaybackToggle() {
        guard sectionLoadStatus.isReady, !playbackCommandPending,
              tempoPercent > 0,
              transportPhase != .buffering,
              timelineScrub == nil,
              let revision = activeQuizRevision,
              let playbackOwner else { return }
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
                    await environment.audio.pauseQuiz(revision: revision, owner: playbackOwner)
                } else {
                    try await environment.audio.playQuiz(revision: revision, owner: playbackOwner)
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
              let revision = activeQuizRevision,
              let playbackOwner else { return }
        cancelQuizCardPreview()
        environment.vocalPractice.handleTransportDiscontinuity()
        environment.vocalPractice.clearMelodyRunScores()
        finishTimelineScrub(resumingIfNeeded: false)
        playbackCommandPending = true
        playbackCommandTask = Task { @MainActor in
            defer {
                playbackCommandPending = false
                playbackCommandTask = nil
            }
            guard !Task.isCancelled else { return }
            await environment.audio.resetQuiz(revision: revision, owner: playbackOwner)
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
            environment.vocalPractice.enterSong(songID: songID, sectionID: restored.key)
            mode = continuity.mode
            tempoPercent = continuity.tempoPercent
            let restoredSoundConfiguration = continuity.playbackConfiguration.soundConfiguration
            soundConfiguration = QuizSoundConfiguration(
                waveform: restoredSoundConfiguration.waveform,
                melodyChordBalance: restoredSoundConfiguration.melodyChordBalance,
                transposeSemitones: restoredSoundConfiguration.transposeSemitones,
                arpeggioOption: restoredSoundConfiguration.arpeggioOption,
                chordMode: continuity.mode == .full ? .full : .rootOnly
            )
            if soundConfiguration != restoredSoundConfiguration {
                environment.rememberQuizSettings(
                    songID: songID,
                    soundConfiguration: soundConfiguration
                )
            }
            usesRelativeIonianContext = continuity.usesRelativeIonianContext
            state = .content(document)
            if let revision = environment.audio.restorableQuizRevision(
                songID: songID,
                sectionID: restored.key,
                tempoPercent: tempoPercent,
                soundConfiguration: soundConfiguration
            ) {
                activeQuizRevision = revision
                sectionLoadStatus = .ready(restored.section.safeSectionName)
                activatePlaybackOwnerIfReady()
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
        cancelQuizCardPreview()
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
        let soundConfiguration = soundConfiguration
        let revision: UInt64
        switch position {
        case .restart:
            revision = environment.audio.beginQuizReplacement(
                songID: songID,
                sectionID: id,
                tempoPercent: tempoPercent,
                soundConfiguration: soundConfiguration
            )
            restartLoadRevision = revision
            transportObservationGeneration &+= 1
            transportPhase = .stopped
            progress = 0
        case .preserveProgress:
            revision = environment.audio.beginQuizReload(
                songID: songID,
                sectionID: id,
                tempoPercent: tempoPercent,
                soundConfiguration: soundConfiguration
            )
            restartLoadRevision = nil
        @unknown default:
            revision = environment.audio.beginQuizReplacement(
                songID: songID,
                sectionID: id,
                tempoPercent: tempoPercent,
                soundConfiguration: soundConfiguration
            )
            restartLoadRevision = revision
            transportObservationGeneration &+= 1
            transportPhase = .stopped
            progress = 0
        }
        activeQuizRevision = revision
        playbackOwner = nil
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
                    revision: revision,
                    soundConfiguration: soundConfiguration
                )
                try Task.checkCancellation()
                guard isCurrentSectionLoad(generation, id: id, revision: revision) else { return }
                if restartLoadRevision == revision {
                    restartLoadRevision = nil
                    transportPhase = .paused
                    progress = 0
                }
                sectionLoadStatus = .ready(section.safeSectionName)
                activatePlaybackOwnerIfReady()
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

    private func activatePlaybackOwnerIfReady() {
        guard scenePhase == .active,
              sectionLoadStatus.isReady,
              let revision = activeQuizRevision
        else { return }
        playbackOwner = environment.audio.activateQuizPlaybackOwner(revision: revision)
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
            transportSampleTimestamp = CACurrentMediaTime()
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
                waveform: .clarinet,
                gain: 1,
                channel: .melody
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
            let resolvedRoot = ChordInterpreter.resolvedRoot(for: chord, key: key)?.simpleModePitch
            guard !notes.isEmpty || resolvedRoot != nil else { return nil }
            return QuizEvent(
                onsetSeconds: max((onset - PlaybackTiming.firstBeat) / beatsPerSecond, 0),
                durationSeconds: duration / beatsPerSecond,
                frequenciesHz: notes.map { MusicTheory.frequency(midi: Double($0)) },
                waveform: .clarinet,
                gain: 1,
                channel: .chord,
                rootFrequencyHz: resolvedRoot.map {
                    MusicTheory.frequency(midi: Double($0.midiNote))
                }
            )
        }
        let duration = (playbackEndBeat(in: section) - PlaybackTiming.firstBeat) / beatsPerSecond
        return AcquiringAudio.QuizTimeline(
            durationSeconds: duration,
            events: melodyEvents + chordEvents,
            nativeBeatsPerSecond: beatsPerSecond
        )
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

private enum QuizTransportLayout {
    static let controlSize: CGFloat = 44
    static let selectorWidth: CGFloat = 72
    /// The mode selector alone, because "Root" sets wider than the transpose readout the
    /// shared width was sized for and would otherwise crowd its chevron.
    static let modeSelectorWidth: CGFloat = 84
    static let spacing: CGFloat = 8
    /// Play is the row's primary action, so it reads at double an icon button.
    /// The row has no slack, so the bar's own width absorbs the difference.
    static let playControlWidth = controlSize * 2
    /// Favorite, reset and one 44 pt selector, plus play and the transpose selector.
    static let width = controlSize * 3 + playControlWidth + selectorWidth + spacing * 4
}

private struct QuizIconButtonStyle: ButtonStyle {
    var isProminent = false
    /// Defaults to a square control; widen it for the row's primary action.
    var width = QuizTransportLayout.controlSize
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .frame(width: width, height: QuizTransportLayout.controlSize)
            .foregroundStyle(isProminent ? Color.white : Color.primary)
            .background(isProminent ? Color.accentColor : .clear, in: RoundedRectangle(cornerRadius: 8))
            .overlay {
                if !isProminent {
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(.secondary.opacity(0.45), lineWidth: 1)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 8))
            .opacity(!isEnabled ? 0.4 : configuration.isPressed ? 0.65 : 1)
    }
}

private struct QuizTransportButton: View {
    let phase: TransportPhase
    let isReady: Bool
    let isPlaybackEnabled: Bool
    let commandPending: Bool
    let action: () -> Void
    var compact = false

    private var isBusy: Bool { commandPending || phase == .buffering }

    private var title: String {
        if !isReady { return "Preparing…" }
        if isBusy { return phase == .playing ? "Pausing…" : "Starting…" }
        return phase == .playing ? "Pause" : "Play"
    }

    var body: some View {
        let button = Button(action: action) {
            HStack(spacing: 8) {
                if isBusy {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: phase == .playing ? "pause.fill" : "play.fill")
                }
                if !compact { Text(title) }
            }
            .frame(minWidth: compact ? nil : 100)
        }
        Group {
            if compact {
                button.buttonStyle(
                    QuizIconButtonStyle(isProminent: true, width: QuizTransportLayout.playControlWidth)
                )
            } else {
                button.buttonStyle(.borderedProminent)
            }
        }
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

private struct QuizTransposeSelector: View {
    let selectedValue: Int
    let onSelect: (Int) -> Void
    @State private var isPresented = false
    @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .body) private var listWidth: CGFloat = 96

    private func title(_ value: Int) -> String {
        value > 0 ? "+\(value)" : "\(value)"
    }

    var body: some View {
        Button {
            isPresented = true
        } label: {
            VStack(spacing: 2) {
                Text("Transpose").font(.caption2)
                HStack(spacing: 3) {
                    Text(title(selectedValue)).font(.caption.weight(.semibold).monospacedDigit())
                    Image(systemName: "chevron.down").font(.system(size: 9))
                }
            }
            .fixedSize()
            .frame(width: QuizTransportLayout.selectorWidth, height: QuizTransportLayout.controlSize)
            .contentShape(Rectangle())
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(.secondary.opacity(0.45), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("quiz.transpose")
        .accessibilityLabel("Transpose")
        .accessibilityValue("\(title(selectedValue)) semitones")
        .popover(isPresented: $isPresented) {
            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    VStack(spacing: 0) {
                        ForEach((-12...12).reversed(), id: \.self) { value in
                            Button {
                                isPresented = false
                                onSelect(value)
                            } label: {
                                Text(title(value))
                                    .font(.body.monospacedDigit())
                                    .frame(maxWidth: .infinity)
                                    .frame(height: rowHeight)
                                    .contentShape(Rectangle())
                                    .overlay(alignment: .trailing) {
                                        if value == selectedValue {
                                            Image(systemName: "checkmark")
                                                .font(.caption2)
                                                .padding(.trailing, 8)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(title(value)) semitones")
                            .accessibilityAddTraits(value == selectedValue ? [.isSelected] : [])
                            .id(value)
                        }
                    }
                }
                .frame(width: listWidth, height: rowHeight * 7)
                .onAppear { proxy.scrollTo(0, anchor: .center) }
            }
            .presentationCompactAdaptation(.popover)
        }
    }
}

private struct QuizSelectorOption: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    var groupTitle: String? = nil
}

/// Keeps one UIKit menu control alive while transport observations redraw Quiz.
/// Its coordinator refreshes the action closure without replacing a menu that is
/// already being presented.
private struct QuizSelectorMenu: View {
    let identityContext: String
    let options: [QuizSelectorOption]
    let selectedID: String
    let caption: String?
    let selectedDisplayTitle: String?
    let selectedAccessibilityValue: String?
    let usesSubheadline: Bool
    var systemImage: String? = nil
    let width: CGFloat?
    let expandsToAvailableWidth: Bool
    let accessibilityIdentifier: String
    let accessibilityLabel: String
    let isEnabled: Bool
    let onSelect: (String) -> Void

    private var selectedTitle: String {
        options.first(where: { $0.id == selectedID })?.title
            ?? options.first?.title
            ?? "Section"
    }

    var body: some View {
        StableQuizMenuButton(
            identityContext: identityContext,
            options: options,
            selectedID: selectedID,
            caption: caption,
            selectedTitle: selectedDisplayTitle ?? selectedTitle,
            selectedAccessibilityValue: selectedAccessibilityValue ?? selectedTitle,
            usesSubheadline: usesSubheadline,
            systemImage: systemImage,
            accessibilityIdentifier: accessibilityIdentifier,
            accessibilityLabel: accessibilityLabel,
            isEnabled: isEnabled && options.count >= 2,
            onSelect: onSelect
        )
        .frame(maxWidth: expandsToAvailableWidth ? .infinity : nil)
        .frame(width: expandsToAvailableWidth ? nil : width)
        .frame(minHeight: 44)
    }
}

private struct StableQuizMenuButton: UIViewRepresentable {
    let identityContext: String
    let options: [QuizSelectorOption]
    let selectedID: String
    let caption: String?
    let selectedTitle: String
    let selectedAccessibilityValue: String
    let usesSubheadline: Bool
    let systemImage: String?
    let accessibilityIdentifier: String
    let accessibilityLabel: String
    let isEnabled: Bool
    let onSelect: (String) -> Void

    @MainActor
    final class Coordinator {
        var onSelect: (String) -> Void
        var menuSignature = ""

        init(onSelect: @escaping (String) -> Void) {
            self.onSelect = onSelect
        }

        func select(_ id: String) {
            onSelect(id)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onSelect: onSelect)
    }

    func makeUIView(context: Context) -> UIButton {
        let button = UIButton(type: .system)
        button.showsMenuAsPrimaryAction = true
        button.changesSelectionAsPrimaryAction = false
        button.preferredMenuElementOrder = .fixed
        button.accessibilityTraits.insert(.button)
        return button
    }

    func updateUIView(_ button: UIButton, context: Context) {
        context.coordinator.onSelect = onSelect
        button.isEnabled = isEnabled
        button.accessibilityIdentifier = accessibilityIdentifier
        button.accessibilityLabel = accessibilityLabel
        button.accessibilityValue = selectedAccessibilityValue

        var configuration = UIButton.Configuration.plain()
        configuration.title = caption ?? selectedTitle
        configuration.subtitle = caption == nil ? nil : selectedTitle
        configuration.image = UIImage(systemName: systemImage ?? "chevron.down")
        configuration.imagePlacement = systemImage == nil ? .trailing : .leading
        configuration.imagePadding = caption == nil ? 5 : 3
        configuration.titleAlignment = .center
        if caption != nil {
            configuration.titlePadding = 0
            configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 9)
            configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var outgoing = incoming
                outgoing.font = .preferredFont(forTextStyle: .caption2)
                return outgoing
            }
            configuration.subtitleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var outgoing = incoming
                outgoing.font = .preferredFont(forTextStyle: .caption1)
                return outgoing
            }
        }
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 6, bottom: 4, trailing: 6)
        configuration.baseForegroundColor = .label
        configuration.background.strokeColor = UIColor.secondaryLabel.withAlphaComponent(0.45)
        configuration.background.strokeWidth = 1
        configuration.background.cornerRadius = 8
        button.configuration = configuration
        if caption == nil {
            button.titleLabel?.font = usesSubheadline
                ? .preferredFont(forTextStyle: .subheadline)
                : .preferredFont(forTextStyle: .caption1)
        }

        let signature = ([identityContext, selectedID] + options.flatMap {
            [$0.id, $0.title, $0.groupTitle ?? ""]
        }).joined(separator: "\u{1F}")
        guard context.coordinator.menuSignature != signature else { return }
        context.coordinator.menuSignature = signature
        button.menu = makeMenu(coordinator: context.coordinator)
    }

    private func makeMenu(coordinator: Coordinator) -> UIMenu {
        let groups = options.reduce(into: [(title: String?, options: [QuizSelectorOption])]()) { groups, option in
            if let lastGroup = groups.last, lastGroup.title == option.groupTitle {
                groups[groups.count - 1].options.append(option)
            } else {
                groups.append((title: option.groupTitle, options: [option]))
            }
        }
        let children: [UIMenuElement] = groups.map { group in
            let actions = group.options.map { option in
                UIAction(
                    title: option.title,
                    state: option.id == selectedID ? .on : .off
                ) { [weak coordinator] _ in
                    coordinator?.select(option.id)
                }
            }
            return UIMenu(
                title: group.title ?? "",
                options: .displayInline,
                children: actions
            )
        }
        return UIMenu(options: .displayInline, children: children)
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
    let owner: AppAudioSystem.QuizPlaybackOwner
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
    let initialKey: KeyInfo
    let currentKey: KeyInfo
    @Binding var usesRelativeIonianContext: Bool
    let quizHelp: QuizHelpState?
    /// What the microphone button monitors in this quiz mode: the melody in Full, the
    /// current root in Root-only - the card each interface is actually built around.
    let monitoringSelection: PersistentPitchSelection
    @Environment(VocalPracticeModel.self) private var vocalPractice: VocalPracticeModel?
    @AccessibilityFocusState private var helpButtonIsFocused: Bool

    private var displayedKey: KeyInfo {
        usesRelativeIonianContext ? RelativeIonianContext.key(for: initialKey) : currentKey
    }

    private var displayedKeyLabel: String {
        SongDetailPresentation.keyLabel(
            KeyInfo(
                tonic: displayedKey.tonic,
                scale: RelativeIonianContext.canonicalScaleName(displayedKey.scale)
            )
        )
    }

    var body: some View {
        ZStack {
            // The lock hangs off the key as a prefix, but the key alone owns the
            // screen's center line: the pair's own center sits half a lock's width
            // to the left of the key's, so shift it back by exactly that much.
            HStack(spacing: 0) {
                majorToggle
                keyLabel
            }
            .offset(x: -QuizTransportLayout.controlSize / 2)
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                monitorButton
                helpButton
            }
        }
        .frame(height: 44)
        .onChange(of: quizHelp?.focusHelpButtonRequest) { _, _ in
            helpButtonIsFocused = true
        }
    }

    private var keyLabel: some View {
        Text(displayedKeyLabel)
            .font(.system(size: 24, weight: .bold))
            .foregroundStyle(modeColor)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .overlay {
                if usesRelativeIonianContext {
                    RoundedRectangle(cornerRadius: 4).stroke(.red, lineWidth: 1)
                }
            }
            .accessibilityIdentifier("quiz.key")
            .accessibilityLabel("Key \(displayedKeyLabel)")
    }

    private var majorToggle: some View {
        Button {
            usesRelativeIonianContext.toggle()
        } label: {
            Image(systemName: usesRelativeIonianContext ? "lock.fill" : "lock.open")
                .font(.body)
                .foregroundStyle(usesRelativeIonianContext ? Color.red : Color.secondary)
                // Trailing-aligned inside a full 44 pt target so the glyph sits against
                // the key string without shrinking the touch area.
                .frame(width: 44, height: 44, alignment: .trailing)
                .contentShape(Rectangle())
        }
            .buttonStyle(.plain)
            .accessibilityLabel("Lock in Major")
            .accessibilityValue(usesRelativeIonianContext ? "On" : "Off")
            .accessibilityHint("Updates key, card degrees, and practice targets to the relative major key")
            .accessibilityIdentifier("quiz.lockInMajor")
            .quizHelpTarget(.quizRelativeKey)
    }

    /// Persistent pitch monitoring's only entry point, sitting beside Help because both are
    /// screen-wide modes rather than actions on one card. It is deliberately not per-card:
    /// each quiz mode has exactly one thing worth singing against.
    private var monitorButton: some View {
        let isMonitoring = vocalPractice?.persistentSelection == monitoringSelection
        return Button {
            vocalPractice?.togglePersistent(monitoringSelection)
        } label: {
            // The handheld stage mic rather than the condenser `mic`, to read like the
            // microphone emoji. It is a solid glyph with no outline counterpart, so on/off
            // is carried entirely by the prominent fill rather than by the glyph's weight.
            // `music.mic` deliberately over its 2024 rename `music.microphone`: the old name
            // still resolves and this app deploys back to iOS 17.
            Image(systemName: "music.mic")
        }
        .buttonStyle(QuizIconButtonStyle(isProminent: isMonitoring))
        .accessibilityLabel("Pitch monitoring")
        .accessibilityValue(isMonitoring ? "On" : "Off")
        .accessibilityHint("Listens while you sing and marks how far off the target you are")
        .accessibilityIdentifier("quiz.monitorPitch")
    }

    private var helpButton: some View {
        Button {
            quizHelp?.toggle()
        } label: {
            Image(systemName: quizHelp?.isPresented == true ? "questionmark.circle.fill" : "questionmark.circle")
        }
        .buttonStyle(QuizIconButtonStyle())
        .accessibilityLabel(quizHelp?.isPresented == true ? "Hide tooltips" : "Show tooltips")
        .accessibilityValue(quizHelp?.isPresented == true ? "On" : "Off")
        .accessibilityHint("Labels the less obvious quiz controls")
        .accessibilityIdentifier("quiz.help")
        .accessibilityFocused($helpButtonIsFocused)
    }

    // Android's key readout keeps the current source mode's color even when the
    // label is locked to the initial relative major; the red border marks locking.
    private var modeColor: Color {
        QuizModeColor.readout(for: currentKey.scale)
    }
}

/// The mode colors the quiz key readout is drawn in, and the lighter wash the
/// timeline lanes take from it so the two read as one thing.
enum QuizModeColor {
    static func readout(for scale: String) -> Color {
        color(rgb(for: scale))
    }

    /// The same hue as the readout, mixed toward white. The lanes sit under the
    /// readout and behind white note text, so they lift rather than re-saturate.
    static func lane(for scale: String) -> Color {
        color(rgb(for: scale), mixedTowardWhite: 0.3)
    }

    private static func rgb(for scale: String) -> UInt32 {
        switch scale {
        case "major", "ionian": 0xFF0000
        case "dorian": 0xFFB014
        case "phrygian", "phrygianDominant": 0xEFE600
        case "lydian": 0x00D300
        case "mixolydian": 0x4800FF
        case "minor", "aeolian", "harmonicMinor": 0xB800E5
        case "locrian": 0xFF00CB
        default: 0xE6E1E5
        }
    }

    private static func color(_ rgb: UInt32, mixedTowardWhite mix: Double = 0) -> Color {
        func channel(_ shift: UInt32) -> Double {
            let value = Double((rgb >> shift) & 0xFF) / 255
            return value + (1 - value) * mix
        }
        return Color(red: channel(16), green: channel(8), blue: channel(0))
    }
}

private struct QuizLaneTintKey: EnvironmentKey {
    // The preview fixtures are in major, so the unset value is major's own lane.
    static let defaultValue = QuizModeColor.lane(for: "major")
}

extension EnvironmentValues {
    /// The color the melody and chord lanes draw their events in.
    var quizLaneTint: Color {
        get { self[QuizLaneTintKey.self] }
        set { self[QuizLaneTintKey.self] = newValue }
    }
}

/// Only Quiz owns these recognizers, and it restores their previous state when
/// leaving. Edge Back is opt-in; timeline and knob gestures are always protected
/// from full-screen swipe navigation.
private struct QuizNavigationGestureGuard: UIViewControllerRepresentable {
    let enablesEdgeSwipeBack: Bool

    func makeUIViewController(context: Context) -> Controller {
        let controller = Controller()
        controller.enablesEdgeSwipeBack = enablesEdgeSwipeBack
        return controller
    }

    func updateUIViewController(_ controller: Controller, context: Context) {
        controller.enablesEdgeSwipeBack = enablesEdgeSwipeBack
    }

    static func dismantleUIViewController(_ controller: Controller, coordinator: ()) {
        controller.restoreNavigationGestures()
    }

    final class Controller: UIViewController {
        private var savedGestures: [(UIGestureRecognizer, Bool)] = []
        var enablesEdgeSwipeBack = false {
            didSet {
                guard !savedGestures.isEmpty else { return }
                navigationController?.interactivePopGestureRecognizer?.isEnabled = enablesEdgeSwipeBack
            }
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard savedGestures.isEmpty, let navigationController else { return }
            var gestures = [navigationController.interactivePopGestureRecognizer].compactMap { $0 }
            if #available(iOS 26.0, *), let contentPop = navigationController.interactiveContentPopGestureRecognizer {
                gestures.append(contentPop)
            }
            savedGestures = gestures.map { ($0, $0.isEnabled) }
            navigationController.interactivePopGestureRecognizer?.isEnabled = enablesEdgeSwipeBack
            if #available(iOS 26.0, *) {
                navigationController.interactiveContentPopGestureRecognizer?.isEnabled = false
            }
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            restoreNavigationGestures()
        }

        func restoreNavigationGestures() {
            savedGestures.forEach { $0.0.isEnabled = $0.1 }
            savedGestures.removeAll()
        }
    }
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
    /// Consecutive equal-pitch melody events, in the same ID space used by the
    /// persistent-practice scorer and card practice context.
    let pitchRuns: [MelodyTimelinePitchRun]
    let restCount: Int

    init(section: ExtractedSection, usesRelativeIonianContext: Bool = false) {
        let initialKey = section.key(at: PlaybackTiming.firstBeat)
        let contextKey = RelativeIonianContext.key(for: initialKey)
        restCount = section.melodyNotes.filter(\.isRest).count
        let builtVisuals: [MelodyTimelineVisual] = section.melodyNotes.enumerated().compactMap { sourceIndex, note in
            guard !note.isRest else { return nil }
            let onset = PlaybackTiming.normalize(beat: note.beat)
            let onsetKey = section.key(at: onset)
            let onsetPitch = MusicTheory.spelledPitch(
                scaleDegree: note.sd,
                relativeOctave: note.octave,
                key: onsetKey
            )
            let rawStaffDegree = MusicTheory.rawDegree(note.sd) + note.octave * 7
            return MelodyTimelineVisual(
                sourceIndex: sourceIndex,
                onset: onset,
                duration: note.duration,
                staffDegree: usesRelativeIonianContext
                    ? RelativeIonianContext.staffDegree(
                        scaleDegree: note.sd,
                        relativeOctave: note.octave,
                        sourceKey: onsetKey,
                        contextKey: contextKey
                    ) ?? rawStaffDegree
                    : rawStaffDegree,
                accessibilityPitch: usesRelativeIonianContext
                    ? (onsetPitch.map {
                        RelativeIonianContext.degreeLabel(for: $0, contextKey: contextKey)
                    } ?? note.sd)
                    : note.octave == 0 ? note.sd : "\(note.sd), octave \(note.octave)"
            )
        }
        // Preserve payload order. SwiftUI paints later source events over earlier
        // ones, matching Android's deterministic overlap behavior.
        visuals = builtVisuals
        pitchRuns = MelodyTimelinePitchRuns.build(from: builtVisuals.map { visual in
            let note = section.melodyNotes[visual.sourceIndex]
            let pitch = MusicTheory.spelledPitch(
                scaleDegree: note.sd,
                relativeOctave: note.octave,
                key: section.key(at: visual.onset)
            )
            let sourceMIDI = pitch.map { pitch in
                usesRelativeIonianContext
                    ? (RelativeIonianContext.previewMIDI(for: pitch, contextKey: contextKey) ?? pitch.midiNote)
                    : pitch.midiNote
            }
            return MelodyTimelinePitchVisual(
                beat: visual.onset,
                duration: visual.duration,
                staffDegree: visual.staffDegree,
                sourceMIDI: sourceMIDI
            )
        })
    }

    /// Points per diatonic staff step. Android clamps this to 5-10 **pixels**
    /// (MainActivity.kt), not points: at a 2x/3x display scale
    /// `laneHeight / 28` is 6.3-9.4px, always inside that window, so the clamp
    /// never fires and the lane shows the full 28 staff steps. Applying the
    /// clamp in points instead pinned iOS to 5pt/step, cutting the visible
    /// pitch window to ~17.6 steps and clipping outer notes off the lane.
    var noteHeight: CGFloat {
        Self.laneHeight / 28
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

    func activeVisual(at beat: Double) -> MelodyTimelineVisual? {
        visuals.last(where: { $0.isActive(at: beat) })
    }
}

private struct QuizTimelinePairView: View {
    let section: ExtractedSection
    let sectionID: String
    let currentBeat: Double
    let sourceTimestamp: CFTimeInterval
    let endBeat: Double
    let tempoPercent: Double
    let usesRelativeIonianContext: Bool
    let isPlaying: Bool
    let seekGeneration: Int
    let isSeekEnabled: Bool
    let onSeek: (Double) -> Void
    let onDragStart: () -> Void
    let onDragChange: (CGFloat, Date) -> Void
    let onDragEnd: () -> Void
    let onDragCancel: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(TimelineFrameRatePreference.defaultsKey)
    private var frameRateRawValue = TimelineFrameRatePreference.standard.rawValue
    @StateObject private var displayModel: QuizTimelineDisplayModel
    @State private var isVisible = false

    init(
        section: ExtractedSection,
        sectionID: String,
        currentBeat: Double,
        sourceTimestamp: CFTimeInterval,
        endBeat: Double,
        tempoPercent: Double,
        usesRelativeIonianContext: Bool,
        isPlaying: Bool,
        seekGeneration: Int,
        isSeekEnabled: Bool,
        onSeek: @escaping (Double) -> Void,
        onDragStart: @escaping () -> Void,
        onDragChange: @escaping (CGFloat, Date) -> Void,
        onDragEnd: @escaping () -> Void,
        onDragCancel: @escaping () -> Void
    ) {
        self.section = section
        self.sectionID = sectionID
        self.currentBeat = currentBeat
        self.sourceTimestamp = sourceTimestamp
        self.endBeat = endBeat
        self.tempoPercent = tempoPercent
        self.usesRelativeIonianContext = usesRelativeIonianContext
        self.isPlaying = isPlaying
        self.seekGeneration = seekGeneration
        self.isSeekEnabled = isSeekEnabled
        self.onSeek = onSeek
        self.onDragStart = onDragStart
        self.onDragChange = onDragChange
        self.onDragEnd = onDragEnd
        self.onDragCancel = onDragCancel
        _displayModel = StateObject(wrappedValue: QuizTimelineDisplayModel(
            section: section,
            sectionID: sectionID,
            usesRelativeIonianContext: usesRelativeIonianContext,
            initialBeat: currentBeat
        ))
    }

    var body: some View {
        lifecycleContent
    }

    private var lanes: some View {
        VStack(spacing: 0) {
            MelodyTimelineView(
                presentation: displayModel.melodyPresentation,
                currentBeat: currentBeat,
                displayedBeat: displayModel.displayedBeat,
                isSeekEnabled: isSeekEnabled,
                onSeek: onSeek,
                onDragStart: onDragStart,
                onDragChange: onDragChange,
                onDragEnd: onDragEnd,
                onDragCancel: onDragCancel
            )
            .frame(height: MelodyTimelinePresentation.laneHeight)
            .accessibilityIdentifier("quiz.timeline")

            ChordTimelineView(
                presentation: displayModel.chordPresentation,
                currentBeat: currentBeat,
                displayedBeat: displayModel.displayedBeat,
                isSeekEnabled: isSeekEnabled,
                onSeek: onSeek,
                onDragStart: onDragStart,
                onDragChange: onDragChange,
                onDragEnd: onDragEnd,
                onDragCancel: onDragCancel
            )
            .frame(height: ChordTimelinePresentation.laneHeight)
            .accessibilityIdentifier("quiz.chordTimeline")
        }
    }

    private var sourceObservationContent: some View {
        lanes
            .onChange(of: sourceTimestamp) { _, timestamp in
                synchronizeSource(forceSnap: false, timestamp: timestamp)
            }
            .onChange(of: currentBeat) { _, _ in
                // Drag/coast owns the beat while audio is paused, so reflect it
                // immediately instead of waiting for an audio transport timestamp.
                guard !isPlaying else { return }
                synchronizeSource(forceSnap: true, timestamp: CACurrentMediaTime())
            }
            .onChange(of: isPlaying) { _, _ in
                synchronizeSource(forceSnap: true, timestamp: CACurrentMediaTime())
            }
            .onChange(of: seekGeneration) { _, _ in
                synchronizeSource(forceSnap: true, timestamp: CACurrentMediaTime())
            }
            .onChange(of: tempoPercent) { _, _ in
                synchronizeSource(forceSnap: true, timestamp: CACurrentMediaTime())
            }
    }

    private var presentationObservationContent: some View {
        sourceObservationContent
            .onChange(of: sectionID) { _, _ in
                displayModel.updatePresentations(
                    section: section,
                    sectionID: sectionID,
                    usesRelativeIonianContext: usesRelativeIonianContext
                )
                synchronizeSource(forceSnap: true, timestamp: CACurrentMediaTime())
            }
            .onChange(of: usesRelativeIonianContext) { _, _ in
                displayModel.updatePresentations(
                    section: section,
                    sectionID: sectionID,
                    usesRelativeIonianContext: usesRelativeIonianContext
                )
            }
    }

    private var lifecycleContent: some View {
        presentationObservationContent
        .onAppear {
            isVisible = true
            displayModel.updatePresentations(
                section: section,
                sectionID: sectionID,
                usesRelativeIonianContext: usesRelativeIonianContext
            )
            synchronizeSource(forceSnap: true, timestamp: sourceTimestamp)
            displayModel.setLifecycle(
                isVisible: true,
                sceneIsActive: scenePhase == .active,
                reduceMotion: reduceMotion
            )
            displayModel.setFrameRatePreference(frameRatePreference)
        }
        .onDisappear {
            isVisible = false
            displayModel.setLifecycle(
                isVisible: false,
                sceneIsActive: scenePhase == .active,
                reduceMotion: reduceMotion
            )
        }
        .onChange(of: scenePhase) { _, phase in
            displayModel.setLifecycle(
                isVisible: isVisible,
                sceneIsActive: phase == .active,
                reduceMotion: reduceMotion
            )
        }
        .onChange(of: reduceMotion) { _, enabled in
            displayModel.setLifecycle(
                isVisible: isVisible,
                sceneIsActive: scenePhase == .active,
                reduceMotion: enabled
            )
        }
        .onChange(of: frameRateRawValue) { _, _ in
            displayModel.setFrameRatePreference(frameRatePreference)
        }
    }

    private var frameRatePreference: TimelineFrameRatePreference {
        TimelineFrameRatePreference(rawValue: frameRateRawValue) ?? .standard
    }

    private func synchronizeSource(forceSnap: Bool, timestamp: CFTimeInterval) {
        let beatsPerSecond = max(section.bpm, 1) / 60 * max(tempoPercent, 0) / 100
        displayModel.updateSource(
            beat: currentBeat,
            timestamp: timestamp,
            endBeat: endBeat,
            beatsPerSecond: beatsPerSecond,
            isPlaying: isPlaying,
            forceSnap: forceSnap
        )
    }
}

@MainActor
private final class QuizTimelineDisplayModel: ObservableObject {
    @Published private(set) var displayedBeat: Double
    @Published private(set) var melodyPresentation: MelodyTimelinePresentation
    @Published private(set) var chordPresentation: ChordTimelinePresentation

    private var presentationSectionID: String
    private var presentationUsesRelativeIonianContext: Bool
    private var sourceBeat: Double
    private var sourceTimestamp: CFTimeInterval
    private var anchorBeat: Double
    private var anchorTimestamp: CFTimeInterval
    private var endBeat = PlaybackTiming.firstBeat
    private var beatsPerSecond = 0.0
    private var isPlaying = false
    private var isVisible = false
    private var sceneIsActive = false
    private var reduceMotion = false
    private var frameRatePreference = TimelineFrameRatePreference.standard
    private var displayLink: CADisplayLink?
    private let displayLinkTarget = QuizTimelineDisplayLinkTarget()

    init(
        section: ExtractedSection,
        sectionID: String,
        usesRelativeIonianContext: Bool,
        initialBeat: Double
    ) {
        presentationSectionID = sectionID
        presentationUsesRelativeIonianContext = usesRelativeIonianContext
        melodyPresentation = MelodyTimelinePresentation(
            section: section,
            usesRelativeIonianContext: usesRelativeIonianContext
        )
        chordPresentation = ChordTimelinePresentation(
            section: section,
            usesRelativeIonianContext: usesRelativeIonianContext
        )
        displayedBeat = initialBeat
        sourceBeat = initialBeat
        let now = CACurrentMediaTime()
        sourceTimestamp = now
        anchorBeat = initialBeat
        anchorTimestamp = now
        displayLinkTarget.owner = self
    }

    func updatePresentations(
        section: ExtractedSection,
        sectionID: String,
        usesRelativeIonianContext: Bool
    ) {
        if presentationSectionID != sectionID {
            presentationSectionID = sectionID
            presentationUsesRelativeIonianContext = usesRelativeIonianContext
            melodyPresentation = MelodyTimelinePresentation(
                section: section,
                usesRelativeIonianContext: usesRelativeIonianContext
            )
            chordPresentation = ChordTimelinePresentation(
                section: section,
                usesRelativeIonianContext: usesRelativeIonianContext
            )
        } else if presentationUsesRelativeIonianContext != usesRelativeIonianContext {
            presentationUsesRelativeIonianContext = usesRelativeIonianContext
            melodyPresentation = MelodyTimelinePresentation(
                section: section,
                usesRelativeIonianContext: usesRelativeIonianContext
            )
            chordPresentation = ChordTimelinePresentation(
                section: section,
                usesRelativeIonianContext: usesRelativeIonianContext
            )
        }
    }

    func updateSource(
        beat: Double,
        timestamp: CFTimeInterval,
        endBeat: Double,
        beatsPerSecond: Double,
        isPlaying: Bool,
        forceSnap: Bool
    ) {
        let sampleTimestamp = timestamp.isFinite && timestamp > 0
            ? timestamp
            : CACurrentMediaTime()
        let normalizedEndBeat = max(endBeat, PlaybackTiming.firstBeat)
        let boundedBeat = min(max(beat, PlaybackTiming.firstBeat), normalizedEndBeat)
        let normalizedRate = beatsPerSecond.isFinite ? max(beatsPerSecond, 0) : 0
        let previousSpan = self.endBeat - PlaybackTiming.firstBeat
        let span = normalizedEndBeat - PlaybackTiming.firstBeat
        let previousPrediction = projectedBeat(at: sampleTimestamp)
        let sourceWrapped = span > 0
            && sourceBeat - boundedBeat > span / 2
        let rateChanged = abs(self.beatsPerSecond - normalizedRate) > 0.000_001
        let phaseChanged = self.isPlaying != isPlaying
        let boundsChanged = abs(previousSpan - span) > 0.000_001
        let drift = PlaybackTiming.circularDelta(from: previousPrediction, to: boundedBeat, span: span)
        let driftLimit = max(0.2, normalizedRate * 0.15)
        let shouldSnap = forceSnap || sourceWrapped || rateChanged || phaseChanged
            || boundsChanged || abs(drift) > driftLimit

        self.endBeat = normalizedEndBeat
        self.beatsPerSecond = normalizedRate
        self.isPlaying = isPlaying
        sourceBeat = boundedBeat
        sourceTimestamp = sampleTimestamp

        if shouldSnap || !isPlaying {
            anchorBeat = boundedBeat
            anchorTimestamp = sampleTimestamp
            displayedBeat = boundedBeat
        } else {
            // The audio sample remains authoritative, but a tiny late sample
            // must not tug the playhead backward every polling interval.
            // Positive error is caught up gradually; meaningful error snaps.
            anchorBeat = PlaybackTiming.wrappedBeat(
                previousPrediction + max(drift, 0) * 0.25,
                span: span
            )
            anchorTimestamp = sampleTimestamp
        }
        updateDisplayLinkState()
    }

    func setLifecycle(isVisible: Bool, sceneIsActive: Bool, reduceMotion: Bool) {
        self.isVisible = isVisible
        self.sceneIsActive = sceneIsActive
        self.reduceMotion = reduceMotion
        updateDisplayLinkState()
    }

    func setFrameRatePreference(_ preference: TimelineFrameRatePreference) {
        frameRatePreference = preference
        configureFrameRate()
    }

    fileprivate func displayFrame(_ link: CADisplayLink) {
        guard isPlaying, isVisible, sceneIsActive, !reduceMotion else { return }
        let timestamp = link.targetTimestamp > 0 ? link.targetTimestamp : link.timestamp
        displayedBeat = projectedBeat(at: timestamp)
    }

    private func projectedBeat(at timestamp: CFTimeInterval) -> Double {
        guard isPlaying, beatsPerSecond > 0 else { return sourceBeat }
        let elapsed = max(timestamp - anchorTimestamp, 0)
        return PlaybackTiming.wrappedBeat(anchorBeat + elapsed * beatsPerSecond, span: endBeat - PlaybackTiming.firstBeat)
    }

    private func updateDisplayLinkState() {
        let shouldRun = isPlaying && beatsPerSecond > 0 && isVisible && sceneIsActive && !reduceMotion
        if shouldRun {
            guard displayLink == nil else { return }
            let link = CADisplayLink(target: displayLinkTarget, selector: #selector(QuizTimelineDisplayLinkTarget.tick(_:)))
            displayLink = link
            configureFrameRate()
            link.add(to: .main, forMode: .common)
        } else {
            displayLink?.invalidate()
            displayLink = nil
            displayedBeat = sourceBeat
        }
    }

    private func configureFrameRate() {
        guard let displayLink else { return }
        let preferred = frameRatePreference.framesPerSecond(
            displayMaximum: UIScreen.main.maximumFramesPerSecond
        )
        displayLink.preferredFrameRateRange = CAFrameRateRange(
            minimum: Float(min(preferred, 30)),
            maximum: Float(preferred),
            preferred: Float(preferred)
        )
    }
}

@MainActor
private final class QuizTimelineDisplayLinkTarget: NSObject {
    weak var owner: QuizTimelineDisplayModel?

    @objc func tick(_ displayLink: CADisplayLink) {
        guard let owner else {
            displayLink.invalidate()
            return
        }
        owner.displayFrame(displayLink)
    }
}

private struct MelodyTimelineView: View {
    let presentation: MelodyTimelinePresentation
    let currentBeat: Double
    let displayedBeat: Double
    let isSeekEnabled: Bool
    let onSeek: (Double) -> Void
    let onDragStart: () -> Void
    let onDragChange: (CGFloat, Date) -> Void
    let onDragEnd: () -> Void
    let onDragCancel: () -> Void
    @Environment(VocalPracticeModel.self) private var vocalPractice: VocalPracticeModel?
    @Environment(\.quizLaneTint) private var laneTint
    @State private var dragIsActive = false
    @GestureState private var dragGestureIsRecognized = false

    init(
        presentation: MelodyTimelinePresentation,
        currentBeat: Double,
        displayedBeat: Double,
        isSeekEnabled: Bool = false,
        onSeek: @escaping (Double) -> Void = { _ in },
        onDragStart: @escaping () -> Void = {},
        onDragChange: @escaping (CGFloat, Date) -> Void = { _, _ in },
        onDragEnd: @escaping () -> Void = {},
        onDragCancel: @escaping () -> Void = {}
    ) {
        self.presentation = presentation
        self.currentBeat = currentBeat
        self.displayedBeat = displayedBeat
        self.isSeekEnabled = isSeekEnabled
        self.onSeek = onSeek
        self.onDragStart = onDragStart
        self.onDragChange = onDragChange
        self.onDragEnd = onDragEnd
        self.onDragCancel = onDragCancel
    }

    var body: some View {
        GeometryReader { proxy in
            let visualBeat = displayedBeat
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
                                    visual.isActive(at: visualBeat)
                                        ? laneTint
                                        : laneTint.opacity(0.6)
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

                persistentPracticeOverlays(
                    containerWidth: proxy.size.width,
                    currentBeat: visualBeat,
                    translation: translation
                )
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
        .onDisappear { cancelActiveDragIfNeeded() }
        .onChange(of: dragGestureIsRecognized) { wasRecognized, isRecognized in
            if wasRecognized, !isRecognized {
                cancelActiveDragIfNeeded()
            }
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
        return "Melody timeline. \(eventText); \(restText). \(activeText). \(practiceAccessibilitySummary) Current beat \(beatText)"
    }

    @ViewBuilder
    private func persistentPracticeOverlays(
        containerWidth: CGFloat,
        currentBeat: Double,
        translation: CGFloat
    ) -> some View {
        if let vocalPractice,
           vocalPractice.persistentSelection == .melody {
            ForEach(presentation.pitchRuns) { run in
                if let outcome = vocalPractice.score(forRunID: run.id) {
                    MelodyRunScoreBadge(outcome: outcome)
                        .offset(
                            x: scoreBadgeX(for: run, translation: translation),
                            y: scoreBadgeY(for: run)
                        )
                        .accessibilityHidden(true)
                }
            }

            if let active = presentation.activeVisual(at: currentBeat) {
                // Its own view, and not by preference: the marker follows `liveCentsError`,
                // which changes every 16 ms. Read here, that would re-evaluate this lane -
                // every note rectangle in it - sixty times a second for the sake of one dot.
                MelodyLiveMarkerOverlay(
                    targetCentreY: presentation.y(for: active) + presentation.noteHeight / 2,
                    noteHeight: presentation.noteHeight,
                    containerWidth: containerWidth
                )
            }
        }
    }

    private func scoreBadgeX(for run: MelodyTimelinePitchRun, translation: CGFloat) -> CGFloat {
        let localX = CGFloat(run.beat - PlaybackTiming.firstBeat) * ChordTimelinePresentation.pointsPerBeat
        return localX + translation + 3
    }

    private func scoreBadgeY(for run: MelodyTimelinePitchRun) -> CGFloat {
        min(max(
            MelodyTimelinePresentation.laneHeight / 2 - CGFloat(run.staffDegree) * presentation.noteHeight - 19,
            2
        ), MelodyTimelinePresentation.laneHeight - 19)
    }

    private var practiceAccessibilitySummary: String {
        guard let vocalPractice,
              vocalPractice.persistentSelection == .melody
        else { return "" }
        let scored = presentation.pitchRuns.compactMap { vocalPractice.score(forRunID: $0.id) }.count
        if let live = vocalPractice.sampledLiveCentsText {
            return "Persistent melody practice is on, live pitch \(live), \(scored) completed run scores."
        }
        return "Persistent melody practice is on, waiting for a voiced pitch, \(scored) completed run scores."
    }

    private func cancelActiveDragIfNeeded() {
        guard dragIsActive else { return }
        dragIsActive = false
        onDragCancel()
    }
}

/// The live pitch marker riding the melody lane, and the signed cents readout beside it.
///
/// Split out of `MelodyTimelineView` on purpose. It follows `liveCentsError`, which changes
/// every 16 ms; read from the lane's own body that would re-evaluate every note rectangle in
/// the lane sixty times a second. `@Observable` tracks reads per-`body`, so owning the read
/// here confines the invalidation to one dot and one pill.
private struct MelodyLiveMarkerOverlay: View {
    /// Vertical centre of the note being sung, in lane coordinates.
    let targetCentreY: CGFloat
    let noteHeight: CGFloat
    let containerWidth: CGFloat

    @Environment(VocalPracticeModel.self) private var vocalPractice: VocalPracticeModel?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// A soft halo behind a small solid dot: the dot is precise enough to read against a
    /// 3pt note bar, the halo is what the eye actually catches while the timeline scrolls.
    private static let haloDiameter: CGFloat = 12
    private static let dotDiameter: CGFloat = 5
    /// Clearance between the readout pill and the playhead line it sits left of.
    private static let readoutGap: CGFloat = 8
    /// Half the pill's rendered height, used only to keep it clear of the lane edges.
    private static let readoutHalfHeight: CGFloat = 9

    var body: some View {
        if vocalPractice?.persistentPhase == .listening {
            // The dot stands for monitoring being on, not for a pitch having been heard, so it
            // is drawn whether or not anything is arriving. With no voiced frame it parks on
            // the target line in neutral white: a pitch colour there would claim an accuracy
            // nothing measured.
            let cents = vocalPractice?.liveCentsError
            let steps = vocalPractice?.liveMarkerStaffSteps
            let colour = cents.map { Color.pitchFeedback(centsError: $0) } ?? .white
            let centreY = markerCentreY(staffSteps: steps.map { $0.isFinite ? $0 : 0 } ?? 0)

            ZStack {
                Circle()
                    .fill(colour.opacity(0.28))
                    .frame(width: Self.haloDiameter, height: Self.haloDiameter)
                Circle()
                    .fill(colour)
                    .frame(width: Self.dotDiameter, height: Self.dotDiameter)
            }
            .offset(
                x: containerWidth / 2 - Self.haloDiameter / 2,
                y: centreY - Self.haloDiameter / 2
            )
            // 32 ms linear, matching Android: attached to the voice, but with the raw
            // detector's frame-to-frame jitter taken off. Never a spring - overshoot here
            // would draw a pitch the singer did not sing.
            .animation(reduceMotion ? nil : .linear(duration: 0.032), value: centreY)
            .accessibilityHidden(true)

            if let centsText = vocalPractice?.sampledLiveCentsText,
               let band = vocalPractice?.sampledFeedbackBand {
                // A zero-height rail ending short of the playhead: a trailing overlay on it
                // centres the pill on the marker without this view having to know how tall
                // the pill renders.
                Color.clear
                    .frame(width: max(containerWidth / 2 - Self.readoutGap, 0), height: 0)
                    .overlay(alignment: .trailing) {
                        LivePitchErrorReadout(text: centsText, color: .pitchFeedback(band))
                    }
                    .offset(y: readoutCentreY(markerCentreY: centreY))
                    .accessibilityHidden(true)
            }
        }
    }

    /// Android clamps the marker into the lane and keeps drawing rather than hiding it once
    /// the singer is more than an octave out: a pinned marker still says "far, and in this
    /// direction", which is exactly what someone that far off needs to see.
    private func markerCentreY(staffSteps: Double) -> CGFloat {
        let raw = targetCentreY - CGFloat(staffSteps) * noteHeight
        let radius = Self.haloDiameter / 2
        return min(max(raw, radius), max(MelodyTimelinePresentation.laneHeight - radius, radius))
    }

    /// Keeps the readout pill inside the lane. The marker may sit within half a pill of the
    /// lane edge, where centring on it alone would push the number under the rounded clip.
    private func readoutCentreY(markerCentreY: CGFloat) -> CGFloat {
        min(max(markerCentreY, Self.readoutHalfHeight),
            MelodyTimelinePresentation.laneHeight - Self.readoutHalfHeight)
    }
}

private struct MelodyRunScoreBadge: View {
    let outcome: MelodyRunScoreOutcome

    var body: some View {
        Text(label)
            .font(.caption2.weight(.bold).monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(color, in: Capsule())
    }

    private var label: String {
        switch outcome {
        case let .scored(_, score): score.formatted
        case .unscored: "Unscored"
        }
    }

    private var color: Color {
        switch outcome {
        case let .scored(_, score):
            .pitchFeedback(PersistentPitchFeedback.band(centsError: score.centsErrorMagnitude))
        case .unscored:
            .gray
        }
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

    init(section: ExtractedSection, usesRelativeIonianContext: Bool = false) {
        let contextKey = RelativeIonianContext.key(for: section.key(at: PlaybackTiming.firstBeat))
        visuals = section.chords.enumerated().map { sourceIndex, chord in
            let onset = PlaybackTiming.normalize(beat: chord["beat"]?.doubleValue ?? 1)
            let duration = chord["duration"]?.doubleValue ?? 1
            let isRest = chord["isRest"]?.boolValue == true || chord["rest"]?.boolValue == true
            let display: RomanNumeralDisplay?
            if isRest {
                display = nil
            } else {
                let onsetKey = section.key(at: onset)
                let symbol = usesRelativeIonianContext
                    ? ChordInterpreter.relativeIonianRomanSymbol(
                        for: chord,
                        key: onsetKey,
                        contextKey: contextKey
                    )
                    : ChordInterpreter.romanSymbol(for: chord, key: onsetKey)
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
    let presentation: ChordTimelinePresentation
    let currentBeat: Double
    let displayedBeat: Double
    let isSeekEnabled: Bool
    let onSeek: (Double) -> Void
    let onDragStart: () -> Void
    let onDragChange: (CGFloat, Date) -> Void
    let onDragEnd: () -> Void
    let onDragCancel: () -> Void
    @Environment(\.quizLaneTint) private var laneTint
    @State private var dragIsActive = false
    @GestureState private var dragGestureIsRecognized = false

    init(
        presentation: ChordTimelinePresentation,
        currentBeat: Double,
        displayedBeat: Double,
        isSeekEnabled: Bool = false,
        onSeek: @escaping (Double) -> Void = { _ in },
        onDragStart: @escaping () -> Void = {},
        onDragChange: @escaping (CGFloat, Date) -> Void = { _, _ in },
        onDragEnd: @escaping () -> Void = {},
        onDragCancel: @escaping () -> Void = {}
    ) {
        self.presentation = presentation
        self.currentBeat = currentBeat
        self.displayedBeat = displayedBeat
        self.isSeekEnabled = isSeekEnabled
        self.onSeek = onSeek
        self.onDragStart = onDragStart
        self.onDragChange = onDragChange
        self.onDragEnd = onDragEnd
        self.onDragCancel = onDragCancel
    }

    var body: some View {
        GeometryReader { proxy in
            let visualBeat = displayedBeat
            let active = presentation.activeVisual(at: visualBeat)
            let translation = presentation.translation(
                containerWidth: proxy.size.width,
                currentBeat: visualBeat
            )

            ZStack(alignment: .topLeading) {
                ZStack(alignment: .topLeading) {
                    ForEach(presentation.visuals) { visual in
                        if presentation.width(for: visual) > 0 {
                            chordBlock(visual, isActive: active?.id == visual.id)
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
        .onDisappear { cancelActiveDragIfNeeded() }
        .onChange(of: dragGestureIsRecognized) { wasRecognized, isRecognized in
            if wasRecognized, !isRecognized {
                cancelActiveDragIfNeeded()
            }
        }
    }

    private func chordBlock(_ visual: ChordTimelineVisual, isActive: Bool) -> some View {
        RoundedRectangle(cornerRadius: 5)
            .fill(isActive ? laneTint.opacity(0.82) : Color.white.opacity(0.16))
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

    private func accessibilityLabel(for active: ChordTimelineVisual?) -> String {
        let event = active?.accessibilityDescription ?? "No active chord"
        return "Chord timeline. \(event). Current beat \(currentBeat.formatted(.number.precision(.fractionLength(0...2))))"
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
            QuizTimelinePairView(
                section: section,
                sectionID: "timeline-preview",
                currentBeat: currentBeat,
                sourceTimestamp: CACurrentMediaTime(),
                endBeat: 7,
                tempoPercent: 100,
                usesRelativeIonianContext: false,
                isPlaying: isPlaying,
                seekGeneration: 0,
                isSeekEnabled: false,
                onSeek: { _ in },
                onDragStart: {},
                onDragChange: { _, _ in },
                onDragEnd: {},
                onDragCancel: {}
            )
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
