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
    case vocalOctaveOffset = "help.vocalOctaveOffset"
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
        case .vocalOctaveOffset:
            "Move singing targets\nby whole octaves"
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
            .accessibilityElement(children: .contain)
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

// MARK: - Leader geometry

/// One connector: a shaft leaving the hint bubble and an arrowhead whose tip sits
/// on the edge of the element the hint describes.
struct QuizHelpLeader: Equatable {
    let start: CGPoint
    let tip: CGPoint

    var length: CGFloat { hypot(tip.x - start.x, tip.y - start.y) }

    /// Direction of travel, or nil for a degenerate zero-length leader.
    var direction: CGVector? {
        let dx = tip.x - start.x
        let dy = tip.y - start.y
        let length = hypot(dx, dy)
        guard length > 0.0001 else { return nil }
        return CGVector(dx: dx / length, dy: dy / length)
    }

    func intersects(_ rect: CGRect) -> Bool {
        QuizHelpGeometry.segment(start, tip, intersects: rect)
    }

    func crosses(_ other: QuizHelpLeader) -> Bool {
        QuizHelpGeometry.segmentsCross(start, tip, other.start, other.tip)
    }
}

enum QuizHelpGeometry {
    /// Intersection with a card/bubble edge, so leaders never terminate in its label.
    static func edge(of rect: CGRect, toward point: CGPoint) -> CGPoint {
        let dx = point.x - rect.midX
        let dy = point.y - rect.midY
        guard dx != 0 || dy != 0 else { return CGPoint(x: rect.midX, y: rect.minY) }
        let scale = 1 / max(abs(dx) / max(1, rect.width / 2), abs(dy) / max(1, rect.height / 2))
        return CGPoint(x: rect.midX + dx * scale, y: rect.midY + dy * scale)
    }

    /// Steps from `point` toward `target`, never overshooting it.
    static func point(_ point: CGPoint, movedBy distance: CGFloat, toward target: CGPoint) -> CGPoint {
        let dx = target.x - point.x
        let dy = target.y - point.y
        let length = hypot(dx, dy)
        guard length > 0.0001 else { return point }
        let step = min(distance, length)
        return CGPoint(x: point.x + dx / length * step, y: point.y + dy / length * step)
    }

    /// True when the segment touches the rectangle's interior or boundary.
    static func segment(_ a: CGPoint, _ b: CGPoint, intersects rect: CGRect) -> Bool {
        guard !rect.isNull, !rect.isEmpty else { return false }
        if rect.contains(a) || rect.contains(b) { return true }
        let corners = [
            CGPoint(x: rect.minX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.minY),
            CGPoint(x: rect.maxX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.maxY),
        ]
        for index in corners.indices where segmentsCross(a, b, corners[index], corners[(index + 1) % corners.count]) {
            return true
        }
        return false
    }

    /// Proper or touching intersection of two segments.
    static func segmentsCross(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint, _ d: CGPoint) -> Bool {
        let d1 = orientation(c, d, a)
        let d2 = orientation(c, d, b)
        let d3 = orientation(a, b, c)
        let d4 = orientation(a, b, d)
        if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)) { return true }
        if d1 == 0, within(c, d, a) { return true }
        if d2 == 0, within(c, d, b) { return true }
        if d3 == 0, within(a, b, c) { return true }
        if d4 == 0, within(a, b, d) { return true }
        return false
    }

    private static func orientation(_ o: CGPoint, _ p: CGPoint, _ q: CGPoint) -> CGFloat {
        (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)
    }

    private static func within(_ a: CGPoint, _ b: CGPoint, _ p: CGPoint) -> Bool {
        min(a.x, b.x) <= p.x && p.x <= max(a.x, b.x) && min(a.y, b.y) <= p.y && p.y <= max(a.y, b.y)
    }
}

// MARK: - Placement

/// Chooses a spot for every hint bubble and the leaders connecting it to the
/// controls it describes. Pure geometry, so it can be exercised without a view.
struct QuizHelpLayoutEngine {
    struct Placement: Identifiable, Equatable {
        let id: QuizHelpTargetID
        let frame: CGRect
        let leaders: [QuizHelpLeader]
    }

