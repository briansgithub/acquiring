import Observation
import SwiftUI
import UIKit

/// Scene-owned state for the contextual quiz help. The host is deliberately kept
/// outside individual screens so its glass can cover navigation and the singing dock.
@MainActor @Observable
final class QuizHelpState {
    var isPresented = false
    var focusHelpButtonRequest = 0
    var pitchCardsMode: QuizHelpPitchCardsMode = .standard
    var intervalMode: QuizHelpIntervalMode = .uncaptured

    func present() { isPresented = true }
    func toggle() { isPresented ? dismiss() : present() }
    func dismiss() {
        guard isPresented else { return }
        isPresented = false
        focusHelpButtonRequest += 1
    }
}

enum QuizHelpPitchCardsMode { case standard, flipFlop, capturing }
enum QuizHelpIntervalMode { case uncaptured, captured }

enum QuizHelpTargetID: String, CaseIterable, Hashable {
    case quizNotes = "help.quizNoteIntervalChordTone"
    case quizChord = "help.quizChord"
    case quizRelativeKey = "help.quizRelativeKey"
    case vocalTessitura = "help.vocalTessitura"
    case vocalPitchCards = "help.vocalPitchCards"
    case vocalInterval = "help.vocalInterval"

    var copy: String {
        switch self {
        case .quizNotes:
            "Tap to hear. Double-tap to sing back. Hold for live pitch feedback; hold again to stop."
        case .quizChord:
            "Tap to hear the chord."
        case .quizRelativeKey:
            "Tap to read note and chord labels using the section’s relative major key."
        case .vocalTessitura:
            "Choose Set and sing a comfortable note. Practice targets shift to a comfortable octave. Clear removes the adjustment."
        case .vocalPitchCards:
            "Double-tap either card, then sing for 3 seconds. Tap a recorded note to replay it."
        case .vocalInterval:
            "Record both notes to measure the interval and hear them separately and together."
        }
    }
}

private struct QuizHelpStateKey: EnvironmentKey {
    static let defaultValue: QuizHelpState? = nil
}

extension EnvironmentValues {
    var quizHelpState: QuizHelpState? {
        get { self[QuizHelpStateKey.self] }
        set { self[QuizHelpStateKey.self] = newValue }
    }
}

private struct QuizHelpFramesKey: PreferenceKey {
    static let defaultValue: [QuizHelpTargetID: [CGRect]] = [:]
    static func reduce(value: inout [QuizHelpTargetID: [CGRect]], nextValue: () -> [QuizHelpTargetID: [CGRect]]) {
        for (id, frames) in nextValue() { value[id, default: []].append(contentsOf: frames) }
    }
}

extension View {
    func quizHelpTarget(_ id: QuizHelpTargetID) -> some View {
        background {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: QuizHelpFramesKey.self,
                    value: [id: [proxy.frame(in: .global)]]
                )
            }
        }
    }

    /// Attach this after the scene's NavigationStack. It intentionally disables the
    /// entire wrapped scene while help is visible so the dismissing tap cannot act on
    /// the underlying control.
    func quizHelpHost(state: QuizHelpState) -> some View {
        modifier(QuizHelpHost(state: state))
    }
}

private struct QuizHelpHost: ViewModifier {
    let state: QuizHelpState
    @State private var frames: [QuizHelpTargetID: [CGRect]] = [:]

    func body(content: Content) -> some View {
        content
            .environment(\.quizHelpState, state)
            .allowsHitTesting(!state.isPresented)
            .accessibilityHidden(state.isPresented)
            .onPreferenceChange(QuizHelpFramesKey.self) { frames = $0 }
            .overlay {
                if state.isPresented {
                    GeometryReader { viewport in
                        QuizHelpOverlay(state: state, frames: frames, safeArea: viewport.safeAreaInsets, dismiss: state.dismiss)
                            .ignoresSafeArea()
                    }
                    .transition(.opacity)
                }
            }
            .onChange(of: state.isPresented) { _, visible in
                if visible { UIAccessibility.post(notification: .screenChanged, argument: nil) }
            }
    }
}

