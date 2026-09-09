import AcquiringCore
import SwiftUI
import UIKit

/// The sole sing-back surface in Quiz and Song Detail.
struct IntervalSingingTool: View {
    @Bindable var model: VocalPracticeModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.quizHelpState) private var quizHelp

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                if model.isExpanded {
                    Text("Flip-Flop").font(.caption)
                    Toggle("Flip-Flop", isOn: Binding(
                        get: { model.isFlipFlopEnabled },
                        set: { model.setFlipFlopEnabled($0) }
                    ))
                    .labelsHidden()
                    .fixedSize()
                    .frame(minHeight: 44)
                    .accessibilityLabel("Flip-Flop")
                    .accessibilityIdentifier("vocal.practice.flipFlop")
                    Spacer(minLength: 0)
                    if model.isManualPracticeActive {
                        Button("Stop", role: .cancel) { model.cancelManualPractice() }
                            .font(.caption.weight(.semibold))
                            .frame(minWidth: 44, minHeight: 44)
                            .accessibilityLabel("Stop microphone")
                            .accessibilityIdentifier("vocal.practice.stop")
                    }
                    octaveOffsetStepper
                        .quizHelpTarget(.vocalOctaveOffset)
                } else {
                    Image(systemName: "waveform")
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Interval Singing Tool").font(.subheadline.weight(.medium))
                        if let summary = minimizedSummary {
                            Text(summary).font(.caption2).foregroundStyle(.secondary)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                    }
                    Spacer(minLength: 0)
                    // The one piece of persistent practice this dock carries. The reading
                    // itself belongs to the card gauge and the timeline marker; all the
                    // singer needs from down here is a way out that does not require
                    // finding the card they held. Collapsed only - expanding stops
                    // monitoring, so there is no expanded state to show it in.
                    if model.persistentSelection != nil {
                        Button("Stop", role: .cancel) { model.stopPersistentPractice() }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .frame(minHeight: 44)
                            .accessibilityLabel("Stop persistent pitch practice")
                            .accessibilityIdentifier("vocal.practice.persistent.stop")
                    }
                }
                Button {
                    model.isExpanded ? model.minimize() : model.expand()
                } label: {
                    Image(systemName: model.isExpanded ? "chevron.down" : "chevron.up")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(width: 44, height: 44)
                        .background(.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(model.isExpanded ? "Collapse interval singing tool" : "Expand interval singing tool")
                .accessibilityValue(model.isExpanded ? "Expanded" : "Collapsed")
                .accessibilityIdentifier("vocal.practice.expand")
            }
            .frame(minHeight: 44)

            // Persistent pitch practice shows no reading here - long-pressing a card wears
            // its feedback on that card's gauge and in the melody timeline, the way Android
            // does it. The collapsed header's Stop button is the whole of its presence.
            if model.isExpanded {
                // The error used to take the interval card's place, which put a
                // CoreAudio string into a third of the dock's width and removed
                // the one card describing the two notes just sung. It reads
                // below the row instead, where a sentence fits.
                HStack(spacing: 6) {
                    pitchCard(slot: 1)
                        .quizHelpTarget(.vocalPitchCards)
                    pitchCard(slot: 2)
                        .quizHelpTarget(.vocalPitchCards)
                    intervalCard
                }
                if let error = model.errorMessage {
                    PracticeErrorMessage(message: error, clear: model.clearError)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if !model.isExpanded, model.errorMessage != nil {
                Text("Practice error — expand for details")
                    .font(.caption).foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 10)
        .padding(.bottom, model.isExpanded ? 6 : 0)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.secondary.opacity(0.45), lineWidth: 1))
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: model.isExpanded)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("vocal.practice.dock")
        .onChange(of: quizHelp?.isPresented) { _, presented in
            guard let quizHelp, presented == true else { return }
            model.expandForHelp()
            updateHelpModes(quizHelp)
        }
        .onChange(of: model.isFlipFlopEnabled) { _, _ in updateHelpModes() }
        .onChange(of: model.recordingSlot) { _, _ in updateHelpModes() }
        .onChange(of: model.listeningSlot) { _, _ in updateHelpModes() }
        .onChange(of: model.slot1) { _, _ in updateHelpModes() }
        .onChange(of: model.slot2) { _, _ in updateHelpModes() }
    }

    /// Moves every singing target by whole octaves. Drawn as one pill in the chevron's own
    /// styling so the header keeps two controls rather than gaining three: the buttons carry
    /// no chrome of their own and the number sits between them.
    private var octaveOffsetStepper: some View {
        HStack(spacing: 0) {
            octaveOffsetButton(
                systemImage: "minus",
                label: "Lower singing targets an octave",
                isEnabled: model.canDecrementOctaveOffset,
                delta: -1
            )
            Text(model.octaveOffsetLabel)
                .font(.caption.monospacedDigit().weight(.semibold))
                .frame(width: 24)
                .accessibilityHidden(true)
            octaveOffsetButton(
                systemImage: "plus",
                label: "Raise singing targets an octave",
                isEnabled: model.canIncrementOctaveOffset,
                delta: 1
            )
        }
        .background(.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Octave offset")
        .accessibilityValue("\(model.octaveOffsetLabel) octaves")
        .accessibilityIdentifier("vocal.practice.octaveOffset")
    }

    private func octaveOffsetButton(
        systemImage: String,
        label: String,
        isEnabled: Bool,
        delta: Int
    ) -> some View {
        Button { model.adjustOctaveOffset(by: delta) } label: {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 28, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.35)
        .accessibilityLabel(label)
        .accessibilityIdentifier(delta < 0 ? "vocal.practice.octaveOffset.down" : "vocal.practice.octaveOffset.up")
    }

    private var minimizedSummary: String? {
        let notes = [model.displayedSlot1?.pitchLabel, model.displayedSlot2?.pitchLabel].compactMap { $0 }
        guard !notes.isEmpty else { return nil }
        let pitches = notes.joined(separator: " → ")
        guard let interval = model.measuredInterval else { return pitches }
        return "\(pitches) · \(interval.namedInterval.quality)\(interval.namedInterval.number) \(interval.direction?.arrow ?? "·")"
    }

    private func pitchCard(slot: Int) -> some View {
        let sample = slot == 1 ? model.displayedSlot1 : model.displayedSlot2
        let captured = slot == 1 ? model.slot1 : model.slot2
        let target = slot == 1 ? model.targetRequest?.first : model.targetRequest?.second
        let isRecording = model.recordingSlot == slot
        let active = model.recordingSlot == slot || model.listeningSlot == slot
        return DockPitchCard(
            title: target?.scaleDegreeLabel ?? (slot == 1 ? "First note" : "Second note"),
            sample: sample,
            isReference: captured == nil && target != nil,
            isActive: active,
            isRecording: isRecording,
            remainingMilliseconds: model.captureRemainingMilliseconds,
            isEnabled: !model.isFlipFlopEnabled && !isRecording,
            anchorMIDI: anchorMIDI(slot: slot),
            play: { model.playSlot(slot) },
            record: { model.toggleRecording(slot: slot) }
        )
        .accessibilityIdentifier("vocal.practice.slot.\(slot)")
    }

    /// The pitch a recording card's tape shows before the microphone has produced anything:
    /// the other slot's note when there is one, otherwise the singer's calibrated comfortable
    /// pitch, otherwise middle C. Only ever a resting place - the first voiced frame replaces it.
    private func anchorMIDI(slot: Int) -> Double {
        (slot == 1 ? model.slot2 : model.slot1)?.rawMIDI ?? 60
    }

    private var intervalCard: some View {
        let hasCapturedPair = model.slot1 != nil && model.slot2 != nil
        return Button { model.playPair() } label: {
            VStack(spacing: 6) {
                Text("Interval").font(.caption).foregroundStyle(.secondary)
                if let interval = model.measuredInterval {
                    Text("\(interval.namedInterval.quality)\(interval.namedInterval.number) \(interval.direction?.arrow ?? "·")")
                        .font(.title3.weight(.semibold))
                        .minimumScaleFactor(0.7)
                    Text(PersistentPitchFeedback.formatCentsError(interval.centsDeviation))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(PersistentPitchFeedback.band(centsError: interval.centsDeviation) == .accurate
                                         ? Color.pitchFeedback(.accurate)
                                         : Color.secondary)
                } else {
                    Text("—").font(.title2).foregroundStyle(.secondary)
                }
                Text(hasCapturedPair ? "Tap to hear" : "Record both notes")
                    .font(.system(size: 10)).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 100)
            .background(.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(.secondary.opacity(0.3)))
            .contentShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(!hasCapturedPair)
        .accessibilityLabel("Measured interval")
        .accessibilityValue(model.measuredInterval.map { "\($0.namedInterval.spokenName), \(PersistentPitchFeedback.formatCentsError($0.centsDeviation))" } ?? "Record both notes")
        .accessibilityHint("Plays the first note, second note, then both together")
        .accessibilityIdentifier("vocal.practice.interval")
        .quizHelpTarget(.vocalInterval)
    }

    private func updateHelpModes(_ state: QuizHelpState? = nil) {
        let state = state ?? quizHelp
        guard let state, state.isPresented else { return }
        state.pitchCardsMode = model.isFlipFlopEnabled
            ? .flipFlop
            : (model.recordingSlot != nil || model.listeningSlot != nil ? .capturing : .standard)
        state.intervalMode = model.slot1 != nil && model.slot2 != nil ? .captured : .uncaptured
    }
}

private struct DockPitchCard: View {
    let title: String
    let sample: VocalPitchSample?
    let isReference: Bool
    let isActive: Bool
    let isRecording: Bool
    let remainingMilliseconds: Int
    let isEnabled: Bool
    /// Where the tape parks while a recording card is still waiting for its first voiced
    /// frame. The gauge is on screen from the moment recording starts, so there has to be a
    /// pitch under it before the singer has sung one.
    let anchorMIDI: Double
    let play: () -> Void
    let record: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var status: String {
        if isActive { return "\(Int(ceil(Double(remainingMilliseconds) / 1000)))s remaining" }
        if isReference { return "Reference" }
        return sample == nil ? "Double tap to record" : "Tap to replay"
    }

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 2) {
                Text(title).lineLimit(1).minimumScaleFactor(0.6)
                Spacer(minLength: 0)
                if isActive { Image(systemName: "mic.fill").foregroundStyle(.tint) }
            }
            .font(.caption).foregroundStyle(.secondary)
            if let sample {
                DockPitchTape(midi: sample.rawMIDI, color: isReference ? .secondary : Color.pitchFeedback(centsError: sample.centsFromReference))
                    .animation(reduceMotion ? nil : .linear(duration: 0.1), value: sample.rawMIDI)
                if isReference {
                    Text("Sing this pitch").font(.system(size: 10)).foregroundStyle(.secondary)
                } else {
                    Text(errorText(sample.centsFromReference))
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Color.pitchFeedback(centsError: sample.centsFromReference))
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
            } else if isActive {
                // Recording runs straight into the gauge: no "Listening…" interstitial to
                // read and then lose. The tape sits at `anchorMIDI`, dimmed, until the first
                // voiced frame takes it over, so the card never changes shape mid-take.
                DockPitchTape(midi: anchorMIDI, color: .secondary)
                    .opacity(0.45)
                Text("—")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.secondary)
            } else {
                Spacer(minLength: 0)
                Text("Record a pitch")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            HStack(spacing: 2) {
                if let sample {
                    Text("Oct \(Int(floor(sample.rawMIDI / 12)) - 1)")
                    Spacer(minLength: 0)
                }
                Text(status).lineLimit(1).minimumScaleFactor(0.7)
            }
            .font(.system(size: 9)).foregroundStyle(isActive ? Color.accentColor : .secondary)
        }
        .padding(6)
        .frame(maxWidth: .infinity)
        .frame(height: 100)
        .background(isActive ? Color.accentColor.opacity(0.12) : Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(isActive ? Color.accentColor : Color.secondary.opacity(0.3), lineWidth: isActive ? 2 : 1))
        .overlay(alignment: .bottomLeading) {
            if isActive {
                GeometryReader { geometry in
                    Capsule().fill(Color.accentColor)
                        .frame(width: geometry.size.width * CGFloat(min(max(Double(remainingMilliseconds) / 3000, 0), 1)), height: 3)
                        .animation(reduceMotion ? nil : .linear(duration: 0.1), value: remainingMilliseconds)
                }
                .frame(height: 3)
                .padding(.horizontal, 6)
                .padding(.bottom, 3)
                .allowsHitTesting(false)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 8))
        .gesture(TapGesture(count: 2).onEnded { if isEnabled { record() } }
            .exclusively(before: TapGesture(count: 1).onEnded { if isEnabled { play() } }))
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(title)
        .accessibilityValue("\(sample?.pitchLabel ?? (isActive ? "Waiting for a voiced pitch" : "No pitch")), \(isReference ? "Reference" : sample.map { errorText($0.centsFromReference) } ?? ""), \(status)")
        .accessibilityHint(
            isEnabled
                ? "Single tap replays. Double tap records or stops listening."
                : isRecording
                    ? "Recording in progress. Use Stop microphone to stop."
                    : "Turn off Flip-Flop to record an individual note"
        )
        .dockPitchCardActions(
            isEnabled: isEnabled,
            isActive: isActive,
            play: play,
            record: record
        )
        // Applied last on purpose. `accessibilityElement(children: .ignore)` above
        // synthesizes a fresh element for this card, and a `disabled` applied
        // before that never reaches it: the gestures were correctly inert while
        // Flip-Flop ran, but VoiceOver and XCUITest were both told the card was
        // still actionable. Disabling the composed element instead reports the
        // state and still propagates down to the gestures.
        .disabled(!isEnabled)
    }

    private func errorText(_ cents: Double) -> String {
        PersistentPitchFeedback.formatCentsError(cents)
    }
}