    /// The region bubbles may occupy, already inset for safe areas and the close button.
    let area: CGRect
    /// One or more anchor rectangles per hint; a shared hint points at every card it covers.
    let frames: [QuizHelpTargetID: [CGRect]]
    /// Bubble sizes, supplied by the view because they depend on its text metrics.
    let sizes: [QuizHelpTargetID: CGSize]

    /// A bubble sitting on the card it explains hides the thing being explained.
    private static let cardCoverageWeight: CGFloat = 20
    /// Leaders draw behind every bubble, so one running under another bubble is
    /// chopped in half — the worst of the connector faults, and worth more than
    /// any amount of card coverage this area can produce.
    private static let bubbleCrossingPenalty: CGFloat = 400_000
    /// Crossed leaders read as a tangle and make a shared hint ambiguous.
    private static let leaderCrossingPenalty: CGFloat = 200_000
    /// Grazing an unrelated card is untidy but still legible.
    private static let cardCrossingPenalty: CGFloat = 400

    private struct PlacedBubble {
        let frame: CGRect
        let leaders: [QuizHelpLeader]
    }

    func placements() -> [Placement] {
        let ids = QuizHelpTargetID.allCases.filter { !(frames[$0] ?? []).isEmpty && sizes[$0] != nil }
        guard !ids.isEmpty else { return [] }
        let anchors = frames.values.flatMap { $0 }
        // Place the smallest hints first, leaving flexible positions for shared hints.
        let ordered = ids.sorted { lhs, rhs in
            let left = sizes[lhs] ?? .zero
            let right = sizes[rhs] ?? .zero
            let leftArea = left.width * left.height
            let rightArea = right.width * right.height
            return leftArea == rightArea ? lhs.rawValue < rhs.rawValue : leftArea < rightArea
        }

        var placed: [QuizHelpTargetID: CGRect] = [:]
        for id in ordered {
            guard let frame = bestFrame(for: id, avoiding: field(placed, excluding: id), anchors: anchors) else {
                return laneFallback(ids: ids)
            }
            placed[id] = frame
        }
        // The greedy pass cannot see the bubbles placed after it. Two cheap
        // refinement passes let each bubble re-choose against the settled field.
        for _ in 0..<4 {
            for id in ordered {
                guard let current = placed[id] else { continue }
                let others = field(placed, excluding: id)
                guard let candidate = bestFrame(for: id, avoiding: others, anchors: anchors) else { continue }
                if cost(of: candidate, for: id, avoiding: others, anchors: anchors)
                    < cost(of: current, for: id, avoiding: others, anchors: anchors) {
                    placed[id] = candidate
                }
            }
        }
        return ids.compactMap { id in
            guard let frame = placed[id] else { return nil }
            return Placement(id: id, frame: frame, leaders: leaders(from: frame, to: frames[id] ?? []))
        }
    }

    /// Leaders run from just inside the bubble's edge to the described element's
    /// edge, so the arrowhead lands on the card rather than inside its label.
    func leaders(from bubble: CGRect, to targets: [CGRect]) -> [QuizHelpLeader] {
        targets.map { target in
            let tip = QuizHelpGeometry.edge(of: target, toward: bubble.center)
            let rim = QuizHelpGeometry.edge(of: bubble, toward: tip)
            // Tuck the tail under the bubble so its rounded corner leaves no gap.
            return QuizHelpLeader(start: QuizHelpGeometry.point(rim, movedBy: 2, toward: bubble.center), tip: tip)
        }
    }

    private func field(_ placed: [QuizHelpTargetID: CGRect], excluding id: QuizHelpTargetID) -> [PlacedBubble] {
        placed.compactMap { entry in
            guard entry.key != id else { return nil }
            return PlacedBubble(frame: entry.value, leaders: leaders(from: entry.value, to: frames[entry.key] ?? []))
        }
    }

