import AcquiringAudio
import AcquiringCore
import SwiftUI

private enum DetailTab: String, CaseIterable, Identifiable {
    case info = "Info"
    case chords = "Chords"
    var id: Self { self }
}

private enum VocalPracticeMode: String, Identifiable {
    case singBack = "Sing Back"
    case interval = "Two-Note Interval"
    case persistent = "Persistent Practice"
    case tessitura = "Tessitura Calibration"
    var id: Self { self }
}

private enum QuizArpeggio: String, CaseIterable, Identifiable {
    case quarter = "1/4"
    case third = "1/3"
    case half = "1/2"
    case off
    case one = "1"
    case two = "2"
    case three = "3"
    case four = "4"

    var id: Self { self }
    var cyclesPerBeat: Double {
        switch self {
        case .quarter: 0.25
        case .third: 1.0 / 3.0
        case .half: 0.5
        case .off: 0
        case .one: 1
        case .two: 2
        case .three: 3
        case .four: 4
        }
    }
}

struct SongDetailView: View {
    let songID: String
    @Environment(AppEnvironment.self) private var environment
    @State private var state: FeatureState<SongDocument> = .loading
    @State private var selectedSectionKey: String?
    @State private var tab: DetailTab = .info
    @State private var isFavorite = false
    @State private var message: String?

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView("Loading song…")
            case .empty: ContentUnavailableView("No chord data", systemImage: "music.note")
            case let .failure(message): ContentUnavailableView("Unable to load song", systemImage: "exclamationmark.triangle", description: Text(message))
            case let .content(document): content(document)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button {
                do { isFavorite = try environment.userLibrary.toggle(slug: songID) }
                catch { message = error.localizedDescription }
            } label: {
                Image(systemName: isFavorite ? "heart.fill" : "heart")
            }
            .accessibilityLabel(isFavorite ? "Remove from Favorites" : "Add to Favorites")
        }
        .task { await load() }
        .alert("Favorites", isPresented: .constant(message != nil)) {
            Button("OK") { message = nil }
        } message: { Text(message ?? "") }
    }

    private var title: String {
        if case let .content(document) = state { return document.song.displayTitle }
        return "Song"
    }

    private func content(_ document: SongDocument) -> some View {
        let sections = document.orderedSections
        let selection = sections.first(where: { $0.key == selectedSectionKey }) ?? sections.first
        return VStack(spacing: 0) {
            if sections.count > 1 {
                Picker("Section", selection: Binding(
                    get: { selection?.key ?? "" },
                    set: { selectedSectionKey = $0 }
                )) {
                    ForEach(sections, id: \.key) { Text($0.section.safeSectionName).tag($0.key) }
                }
                .padding()
            }
            Picker("Detail", selection: $tab) {
                ForEach(DetailTab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            if let section = selection?.section {
                switch tab {
                case .info: SongInfoView(document: document, section: section)
                case .chords: ChordsView(section: section)
                }
            } else {
                ContentUnavailableView("No sections", systemImage: "music.note")
            }
        }
    }

    private func load() async {
        do {
            let document = try await environment.catalog.songDocument(id: songID)
            state = document.sections.isEmpty ? .empty : .content(document)
            selectedSectionKey = document.orderedSections.first?.key
            isFavorite = (try? environment.userLibrary.contains(slug: songID)) ?? false
        } catch { state = .failure(error.localizedDescription) }
    }
}

private struct SongInfoView: View {
    let document: SongDocument
    let section: ExtractedSection
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        List {
            Section("Overview") {
                LabeledContent("Title", value: document.song.displayTitle)
                LabeledContent("Artist", value: document.song.displayArtist)
                LabeledContent("Section", value: section.safeSectionName)
                if let firstKey = section.keys.first?.key {
                    LabeledContent("Key", value: "\(firstKey.tonic) \(prettyScale(firstKey.scale))")
                }
                LabeledContent("Tempo", value: "\(section.bpm.formatted(.number.precision(.fractionLength(0)))) BPM")
                if let beatsPerMeasure {
                    LabeledContent("Beats / measure", value: beatsPerMeasure.formatted())
                }
                if let totalBeats {
                    LabeledContent("Length", value: durationLabel(totalBeats))
                    let bars = beatsPerMeasure.map { Int(ceil(totalBeats / Double($0))) }
                    LabeledContent("Beats", value: totalBeats.formatted() + (bars.map { " · \($0) bars" } ?? ""))
                }
                LabeledContent("Chords", value: "\(section.chords.count) (\(uniqueChordCount) unique)")
                LabeledContent(
                    "Melody notes",
                    value: section.melodyNotes.isEmpty
                        ? "None — chords only"
                        : "\(section.melodyNotes.filter { !$0.isRest }.count) sounded / \(section.melodyNotes.count) total"
                )
                if !section.safeNumericID.isEmpty { LabeledContent("Hooktheory ID", value: section.safeNumericID) }
            }
            if !section.chords.isEmpty {
                Section("Progression") {
                    ForEach(Array(section.chords.sorted(by: { ($0["beat"]?.doubleValue ?? 1) < ($1["beat"]?.doubleValue ?? 1) }).enumerated()), id: \.offset) { _, chord in
                        let beat = chord["beat"]?.doubleValue ?? 1
                        let key = section.key(at: beat)
                        Button {
                            let notes = ChordInterpreter.chordNotes(for: chord, key: key)
                            Task { try? await environment.audio.play(PreviewRequest(frequenciesHz: notes.map { MusicTheory.frequency(midi: Double($0)) })) }
                        } label: {
                            HStack {
                                FittedRomanNumeral(
                                    display: RomanNumeralDisplay(
                                        symbol: ChordInterpreter.romanSymbol(for: chord, key: key),
                                        borrowed: chord["borrowed"]
                                    ),
                                    maximumFontSize: 34,
                                    minimumFontSize: 10
                                )
                                .frame(width: 130, height: 44)
                                Spacer()
                                Text("Beat \(beat.formatted())")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityLabel("\(ChordInterpreter.romanSymbol(for: chord, key: key)), beat \(beat.formatted())")
                        .accessibilityHint("Previews this chord")
                    }
                }
            }
            Section(section.keys.count > 1 ? "Key changes" : "Keys") {
                ForEach(Array(section.keys.enumerated()), id: \.offset) { _, value in
                    LabeledContent("Beat \(value.beat.formatted())", value: "\(value.key.tonic) \(prettyScale(value.key.scale))")
                }
            }
            if let url = document.song.url {
                Link("Open on Hooktheory", destination: url)
            }
            if let youtubeURL {
                Link("Open video on YouTube", destination: youtubeURL)
            }
        }
    }

    private var totalBeats: Double? { section.endBeat.map { max($0 - 1, 0) }.flatMap { $0 > 0 ? $0 : nil } }
    private var beatsPerMeasure: Int? {
        section.metadata?["meters"]?.arrayValue?.first?.objectValue?["numBeats"]?.intValue
    }
    private var uniqueChordCount: Int {
        Set(section.chords.map { chord in
            ChordInterpreter.romanSymbol(for: chord, key: section.key(at: chord["beat"]?.doubleValue ?? 1))
        }).count
    }
    private var youtubeURL: URL? {
        guard let id = section.metadata?["youtube"]?.objectValue?["id"]?.stringValue else { return nil }
        return URL(string: "https://www.youtube.com/watch?v=\(id)")
    }
    private func durationLabel(_ beats: Double) -> String {
        let seconds = Int((beats / max(section.bpm, 1) * 60).rounded())
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
    private func prettyScale(_ value: String) -> String {
        value.replacingOccurrences(of: "([a-z])([A-Z])", with: "$1 $2", options: .regularExpression).capitalized
    }
}

private struct ChordsView: View {
    let section: ExtractedSection
    @Environment(AppEnvironment.self) private var environment
    @State private var usesRomanNumerals = true
    @State private var arpeggiates = false
    @State private var arpeggioStep = 80.0
    @State private var error: String?

    var body: some View {
        List {
            Toggle("Roman numerals", isOn: $usesRomanNumerals)
            Toggle("Arpeggiate previews", isOn: $arpeggiates)
            if arpeggiates {
                LabeledContent("Arpeggio speed", value: "\(Int(arpeggioStep)) ms")
                Slider(value: $arpeggioStep, in: 30...1_000, step: 10)
                    .accessibilityLabel("Arpeggio preview speed")
            }
            ForEach(Array(section.chords.enumerated()), id: \.offset) { index, chord in
                Button {
                    preview(chord)
                } label: {
                    HStack {
                        if usesRomanNumerals {
                            FittedRomanNumeral(
                                display: RomanNumeralDisplay(
                                    symbol: chordLabel(chord, index: index),
                                    borrowed: chord["borrowed"]
                                ),
                                maximumFontSize: 38,
                                minimumFontSize: 10
                            )
                            .frame(width: 150, height: 54)
                        } else {
                            Text(chordLabel(chord, index: index))
                                .font(.title3.monospaced())
                                .frame(width: 150, alignment: .leading)
                        }
                        Spacer()
                        Text("Beat \((chord["beat"]?.doubleValue ?? 1).formatted())").foregroundStyle(.secondary)
                        Image(systemName: "speaker.wave.2")
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityHint("Previews this chord")
            }
        }
        .alert("Chord preview", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }

    private func chordLabel(_ chord: [String: JSONValue], index: Int) -> String {
        let key = section.key(at: chord["beat"]?.doubleValue ?? 1)
        let label = usesRomanNumerals
            ? ChordInterpreter.romanSymbol(for: chord, key: key)
            : ChordInterpreter.letterName(for: chord, key: key)
        return label.isEmpty ? "Chord \(index + 1)" : label
    }

    private func preview(_ chord: [String: JSONValue]) {
        let key = section.key(at: chord["beat"]?.doubleValue ?? 1)
        let notes = ChordInterpreter.chordNotes(for: chord, key: key)
        Task {
            do {
                try await environment.audio.play(PreviewRequest(
                    frequenciesHz: notes.map { MusicTheory.frequency(midi: Double($0)) },
                    arpeggiates: arpeggiates,
                    arpeggioStep: .milliseconds(arpeggioStep)
                ))
            } catch { self.error = error.localizedDescription }
        }
    }
}

struct QuizView: View {
    let songID: String
    @Environment(AppEnvironment.self) private var environment
    @State private var state: FeatureState<SongDocument> = .loading
    @State private var selectedSectionKey: String?
    @State private var waveform: SynthWaveform = .sawtooth
    @State private var simpleMode = false
    @State private var transpose = 0
    @State private var tempoPercent = 100.0
    @State private var melodyBalance = 0.5
    @State private var arpeggio = QuizArpeggio.off
    @State private var progress = 0.0
    @State private var playing = false
    @State private var isSeeking = false
    @State private var error: String?
    @State private var practiceMode: VocalPracticeMode?
    @State private var tessituraAnchor: Double?
    @State private var usesRelativeIonianContext = false

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView("Preparing quiz…")
            case .empty: ContentUnavailableView("No quiz data", systemImage: "questionmark.music.note")
            case let .failure(message): ContentUnavailableView("Unable to open quiz", systemImage: "exclamationmark.triangle", description: Text(message))
            case let .content(document): quiz(document)
            }
        }
        .navigationTitle("Quiz")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .task { await observeTransport() }
        .alert("Audio", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
        .sheet(item: $practiceMode) { mode in
            if case let .content(document) = state,
               let section = document.orderedSections.first(where: { $0.key == selectedSectionKey })?.section
                    ?? document.orderedSections.first?.section {
                VocalPracticeSheet(
                    mode: mode,
                    targetMIDI: targetMIDI(section),
                    tessituraAnchor: $tessituraAnchor
                )
            }
        }
    }

    private func quiz(_ document: SongDocument) -> some View {
        let sections = document.orderedSections
        let selected = sections.first(where: { $0.key == selectedSectionKey }) ?? sections.first
        return ScrollView {
            VStack(spacing: 20) {
                Text(document.song.displayTitle).font(.title2.bold()).multilineTextAlignment(.center)
                if sections.count > 1 {
                    Picker("Section", selection: Binding(
                        get: { selected?.key ?? "" }, set: { selectedSectionKey = $0 }
                    )) {
                        ForEach(sections, id: \.key) { Text($0.section.safeSectionName).tag($0.key) }
                    }
                    .onChange(of: selectedSectionKey) { _, _ in Task { await loadSelectedTimeline(document) } }
                }
                if let section = selected?.section {
                    QuizTimelineView(section: section, progress: progress)
                        .frame(height: 150)
                        .accessibilityLabel("Chord and melody timeline, \(Int(progress * 100)) percent")
                    theoryCard(section)
                    Slider(value: $progress, in: 0...1) { editing in
                        isSeeking = editing
                        if !editing { Task { await environment.audio.seek(to: progress) } }
                    }
                        .accessibilityValue("\(Int(progress * 100)) percent")
                    HStack {
                        Button(playing ? "Pause" : "Play", systemImage: playing ? "pause.fill" : "play.fill") {
                            Task { await togglePlayback(section) }
                        }
                        .buttonStyle(.borderedProminent)
                        Button("Preview root", systemImage: "speaker.wave.2") {
                            Task { await previewRootReportingErrors(section) }
                        }
                        .accessibilityAction(named: "Preview pitch") { Task { await previewRootReportingErrors(section) } }
                    }
                    Picker("Quiz mode", selection: $simpleMode) {
                        Text("Full").tag(false)
                        Text("Simple").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: simpleMode) { _, _ in Task { await loadSelectedTimeline(document) } }
                    Stepper("Transpose: \(transpose)", value: $transpose, in: -12...12)
                        .onChange(of: transpose) { _, _ in Task { await loadSelectedTimeline(document) } }
                    LabeledContent("Tempo", value: "\(Int(tempoPercent))%")
                    Slider(value: $tempoPercent, in: 0...200, step: 1)
                        .accessibilityLabel("Quiz tempo")
                        .onChange(of: tempoPercent) { _, _ in Task { await loadSelectedTimeline(document) } }
                    Picker("Chord arpeggiation", selection: $arpeggio) {
                        ForEach(QuizArpeggio.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .onChange(of: arpeggio) { _, _ in Task { await loadSelectedTimeline(document) } }
                    LabeledContent("Melody / chord balance", value: "\(Int(melodyBalance * 100)) / \(Int((1 - melodyBalance) * 100))")
                    Slider(value: $melodyBalance, in: 0...1)
                        .accessibilityLabel("Melody and chord volume balance")
                        .onChange(of: melodyBalance) { _, _ in Task { await loadSelectedTimeline(document) } }
                    Picker("Instrument", selection: $waveform) {
                        ForEach(SynthWaveform.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .onChange(of: waveform) { _, _ in Task { await loadSelectedTimeline(document) } }
                    vocalPracticeActions(section)
                }
            }
            .padding()
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
    }

    private func theoryCard(_ section: ExtractedSection) -> some View {
        let active = activeChord(in: section)
        let sourceKey = active.map { section.key(at: $0.beat) } ?? section.keys[0].key
        let contextKey = RelativeIonianContext.key(for: section.keys[0].key)
        let symbol = active.map {
            usesRelativeIonianContext
                ? ChordInterpreter.relativeIonianRomanSymbol(for: $0.chord, key: sourceKey, contextKey: contextKey)
                : ChordInterpreter.romanSymbol(for: $0.chord, key: sourceKey)
        } ?? "Rest"
        let rootDegree = active
            .flatMap { ChordInterpreter.resolvedRoot(for: $0.chord, key: sourceKey)?.pitch }
            .map {
                usesRelativeIonianContext
                    ? RelativeIonianContext.degreeLabel(for: $0, contextKey: contextKey)
                    : MusicTheory.degreeLabel(midi: $0.midiNote, key: sourceKey)
            } ?? ""

        return GroupBox("Current theory") {
            VStack(alignment: .leading, spacing: 10) {
                Toggle("Lock in Major", isOn: $usesRelativeIonianContext)
                    .accessibilityHint("Keeps Roman numerals and scale degrees relative to the section's major-key context without changing playback pitches")
                HStack(alignment: .center, spacing: 12) {
                    FittedRomanNumeral(
                        display: RomanNumeralDisplay(
                            symbol: symbol,
                            borrowed: active?.chord["borrowed"]
                        ),
                        maximumFontSize: 64,
                        minimumFontSize: 12
                    )
                    .frame(width: 210, height: 76)
                    if !rootDegree.isEmpty {
                        FittedScaleDegree(rootDegree, maximumFontSize: 58, minimumFontSize: 14)
                            .frame(width: 84, height: 76)
                    }
                    Spacer()
                    Text(usesRelativeIonianContext ? "\(contextKey.tonic) major" : "\(sourceKey.tonic) \(sourceKey.scale)")
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Current chord \(symbol), root \(rootDegree), in \(usesRelativeIonianContext ? contextKey.tonic + " major" : sourceKey.tonic + " " + sourceKey.scale)")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func activeChord(in section: ExtractedSection) -> (chord: [String: JSONValue], beat: Double)? {
        let sorted = section.chords.sorted { ($0["beat"]?.doubleValue ?? 1) < ($1["beat"]?.doubleValue ?? 1) }
        guard let first = sorted.first else { return nil }
        let metadataEnd = section.endBeat ?? 1
        let chordEnd = sorted.map { chord -> Double in
            let onset = chord["beat"]?.doubleValue ?? 1
            let duration = chord["duration"]?.doubleValue ?? 1
            return onset + duration
        }.max() ?? 1
        let melodyEnd = section.melodyNotes.map { $0.beat + $0.duration }.max() ?? 1
        let audibleEnd = max(metadataEnd, max(chordEnd, melodyEnd))
        let beat = 1 + min(max(progress, 0), 1) * max(audibleEnd - 1, 0)
        let chord = sorted.last(where: { ($0["beat"]?.doubleValue ?? 1) <= beat }) ?? first
        return (chord, chord["beat"]?.doubleValue ?? 1)
    }

    private func vocalPracticeActions(_ section: ExtractedSection) -> some View {
        GroupBox("Vocal practice") {
            VStack(alignment: .leading) {
                Button("Sing back target", systemImage: "mic") { practiceMode = .singBack }
                    .accessibilityHint("Starts a finite pitch-matching attempt")
                Button("Two-note interval", systemImage: "arrow.up.and.down") { practiceMode = .interval }
                    .accessibilityHint("Captures two sung pitches and names their interval")
                Button("Persistent practice", systemImage: "waveform") { practiceMode = .persistent }
                    .accessibilityHint("Continuously scores the sung pitch against the active target")
                Button("Calibrate tessitura", systemImage: "tuningfork") { practiceMode = .tessitura }
                    .accessibilityHint("Uses a comfortable hummed note as the vocal anchor")
                if let tessituraAnchor {
                    LabeledContent("Tessitura anchor", value: midiName(tessituraAnchor))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func togglePlayback(_ section: ExtractedSection) async {
        do {
            if playing {
                await environment.audio.pause()
            } else {
                try await environment.audio.play()
            }
            playing.toggle()
        } catch { self.error = error.localizedDescription }
    }

    private func previewRoot(_ section: ExtractedSection) async throws {
        let midi = targetMIDI(section)
        try await environment.audio.play(PreviewRequest(frequenciesHz: [MusicTheory.frequency(midi: Double(midi))], waveform: waveform))
    }

    private func targetMIDI(_ section: ExtractedSection) -> Int {
        let chord = section.chords.first ?? [:]
        let degree = chord["root"]?.intValue ?? 1
        let key = section.key(at: chord["beat"]?.doubleValue ?? 1)
        let source = MusicTheory.midiNote(scaleDegree: String(degree), octave: 0, key: key) + transpose
        guard let tessituraAnchor else { return source }
        return TessituraResolver.resolveTarget(sourceMIDI: source, anchorMIDI: tessituraAnchor)
    }

    private func midiName(_ midi: Double) -> String {
        let rounded = Int(midi.rounded())
        let name = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"][((rounded % 12) + 12) % 12]
        return "\(name)\(rounded / 12 - 1)"
    }

    private func previewRootReportingErrors(_ section: ExtractedSection) async {
        do { try await previewRoot(section) }
        catch { self.error = error.localizedDescription }
    }

    private func load() async {
        do {
            let document = try await environment.catalog.songDocument(id: songID)
            state = document.sections.isEmpty ? .empty : .content(document)
            selectedSectionKey = document.orderedSections.first?.key
            await loadSelectedTimeline(document)
        } catch { state = .failure(error.localizedDescription) }
    }

    private func loadSelectedTimeline(_ document: SongDocument) async {
        guard let section = document.orderedSections.first(where: { $0.key == selectedSectionKey })?.section
                ?? document.orderedSections.first?.section else { return }
        do { try await environment.audio.load(timeline(for: section)) }
        catch { self.error = error.localizedDescription }
    }

    private func observeTransport() async {
        for await value in await environment.audio.states() {
            playing = value.phase == .playing || value.phase == .buffering
            guard !isSeeking else { continue }
            let duration = value.duration.secondsValue
            progress = duration > 0 ? min(max(value.elapsed.secondsValue / duration, 0), 1) : 0
        }
    }

    private func timeline(for section: ExtractedSection) -> AcquiringAudio.QuizTimeline {
        let beatsPerSecond = max(section.bpm * tempoPercent / 100, 1) / 60
        let sorted = section.chords.sorted { ($0["beat"]?.doubleValue ?? 1) < ($1["beat"]?.doubleValue ?? 1) }
        var events = sorted.enumerated().flatMap { index, chord -> [QuizEvent] in
            let beat = chord["beat"]?.doubleValue ?? 1
            let nextBeat = sorted.indices.contains(index + 1) ? sorted[index + 1]["beat"]?.doubleValue : nil
            let durationBeats = chord["duration"]?.doubleValue ?? nextBeat.map { max($0 - beat, 0.25) } ?? 1
            let key = section.key(at: beat)
            let notes = ChordInterpreter.chordNotes(for: chord, key: key)
            let selectedNotes = simpleMode ? Array(notes.prefix(1)) : notes
            guard !selectedNotes.isEmpty else { return [] }
            let frequencies = selectedNotes.map { MusicTheory.frequency(midi: Double($0 + transpose)) }
            let onset = max((beat - 1) / beatsPerSecond, 0)
            let duration = max(durationBeats / beatsPerSecond, 0.05)
            let gain = Float(1 - melodyBalance)
            guard arpeggio.cyclesPerBeat > 0, frequencies.count > 1 else {
                return [QuizEvent(onsetSeconds: onset, durationSeconds: duration, frequenciesHz: frequencies, waveform: waveform, gain: gain)]
            }
            let step = 1 / (arpeggio.cyclesPerBeat * Double(frequencies.count) * beatsPerSecond)
            var cursor = 0.0
            var result: [QuizEvent] = []
            while cursor < duration {
                let noteIndex = Int((cursor / step).rounded(.down)) % frequencies.count
                result.append(QuizEvent(
                    onsetSeconds: onset + cursor,
                    durationSeconds: min(step, duration - cursor),
                    frequenciesHz: [frequencies[noteIndex]],
                    waveform: waveform,
                    gain: gain
                ))
                cursor += step
            }
            return result
        }
        if !simpleMode {
            events.append(contentsOf: section.melodyNotes.compactMap { note in
                guard !note.isRest else { return nil }
                let key = section.key(at: note.beat)
                let midi = MusicTheory.midiNote(scaleDegree: note.sd, octave: note.octave, key: key) + transpose
                return QuizEvent(
                    onsetSeconds: max((note.beat - 1) / beatsPerSecond, 0),
                    durationSeconds: max(note.duration / beatsPerSecond, 0.05),
                    frequenciesHz: [MusicTheory.frequency(midi: Double(midi))],
                    waveform: waveform,
                    gain: Float(melodyBalance)
                )
            })
        }
        let metadataDuration = section.endBeat.map { max(($0 - 1) / beatsPerSecond, 0) } ?? 0
        let duration = max(events.map { $0.onsetSeconds + $0.durationSeconds }.max() ?? 1, metadataDuration)
        return AcquiringAudio.QuizTimeline(durationSeconds: max(duration, 0.1), events: events)
    }
}

private extension Duration {
    var secondsValue: Double {
        let parts = components
        return Double(parts.seconds) + Double(parts.attoseconds) / 1e18
    }
}

private struct VocalPracticeSheet: View {
    let mode: VocalPracticeMode
    let targetMIDI: Int
    @Binding var tessituraAnchor: Double?
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var listening = false
    @State private var reading: PitchReading?
    @State private var captured: [Double] = []
    @State private var error: String?
    @State private var listeningTask: Task<Void, Never>?
    @State private var calibrationTask: Task<Void, Never>?
    @State private var capture = ComfortablePitchCapture()
    @State private var captureProgress = ComfortablePitchCapture().progress
    @State private var lastCaptureObservation = Date.now
    @State private var lastPitchDate: Date?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: mode == .tessitura ? "tuningfork" : "waveform")
                    .font(.system(size: 48))
                    .accessibilityHidden(true)
                Text(instruction).multilineTextAlignment(.center)
                if let reading {
                    Text(midiName(reading.midi)).font(.largeTitle.monospaced().bold())
                    if mode != .tessitura {
                        let cents = Int(((reading.midi - Double(targetMIDI)) * 100).rounded())
                        Text(cents == 0 ? "On pitch" : "\(abs(cents)) cents \(cents < 0 ? "flat" : "sharp")")
                            .foregroundStyle(abs(cents) <= 25 ? .green : .orange)
                            .accessibilityLabel(cents == 0 ? "On pitch" : "\(abs(cents)) cents \(cents < 0 ? "flat" : "sharp")")
                    }
                    ProgressView(value: min(max(reading.confidence, 0), 1)) { Text("Confidence") }
                } else {
                    ContentUnavailableView("Listening for a steady pitch", systemImage: "mic")
                }
                if mode == .interval {
                    HStack {
                        Button("Capture note \(min(captured.count + 1, 2))") {
                            if let reading, captured.count < 2 { captured.append(reading.midi) }
                        }
                        .disabled(reading == nil || captured.count == 2)
                        if captured.count == 2 { Text(intervalLabel(from: captured[0], to: captured[1])).font(.title2.bold()) }
                    }
                }
                if mode == .tessitura {
                    ProgressView(value: 1 - Double(captureProgress.remainingMilliseconds) / 3_000) {
                        Text(captureProgress.hasSignal ? "Hold a comfortable note" : "Waiting for your hum")
                    }
                    Button("Use this comfortable pitch") {
                        tessituraAnchor = capture.averageMIDI
                        dismiss()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!captureProgress.isComplete)
                    Button("Retry calibration") {
                        capture.restart()
                        captureProgress = capture.progress
                        lastCaptureObservation = .now
                    }
                }
                Button(listening ? "Stop listening" : "Start listening", systemImage: listening ? "stop.fill" : "mic.fill") {
                    listening ? stop() : start()
                }
                .buttonStyle(.borderedProminent)
                if let error { Text(error).foregroundStyle(.red) }
            }
            .padding()
            .navigationTitle(mode.rawValue)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .onDisappear { stop() }
        }
    }

    private var instruction: String {
        switch mode {
        case .singBack: "Listen to the target, then sing it back. The reading shows your distance from the target."
        case .interval: "Sing two steady notes and capture each one. Their measured direction and size stay intact."
        case .persistent: "Sustain or move between notes while Acquiring continuously compares your pitch with the target."
        case .tessitura: "Hum a comfortable note, wait for a stable reading, then use it as this quiz session’s anchor."
        }
    }

    private func start() {
        listening = true
        if mode == .tessitura {
            capture.restart()
            captureProgress = capture.progress
            lastCaptureObservation = .now
            lastPitchDate = nil
            calibrationTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(100))
                    guard !Task.isCancelled, listening else { break }
                    if lastPitchDate.map({ Date.now.timeIntervalSince($0) >= 0.1 }) ?? false {
                        updateCapture(midi: nil)
                    }
                }
            }
        }
        listeningTask = Task {
            do {
                if mode == .singBack {
                    try await environment.audio.play(PreviewRequest(frequenciesHz: [MusicTheory.frequency(midi: Double(targetMIDI))]))
                    try? await Task.sleep(for: .milliseconds(550))
                }
                for try await value in await environment.audio.readings() {
                    guard !Task.isCancelled else { break }
                    reading = value
                    if mode == .tessitura {
                        lastPitchDate = .now
                        updateCapture(midi: value.midi)
                    }
                }
            } catch { self.error = error.localizedDescription }
            listening = false
        }
    }

    private func stop() {
        listeningTask?.cancel()
        listeningTask = nil
        calibrationTask?.cancel()
        calibrationTask = nil
        listening = false
        Task { await environment.audio.stop() }
    }

    private func midiName(_ midi: Double) -> String {
        let rounded = Int(midi.rounded())
        let name = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"][((rounded % 12) + 12) % 12]
        return "\(name)\(rounded / 12 - 1)"
    }

    private func intervalLabel(from: Double, to: Double) -> String {
        let interval = IntervalAnalysis.measured(fromMIDI: from, toMIDI: to)
        let cents = Int(interval.centsDeviation.rounded())
        return cents == 0 ? interval.shorthand : "\(interval.shorthand), \(abs(cents)) cents \(cents < 0 ? "narrow" : "wide")"
    }

    private func updateCapture(midi: Double?) {
        let now = Date.now
        let elapsed = max(Int(now.timeIntervalSince(lastCaptureObservation) * 1_000), 0)
        lastCaptureObservation = now
        captureProgress = capture.observe(elapsedMilliseconds: elapsed, midi: midi)
    }
}

private struct QuizTimelineView: View {
    let section: ExtractedSection
    let progress: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Canvas { context, size in
            let maxBeat = max(section.chords.compactMap { $0["beat"]?.doubleValue }.max() ?? 1, 1)
            for (index, chord) in section.chords.enumerated() {
                let beat = chord["beat"]?.doubleValue ?? 1
                let x = (beat - 1) / maxBeat * size.width
                let rect = CGRect(x: x, y: 35, width: max(size.width / Double(max(section.chords.count, 1)) - 3, 6), height: 70)
                context.fill(Path(roundedRect: rect, cornerRadius: 5), with: .color(index.isMultiple(of: 2) ? .indigo : .purple))
            }
            let cursorX = size.width * progress
            context.stroke(Path(CGRect(x: cursorX, y: 0, width: 1, height: size.height)), with: .color(.white), lineWidth: 3)
        }
        .animation(reduceMotion ? nil : .linear(duration: 0.12), value: progress)
        .background(.black.opacity(0.3), in: RoundedRectangle(cornerRadius: 12))
    }
}

private extension SynthWaveform {
    var displayName: String {
        switch self {
        case .sine: "Sine"
        case .square: "Square"
        case .sawtooth: "Sawtooth"
        case .triangle: "Triangle"
        case .strings: "Strings"
        case .electricPiano: "Electric Piano"
        case .warmOrgan: "Warm Organ"
        case .marimba: "Marimba"
        case .vibraphone: "Vibraphone"
        case .nylonGuitar: "Nylon Guitar"
        }
    }
}