private extension View {
    @ViewBuilder
    func dockPitchCardActions(
        isEnabled: Bool,
        isActive: Bool,
        play: @escaping () -> Void,
        record: @escaping () -> Void
    ) -> some View {
        if isEnabled {
            accessibilityAction(named: "Replay") { play() }
                .accessibilityAction(named: isActive ? "Stop recording" : "Record or sing back") { record() }
        } else {
            self
        }
    }
}

/// The measured pitch moves the note tape beneath a stationary tuning line.
private struct DockPitchTape: View, @preconcurrency Animatable {
    var midi: Double
    let color: Color
    var animatableData: Double {
        get { midi }
        set { midi = newValue }
    }

    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            let spacing: CGFloat = 22
            let nearest = Int(midi.rounded())
            ZStack {
                ForEach((nearest - 3)...(nearest + 3), id: \.self) { note in
                    let name = SpelledPitch.fromMIDI(note).displayName.filter { !$0.isNumber && $0 != "-" }
                    let emphasized = abs(Double(note) - midi) < 0.5
                    HStack(spacing: 0) {
                        Rectangle().fill(.secondary.opacity(0.45)).frame(width: 7, height: 1)
                        Spacer(minLength: 0)
                        Text(name)
                            .font(.system(size: emphasized ? 13 : 11, weight: emphasized ? .semibold : .regular))
                            .foregroundStyle(.primary.opacity(emphasized ? 1 : 0.45))
                        Spacer(minLength: 0)
                        Rectangle().fill(.secondary.opacity(0.45)).frame(width: 7, height: 1)
                    }
                    .frame(width: size.width)
                    .position(x: size.width / 2, y: size.height / 2 - CGFloat(Double(note) - midi) * spacing)
                }
                HStack(spacing: min(CGFloat(36), size.width * 2 / 3)) {
                    Rectangle().fill(color.opacity(0.85)).frame(height: 2)
                    Rectangle().fill(color.opacity(0.85)).frame(height: 2)
                }
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

private struct PracticeErrorMessage: View {
    let message: String
    let clear: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote)
                .foregroundStyle(.red)
            HStack {
                if message.localizedCaseInsensitiveContains("permission"),
                   let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                    Link("Open Settings", destination: settingsURL)
                        .font(.footnote.weight(.semibold))
                }
                Button("Dismiss") { clear() }
                    .font(.footnote)
                    .buttonStyle(.borderless)
            }
        }
        .padding(10)
        .background(.red.opacity(0.13), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}
