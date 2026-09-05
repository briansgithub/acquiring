import Foundation
import SwiftUI

private let quizTransportDefaultBottomClearance: CGFloat = 72
private let quizTransportDefaultControlSize = CGSize(width: 180, height: 64)

/// Hosts the Quiz transport inside the space the Quiz surface makes available.
///
/// Placement is kept as fractions rather than points so rotation, split view, and
/// navigation restoration retain the user's intended corner. A missing placement
/// intentionally uses Android's trailing / bottom-clearance default.
struct DraggableQuizTransportHost<Content: View>: View {
    private let persistenceKey: String
    private let controlSize: CGSize
    @ViewBuilder private let content: () -> Content

    @State private var placement: QuizTransportPlacement?
    @GestureState private var dragState = QuizTransportDragState()

    init(
        persistenceKey: String = QuizTransportPlacementStore.defaultKey,
        controlSize: CGSize = quizTransportDefaultControlSize,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.persistenceKey = persistenceKey
        self.controlSize = controlSize
        self.content = content
    }

    var body: some View {
        GeometryReader { geometry in
            let bounds = availableBounds(in: geometry.size)
            let resolved = resolvedPosition(in: geometry.size)
            let displayed = position(
                from: resolved,
                translation: dragState.translation,
                in: bounds
            )
            content()
                .frame(width: controlSize.width, height: controlSize.height)
                .offset(x: displayed.x, y: displayed.y)
                // The high-priority drag recognizes before the button; a touch that
                // never crosses the threshold still activates the original control.
                .highPriorityGesture(dragGesture(in: geometry.size, startingAt: resolved))
                .accessibilityHint(
                    "Drag to move. Use the Move transport or Reset transport placement actions to reposition without dragging."
                )
                .accessibilityAction(named: Text("Move transport to top leading")) {
                    move(to: .topLeading)
                }
                .accessibilityAction(named: Text("Move transport to top trailing")) {
                    move(to: .topTrailing)
                }
                .accessibilityAction(named: Text("Move transport to bottom leading")) {
                    move(to: .bottomLeading)
                }
                .accessibilityAction(named: Text("Reset transport placement")) {
                    resetPlacement()
                }
                .contextMenu {
                    Button("Move transport to top leading") { move(to: .topLeading) }
                    Button("Move transport to top trailing") { move(to: .topTrailing) }
                    Button("Move transport to bottom leading") { move(to: .bottomLeading) }
                    Button("Reset transport placement") { resetPlacement() }
                }
        }
        .accessibilityElement(children: .contain)
        .onAppear {
            placement = QuizTransportPlacementStore.load(for: persistenceKey)
        }
    }

    private func resolvedPosition(in availableSize: CGSize) -> CGPoint {
        let bounds = availableBounds(in: availableSize)
        guard let placement else {
            return CGPoint(x: bounds.maxX, y: max(bounds.maxY - quizTransportDefaultBottomClearance, 0))
        }
        return CGPoint(
            x: placement.x * bounds.maxX,
            y: placement.y * bounds.maxY
        )
    }

    private func dragGesture(
        in availableSize: CGSize,
        startingAt start: CGPoint
    ) -> some Gesture {
        DragGesture(minimumDistance: 12, coordinateSpace: .local)
            .updating($dragState) { value, state, _ in
                // GestureState is reset by SwiftUI for normal endings *and* system
                // cancellations, so a navigation/layout interruption cannot leave a
                // transport latched in a dragging state.
                state = QuizTransportDragState(translation: value.translation)
            }
            .onEnded { value in
                let bounds = availableBounds(in: availableSize)
                save(
                    position: position(from: start, translation: value.translation, in: bounds),
                    in: bounds
                )
            }
    }

    private func availableBounds(in availableSize: CGSize) -> CGRect {
        CGRect(
            origin: .zero,
            size: CGSize(
                width: max(availableSize.width - controlSize.width, 0),
                height: max(availableSize.height - controlSize.height, 0)
            )
        )
    }

    private func position(
        from start: CGPoint,
        translation: CGSize,
        in bounds: CGRect
    ) -> CGPoint {
        CGPoint(
            x: min(max(start.x + translation.width, 0), bounds.maxX),
            y: min(max(start.y + translation.height, 0), bounds.maxY)
        )
    }

    private func save(position: CGPoint, in bounds: CGRect) {
        let normalized = QuizTransportPlacement(
            x: bounds.maxX > 0 ? position.x / bounds.maxX : 0,
            y: bounds.maxY > 0 ? position.y / bounds.maxY : 0
        )
        placement = normalized
        QuizTransportPlacementStore.save(normalized, for: persistenceKey)
    }

    private func move(to target: QuizTransportPlacementTarget) {
        let normalized = target.placement
        placement = normalized
        QuizTransportPlacementStore.save(normalized, for: persistenceKey)
    }

    private func resetPlacement() {
        placement = nil
        QuizTransportPlacementStore.remove(for: persistenceKey)
    }
}

private struct QuizTransportPlacement: Codable, Equatable {
    let x: CGFloat
    let y: CGFloat

    init(x: CGFloat, y: CGFloat) {
        self.x = min(max(x, 0), 1)
        self.y = min(max(y, 0), 1)
    }
}

private struct QuizTransportDragState {
    var translation = CGSize.zero

    init(translation: CGSize = .zero) {
        self.translation = translation
    }
}

private enum QuizTransportPlacementTarget {
    case topLeading
    case topTrailing
    case bottomLeading

    var placement: QuizTransportPlacement {
        switch self {
        case .topLeading: QuizTransportPlacement(x: 0, y: 0)
        case .topTrailing: QuizTransportPlacement(x: 1, y: 0)
        case .bottomLeading: QuizTransportPlacement(x: 0, y: 1)
        }
    }
}

private enum QuizTransportPlacementStore {
    static let defaultKey = "quiz.transport.placement"

    static func load(for key: String) -> QuizTransportPlacement? {
        guard let data = UserDefaults.standard.data(forKey: key),
              let placement = try? JSONDecoder().decode(QuizTransportPlacement.self, from: data),
              placement.x.isFinite,
              placement.y.isFinite
        else { return nil }
        // Codable's synthesized decoding bypasses the initializer, so normalize
        // persisted values from an older/corrupt store before rendering them.
        return QuizTransportPlacement(x: placement.x, y: placement.y)
    }

    static func save(_ placement: QuizTransportPlacement, for key: String) {
        guard let data = try? JSONEncoder().encode(placement) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    static func remove(for key: String) {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
