import AcquiringCore
import SwiftUI
import UIKit

/// The inline practice control used by both Quiz and Song Detail. It stays small
/// until requested, while the model continues to own all microphone arbitration
/// and capture timing.
struct VocalPracticePanel: View {
    @Bindable var model: VocalPracticeModel

    init(model: VocalPracticeModel) {
        self.model = model
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Label("Vocal practice", systemImage: "mic.fill")
                    .font(.headline)
                Spacer()
                Button(model.isExpanded ? "Hide" : "Practice") {
                    model.isExpanded ? model.collapse() : model.expand()
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(model.isExpanded ? "Hide vocal practice" : "Show vocal practice")
            }

            if model.isExpanded {
                manualPractice
                    .transition(.opacity.combined(with: .move(edge: .top)))
            } else {
                Text("Capture two notes, hear them back exactly, and compare the interval.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .accessibilityHint("Activate Practice to reveal two recording slots.")
            }

            if model.persistentSelection != nil {
                PersistentPracticeStatus(model: model)
            }

            // Persistent acquisition can fail before it has a selection to show.
            // Keep that recovery path available even after the panel collapses.
            if !model.isExpanded, let error = model.errorMessage {
                PracticeErrorMessage(message: error, clear: model.clearError)
            }
        }
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .animation(reduceMotion ? nil : .snappy(duration: 0.22), value: model.isExpanded)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("vocal.practice.panel")
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var manualPractice: some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.targetRequest != nil {
                Label("Sing back the highlighted target", systemImage: "ear.and.waveform")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.tint)
                    .accessibilityHint("The microphone compares your live pitch with this target.")
            }

