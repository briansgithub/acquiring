import AcquiringCore
import SwiftUI
import UIKit

/// The inline practice control used by both Quiz and Song Detail.  It stays small
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

/// Attach this once at the active Song Detail or Quiz boundary.  It centralizes
/// the two modal flows so card gestures never create competing sheet presenters.
struct VocalPracticePresentation: ViewModifier {
    @Bindable var model: VocalPracticeModel

    init(model: VocalPracticeModel) {
        self.model = model
    }

    func body(content: Content) -> some View {
        content
            .sheet(item: activePresentation) { presentation in
                switch presentation {
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
                                Button("Done") { model.clearSingingTargets() }
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
        case guided
        case calibration

        var id: String {
            switch self {
            case .guided: "guided"
            case .calibration: "calibration"
            }
        }
    }

    private var activePresentation: Binding<Presentation?> {
        Binding(
            get: {
                if case .idle = model.calibrationState {
                    return model.targetRequest == nil ? nil : .guided
                }
                return .calibration
            },
            set: { presentation in
                guard case nil = presentation else { return }
                switch self.activePresentation.wrappedValue {
                case .guided:
                    model.clearSingingTargets()
                case .calibration:
                    model.cancelCalibration()
                case nil:
                    break
                }
            }
        )
    }
}

extension View {
    func vocalPracticePresentation(model: VocalPracticeModel) -> some View {
        modifier(VocalPracticePresentation(model: model))
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
