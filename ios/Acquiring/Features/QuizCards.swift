import AcquiringCore
import Foundation
import SwiftUI

struct QuizPracticeTargets: Equatable {
    let root: QuizPitchCardTarget?
    let melody: QuizPitchCardTarget?
    let chordTones: [QuizPitchCardTarget]
    let melodyRuns: [MelodyTimelinePitchRun]
}

/// The event-aware card stack shared by Full Quiz and Root-only Quiz.
/// Preview closures receive source MIDI (or its fixed-Ionian register equivalent);
/// the audio boundary owns transpose, waveform, and cancellation.
struct QuizCardsView: View {
    private enum MelodyCardLayout {
        static let pairHeight: CGFloat = 44
        static let singleOrIntervalHeight: CGFloat = 88
    }

    /// Root-only keeps the previous/current roots in their own stable columns. This
    /// gives the current root the same place before and after a predecessor appears.
    private enum RootCardLayout {
        static let previousHeight: CGFloat = 128
        static let currentHeight: CGFloat = 162
        static let columnGap: CGFloat = 14
    }

    let section: ExtractedSection
    let beat: Double
    let rootOnly: Bool
    let usesRelativeIonianContext: Bool
    let isPreviewEnabled: Bool
    let isTessituraEnabled: Bool
    /// Removes visual section labels and uses the fixed-height card rows needed by the single-screen quiz.
    let compact: Bool
    let onPreview: ([Int], Duration) -> Void
    let onIntervalPreview: ([Int]) -> Void
    let onSingBack: ((SingingTargetRequest) -> Void)?
    let onPersistentPractice: ((PersistentPitchSelection) -> Void)?
    let onPracticeContext: ((QuizPracticeTargets) -> Void)?

    @State private var presentation: QuizCardsPresentation
    @State private var singingRequestID = 0
    /// The only practice value read here. It changes with the selection or the sounding
    /// event, never at frame rate; the gauge itself reads the live cents error from the
    /// same model so the 60 Hz redraw stays inside `QuizPitchGauge`.
    @Environment(VocalPracticeModel.self) private var vocalPractice: VocalPracticeModel?

    init(
        section: ExtractedSection,
        beat: Double,
        rootOnly: Bool,
        usesRelativeIonianContext: Bool,
        isPreviewEnabled: Bool,
        compact: Bool = false,
        isTessituraEnabled: Bool = false,
        onPreview: @escaping ([Int], Duration) -> Void,
        onIntervalPreview: @escaping ([Int]) -> Void,
        onSingBack: ((SingingTargetRequest) -> Void)? = nil,
        onPersistentPractice: ((PersistentPitchSelection) -> Void)? = nil,
        onPracticeContext: ((QuizPracticeTargets) -> Void)? = nil
    ) {
        self.section = section
        self.beat = beat
        self.rootOnly = rootOnly
        self.usesRelativeIonianContext = usesRelativeIonianContext
        self.isPreviewEnabled = isPreviewEnabled
        self.compact = compact
        self.isTessituraEnabled = isTessituraEnabled
        self.onPreview = onPreview
        self.onIntervalPreview = onIntervalPreview
        self.onSingBack = onSingBack
        self.onPersistentPractice = onPersistentPractice
        self.onPracticeContext = onPracticeContext
        _presentation = State(initialValue: QuizCardsPresentation(section: section))
    }

    var body: some View {
        let activeChord = presentation.activeChord(at: beat)
        let activeMelody = presentation.activeMelody(at: beat)
        let rootState = presentation.rootState(at: beat, activeChord: activeChord)
        let melodyState = presentation.melodyState(at: beat, activeMelody: activeMelody)
        let targets = practiceTargets(activeChord: activeChord, activeMelody: activeMelody, rootState: rootState)

        VStack(alignment: .leading, spacing: compact ? 3 : 12) {
            if rootOnly {
                rootOnlyCards(rootState: rootState)
            } else {
                melodyCards(active: activeMelody, state: melodyState)
                chordCards(active: activeChord)
                chordToneCards(active: activeChord)
            }
        }
        .onChange(of: section) { _, newSection in
            presentation = QuizCardsPresentation(section: newSection)
        }
        .onChange(of: targets, initial: true) { _, value in onPracticeContext?(value) }
        .onChange(of: beat) { _, _ in onPracticeContext?(targets) }
        .accessibilityIdentifier(rootOnly ? "quiz.rootCards" : "quiz.cards")
    }

    private var ionianContextKey: KeyInfo {
        RelativeIonianContext.key(for: section.key(at: PlaybackTiming.firstBeat))
    }

    /// Mirrors Android: the gauge rides the card whose pitch is actually being measured. The
    /// paired 44pt melody cards and both root/melody interval partners never wear it, so the
    /// singer's feedback stays in one place on screen as the melody moves in and out of
    /// having a predecessor.
    private func showsPitchGauge(_ position: PersistentPitchCardPosition) -> Bool {
        vocalPractice?.gaugePosition == position
    }

