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
            "1 tap: hear\n2 taps: sing-back practice\nHold: live singing practice"
        case .quizChord:
            "1 tap: hear chord"
        case .quizRelativeKey:
            "Use relative-major labels"
        case .vocalTessitura:
            "Set: sing a comfortable note.\nTargets shift to a comfortable range."
        case .vocalPitchCards:
            "2 taps: record for 3 seconds\n1 tap: replay"
        case .vocalInterval:
            "Calculated interval"
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
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        GeometryReader { proxy in
            let bounds = CGRect(origin: .zero, size: proxy.size)
            let origin = proxy.frame(in: .global).origin
            let localFrames = frames.mapValues { rects in
                rects.map { $0.offsetBy(dx: -origin.x, dy: -origin.y) }
                    .filter { !$0.isEmpty && bounds.intersects($0) }
            }
            let layouts = bubbleLayouts(in: proxy.size, frames: localFrames)
            ZStack {
                Color.clear.contentShape(Rectangle()).onTapGesture(perform: dismiss)

                // Draw every leader behind all bubbles. Shared descriptions retain
                // separate connections to each actual card, including chord tones.
                ForEach(layouts) { layout in
                    Path { path in
                        for anchor in localFrames[layout.id] ?? [] {
                            let end = edge(of: anchor, toward: layout.frame.center)
                            let start = edge(of: layout.frame, toward: end)
                            path.move(to: start)
                            path.addLine(to: end)
                        }
                    }
                    .stroke(Color.accentColor.opacity(0.65), style: StrokeStyle(lineWidth: 1, lineCap: .round))
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }
                ForEach(layouts) { layout in
                    bubble(layout)
                }

                Button(action: dismiss) {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.semibold))
                        .padding(8)
                        .background(bubbleBackground, in: Circle())
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Dismiss hints")
                .accessibilityIdentifier("help.dismiss")
                .padding(.top, safeArea.top)
                .padding(.trailing, safeArea.trailing + 4)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
        }
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, dismiss)
        .accessibilityIdentifier("help.overlay")
    }

    private func bubble(_ layout: BubbleLayout) -> some View {
        // Only an individual over-height hint scrolls at larger text sizes;
        // there is no omnibus panel covering the quiz.
        ScrollView(.vertical) {
            Text(copy(for: layout.id))
                .font(.caption)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollBounceBehavior(.basedOnSize)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(width: layout.frame.width, height: layout.frame.height)
        .background(bubbleBackground, in: RoundedRectangle(cornerRadius: 11))
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color.accentColor.opacity(0.3), lineWidth: 0.5))
        .contentShape(RoundedRectangle(cornerRadius: 11))
        .position(layout.frame.center)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(copy(for: layout.id))
        .accessibilityIdentifier(layout.id.rawValue)
        .accessibilityAction(.escape, dismiss)
        .onTapGesture(perform: dismiss)
    }

    private var bubbleBackground: AnyShapeStyle {
        reduceTransparency ? AnyShapeStyle(Color(uiColor: .systemBackground)) : AnyShapeStyle(.regularMaterial)
    }

    private func bubbleLayouts(in size: CGSize, frames: [QuizHelpTargetID: [CGRect]]) -> [BubbleLayout] {
        let ids = QuizHelpTargetID.allCases.filter { !(frames[$0] ?? []).isEmpty }
        guard !ids.isEmpty else { return [] }
        let area = CGRect(x: safeArea.leading + 8, y: safeArea.top + 44,
                          width: max(1, size.width - safeArea.leading - safeArea.trailing - 16),
                          height: max(1, size.height - safeArea.top - safeArea.bottom - 52))
        let anchors = frames.values.flatMap { $0 }
        let laneHeight = area.height / CGFloat(ids.count)
        var result: [BubbleLayout] = []
        // Place the shortest hints first, leaving flexible positions for shared hints.
        let ordered = ids.sorted { copy(for: $0).count < copy(for: $1).count }
        for id in ordered {
            let width = min(area.width, preferredWidth(for: id))
            let height = min(estimatedHeight(for: copy(for: id), width: width), max(24, laneHeight - 6))
            let targets = frames[id] ?? []
            var candidates: [CGRect] = []
            func candidate(x: CGFloat, y: CGFloat) -> CGRect {
                CGRect(x: min(max(x, area.minX), area.maxX - width),
                       y: min(max(y, area.minY), area.maxY - height), width: width, height: height)
            }
            for target in targets {
                candidates.append(candidate(x: target.midX - width / 2, y: target.minY - height - 8))
                candidates.append(candidate(x: target.midX - width / 2, y: target.maxY + 8))
                candidates.append(candidate(x: target.minX - width - 8, y: target.midY - height / 2))
                candidates.append(candidate(x: target.maxX + 8, y: target.midY - height / 2))
            }
            // Search surrounding whitespace when the immediately adjacent gap is too small.
            for y in stride(from: area.minY, through: max(area.minY, area.maxY - height), by: 12) {
                for x in [area.minX, area.midX - width / 2, area.maxX - width] {
                    candidates.append(candidate(x: x, y: y))
                }
            }
            let available = candidates.filter { rect in
                !result.contains { $0.frame.insetBy(dx: -4, dy: -4).intersects(rect) }
            }
            func score(_ rect: CGRect) -> CGFloat {
                let covered = anchors.reduce(CGFloat.zero) { total, anchor in
                    let overlap = rect.intersection(anchor.insetBy(dx: -3, dy: -3))
                    return total + (overlap.isNull ? 0 : overlap.width * overlap.height)
                }
                let distance = targets.reduce(CGFloat.zero) { total, target in
                    let end = edge(of: target, toward: rect.center)
                    let start = edge(of: rect, toward: end)
                    return total + hypot(end.x - start.x, end.y - start.y)
                } / CGFloat(max(1, targets.count))
                return covered * 20 + distance
            }
            guard let best = available.min(by: { score($0) < score($1) }) else {
                // Extremely constrained layouts still keep distinct, connected bubbles.
                // Non-overlapping rows and independently scrollable text retain access.
                return ids.enumerated().map { index, id in
                    let width = min(area.width, preferredWidth(for: id))
                    let targetX = frames[id]?.first?.midX ?? area.midX
                    return BubbleLayout(id: id, frame: CGRect(
                        x: min(max(targetX - width / 2, area.minX), area.maxX - width),
                        y: area.minY + CGFloat(index) * laneHeight,
                        width: width, height: min(estimatedHeight(for: copy(for: id), width: width), max(1, laneHeight - 6))))
                }
            }
            result.append(BubbleLayout(id: id, frame: best))
        }
        return result
    }

    private func preferredWidth(for id: QuizHelpTargetID) -> CGFloat {
        if dynamicTypeSize.isAccessibilitySize { return 270 }
        switch id {
        case .quizNotes, .vocalTessitura: return 195
        case .vocalPitchCards: return 175
        case .quizRelativeKey: return 150
        case .quizChord, .vocalInterval: return 130
        }
    }

    private func estimatedHeight(for text: String, width: CGFloat) -> CGFloat {
        let bounds = (text as NSString).boundingRect(
            with: CGSize(width: max(1, width - 20), height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: UIFont.preferredFont(forTextStyle: .caption1)], context: nil)
        return ceil(bounds.height) + 16
    }

    /// Intersection with a card/bubble edge, so leaders never terminate in its label.
    private func edge(of rect: CGRect, toward point: CGPoint) -> CGPoint {
        let dx = point.x - rect.midX
        let dy = point.y - rect.midY
        guard dx != 0 || dy != 0 else { return CGPoint(x: rect.midX, y: rect.minY) }
        let scale = 1 / max(abs(dx) / max(1, rect.width / 2), abs(dy) / max(1, rect.height / 2))
        return CGPoint(x: rect.midX + dx * scale, y: rect.midY + dy * scale)
    }

    private func copy(for id: QuizHelpTargetID) -> String {
        switch id {
        case .vocalPitchCards where state.pitchCardsMode == .flipFlop:
            "Flip-Flop off: record or replay"
        case .vocalPitchCards where state.pitchCardsMode == .capturing:
            "Listening: Stop to finish"
        default:
            id.copy
        }
    }

    private struct BubbleLayout: Identifiable {
        let id: QuizHelpTargetID
        let frame: CGRect
    }
}

private extension CGRect {
    var center: CGPoint { CGPoint(x: midX, y: midY) }
}
