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

    /// Root-only reads left to right: a narrow previous root, then the current root and
    /// the interval that got you there sharing the two wider, taller columns.
    private enum RootCardLayout {
        static let previousHeight: CGFloat = 128
        static let featuredHeight: CGFloat = 162
        static let columnGap: CGFloat = 8
        /// The previous root keeps the old layout's 40/60 ratio against the current root.
        static let previousWidthShare: CGFloat = 0.4 / 1.6
    }

    let section: ExtractedSection
    let beat: Double
    let rootOnly: Bool
    let usesRelativeIonianContext: Bool
    let isPreviewEnabled: Bool
    /// Removes visual section labels and uses the fixed-height card rows needed by the single-screen quiz.
    let compact: Bool
    let onPreview: ([Int], Duration) -> Void
    let onIntervalPreview: ([Int]) -> Void
    let onSingBack: ((SingingTargetRequest) -> Void)?
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
        onPreview: @escaping ([Int], Duration) -> Void,
        onIntervalPreview: @escaping ([Int]) -> Void,
        onSingBack: ((SingingTargetRequest) -> Void)? = nil,
        onPracticeContext: ((QuizPracticeTargets) -> Void)? = nil
    ) {
        self.section = section
        self.beat = beat
        self.rootOnly = rootOnly
        self.usesRelativeIonianContext = usesRelativeIonianContext
        self.isPreviewEnabled = isPreviewEnabled
        self.compact = compact
        self.onPreview = onPreview
        self.onIntervalPreview = onIntervalPreview
        self.onSingBack = onSingBack
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

    /// Root-only is the one interface that still wears the on-card gauge, because it has no
    /// melody timeline to carry the reading. In Full the marker on the timeline is the whole
    /// of the feedback, so no melody, interval or chord-tone card draws a gauge.
    private func showsPitchGauge(_ position: PersistentPitchCardPosition) -> Bool {
        vocalPractice?.gaugePosition == position
    }

    @ViewBuilder
    private func rootOnlyCards(rootState: ChordRootIntervalState?) -> some View {
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
                let availableWidth = max(0, row.size.width - RootCardLayout.columnGap * 2)
                let previousWidth = availableWidth * RootCardLayout.previousWidthShare
                let featuredWidth = (availableWidth - previousWidth) / 2
                HStack(alignment: .bottom, spacing: RootCardLayout.columnGap) {
                    rootOnlyRootCard(
                        title: "Previous Root",
                        accessibilityTitle: "Previous root",
                        pitch: previous,
                        degree: previousLabel,
                        identifier: "quiz.root.previous",
                        fixedHeight: RootCardLayout.previousHeight
                    )
                    .frame(width: previousWidth)
                    rootOnlyRootCard(
                        title: "Current Root",
                        accessibilityTitle: "Current root",
                        pitch: current,
                        degree: currentLabel,
                        identifier: "quiz.root.current",
                        fixedHeight: RootCardLayout.featuredHeight,
                        maximumDegreeFontSize: 52,
                        showsPitchGauge: showsPitchGauge(.simpleRoot)
                    )
                    .frame(width: featuredWidth)
                    if let previous, let current, let interval, previous != current {
                        intervalCard(
                            title: "Root interval",
                            previous: previous,
                            current: current,
                            interval: interval,
                            identifier: "quiz.root.interval",
                            labels: [previousLabel, currentLabel],
                            fixedHeight: RootCardLayout.featuredHeight
                        )
                        .frame(width: featuredWidth)
                    } else {
                        QuizEmptyCardSlot(fixedHeight: RootCardLayout.featuredHeight)
                            .frame(width: featuredWidth)
                    }
                }
            }
            .frame(height: RootCardLayout.featuredHeight)
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
        maximumDegreeFontSize: CGFloat = 42,
        showsPitchGauge: Bool = false
    ) -> some View {
        if let pitch {
            QuizCardButton(
                title: "Play \(accessibilityTitle) \(pitch.displayName), scale degree \(degree)",
                identifier: identifier,
                enabled: isPreviewEnabled && !degree.isEmpty,
                action: { onPreview([previewMIDI(for: pitch)], .milliseconds(450)) },
                doubleTapAction: singBackAction([previewMIDI(for: pitch)], labels: [degree]),
                doubleTapActionName: "Sing Back",
                showsPitchGauge: showsPitchGauge,
                fixedHeight: fixedHeight
            ) {
                VStack(spacing: 6) {
                    Text(title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.78))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    FittedScaleDegree(
                        degree,
                        maximumFontSize: maximumDegreeFontSize,
                        minimumFontSize: 13,
                        color: .white
                    )
                    .frame(maxWidth: .infinity)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .quizHelpTarget(.quizNotes)
        } else {
            QuizEmptyCardSlot(fixedHeight: fixedHeight)
        }
    }

    /// The melody row is always the same two columns: the note pair on the left, the melody
    /// interval on the right. Both columns are fixtures - present through rests, unisons and
    /// first notes alike - so the row never reflows and the eye always finds the interval in
    /// one place. Only the strings inside the cards come and go.
    private func melodyCards(active: MelodyNote?, state: MelodyIntervalState?) -> some View {
        QuizCardSection("Melody", compact: compact) {
            GeometryReader { row in
                let halfWidth = max(0, (row.size.width - 8) / 2)
                HStack(alignment: .center, spacing: 8) {
                    melodyPairColumn(active: active, state: state)
                        .frame(width: halfWidth)
                    melodyIntervalColumn(active: active, state: state)
                        .frame(width: halfWidth)
                }
            }
            .frame(height: MelodyCardLayout.singleOrIntervalHeight)
        }
    }

    /// The sounding melody note and its degree label, or nil through rests and gaps. Resolved
    /// in one place so the pair and the interval card can never disagree about what is playing.
    private func soundingMelody(_ active: MelodyNote?) -> (pitch: SpelledPitch, label: String)? {
        guard let active, !active.isRest, active.duration > 0, let pitch = melodyPitch(for: active) else {
            return nil
        }
        return (
            pitch,
            degreeLabel(for: pitch, sourceKey: section.key(at: PlaybackTiming.normalize(beat: active.beat)))
        )
    }

    private func melodyIntervalLabels(_ state: MelodyIntervalState, currentLabel: String) -> [String] {
        [
            usesRelativeIonianContext
                ? RelativeIonianContext.degreeLabel(for: state.previous, contextKey: ionianContextKey)
                : state.previousDegreeLabel,
            currentLabel
        ]
    }

    /// Previous note on the left, current note on the right, each 44pt inside the 88pt row.
    /// With an interval the two sit high and low to draw its direction; without one - a
    /// repeated note, or a first note with no predecessor - the current note stays in its own
    /// column and centres between those two positions, so gaining a predecessor slides the
    /// card rather than throwing it across the row.
    @ViewBuilder
    private func melodyPairColumn(active: MelodyNote?, state: MelodyIntervalState?) -> some View {
        HStack(spacing: 8) {
            if let sounding = soundingMelody(active) {
                let cards = state.map {
                    QuizIntervals.melodyPitchCards(
                        for: $0,
                        previousLabel: usesRelativeIonianContext
                            ? RelativeIonianContext.degreeLabel(for: $0.previous, contextKey: ionianContextKey)
                            : $0.previousDegreeLabel,
                        currentLabel: sounding.label
                    )
                } ?? []
                if QuizIntervals.melodyPitchCardDisplayMode(
                    currentPitch: sounding.pitch,
                    intervalState: state
                ) == .interval, let previous = cards.first(where: { $0.role == .previous }),
                   let currentCard = cards.first(where: { $0.role == .current }) {
                    positionedPitchCard(previous, title: "Previous melody note", identifier: "quiz.melody.previous")
                    positionedPitchCard(currentCard, title: "Current melody note", identifier: "quiz.melody.current")
                } else {
                    melodyPairPlaceholder
                    pitchCard(
                        title: "Current melody note",
                        pitch: sounding.pitch,
                        degree: sounding.label,
                        identifier: "quiz.melody.current",
                        fixedHeight: MelodyCardLayout.pairHeight
                    )
                    .frame(height: MelodyCardLayout.singleOrIntervalHeight, alignment: .center)
                }
            } else {
                melodyPairPlaceholder
                melodyPairPlaceholder
            }
        }
    }

    private var melodyPairPlaceholder: some View {
        QuizEmptyCardSlot(fixedHeight: MelodyCardLayout.pairHeight)
            .frame(height: MelodyCardLayout.singleOrIntervalHeight)
    }

    /// The interval card. Always drawn, and always the same card: identical tint, size and
    /// opacity whether a note, a rest or nothing at all is playing. The only thing that comes
    /// and goes is the interval string, so the card reads as the one place an interval lives
    /// rather than as something appearing and disappearing. It never wears the pitch gauge -
    /// that rides the current note's own card, which is the pitch being measured.
    @ViewBuilder
    private func melodyIntervalColumn(active: MelodyNote?, state: MelodyIntervalState?) -> some View {
        if let sounding = soundingMelody(active),
           let state,
           QuizIntervals.melodyPitchCardDisplayMode(
               currentPitch: sounding.pitch,
               intervalState: state
           ) == .interval {
            intervalCard(
                title: "Melody interval",
                previous: state.previous,
                current: state.current,
                interval: state.interval,
                identifier: "quiz.melody.interval",
                labels: melodyIntervalLabels(state, currentLabel: sounding.label),
                fixedHeight: MelodyCardLayout.singleOrIntervalHeight
            )
        } else {
            // Deliberately the picture-only card rather than a disabled `QuizCardButton`:
            // disabling dims to 45%, which would make the card change shade as the melody
            // moves in and out of having an interval.
            QuizExampleCard(fixedHeight: MelodyCardLayout.singleOrIntervalHeight) {
                Color.clear
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
            .quizHelpTarget(.quizChord)
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
            let interpreted = ChordInterpreter.interpret(active.chord, key: key)
            if !interpreted.midi.isEmpty {
                ChordToneCardLayout(tones: interpreted.midi, labels: interpreted.toneLabels) { index, tone, label in
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
            doubleTapActionName: "Sing Back",
            fixedHeight: compact ? 44 : nil
        ) {
            FittedScaleDegree(label, maximumFontSize: 28, minimumFontSize: 11, color: .white)
                .frame(maxWidth: .infinity, minHeight: compact ? 34 : 44)
        }
        .quizHelpTarget(.quizNotes)
    }

    @ViewBuilder
    private func pitchCard(
        title: String,
        pitch: SpelledPitch,
        degree: String,
        identifier: String,
        fixedHeight: CGFloat? = nil
    ) -> some View {
        QuizCardButton(
            title: "Play \(title) \(pitch.displayName), scale degree \(degree)",
            identifier: identifier,
            enabled: isPreviewEnabled && !degree.isEmpty,
            action: { onPreview([previewMIDI(for: pitch)], .milliseconds(450)) },
            doubleTapAction: singBackAction([previewMIDI(for: pitch)], labels: [degree]),
            doubleTapActionName: "Sing Back",
            fixedHeight: fixedHeight
        ) {
            FittedScaleDegree(degree, maximumFontSize: 32, minimumFontSize: 11, color: .white)
                .frame(maxWidth: .infinity)
        }
        .quizHelpTarget(.quizNotes)
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
        fixedHeight: CGFloat? = nil
    ) -> some View {
        if let previous, let current, let interval {
            QuizCardButton(
                title: "Play \(title) \(previous.displayName) to \(current.displayName), \(interval.spokenName)",
                identifier: identifier,
                enabled: isPreviewEnabled,
                action: { onIntervalPreview(intervalPreviewPair(previous: previous, current: current)) },
                doubleTapAction: singBackAction(intervalPreviewPair(previous: previous, current: current), labels: labels),
                previewActionName: "Preview sequence and together",
                doubleTapActionName: "Sing Back Interval",
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
            .quizHelpTarget(.quizNotes)
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
            let interpreted = ChordInterpreter.interpret(activeChord.chord, key: key)
            tones = zip(interpreted.midi, interpreted.toneLabels).map { note, label in
                QuizPitchCardTarget(
                    sourceMIDI: chordTonePreviewMIDI(note, chord: activeChord.chord, key: key),
                    label: label
                )
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
    let previewActionName: String
    let doubleTapActionName: String
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
        previewActionName: String = "Preview",
        doubleTapActionName: String = "Practice",
        showsPitchGauge: Bool = false,
        fixedHeight: CGFloat? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.identifier = identifier
        self.enabled = enabled
        self.action = action
        self.doubleTapAction = doubleTapAction
        self.previewActionName = previewActionName
        self.doubleTapActionName = doubleTapActionName
        self.showsPitchGauge = showsPitchGauge
        self.fixedHeight = fixedHeight
        self.content = content
    }

    /// Only the one card wearing the gauge reads the sampled reading, so the 4 Hz
    /// invalidation that costs is confined to it.
    private var accessibilityValueText: String {
        guard showsPitchGauge else { return "" }
        return vocalPractice?.sampledLiveCentsText
            .map { "pitch \($0) from target" } ?? "waiting for a voiced pitch"
    }

    var body: some View {
        QuizCardActions(
            accessibilityLabel: title,
            isEnabled: enabled,
            onTap: action,
            onDoubleTap: doubleTapAction,
            previewActionName: previewActionName,
            doubleTapActionName: doubleTapActionName
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
        .accessibilityValue(accessibilityValueText)
        .accessibilityHint(enabled
            ? (doubleTapAction != nil ? "Tap to preview. Double tap to sing back." : "Tap to preview.")
            : "Preview unavailable")
        .opacity(enabled ? 1 : 0.45)
        .accessibilityIdentifier(identifier)
    }
}

/// A chord's tones as cards carrying their interpreted musical-role labels.
/// Shared so the quiz stack and the song chord inventory agree on spelling and wrapping;
/// each call site supplies its own card chrome and gestures.
struct ChordToneCardLayout<Card: View>: View {
    let tones: [Int]
    let labels: [String]
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
            card(index, tone, labels[index])
        }
    }
}

/// A quiz card drawn purely as a picture: the same tint fill, 14pt continuous radius, white
/// content and corner pitch-hint dot as `QuizCardButton`, minus every gesture, model read and
/// accessibility action. The introduction uses it to show what a card is before the learner has
/// met one, which is why the chrome here is a copy of that card's and not a look-alike.
struct QuizExampleCard<Content: View>: View {
    var fixedHeight: CGFloat = 44
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity)
            .frame(height: fixedHeight)
            .background(.tint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .allowsHitTesting(false)
            // Decorative: every call site describes the row it sits in.
            .accessibilityHidden(true)
    }
}

/// A single arbitration point for card gestures. Without a double-tap handler it
/// intentionally remains a native Button; adding one swaps to an exclusive recognizer
/// chain so a Button action cannot click through the sing-back tap.
private struct QuizCardActions<Content: View>: View {
    let accessibilityLabel: String
    let isEnabled: Bool
    let onTap: () -> Void
    let onDoubleTap: (() -> Void)?
    let previewActionName: String
    let doubleTapActionName: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        if let onDoubleTap {
            gestureControl
                .gesture(doubleTapGesture(onDoubleTap))
                .quizCardAccessibility(
                    label: accessibilityLabel,
                    isEnabled: isEnabled,
                    onTap: onTap,
                    onDoubleTap: onDoubleTap,
                    previewActionName: previewActionName,
                    doubleTapActionName: doubleTapActionName
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
                    previewActionName: previewActionName,
                    doubleTapActionName: doubleTapActionName
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
        previewActionName: String,
        doubleTapActionName: String
    ) -> some View {
        if let onDoubleTap {
            self.quizCardAccessibilityBase(label: label, isEnabled: isEnabled, onTap: onTap, previewActionName: previewActionName)
                .accessibilityAction(named: doubleTapActionName) { if isEnabled { onDoubleTap() } }
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