            TessituraAnchorControl(model: model)

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 10) {
                    captureSlot(1, title: "First note")
                    captureSlot(2, title: "Second note")
                }
                VStack(spacing: 10) {
                    captureSlot(1, title: "First note")
                    captureSlot(2, title: "Second note")
                }
            }

            if let interval = model.measuredInterval {
                Label(measuredIntervalLabel(interval), systemImage: "arrow.left.and.right")
                    .font(.subheadline.weight(.semibold))
                    .accessibilityLabel("Measured interval, \(measuredIntervalLabel(interval))")
            } else {
                Text("Record both notes to measure their interval and direction.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { pairControls; sessionControls }
                VStack(alignment: .leading, spacing: 8) { pairControls; sessionControls }
            }

            if let status = model.manualStatusText, !status.isEmpty {
                Text(status)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let error = model.errorMessage {
                PracticeErrorMessage(message: error, clear: model.clearError)
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func captureSlot(_ slot: Int, title: String) -> some View {
        let sample = slot == 1 ? model.displayedSlot1 : model.displayedSlot2
        let isRecording = model.recordingSlot == slot
        let isListening = model.listeningSlot == slot
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)

            CaptureSlotSurface(
                title: title,
                sample: sample,
                isRecording: isRecording,
                isListening: isListening,
                remainingMilliseconds: model.captureRemainingMilliseconds,
                play: { model.playSlot(slot) },
                record: { model.toggleRecording(slot: slot) }
            )

            HStack(spacing: 8) {
                Button {
                    model.playSlot(slot)
                } label: {
                    Label("Replay", systemImage: "play.fill")
                }
                .buttonStyle(.bordered)
                .disabled(sample == nil)
                .accessibilityLabel("Replay \(title)")

                Button(isRecording ? "Cancel" : sample == nil ? "Record" : "Re-record") {
                    model.toggleRecording(slot: slot)
                }
                .buttonStyle(.borderedProminent)
                .tint(isRecording ? .red : .accentColor)
                .accessibilityLabel(isRecording ? "Cancel recording \(title)" : "Record \(title)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var pairControls: some View {
        Button {
            model.playPair()
        } label: {
            Label("Play pair", systemImage: "play.square.stack.fill")
        }
        .buttonStyle(.bordered)
        .disabled(model.displayedSlot1 == nil || model.displayedSlot2 == nil)
        .accessibilityHint("Plays the first note, second note, together, then sequentially.")
    }

    private var sessionControls: some View {
        Group {
            Toggle(isOn: Binding(
                get: { model.isFlipFlopEnabled },
                set: { model.setFlipFlopEnabled($0) }
            )) {
                Text("Flip-Flop")
            }
            .toggleStyle(.button)
            .accessibilityHint("Alternates playback and capture between the two notes.")

            Button("Cancel", role: .cancel) {
                model.cancelManualPractice()
            }
            .buttonStyle(.bordered)
        }
    }

    private func measuredIntervalLabel(_ interval: MeasuredInterval) -> String {
        let cents = interval.centsDeviation.formatted(.number.precision(.fractionLength(0)))
        return "\(interval.namedInterval.spokenName), \(cents) cents deviation"
    }
}

/// Nonmodal Quiz practice dock; microphone and playback remain model-owned.
struct VocalPracticeDock: View {
    @Bindable var model: VocalPracticeModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 6) {
            Button {
                model.isExpanded ? model.minimize() : model.expand()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "waveform")
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Interval Singing Tool").font(.subheadline.weight(.medium))
                        if !model.isExpanded, let summary = minimizedSummary {
                            Text(summary).font(.caption2).foregroundStyle(.secondary)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: model.isExpanded ? "chevron.down" : "chevron.up")
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(model.isExpanded ? "Minimize interval singing tool" : "Expand interval singing tool")
            .accessibilityIdentifier("vocal.practice.expand")

            if model.isExpanded {
                HStack(spacing: 6) {
                    pitchCard(slot: 1)
                    pitchCard(slot: 2)
                    intervalCard
                }
                HStack(spacing: 10) {
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
                    Menu {
                        Button("Reset recordings") {
                            model.collapse()
                            model.clearError()
                            model.expand()
                        }
                        Button("Calibrate comfortable pitch") { model.startCalibration() }
                        Button("Clear comfortable pitch") { model.clearTessituraAdjustment() }
                    } label: {
                        Image(systemName: "ellipsis")
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Interval singing options")
                }
                if let error = model.errorMessage {
                    PracticeErrorMessage(message: error, clear: model.clearError)
                }
            }
            if model.persistentSelection != nil { persistentFeedback }
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
        let active = model.recordingSlot == slot || model.listeningSlot == slot
        return DockPitchCard(
            title: target?.scaleDegreeLabel ?? (slot == 1 ? "First note" : "Second note"),
            sample: sample,
            isReference: captured == nil && target != nil,
            isActive: active,
            remainingMilliseconds: model.captureRemainingMilliseconds,
            isEnabled: !model.isFlipFlopEnabled,
            showsPitchHint: !model.isFlipFlopEnabled && model.recordingSlot != slot,
            isTessituraAdjusted: model.isSingingTargetTessituraAdjusted(slot: slot),
            play: { model.playSlot(slot) },
            record: { model.toggleRecording(slot: slot) }
        )
        .accessibilityIdentifier("vocal.practice.slot.\(slot)")
    }

    private var intervalCard: some View {
        Button { model.playPair() } label: {
            VStack(spacing: 6) {
                Text("Interval").font(.caption).foregroundStyle(.secondary)
                if let interval = model.measuredInterval {
                    Text("\(interval.namedInterval.quality)\(interval.namedInterval.number) \(interval.direction?.arrow ?? "·")")
                        .font(.title3.weight(.semibold))
                        .minimumScaleFactor(0.7)
                    Text(PersistentPitchFeedback.formatCentsError(interval.centsDeviation))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(abs(interval.centsDeviation) < 15 ? Color.green : Color.secondary)
                } else {
                    Text("—").font(.title2).foregroundStyle(.secondary)
                }
                Text("Tap to hear").font(.system(size: 10)).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 124)
            .background(.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(.secondary.opacity(0.3)))
            .contentShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(model.slot1 == nil || model.slot2 == nil)
        .accessibilityLabel("Measured interval")
        .accessibilityValue(model.measuredInterval.map { "\($0.namedInterval.spokenName), \(PersistentPitchFeedback.formatCentsError($0.centsDeviation))" } ?? "Record both notes")
        .accessibilityHint("Plays the first note, second note, then both together")
        .accessibilityIdentifier("vocal.practice.interval")
    }

    private var persistentFeedback: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(livePitchText)
                    .font(.footnote.monospacedDigit().weight(.semibold))
                    .lineLimit(1)
                if let cents = model.liveCentsError {
                    Text("\(cents, format: .number.precision(.fractionLength(0)))¢")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(centsColor(cents))
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(liveFeedbackAccessibilityLabel)

            Button("Stop", role: .cancel) {
                model.stopPersistentPractice()
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .frame(minHeight: 44)
            .accessibilityLabel("Stop persistent pitch practice")
        }
    }

    private var statusText: String {
        if model.recordingSlot != nil { return "Recording" }
        if model.listeningSlot != nil { return "Listening" }
        if model.isExpanded { return "Practice open" }
        return "Ready"
    }

    private var livePitchText: String {
        guard let midi = model.persistentMeasuredMIDI else { return "Listening…" }
        return "Live \(midi.formatted(.number.precision(.fractionLength(1))))"
    }

    private var liveFeedbackAccessibilityLabel: String {
        guard let cents = model.liveCentsError else {
            return "Persistent pitch practice, listening for a voiced pitch"
        }
        return "Persistent pitch practice, \(livePitchText), \(cents.formatted(.number.precision(.fractionLength(0)))) cents from target"
    }

    private func centsColor(_ cents: Double) -> Color {
        abs(cents) <= 15 ? .green : abs(cents) <= 35 ? .orange : .red
    }
}

private func dockPitchColor(_ cents: Double) -> Color {
    switch PersistentPitchFeedback.band(centsError: cents) {
    case .accurate: .green
    case .close: .yellow
    case .far: .red
    }
}

private struct DockPitchCard: View {
    let title: String
    let sample: VocalPitchSample?
    let isReference: Bool
    let isActive: Bool
    let remainingMilliseconds: Int
    let isEnabled: Bool
    let showsPitchHint: Bool
    let isTessituraAdjusted: Bool
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
            .padding(.trailing, showsPitchHint ? 16 : 0)
            if let sample {
                DockPitchTape(midi: sample.rawMIDI, color: isReference ? .secondary : dockPitchColor(sample.centsFromReference))
                    .animation(reduceMotion ? nil : .linear(duration: 0.1), value: sample.rawMIDI)
                if isReference {
                    Text("Sing this pitch").font(.system(size: 10)).foregroundStyle(.secondary)
                } else {
                    Text(errorText(sample.centsFromReference))
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(dockPitchColor(sample.centsFromReference))
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
            } else {
                Spacer(minLength: 0)
                Text(isActive ? "Listening…" : "Record a pitch")
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
        .frame(height: 124)
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
        .overlay(alignment: .topTrailing) {
            if showsPitchHint {
                PitchHintDot(isAdjusted: isTessituraAdjusted).padding(5)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 8))
        .gesture(TapGesture(count: 2).onEnded { if isEnabled { record() } }
            .exclusively(before: TapGesture(count: 1).onEnded { if isEnabled { play() } }))
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(title)
        .accessibilityValue("\(sample?.pitchLabel ?? "No pitch"), \(isReference ? "Reference" : sample.map { errorText($0.centsFromReference) } ?? ""), \(status), \(isTessituraAdjusted ? "Tessitura adjusted" : "Original target octave")")
        .accessibilityHint(isEnabled ? "Single tap replays. Double tap records or stops listening." : "Turn off Flip-Flop to record an individual note")
        .accessibilityAction(named: "Replay") { if isEnabled { play() } }
        .accessibilityAction(named: isActive ? "Stop recording" : "Record or sing back") { if isEnabled { record() } }
    }

    private func errorText(_ cents: Double) -> String {
        let label = PersistentPitchFeedback.formatCentsError(cents)
        guard PersistentPitchFeedback.showsLiveErrorPercentage(centsError: cents) else { return label }
        return "\(label) · \(PersistentPitchFeedback.formatLiveErrorPercentage(centsError: cents))"
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
        Canvas { context, size in
            let centerY = size.height / 2
            let spacing: CGFloat = 22
            let nearest = Int(midi.rounded())
            for note in (nearest - 3)...(nearest + 3) {
                let y = centerY - CGFloat(Double(note) - midi) * spacing
                guard y > -spacing, y < size.height + spacing else { continue }
                let name = SpelledPitch.fromMIDI(note).displayName.filter { !$0.isNumber && $0 != "-" }
                let emphasized = abs(Double(note) - midi) < 0.5
                context.draw(Text(name).font(.system(size: emphasized ? 13 : 11, weight: emphasized ? .semibold : .regular)).foregroundColor(.primary.opacity(emphasized ? 1 : 0.45)), at: CGPoint(x: size.width / 2, y: y))
                var ticks = Path()
                ticks.move(to: CGPoint(x: 0, y: y)); ticks.addLine(to: CGPoint(x: 7, y: y))
                ticks.move(to: CGPoint(x: size.width - 7, y: y)); ticks.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(ticks, with: .color(.secondary.opacity(0.45)), lineWidth: 1)
            }
            var line = Path()
            let gap = min(CGFloat(18), size.width / 3)
            line.move(to: CGPoint(x: 0, y: centerY))
            line.addLine(to: CGPoint(x: size.width / 2 - gap, y: centerY))
            line.move(to: CGPoint(x: size.width / 2 + gap, y: centerY))
            line.addLine(to: CGPoint(x: size.width, y: centerY))
            context.stroke(line, with: .color(color.opacity(0.85)), lineWidth: 2)
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

private struct CaptureSlotSurface: View {
    let title: String
    let sample: VocalPitchSample?
    let isRecording: Bool
    let isListening: Bool
    let remainingMilliseconds: Int
    let play: () -> Void
    let record: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let sample {
                Text(sample.pitchLabel)
                    .font(.title2.monospacedDigit().weight(.bold))
                Text(sample.centsLabel)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(centsColor(sample.centsFromReference))
            } else if isRecording || isListening {
                Label(captureLabel, systemImage: isListening ? "waveform" : "mic.fill")
                    .font(.subheadline.weight(.medium))
            } else {
                Text("No capture")
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .padding(10)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .gesture(
            TapGesture(count: 2)
                .onEnded(record)
                .exclusively(before: TapGesture(count: 1).onEnded(play))
        )
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Single tap replays exactly. Double tap records.")
        .accessibilityAction(named: "Replay exactly", play)
        .accessibilityAction(named: isRecording ? "Cancel recording" : "Record", record)
    }

    private var captureLabel: String {
        if isListening { return "Listening for target" }
        let seconds = Double(max(0, remainingMilliseconds)) / 1_000
        return "Recording \(seconds.formatted(.number.precision(.fractionLength(1)))) seconds remaining"
    }

    private var accessibilityLabel: String {
        if let sample {
            return "\(title), \(sample.pitchLabel), \(sample.centsLabel)"
        }
        return "\(title), \(captureLabel)"
    }

    private func centsColor(_ cents: Double) -> Color {
        abs(cents) <= 15 ? .green : abs(cents) <= 35 ? .orange : .red
    }
}

private struct PersistentPracticeStatus: View {
    @Bindable var model: VocalPracticeModel

    var body: some View {
        let scores = scoreBadges
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Persistent practice", systemImage: "scope")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Button("Stop", role: .cancel) { model.stopPersistentPractice() }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Stop persistent pitch practice")
            }

            Text("Selection: \(selectionLabel)")
                .font(.footnote)
                .foregroundStyle(.secondary)

            if let target = model.persistentTarget {
                Label("Target \(target.label)", systemImage: "scope")
                .font(.subheadline)
            }

            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(livePitchText)
                    .font(.headline.monospacedDigit())
                if let cents = model.liveCentsError {
                    Text("\(cents, format: .number.precision(.fractionLength(0)))¢")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(centsColor(cents))
                }
                if let percentage = model.persistentLivePercentageText {
                    Text(percentage)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }

            LivePitchMarker(staffSteps: model.liveMarkerStaffSteps)
                .accessibilityLabel(liveMarkerAccessibilityLabel)

            Text(feedbackLabel)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(feedbackColor, in: Capsule())
                .accessibilityLabel("Pitch feedback, \(feedbackLabel)")

            if !scores.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(scores) { score in
                        Text("Run \(score.id + 1): \(scoreLabel(score.outcome))")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 4)
                            .background(.quaternary, in: Capsule())
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Melody scoring badges")
            }

            if case let .failed(message) = model.persistentPhase {
                PracticeErrorMessage(message: message, clear: model.clearError)
            }
        }
        .padding(12)
        .background(.background.opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var livePitchText: String {
        guard let midi = model.persistentMeasuredMIDI else { return "Listening…" }
        return "Live \(midi.formatted(.number.precision(.fractionLength(1)))) MIDI"
    }

    private var selectionLabel: String {
        switch model.persistentSelection {
        case .simpleRoot: "Root"
        case let .chordTone(requestedIndex): "Chord tone \(requestedIndex + 1)"
        case .melody: "Melody"
        case nil: "Idle"
        }
    }

    private var scoreBadges: [ScoreBadge] {
        model.melodyRunScores
            .map { ScoreBadge(id: $0.key, outcome: $0.value) }
            .sorted { $0.id < $1.id }
    }

    private var feedbackLabel: String {
        switch model.persistentFeedbackBand {
        case .accurate: "Accurate"
        case .close: "Close"
        case .far: "Off target"
        case nil: "No pitch"
        }
    }

    private var feedbackColor: Color {
        switch model.persistentFeedbackBand {
        case .accurate: .green
        case .close: .orange
        case .far: .red
        case nil: .gray
        }
    }

    private func scoreLabel(_ outcome: MelodyRunScoreOutcome) -> String {
        switch outcome {
        case let .scored(_, score): score.formatted
        case .unscored: "Unscored"
        }
    }

    private var liveMarkerAccessibilityLabel: String {
        guard let steps = model.liveMarkerStaffSteps else {
            return "Live pitch marker is waiting for a voiced pitch"
        }
        return "Live pitch marker, \(steps.formatted(.number.precision(.fractionLength(1)))) staff steps from target"
    }

    private func centsColor(_ cents: Double) -> Color {
        abs(cents) <= 15 ? .green : abs(cents) <= 35 ? .orange : .red
    }

    private struct ScoreBadge: Identifiable {
        let id: Int
        let outcome: MelodyRunScoreOutcome
    }
}

private struct LivePitchMarker: View {
    let staffSteps: Double?

    var body: some View {
        GeometryReader { proxy in
            let clamped = min(max(staffSteps ?? 0, -8), 8)
            let x = proxy.size.width * (CGFloat(clamped + 8) / 16)
            ZStack(alignment: .leading) {
                ForEach(0..<5, id: \.self) { index in
                    Rectangle()
                        .fill(.secondary.opacity(0.35))
                        .frame(height: 1)
                        .offset(y: CGFloat(index) * 5)
                }
                Circle()
                    .fill(.tint)
                    .frame(width: 12, height: 12)
                    .offset(x: max(0, min(proxy.size.width - 12, x - 6)), y: 4)
            }
        }
        .frame(height: 24)
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

/// Attach this once at the active Song Detail or Quiz boundary. It centralizes
/// manual, guided, and calibration flows so card gestures never create competing
/// sheet presenters. Manual practice is opt-in because Song Detail retains its
/// existing guided-only behavior.
struct VocalPracticePresentation: ViewModifier {
    @Bindable var model: VocalPracticeModel
    let includesManualPractice: Bool

    init(model: VocalPracticeModel, includesManualPractice: Bool = false) {
        self.model = model
        self.includesManualPractice = includesManualPractice
    }

    func body(content: Content) -> some View {
        content
            .sheet(item: activePresentation) { presentation in
                switch presentation {
                case .manual:
                    ManualPracticeSheet(model: model)
                case .guided:
                    NavigationStack {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Sing back")
                                    .font(.title2.weight(.bold))
                                Text("Listen to each target, then sing it back. Live pitch and cents update while you sing.")
                                    .foregroundStyle(.secondary)
                                VocalPracticePanel(model: model)
                            }
                            .padding()
                            .frame(maxWidth: 680, alignment: .leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .navigationTitle("Sing back")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Done") {
                                    model.clearSingingTargets()
                                    if includesManualPractice { model.collapse() }
                                }
                            }
                        }
                    }
                    .presentationDetents([.medium, .large])
                case .calibration:
                    CalibrationSheet(model: model)
                        .interactiveDismissDisabled()
                        .presentationDetents([.medium])
                }
            }
    }

    private enum Presentation: Identifiable {
        case manual
        case guided
        case calibration

        var id: String {
            switch self {
            case .manual: "manual"
            case .guided: "guided"
            case .calibration: "calibration"
            }
        }
    }

    private var activePresentation: Binding<Presentation?> {
        Binding(
            get: {
                if case .idle = model.calibrationState {
                    if includesManualPractice { return nil }
                    if model.targetRequest != nil { return .guided }
                    if includesManualPractice, model.isExpanded { return .manual }
                    return nil
                }
                return .calibration
            },
            set: { presentation in
                guard case nil = presentation else { return }
                // A model-driven switch from manual/guided practice to calibration can
                // cause SwiftUI to clear the old sheet binding. Calibration owns the
                // microphone at that point, so never treat that transition as a cancel.
                guard case .idle = model.calibrationState else { return }
                if model.targetRequest != nil {
                    model.clearSingingTargets()
                    if includesManualPractice { model.collapse() }
                } else if includesManualPractice, model.isExpanded {
                    model.collapse()
                }
            }
        )
    }
}

extension View {
    func vocalPracticePresentation(
        model: VocalPracticeModel,
        includesManualPractice: Bool = false
    ) -> some View {
        modifier(VocalPracticePresentation(
            model: model,
            includesManualPractice: includesManualPractice
        ))
    }
}

private struct ManualPracticeSheet: View {
    @Bindable var model: VocalPracticeModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VocalPracticePanel(model: model)
                    .padding()
                    .frame(maxWidth: 680, alignment: .leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Vocal practice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        model.collapse()
                    }
                    .accessibilityLabel("Done with vocal practice")
                    .accessibilityHint("Closes practice and stops an active recording.")
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct TessituraAnchorControl: View {
    @Bindable var model: VocalPracticeModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Comfortable range")
                .font(.headline)
            if let anchor = model.comfortablePitchMIDI {
                Text("Anchor: \(model.comfortablePitchLabel ?? "pitch") (\(anchor, format: .number.precision(.fractionLength(1))) MIDI)")
                    .font(.subheadline.monospacedDigit())
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { adjustmentButtons; clearButton }
                    VStack(alignment: .leading, spacing: 8) { adjustmentButtons; clearButton }
                }
            } else {
                Text("Hum one comfortable pitch. It changes listening targets only, never song playback.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("Calibrate comfortable pitch") { model.startCalibration() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(12)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var adjustmentButtons: some View {
        Group {
            Button("− semitone") { model.adjustComfortablePitch(semitones: -1) }
            Button("+ semitone") { model.adjustComfortablePitch(semitones: 1) }
            Button("− octave") { model.adjustComfortablePitch(semitones: -12) }
            Button("+ octave") { model.adjustComfortablePitch(semitones: 12) }
        }
        .buttonStyle(.bordered)
    }

    private var clearButton: some View {
        Button("Clear anchor", role: .destructive) { model.clearTessituraAdjustment() }
            .buttonStyle(.bordered)
            .accessibilityHint("Returns practice targets to their song register.")
    }
}

private struct CalibrationSheet: View {
    @Bindable var model: VocalPracticeModel

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "waveform")
                .font(.largeTitle)
                .foregroundStyle(.tint)
            Text(title)
                .font(.title3.weight(.bold))
            Text(detail)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            if case let .capturing(remainingMilliseconds, hasSignal) = model.calibrationState {
                ProgressView(value: progress(remainingMilliseconds))
                    .accessibilityLabel("Calibration progress")
                    .accessibilityValue("\(Int(progress(remainingMilliseconds) * 100)) percent")
                Text(hasSignal ? "Voice detected" : "Waiting for a voiced pitch")
                    .font(.footnote)
                    .foregroundStyle(hasSignal ? .green : .secondary)
            }
            HStack {
                if case .failed = model.calibrationState {
                    Button("Retry") { model.retryCalibration() }
                        .buttonStyle(.borderedProminent)
                }
                Button("Cancel", role: .cancel) { model.cancelCalibration() }
                    .buttonStyle(.bordered)
            }
        }
        .padding(24)
        .frame(maxWidth: 460)
        .accessibilityElement(children: .contain)
    }

    private var title: String {
        switch model.calibrationState {
        case .idle: "Comfortable pitch"
        case .requestingPermission: "Microphone permission"
        case .capturing: "Hum one comfortable pitch"
        case .failed: "Calibration needs another try"
        }
    }

    private var detail: String {
        switch model.calibrationState {
        case .idle: ""
        case .requestingPermission: "Waiting for microphone permission."
        case .capturing: "Keep a voiced note steady for three seconds. Brief silence pauses the timer."
        case let .failed(message): message
        }
    }

    private func progress(_ remainingMilliseconds: Int) -> Double {
        min(max(1 - Double(remainingMilliseconds) / 3_000, 0), 1)
    }
}

/// A compact wrapping layout for scoring badges without committing the practice
/// panel to a particular phone width or iPad orientation.
private struct FlowLayout: Layout {
    var spacing: CGFloat

    init(spacing: CGFloat) {
        self.spacing = spacing
    }

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let width = proposal.width ?? .greatestFiniteMagnitude
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += lineHeight + spacing
                lineHeight = 0
            }
            x += size.width + (x == 0 ? 0 : spacing)
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: proposal.width ?? x, height: y + lineHeight)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + spacing
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