    private func bestFrame(for id: QuizHelpTargetID, avoiding others: [PlacedBubble], anchors: [CGRect]) -> CGRect? {
        guard let size = sizes[id] else { return nil }
        let available = candidates(size: size, targets: frames[id] ?? []).filter { rect in
            !others.contains { $0.frame.insetBy(dx: -4, dy: -4).intersects(rect) }
        }
        return available.min { lhs, rhs in
            cost(of: lhs, for: id, avoiding: others, anchors: anchors)
                < cost(of: rhs, for: id, avoiding: others, anchors: anchors)
        }
    }

    private func candidates(size: CGSize, targets: [CGRect]) -> [CGRect] {
        func candidate(x: CGFloat, y: CGFloat) -> CGRect {
            CGRect(x: min(max(x, area.minX), max(area.minX, area.maxX - size.width)),
                   y: min(max(y, area.minY), max(area.minY, area.maxY - size.height)),
                   width: size.width, height: size.height)
        }
        var candidates: [CGRect] = []
        for target in targets {
            // Centred, left- and right-aligned above and below, so a bubble can
            // sidestep a neighbour in a tight row instead of stacking on it.
            for x in [target.midX - size.width / 2, target.minX, target.maxX - size.width] {
                candidates.append(candidate(x: x, y: target.minY - size.height - 8))
                candidates.append(candidate(x: x, y: target.maxY + 8))
            }
            candidates.append(candidate(x: target.minX - size.width - 8, y: target.midY - size.height / 2))
            candidates.append(candidate(x: target.maxX + 8, y: target.midY - size.height / 2))
        }
        // Search surrounding whitespace when the immediately adjacent gap is too small.
        let span = max(0, area.width - size.width)
        for y in stride(from: area.minY, through: max(area.minY, area.maxY - size.height), by: 12) {
            for fraction in [0, 0.25, 0.5, 0.75, 1] as [CGFloat] {
                candidates.append(candidate(x: area.minX + span * fraction, y: y))
            }
        }
        return candidates
    }

    private func cost(of rect: CGRect, for id: QuizHelpTargetID, avoiding others: [PlacedBubble], anchors: [CGRect]) -> CGFloat {
        let targets = frames[id] ?? []
        let leaders = leaders(from: rect, to: targets)
        let covered = anchors.reduce(CGFloat.zero) { total, anchor in
            let overlap = rect.intersection(anchor.insetBy(dx: -3, dy: -3))
            return total + (overlap.isNull ? 0 : overlap.width * overlap.height)
        }
        let distance = leaders.reduce(CGFloat.zero) { $0 + $1.length } / CGFloat(max(1, leaders.count))
        var crossings = CGFloat.zero
        for leader in leaders {
            for other in others {
                if leader.intersects(other.frame.insetBy(dx: -4, dy: -4)) { crossings += Self.bubbleCrossingPenalty }
                for otherLeader in other.leaders where leader.crosses(otherLeader) {
                    crossings += Self.leaderCrossingPenalty
                }
            }
            for anchor in anchors where !targets.contains(anchor) && leader.intersects(anchor) {
                crossings += Self.cardCrossingPenalty
            }
        }
        return covered * Self.cardCoverageWeight + distance + crossings
    }

    /// Extremely constrained layouts still keep distinct, connected bubbles.
    /// Non-overlapping rows and independently scrollable text retain access.
    private func laneFallback(ids: [QuizHelpTargetID]) -> [Placement] {
        let laneHeight = area.height / CGFloat(max(1, ids.count))
        return ids.enumerated().map { index, id in
            let size = sizes[id] ?? .zero
            let frame = CGRect(
                x: min(max((frames[id]?.first?.midX ?? area.midX) - size.width / 2, area.minX),
                       max(area.minX, area.maxX - size.width)),
                y: area.minY + CGFloat(index) * laneHeight,
                width: size.width, height: min(size.height, max(1, laneHeight - 6)))
            return Placement(id: id, frame: frame, leaders: leaders(from: frame, to: frames[id] ?? []))
        }
    }
}

// MARK: - Connector drawing