    @ViewBuilder
    private func rootOnlyCards(rootState: ChordRootIntervalState?) -> some View {
        // Unlike the three compact Full-mode sections, the root pair and its interval
        // need the whole screen width so the shorthand is actually centered.
        VStack(spacing: compact ? 3 : 5) {
            let previous = rootState?.previousIntervalPitch
            let current = rootState?.currentIntervalPitch
            let interval = rootState?.interval
            let previousLabel = previous.map {
                usesRelativeIonianContext
                    ? RelativeIonianContext.degreeLabel(for: $0, contextKey: ionianContextKey)
                    : (rootState?.previousDegreeLabel ?? "")
            } ?? ""
            let currentLabel = current.map {
                usesRelativeIonianContext
                    ? RelativeIonianContext.degreeLabel(for: $0, contextKey: ionianContextKey)
                    : (rootState?.currentDegreeLabel ?? "")
            } ?? ""

            GeometryReader { row in
                let availableWidth = max(0, row.size.width - RootCardLayout.columnGap)
                let previousWidth = availableWidth * 0.4
                let currentWidth = availableWidth * 0.6
                HStack(alignment: .bottom, spacing: RootCardLayout.columnGap) {
                    rootOnlyRootCard(
                        title: "Previous",
                        accessibilityTitle: "Previous root",
                        pitch: previous,
                        degree: previousLabel,
                        identifier: "quiz.root.previous",
                        fixedHeight: RootCardLayout.previousHeight
                    )
                    .frame(width: previousWidth)
                    rootOnlyRootCard(
                        title: "Current root",
                        accessibilityTitle: "Current root",
                        pitch: current,
                        degree: currentLabel,
                        identifier: "quiz.root.current",
                        fixedHeight: RootCardLayout.currentHeight,
                        showsPitchGauge: showsPitchGauge(.simpleRoot)
                    )
                    .frame(width: currentWidth)
                }
            }
            .frame(height: RootCardLayout.currentHeight)

            GeometryReader { row in
                let cardWidth = max(0, (row.size.width - 8) / 2)
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    if let previous, let current, let interval, previous != current {
                        intervalCard(
                            title: "Root interval",
                            previous: previous,
                            current: current,
                            interval: interval,
                            identifier: "quiz.root.interval",
                            labels: [previousLabel, currentLabel],
                            fixedHeight: 44
                        )
                        .frame(width: cardWidth)
                    } else {
                        Color.clear
                            .frame(width: cardWidth, height: 44)
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(height: 44)
        }
    }

    /// Root-only intentionally renders only the requested scale degree. Source note
    /// spellings are available to VoiceOver but are not shown as a fallback caption.
    @ViewBuilder
    private func rootOnlyRootCard(
        title: String,
        accessibilityTitle: String,
        pitch: SpelledPitch?,
        degree: String,
        identifier: String,
        fixedHeight: CGFloat,
        showsPitchGauge: Bool = false
    ) -> some View {
        if let pitch {
            QuizCardButton(
                title: "Play \(accessibilityTitle) \(pitch.displayName), scale degree \(degree)",
                identifier: identifier,
                enabled: isPreviewEnabled && !degree.isEmpty,
                action: { onPreview([previewMIDI(for: pitch)], .milliseconds(450)) },
                doubleTapAction: singBackAction([previewMIDI(for: pitch)], labels: [degree]),
                longPressAction: persistentAction(.simpleRoot),
                doubleTapActionName: "Sing Back",
                isTessituraEnabled: isTessituraEnabled,
                showsPitchGauge: showsPitchGauge,
                fixedHeight: fixedHeight
            ) {
                VStack(spacing: 6) {
                    Text(title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.78))
                    FittedScaleDegree(
                        degree,
                        maximumFontSize: title == "Current root" ? 52 : 42,
                        minimumFontSize: 13,
                        color: .white
                    )
                    .frame(maxWidth: .infinity)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            QuizEmptyCardSlot(fixedHeight: fixedHeight)
        }
    }

    @ViewBuilder
    private func melodyCards(active: MelodyNote?, state: MelodyIntervalState?) -> some View {
        QuizCardSection("Melody", compact: compact) {
            if let active,
               !active.isRest,
               active.duration > 0,
               let current = melodyPitch(for: active) {

                let currentLabel = degreeLabel(
                    for: current,
                    sourceKey: section.key(at: PlaybackTiming.normalize(beat: active.beat))
                )
            switch QuizIntervals.melodyPitchCardDisplayMode(currentPitch: current, intervalState: state) {
            case .hidden:
                QuizEmptyCardSlot(
                    fixedHeight: MelodyCardLayout.singleOrIntervalHeight
                )
            case .single:
                GeometryReader { row in
                    let halfWidth = max(0, (row.size.width - 8) / 2)
                    pitchCard(
                        title: "Current melody note",
                        pitch: current,
                        degree: currentLabel,
                        identifier: "quiz.melody.current",
                        fixedHeight: MelodyCardLayout.singleOrIntervalHeight,
                        showsPitchGauge: showsPitchGauge(.melodyCurrent)
                    )
                    .frame(width: halfWidth)
                    .offset(x: halfWidth + 8)
                }
                .frame(height: MelodyCardLayout.singleOrIntervalHeight)
            case .interval:
                let cards = state.map {
                    QuizIntervals.melodyPitchCards(
                        for: $0,
                        previousLabel: usesRelativeIonianContext
                            ? RelativeIonianContext.degreeLabel(for: $0.previous, contextKey: ionianContextKey)
                            : $0.previousDegreeLabel,
                        currentLabel: currentLabel
                    )
                } ?? []
                GeometryReader { row in
                    let halfWidth = max(0, (row.size.width - 8) / 2)
                    HStack(alignment: .center, spacing: 8) {
                        HStack(spacing: 8) {
                            if let previous = cards.first(where: { $0.role == .previous }) {
                                positionedPitchCard(previous, title: "Previous melody note", identifier: "quiz.melody.previous")
                            } else {
                                QuizEmptyCardSlot(
                                    fixedHeight: MelodyCardLayout.pairHeight
                                )
                                .frame(height: MelodyCardLayout.singleOrIntervalHeight, alignment: .bottom)
                            }
                            if let currentCard = cards.first(where: { $0.role == .current }) {
                                positionedPitchCard(currentCard, title: "Current melody note", identifier: "quiz.melody.current")
                            } else {
                                QuizEmptyCardSlot(
                                    fixedHeight: MelodyCardLayout.pairHeight
                                )
                                .frame(height: MelodyCardLayout.singleOrIntervalHeight, alignment: .top)
                            }
                        }
                        .frame(width: halfWidth)
                        intervalCard(
                            title: "Melody interval",
                            previous: state?.previous,
                            current: state?.current,
                            interval: state?.interval,
                            identifier: "quiz.melody.interval",
                            labels: [
                                state.map {
                                    usesRelativeIonianContext
                                        ? RelativeIonianContext.degreeLabel(for: $0.previous, contextKey: ionianContextKey)
                                        : $0.previousDegreeLabel
                                } ?? "",
                                currentLabel
                            ],
                            fixedHeight: MelodyCardLayout.singleOrIntervalHeight,
                            showsPitchGauge: showsPitchGauge(.melodyCurrent)
                        )
                        .frame(width: halfWidth)
                    }
                }
                .frame(height: MelodyCardLayout.singleOrIntervalHeight)
            }
            } else {
                QuizEmptyCardSlot(
                    fixedHeight: MelodyCardLayout.singleOrIntervalHeight
                )
            }
        }
    }

    @ViewBuilder
    private func chordCards(active: QuizCardsPresentation.ActiveChord?) -> some View {
        QuizCardSection("Chord", compact: compact) {
            if let active, !active.isRest {
            let key = section.key(at: active.onset)
            let symbol = usesRelativeIonianContext
                ? ChordInterpreter.relativeIonianRomanSymbol(
                    for: active.chord,
                    key: key,
                    contextKey: ionianContextKey
                )
                : ChordInterpreter.romanSymbol(for: active.chord, key: key)
            let voicing = chordPreviewNotes(for: active.chord, key: key)

            QuizCardButton(
                title: "Play chord \(symbol)",
                identifier: "quiz.chord.preview",
                enabled: isPreviewEnabled && !voicing.isEmpty,
                action: { onPreview(voicing, active.nativeDuration(bpm: section.bpm)) },
                showsSingBackHint: false,
                fixedHeight: compact ? 44 : nil
            ) {
                FittedRomanNumeral(
                    display: RomanNumeralDisplay(symbol: symbol, borrowed: active.chord["borrowed"]),
                    maximumFontSize: 36,
                    minimumFontSize: 12,
                    color: .white
                )
                .frame(maxWidth: .infinity, minHeight: compact ? 34 : 58)
            }
            .frame(maxWidth: .infinity)
            } else {
                QuizEmptyCardSlot(
                    fixedHeight: compact ? 44 : nil
                )
            }
        }
        .accessibilityIdentifier("quiz.chordCard")
    }

    @ViewBuilder
    private func chordToneCards(active: QuizCardsPresentation.ActiveChord?) -> some View {
        QuizCardSection("Chord Tones", compact: compact) {
            if let active, !active.isRest {
            let key = section.key(at: active.onset)
            let tones = ChordInterpreter.chordNotes(for: active.chord, key: key)
            let root = ChordInterpreter.rootPositionChordNotes(for: active.chord, key: key).first
            if let root, !tones.isEmpty {
                ChordToneCardLayout(tones: tones, rootMIDI: root) { index, tone, label in
                    toneCard(tone: tone, label: label, chord: active.chord, key: key, index: index)
                }
            } else {
                QuizEmptyCardSlot(
                    fixedHeight: compact ? 44 : nil
                )
            }
            } else {
                QuizEmptyCardSlot(
                    fixedHeight: compact ? 44 : nil
                )
            }
        }
    }

    private func toneCard(
        tone: Int,
        label: String,
        chord: [String: JSONValue],
        key: KeyInfo,
        index: Int
    ) -> some View {
        let preview = chordTonePreviewMIDI(tone, chord: chord, key: key)
        return QuizCardButton(
            title: "Play chord tone \(label)",
            identifier: "quiz.chordTone.\(index)",
            enabled: isPreviewEnabled,
            action: { onPreview([preview], .milliseconds(450)) },
            doubleTapAction: singBackAction([preview], labels: [label]),
            longPressAction: persistentAction(.chordTone(requestedIndex: index)),
            doubleTapActionName: "Sing Back",
            isTessituraEnabled: isTessituraEnabled,
            showsPitchGauge: showsPitchGauge(.chordTone(displayedIndex: index)),
            fixedHeight: compact ? 44 : nil
        ) {
            FittedScaleDegree(label, maximumFontSize: 28, minimumFontSize: 11, color: .white)
                .frame(maxWidth: .infinity, minHeight: compact ? 34 : 44)
        }
    }

    @ViewBuilder
    private func pitchCard(
        title: String,
        pitch: SpelledPitch,
        degree: String,
        identifier: String,
        fixedHeight: CGFloat? = nil,
        showsPitchGauge: Bool = false
    ) -> some View {
        QuizCardButton(
            title: "Play \(title) \(pitch.displayName), scale degree \(degree)",
            identifier: identifier,
            enabled: isPreviewEnabled && !degree.isEmpty,
            action: { onPreview([previewMIDI(for: pitch)], .milliseconds(450)) },
            doubleTapAction: singBackAction([previewMIDI(for: pitch)], labels: [degree]),
            longPressAction: persistentAction(.melody),
            doubleTapActionName: "Sing Back",
            isTessituraEnabled: isTessituraEnabled,
            showsPitchGauge: showsPitchGauge,
            fixedHeight: fixedHeight
        ) {
            FittedScaleDegree(degree, maximumFontSize: 32, minimumFontSize: 11, color: .white)
                .frame(maxWidth: .infinity)
        }
    }

    private func positionedPitchCard(
        _ card: MelodyPitchCard,
        title: String,
        identifier: String
    ) -> some View {
        VStack(spacing: 0) {
            if case .bottom = card.verticalPosition { Spacer(minLength: 0) }
            pitchCard(
                title: title,
                pitch: card.pitch,
                degree: card.scaleDegreeLabel,
                identifier: identifier,
                fixedHeight: MelodyCardLayout.pairHeight
            )
            if case .top = card.verticalPosition { Spacer(minLength: 0) }
        }
        .frame(height: MelodyCardLayout.singleOrIntervalHeight)
    }

    @ViewBuilder
    private func intervalCard(
        title: String,
        previous: SpelledPitch?,
        current: SpelledPitch?,
        interval: NamedInterval?,
        identifier: String,
        labels: [String],
        fixedHeight: CGFloat? = nil,
        showsPitchGauge: Bool = false
    ) -> some View {
        if let previous, let current, let interval {
            QuizCardButton(
                title: "Play \(title) \(previous.displayName) to \(current.displayName), \(interval.spokenName)",
                identifier: identifier,
                enabled: isPreviewEnabled,
                action: { onIntervalPreview(intervalPreviewPair(previous: previous, current: current)) },
                doubleTapAction: singBackAction(intervalPreviewPair(previous: previous, current: current), labels: labels),
                longPressAction: persistentAction(identifier.hasPrefix("quiz.root") ? .simpleRoot : .melody),
                previewActionName: "Preview sequence and together",
                doubleTapActionName: "Sing Back Interval",
                isTessituraEnabled: isTessituraEnabled,
                showsPitchGauge: showsPitchGauge,
                fixedHeight: fixedHeight
            ) {
                // The shorthand already carries the direction arrow; the note letters
                // it used to sit above are the source spelling, not the interval.
                Text(interval.shorthand)
                    .font(.custom("Roboto-Bold", size: 32, relativeTo: .title3))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .frame(maxWidth: .infinity)
            }
        } else {
            QuizEmptyCardSlot(fixedHeight: fixedHeight)
        }
    }

    private func melodyPitch(for note: MelodyNote) -> SpelledPitch? {
        MusicTheory.spelledPitch(
            scaleDegree: note.sd,
            relativeOctave: note.octave,
            key: section.key(at: PlaybackTiming.normalize(beat: note.beat))
        )
    }

    private func degreeLabel(for pitch: SpelledPitch, sourceKey: KeyInfo) -> String {
        usesRelativeIonianContext
            ? RelativeIonianContext.degreeLabel(for: pitch, contextKey: ionianContextKey)
            : MusicTheory.degreeLabel(for: pitch, key: sourceKey)
    }

    private func previewMIDI(for pitch: SpelledPitch) -> Int {
        guard usesRelativeIonianContext else { return pitch.midiNote }
        return RelativeIonianContext.previewMIDI(for: pitch, contextKey: ionianContextKey) ?? pitch.midiNote
    }

    private func chordPreviewNotes(for chord: [String: JSONValue], key: KeyInfo) -> [Int] {
        ChordInterpreter.chordNotes(for: chord, key: key)
    }

    private func chordTonePreviewMIDI(_ tone: Int, chord: [String: JSONValue], key: KeyInfo) -> Int {
        guard usesRelativeIonianContext,
              let spelledRoot = ChordInterpreter.resolvedRoot(for: chord, key: key)?.pitch
        else { return tone }
        let spelledTone = SpelledPitch.spellRelative(from: spelledRoot, toMIDI: tone)
        return RelativeIonianContext.previewMIDI(for: spelledTone, contextKey: ionianContextKey) ?? tone
    }

    private func intervalPreviewPair(previous: SpelledPitch, current: SpelledPitch) -> [Int] {
        guard usesRelativeIonianContext else { return [previous.midiNote, current.midiNote] }
        let registerShift = previewMIDI(for: previous) - previous.midiNote
        return [previous.midiNote + registerShift, current.midiNote + registerShift]
    }

    private func singBackAction(_ notes: [Int], labels: [String] = []) -> (() -> Void)? {
        guard let onSingBack, let first = notes.first else { return nil }
        return {
            singingRequestID &+= 1
            onSingBack(SingingTargetRequest(
                first: SingingTargetNote(sourceMIDI: first, scaleDegreeLabel: labels.first ?? "First note"),
                second: notes.count > 1 ? SingingTargetNote(sourceMIDI: notes[1], scaleDegreeLabel: labels.count > 1 ? labels[1] : "Second note") : nil,
                requestID: singingRequestID
            ))
        }
    }

    private func persistentAction(_ selection: PersistentPitchSelection) -> (() -> Void)? {
        guard let onPersistentPractice else { return nil }
        return { onPersistentPractice(selection) }
    }

    private func practiceTargets(
        activeChord: QuizCardsPresentation.ActiveChord?,
        activeMelody: MelodyNote?,
        rootState: ChordRootIntervalState?
    ) -> QuizPracticeTargets {
        var root: QuizPitchCardTarget?
        var tones: [QuizPitchCardTarget] = []
        if let activeChord, !activeChord.isRest {
            let key = section.key(at: activeChord.onset)
            if let pitch = rootState?.currentIntervalPitch {
                root = QuizPitchCardTarget(sourceMIDI: previewMIDI(for: pitch), label: degreeLabel(for: pitch, sourceKey: key))
            }
            let notes = ChordInterpreter.chordNotes(for: activeChord.chord, key: key)
            if let chordRoot = ChordInterpreter.rootPositionChordNotes(for: activeChord.chord, key: key).first {
                tones = notes.map { note in
                    QuizPitchCardTarget(
                        sourceMIDI: chordTonePreviewMIDI(note, chord: activeChord.chord, key: key),
                        label: MusicTheory.relativeMajorDegreeLabel(midi: note, rootMIDI: chordRoot)
                    )
                }
            }
        }
        let melody = activeMelody.flatMap { note -> QuizPitchCardTarget? in
            guard !note.isRest, note.duration > 0, let pitch = melodyPitch(for: note) else { return nil }
            return QuizPitchCardTarget(
                sourceMIDI: previewMIDI(for: pitch),
                label: degreeLabel(for: pitch, sourceKey: section.key(at: PlaybackTiming.normalize(beat: note.beat)))
            )
        }
        return QuizPracticeTargets(
            root: root, melody: melody, chordTones: tones,
            melodyRuns: presentation.practiceRuns(lockedInMajor: usesRelativeIonianContext)
        )
    }
}

private final class QuizCardsPresentation {
    struct ActiveChord: Equatable {
        let chord: [String: JSONValue]
        let onset: Double
        let duration: Double

        var isRest: Bool {
            chord["isRest"]?.boolValue == true || chord["rest"]?.boolValue == true
        }

        func nativeDuration(bpm: Double) -> Duration {
            let eventEndBeat = PlaybackTiming.eventEndBeat(beat: onset, duration: duration)
            let milliseconds = eventEndBeat.flatMap {
                PlaybackTiming.remainingMilliseconds(eventEndBeat: $0, currentBeat: onset, bpm: bpm)
            } ?? 40
            return .milliseconds(Int64(milliseconds))
        }
    }

    private let section: ExtractedSection
    private let index: ActiveEventIndex
    private var cachedRootState: (active: ActiveChord, state: ChordRootIntervalState?)?
    private var cachedMelodyState: (active: MelodyNote, state: MelodyIntervalState?)?
    private var cachedPracticeRuns: (locked: Bool, runs: [MelodyTimelinePitchRun])?

    init(section: ExtractedSection) {
        self.section = section
        index = ActiveEventIndex(section: section, melody: section.melodyNotes)
    }

    func activeChord(at beat: Double) -> ActiveChord? {
        guard let chord = index.chord(at: beat) else { return nil }
        return ActiveChord(
            chord: chord,
            onset: PlaybackTiming.normalize(beat: chord["beat"]?.doubleValue ?? PlaybackTiming.firstBeat),
            duration: chord["duration"]?.doubleValue ?? 1
        )
    }

    func practiceRuns(lockedInMajor: Bool) -> [MelodyTimelinePitchRun] {
        if let cachedPracticeRuns, cachedPracticeRuns.locked == lockedInMajor { return cachedPracticeRuns.runs }
        let visuals = MelodyTimelinePresentation(section: section, usesRelativeIonianContext: lockedInMajor)
        let runs = visuals.pitchRuns
        cachedPracticeRuns = (lockedInMajor, runs)
        return runs
    }

    func activeMelody(at beat: Double) -> MelodyNote? {
        index.melodyNote(at: beat)
    }

    func rootState(at beat: Double, activeChord: ActiveChord?) -> ChordRootIntervalState? {
        guard let activeChord, !activeChord.isRest else { return nil }
        if let cachedRootState, cachedRootState.active == activeChord { return cachedRootState.state }
        let state = QuizIntervals.resolveChordRootState(section: section, currentBeat: beat)
        cachedRootState = (activeChord, state)
        return state
    }

    func melodyState(at beat: Double, activeMelody: MelodyNote?) -> MelodyIntervalState? {
        guard let activeMelody else { return nil }
        if let cachedMelodyState, cachedMelodyState.active == activeMelody { return cachedMelodyState.state }
        let state = QuizIntervals.resolveMelodyState(
            melody: section.melodyNotes,
            currentBeat: beat,
            keyAtBeat: section.key(at:)
        )
        cachedMelodyState = (activeMelody, state)
        return state
    }
}

private struct QuizCardSection<Content: View>: View {
    let title: String
    let compact: Bool
    @ViewBuilder let content: () -> Content

    init(_ title: String, compact: Bool = false, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.compact = compact
        self.content = content
    }

    var body: some View {
        if compact {
            HStack(alignment: .center, spacing: 8) {
                Text(title)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .multilineTextAlignment(.leading)
                    .frame(width: 44, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                content()
                    .frame(maxWidth: .infinity)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(title)
        } else {
            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                content()
            }
        }
    }
}

private struct QuizCardButton<Content: View>: View {
    let title: String
    let identifier: String
    let enabled: Bool
    let action: () -> Void
    let doubleTapAction: (() -> Void)?
    let longPressAction: (() -> Void)?
    let previewActionName: String
    let doubleTapActionName: String
    let longPressActionName: String
    let isTessituraEnabled: Bool
    let showsSingBackHint: Bool
    /// Whether this is the card currently under persistent practice.
    let showsPitchGauge: Bool
    let fixedHeight: CGFloat?
    @ViewBuilder let content: () -> Content
    @Environment(VocalPracticeModel.self) private var vocalPractice: VocalPracticeModel?

    init(
        title: String,
        identifier: String,
        enabled: Bool,
        action: @escaping () -> Void,
        doubleTapAction: (() -> Void)? = nil,
        longPressAction: (() -> Void)? = nil,
        previewActionName: String = "Preview",
        doubleTapActionName: String = "Practice",
        longPressActionName: String = "Persistent pitch practice",
        isTessituraEnabled: Bool = false,
        showsSingBackHint: Bool = true,
        showsPitchGauge: Bool = false,
        fixedHeight: CGFloat? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.identifier = identifier
        self.enabled = enabled
        self.action = action
        self.doubleTapAction = doubleTapAction
        self.longPressAction = longPressAction
        self.previewActionName = previewActionName
        self.doubleTapActionName = doubleTapActionName
        self.longPressActionName = longPressActionName
        self.isTessituraEnabled = isTessituraEnabled
        self.showsSingBackHint = showsSingBackHint
        self.showsPitchGauge = showsPitchGauge
        self.fixedHeight = fixedHeight
        self.content = content
    }

    private var hasSingBackHint: Bool {
        enabled && showsSingBackHint && doubleTapAction != nil
    }

    /// Only the one card wearing the gauge reads the sampled percentage, so the 4 Hz
    /// invalidation that costs is confined to it.
    private var accessibilityValueText: String {
        let register = hasSingBackHint
            ? (isTessituraEnabled ? "Tessitura enabled" : "Original target octave")
            : ""
        guard showsPitchGauge else { return register }
        let pitch = vocalPractice?.sampledLivePercentageText
            .map { "pitch \($0) from target" } ?? "waiting for a voiced pitch"
        return register.isEmpty ? pitch : "\(register), \(pitch)"
    }

    var body: some View {
        QuizCardActions(
            accessibilityLabel: title,
            isEnabled: enabled,
            onTap: action,
            onDoubleTap: doubleTapAction,
            onLongPress: longPressAction,
            previewActionName: previewActionName,
            doubleTapActionName: doubleTapActionName,
            longPressActionName: longPressActionName
        ) {
            content()
                .padding(.horizontal, 8)
                // Short paired cards would lose most of their content box to the
                // standard inset, so the padding scales with the card.
                .padding(.vertical, fixedHeight.map { $0 <= 24 } == true ? 2 : 5)
                .frame(maxWidth: .infinity)
                .frame(height: fixedHeight)
        }
        .foregroundStyle(.white)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.tint)
                .overlay { if showsPitchGauge { QuizPitchGauge() } }
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .overlay(alignment: .topTrailing) {
            if hasSingBackHint {
                PitchHintDot(isAdjusted: isTessituraEnabled)
                    .padding(fixedHeight.map { $0 <= 24 } == true ? 1 : fixedHeight.map { $0 <= 44 } == true ? 3 : 5)
            }
        }
        .accessibilityValue(accessibilityValueText)
        .accessibilityHint(enabled
            ? (doubleTapAction != nil ? "Tap to preview. Double tap to sing back." : "Tap to preview.")
                + (longPressAction != nil ? " Long press to toggle persistent pitch practice." : "")
            : "Preview unavailable")
        .opacity(enabled ? 1 : 0.45)
        .accessibilityIdentifier(identifier)
    }
}

/// A chord's tones as scale-degree cards, labeled relative to the chord's root-position root.
/// Shared so the quiz stack and the song chord inventory agree on spelling and wrapping;
/// each call site supplies its own card chrome and gestures.
struct ChordToneCardLayout<Card: View>: View {
    let tones: [Int]
    let rootMIDI: Int
    /// Receives the tone's index, its source MIDI, and its degree label.
    @ViewBuilder let card: (Int, Int, String) -> Card

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: tones.count >= 7 ? 3 : 7) { cards }
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 56), spacing: 8)],
                spacing: 8
            ) { cards }
        }
    }

    private var cards: some View {
        ForEach(Array(tones.enumerated()), id: \.offset) { index, tone in
            card(index, tone, MusicTheory.relativeMajorDegreeLabel(midi: tone, rootMIDI: rootMIDI))
        }
    }
}