private struct QuizHelpOverlay: View {
    let state: QuizHelpState
    let frames: [QuizHelpTargetID: [CGRect]]
    let safeArea: EdgeInsets
    let dismiss: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        GeometryReader { proxy in
            let localFrames = frames.mapValues { $0.map { frame in
                frame.offsetBy(dx: -proxy.frame(in: .global).minX, dy: -proxy.frame(in: .global).minY)
            }}
            let layouts = bubbleLayouts(in: proxy.size, safeArea: safeArea, frames: localFrames)
            ZStack {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture(perform: dismiss)

                if let layouts {
                    ForEach(layouts) { layout in
                        bubble(layout)
                    }
                } else {
                    ForEach(Array(visibleTips.enumerated()), id: \.element) { index, id in
                        ForEach(Array((localFrames[id] ?? []).enumerated()), id: \.offset) { _, rect in
                            Text("\(index + 1)")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.white)
                                .frame(width: 24, height: 24)
                                .background(.tint, in: Circle())
                                .overlay(Circle().stroke(.background, lineWidth: 2))
                                .position(x: min(max(rect.maxX - 12, 16), proxy.size.width - 16),
                                          y: min(max(rect.minY + 12, safeArea.top + 16), proxy.size.height - safeArea.bottom - 16))
                                .allowsHitTesting(false)
                                .accessibilityHidden(true)
                        }
                    }
                    fallbackPanel(in: proxy.size, safeArea: safeArea, frames: localFrames)
                }

                Button("Tap anywhere to dismiss", action: dismiss)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(bubbleBackground, in: Capsule())
                    .accessibilityIdentifier("help.dismiss")
                    .padding(.trailing, safeArea.trailing + 14)
                    .padding(.bottom, safeArea.bottom + 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.16), value: frames)
        }
        .accessibilityAddTraits(.isModal)
        .accessibilityIdentifier("help.overlay")
    }

    private var visibleTips: [QuizHelpTargetID] {
        QuizHelpTargetID.allCases.filter { !(frames[$0] ?? []).isEmpty }
    }

    @ViewBuilder
    private func fallbackPanel(in size: CGSize, safeArea: EdgeInsets, frames: [QuizHelpTargetID: [CGRect]]) -> some View {
        VStack(spacing: 8) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(visibleTips.enumerated()), id: \.element) { index, id in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(index + 1)")
                                .font(.caption.weight(.bold))
                                .frame(width: 20, height: 20)
                                .background(.tint, in: Circle())
                                .foregroundStyle(.white)
                            Text(copy(for: id))
                                .font(.footnote)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier(id.rawValue)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Text("Tap anywhere to dismiss")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: min(430, max(260, size.width - 32)), maxHeight: min(360, max(180, size.height * 0.48)))
        .background(reduceTransparency ? AnyShapeStyle(Color(uiColor: .systemBackground)) : AnyShapeStyle(.regularMaterial), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.secondary.opacity(0.35)))
        .padding(.top, safeArea.top + 8)
        .padding(.bottom, safeArea.bottom + 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Quiz help")
        .accessibilityHint("Tap anywhere to dismiss")
        .accessibilityAction(.escape, dismiss)
        .onTapGesture(perform: dismiss)
    }

    @ViewBuilder
    private func bubble(_ layout: BubbleLayout) -> some View {
        VStack(spacing: 0) {
            if !layout.pointsDown { pointer.rotationEffect(.degrees(180)) }
            HStack(alignment: .top, spacing: 8) {
                Text("\(layout.number)")
                    .font(.caption.weight(.bold))
                    .frame(width: 20, height: 20)
                    .background(.tint, in: Circle())
                    .foregroundStyle(.white)
                Text(copy(for: layout.id)).font(.footnote).fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .background(bubbleBackground, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(.secondary.opacity(0.35)))
            if layout.pointsDown { pointer }
        }
        .frame(width: layout.frame.width, height: layout.frame.height)
        .position(x: layout.frame.midX, y: layout.frame.midY)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(layout.id.rawValue)
        .accessibilityLabel(copy(for: layout.id))
        .accessibilityHint("Tap anywhere to dismiss")
        .accessibilityAction(.escape, dismiss)
        .onTapGesture(perform: dismiss)
    }

    private var pointer: some View {
        Triangle()
            .fill(reduceTransparency ? Color(uiColor: .systemBackground) : Color.secondary.opacity(0.35))
            .frame(width: 16, height: 9)
    }

    private var bubbleBackground: AnyShapeStyle {
        reduceTransparency ? AnyShapeStyle(Color(uiColor: .systemBackground)) : AnyShapeStyle(.regularMaterial)
    }

    private func bubbleLayouts(in size: CGSize, safeArea: EdgeInsets, frames: [QuizHelpTargetID: [CGRect]]) -> [BubbleLayout]? {
        let width = min(300, size.width - 32)
        guard width >= 240, dynamicTypeSize <= .large else { return nil }
        var result: [BubbleLayout] = []
        for (offset, id) in visibleTips.enumerated() {
            guard let anchor = frames[id]?.first else { continue }
            let height = estimatedHeight(for: copy(for: id), width: width)
            let x = min(max(anchor.midX, safeArea.leading + width / 2 + 8), size.width - safeArea.trailing - width / 2 - 8)
            let above = anchor.minY - height - 10
            let below = anchor.maxY + 10
            let candidates = [(above, true), (below, false)]
            guard let candidate = candidates.first(where: { y, _ in
                let rect = CGRect(x: x - width / 2, y: y, width: width, height: height)
                return y >= safeArea.top + 8
                    && rect.maxY <= size.height - safeArea.bottom - 54
                    && !result.contains { $0.frame.intersects(rect.insetBy(dx: -6, dy: -6)) }
                    && !frames.values.flatMap({ $0 }).contains { $0.intersects(rect) }
            }) else { return nil }
            let frame = CGRect(x: x - width / 2, y: candidate.0, width: width, height: height)
            result.append(BubbleLayout(id: id, number: offset + 1, frame: frame, pointsDown: candidate.1))
        }
        return result.isEmpty ? nil : result
    }

    private func estimatedHeight(for text: String, width: CGFloat) -> CGFloat {
        let textBounds = (text as NSString).boundingRect(
            with: CGSize(width: width - 52, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: UIFont.preferredFont(forTextStyle: .footnote)],
            context: nil
        )
        return max(20, ceil(textBounds.height)) + 34
    }

    private func copy(for id: QuizHelpTargetID) -> String {
        switch id {
        case .vocalPitchCards where state.pitchCardsMode == .flipFlop:
            "Turn off Flip-Flop to record or replay either note yourself."
        case .vocalPitchCards where state.pitchCardsMode == .capturing:
            "Listening now. Use Stop to end early."
        case .vocalInterval where state.intervalMode == .captured:
            "Tap to hear the first note, second note, then both together."
        default:
            id.copy
        }
    }

    private struct BubbleLayout: Identifiable {
        let id: QuizHelpTargetID
        let number: Int
        let frame: CGRect
        let pointsDown: Bool
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.midX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.closeSubpath()
        }
    }
}