private enum QuizHelpLeaderStyle {
    static let shaftWidth: CGFloat = 2
    static let casingWidth: CGFloat = 4.5
    static let headLength: CGFloat = 9
    static let headHalfWidth: CGFloat = 4.5
}

/// Draws one hint's leaders. A casing underneath keeps the accent stroke legible
/// over cards and artwork, and every leader ends in an arrowhead on its target.
private struct QuizHelpConnectors: View {
    let leaders: [QuizHelpLeader]
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        ZStack {
            shafts.stroke(casing, style: StrokeStyle(lineWidth: QuizHelpLeaderStyle.casingWidth, lineCap: .round))
            heads.stroke(casing, style: StrokeStyle(lineWidth: 2.5, lineJoin: .round))
            shafts.stroke(line, style: StrokeStyle(lineWidth: QuizHelpLeaderStyle.shaftWidth, lineCap: .round))
            heads.fill(line)
        }
    }

    private var line: Color { Color.accentColor.opacity(reduceTransparency ? 1 : 0.9) }

    private var casing: Color { Color(uiColor: .systemBackground).opacity(reduceTransparency ? 1 : 0.75) }

    private var shafts: Path {
        Path { path in
            for leader in leaders {
                guard let direction = leader.direction else { continue }
                // Stop under the arrowhead so its fill hides the shaft's end.
                let pullback = min(QuizHelpLeaderStyle.headLength * 0.75, max(0, leader.length - 1))
                path.move(to: leader.start)
                path.addLine(to: CGPoint(x: leader.tip.x - direction.dx * pullback,
                                         y: leader.tip.y - direction.dy * pullback))
            }
        }
    }

    private var heads: Path {
        Path { path in
            for leader in leaders {
                guard let direction = leader.direction else { continue }
                let base = CGPoint(x: leader.tip.x - direction.dx * QuizHelpLeaderStyle.headLength,
                                   y: leader.tip.y - direction.dy * QuizHelpLeaderStyle.headLength)
                let half = QuizHelpLeaderStyle.headHalfWidth
                path.move(to: leader.tip)
                path.addLine(to: CGPoint(x: base.x - direction.dy * half, y: base.y + direction.dx * half))
                path.addLine(to: CGPoint(x: base.x + direction.dy * half, y: base.y - direction.dx * half))
                path.closeSubpath()
            }
        }
    }
}

// MARK: - Overlay

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
                    QuizHelpConnectors(leaders: layout.leaders)
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
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, dismiss)
        .accessibilityIdentifier("help.overlay")
    }

    private func bubble(_ layout: QuizHelpLayoutEngine.Placement) -> some View {
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

    private func bubbleLayouts(in size: CGSize, frames: [QuizHelpTargetID: [CGRect]]) -> [QuizHelpLayoutEngine.Placement] {
        let ids = QuizHelpTargetID.allCases.filter { !(frames[$0] ?? []).isEmpty }
        guard !ids.isEmpty else { return [] }
        let area = CGRect(x: safeArea.leading + 8, y: safeArea.top + 44,
                          width: max(1, size.width - safeArea.leading - safeArea.trailing - 16),
                          height: max(1, size.height - safeArea.top - safeArea.bottom - 52))
        let laneHeight = area.height / CGFloat(ids.count)
        var sizes: [QuizHelpTargetID: CGSize] = [:]
        for id in ids {
            let width = min(area.width, preferredWidth(for: id))
            sizes[id] = CGSize(
                width: width,
                height: min(estimatedHeight(for: copy(for: id), width: width), max(24, laneHeight - 6)))
        }
        return QuizHelpLayoutEngine(area: area, frames: frames, sizes: sizes).placements()
    }

    private func preferredWidth(for id: QuizHelpTargetID) -> CGFloat {
        if dynamicTypeSize.isAccessibilitySize { return 270 }
        switch id {
        case .quizNotes, .vocalOctaveOffset: return 195
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
}

private extension CGRect {
    var center: CGPoint { CGPoint(x: midX, y: midY) }
}