/// A quiz card drawn purely as a picture: the same tint fill, 14pt continuous radius, white
/// content and corner pitch-hint dot as `QuizCardButton`, minus every gesture, model read and
/// accessibility action. The introduction uses it to show what a card is before the learner has
/// met one, which is why the chrome here is a copy of that card's and not a look-alike.
struct QuizExampleCard<Content: View>: View {
    var fixedHeight: CGFloat = 44
    var showsPitchHint: Bool = true
    var isTessituraAdjusted: Bool = false
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity)
            .frame(height: fixedHeight)
            .background(.tint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(alignment: .topTrailing) {
                if showsPitchHint {
                    PitchHintDot(isAdjusted: isTessituraAdjusted)
                        .padding(fixedHeight <= 44 ? 3 : 5)
                }
            }
            .allowsHitTesting(false)
            // Decorative: every call site describes the row it sits in.
            .accessibilityHidden(true)
    }
}

/// Shared decorative singing affordance. Color describes register handling, not microphone activity.
struct PitchHintDot: View {
    let isAdjusted: Bool

    var body: some View {
        let color = isAdjusted ? Color(red: 158.0 / 255, green: 158.0 / 255, blue: 158.0 / 255) : .white
        RadialGradient(
            stops: [
                .init(color: color, location: 0),
                .init(color: color.opacity(0.95), location: 0.10),
                .init(color: color.opacity(0.80), location: 0.22),
                .init(color: color.opacity(0.58), location: 0.36),
                .init(color: color.opacity(0.36), location: 0.52),
                .init(color: color.opacity(0.18), location: 0.68),
                .init(color: color.opacity(0.07), location: 0.84),
                .init(color: color.opacity(0), location: 1)
            ],
            center: .center, startRadius: 0, endRadius: 8
        )
        .frame(width: 16, height: 16)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// A single arbitration point for future card-practice gestures. With no optional
/// handlers it intentionally remains a native Button; adding a handler swaps to
/// one exclusive recognizer chain so a Button action cannot click through.
private struct QuizCardActions<Content: View>: View {
    let accessibilityLabel: String
    let isEnabled: Bool
    let onTap: () -> Void
    let onDoubleTap: (() -> Void)?
    let onLongPress: (() -> Void)?
    let previewActionName: String
    let doubleTapActionName: String
    let longPressActionName: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        if let onLongPress {
            if let onDoubleTap {
                gestureControl
                    .gesture(longPressThenDoubleTapGesture(onLongPress, onDoubleTap: onDoubleTap))
                    .quizCardAccessibility(
                        label: accessibilityLabel,
                        isEnabled: isEnabled,
                        onTap: onTap,
                        onDoubleTap: onDoubleTap,
                        onLongPress: onLongPress,
                        previewActionName: previewActionName,
                        doubleTapActionName: doubleTapActionName,
                        longPressActionName: longPressActionName
                    )
            } else {
                gestureControl
                    .gesture(longPressThenSingleTapGesture(onLongPress))
                    .quizCardAccessibility(
                        label: accessibilityLabel,
                        isEnabled: isEnabled,
                        onTap: onTap,
                        onDoubleTap: nil,
                        onLongPress: onLongPress,
                        previewActionName: previewActionName,
                        doubleTapActionName: doubleTapActionName,
                        longPressActionName: longPressActionName
                    )
            }
        } else if let onDoubleTap {
            gestureControl
                .gesture(doubleTapGesture(onDoubleTap))
                .quizCardAccessibility(
                    label: accessibilityLabel,
                    isEnabled: isEnabled,
                    onTap: onTap,
                    onDoubleTap: onDoubleTap,
                    onLongPress: nil,
                    previewActionName: previewActionName,
                    doubleTapActionName: doubleTapActionName,
                    longPressActionName: longPressActionName
                )
        } else {
            Button(action: perform(onTap)) { content() }
                .buttonStyle(.plain)
                .disabled(!isEnabled)
                .quizCardAccessibility(
                    label: accessibilityLabel,
                    isEnabled: isEnabled,
                    onTap: onTap,
                    onDoubleTap: nil,
                    onLongPress: nil,
                    previewActionName: previewActionName,
                    doubleTapActionName: doubleTapActionName,
                    longPressActionName: longPressActionName
                )
        }
    }

    private var gestureControl: some View {
        content()
            .contentShape(Rectangle())
            .allowsHitTesting(isEnabled)
    }

    private func doubleTapGesture(_ action: @escaping () -> Void) -> some Gesture {
        TapGesture(count: 2)
            .onEnded { _ in perform(action)() }
            .exclusively(before: TapGesture().onEnded { _ in perform(onTap)() })
    }

    private func longPressThenDoubleTapGesture(
        _ action: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void
    ) -> some Gesture {
        LongPressGesture(minimumDuration: 0.5)
            .onEnded { _ in perform(action)() }
            .exclusively(before: doubleTapGesture(onDoubleTap))
    }

    private func longPressThenSingleTapGesture(_ action: @escaping () -> Void) -> some Gesture {
        LongPressGesture(minimumDuration: 0.5)
            .onEnded { _ in perform(action)() }
            .exclusively(before: TapGesture().onEnded { _ in perform(onTap)() })
    }

    private func perform(_ action: @escaping () -> Void) -> () -> Void {
        { if isEnabled { action() } }
    }
}

private extension View {
    @ViewBuilder
    func quizCardAccessibility(
        label: String,
        isEnabled: Bool,
        onTap: @escaping () -> Void,
        onDoubleTap: (() -> Void)?,
        onLongPress: (() -> Void)?,
        previewActionName: String,
        doubleTapActionName: String,
        longPressActionName: String
    ) -> some View {
        if let onDoubleTap, let onLongPress {
            self.quizCardAccessibilityBase(label: label, isEnabled: isEnabled, onTap: onTap, previewActionName: previewActionName)
                .accessibilityAction(named: doubleTapActionName) { if isEnabled { onDoubleTap() } }
                .accessibilityAction(named: longPressActionName) { if isEnabled { onLongPress() } }
        } else if let onDoubleTap {
            self.quizCardAccessibilityBase(label: label, isEnabled: isEnabled, onTap: onTap, previewActionName: previewActionName)
                .accessibilityAction(named: doubleTapActionName) { if isEnabled { onDoubleTap() } }
        } else if let onLongPress {
            self.quizCardAccessibilityBase(label: label, isEnabled: isEnabled, onTap: onTap, previewActionName: previewActionName)
                .accessibilityAction(named: longPressActionName) { if isEnabled { onLongPress() } }
        } else {
            self.quizCardAccessibilityBase(label: label, isEnabled: isEnabled, onTap: onTap, previewActionName: previewActionName)
        }
    }

    private func quizCardAccessibilityBase(
        label: String,
        isEnabled: Bool,
        onTap: @escaping () -> Void,
        previewActionName: String
    ) -> some View {
        accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(label)
            .accessibilityHint(isEnabled ? "Plays a preview" : "Preview unavailable")
            .accessibilityAction { if isEnabled { onTap() } }
            .accessibilityAction(named: previewActionName) { if isEnabled { onTap() } }
    }
}

/// Preserve the row/slot geometry during rests, but draw no card and expose no
/// placeholder or dead control to touch/VoiceOver.
private struct QuizEmptyCardSlot: View {
    let fixedHeight: CGFloat?

    var body: some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: fixedHeight ?? 44)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
