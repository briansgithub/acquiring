import AcquiringAudio
import AcquiringCore
import SwiftUI

struct SongDetailView: View {
    let songID: String

    var body: some View {
        Text(songID)
            .navigationTitle("Song")
            .navigationBarTitleDisplayMode(.inline)
    }
}

struct QuizView: View {
    let songID: String
    @Environment(AppEnvironment.self) private var environment
    @State private var state: FeatureState<SongDocument> = .loading
    @State private var progress = 0.0
    @State private var playing = false
    @State private var error: String?

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
    }

    private func quiz(_ document: SongDocument) -> some View {
        let section = document.orderedSections.first?.section
        return VStack(spacing: 20) {
            Text(document.song.displayTitle).font(.title2.bold()).multilineTextAlignment(.center)
            if let section {
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
            }
        }
        .padding()
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
    }

    private func chordCard(_ section: ExtractedSection) -> some View {
        let active = activeChord(in: section)
        let key = active.map { section.key(at: $0.beat) } ?? section.keys[0].key
        let symbol = active.map { ChordInterpreter.romanSymbol(for: $0.chord, key: key) } ?? "—"
        let rootDegree = active
            .flatMap { ChordInterpreter.resolvedRoot(for: $0.chord, key: key)?.pitch }
            .map { MusicTheory.degreeLabel(midi: $0.midiNote, key: key) } ?? ""
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
        do {
            let document = try await environment.catalog.songDocument(id: songID)
            state = document.sections.isEmpty ? .empty : .content(document)
            if let section = document.orderedSections.first?.section {
                try await environment.audio.load(timeline(for: section), position: .restart)
            }
        } catch { state = .failure(error.localizedDescription) }
    }

    private func observeTransport() async {
        for await value in await environment.audio.states() {
            playing = value.phase == .playing || value.phase == .buffering
            let duration = value.duration.secondsValue
            progress = duration > 0 ? min(max(value.elapsed.secondsValue / duration, 0), 1) : 0
        }
    }

    private func timeline(for section: ExtractedSection) -> AcquiringAudio.QuizTimeline {
        let beatsPerSecond = max(section.bpm, 1) / 60
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
