import SwiftUI

/// A compact, resettable rotary control for discrete playback settings.
struct PlaybackKnob: View {
    private let title: String
    @Binding private var value: Double
    private let range: ClosedRange<Double>
    private let step: Double
    private let valueLabel: String
    private let accessibilityValue: String
    private let ringLabels: [String]
    private let resetValue: Double
    private let identifier: String
    /// Uses the smaller dial and type scale intended for the single-screen quiz controls.
    private let compact: Bool
    @Environment(\.isEnabled) private var isEnabled

    init(
        title: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        step: Double = 1,
        valueLabel: String,
        accessibilityValue: String,
        ringLabels: [String] = [],
        resetValue: Double,
        identifier: String,
        compact: Bool = false
    ) {
        self.title = title
        _value = value
        self.range = range
        self.step = step
        self.valueLabel = valueLabel
        self.accessibilityValue = accessibilityValue
        self.ringLabels = ringLabels
        self.resetValue = resetValue
        self.identifier = identifier
        self.compact = compact
    }

    var body: some View {
        VStack(spacing: compact ? 1 : 3) {
            Text(title)
                .font(compact ? .caption.weight(.semibold) : .headline)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            Text(valueLabel)
                .font(compact ? .caption2 : .subheadline)
                .foregroundStyle(Color.accentColor)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            dial
        }
        .frame(minWidth: compact ? 96 : 132)
    }

    private var dialDiameter: CGFloat {
        compact ? 96 : 120
    }

    private var dialCenter: CGFloat {
        dialDiameter / 2
    }

    private var dial: some View {
        let fraction = displayedFraction
        let drag = DragGesture(minimumDistance: 6, coordinateSpace: .local)
            .onChanged { change in
                update(for: change.location)
            }
        let tapOrDrag = TapGesture()
            .exclusively(before: drag)
            .onEnded { result in
                if case .first = result {
                    reset()
                }
            }

        return ZStack {
            DialArc(endAngle: 405, inset: compact ? 15 : 18)
                .stroke(.secondary.opacity(0.24), style: .init(lineWidth: 4, lineCap: .round))
            DialArc(endAngle: 135 + 270 * fraction, inset: compact ? 15 : 18)
                .stroke(Color.accentColor, style: .init(lineWidth: 4, lineCap: .round))

            ForEach(Array(ringLabels.enumerated()), id: \.offset) { index, label in
                ringLabel(label, index: index, fraction: fraction)
            }

            Circle()
                .fill(.thinMaterial)
                .overlay {
                    Circle().fill(.secondary.opacity(0.10))
                }
                .overlay {
                    Circle().strokeBorder(.white.opacity(0.25), lineWidth: 1)
                }
                .frame(width: compact ? 54 : 72, height: compact ? 54 : 72)
                .shadow(color: .black.opacity(0.16), radius: 2, y: 2)

            indicator(at: fraction)
        }
        .frame(width: dialDiameter, height: dialDiameter)
        .contentShape(Circle())
        .highPriorityGesture(tapOrDrag)
        .allowsHitTesting(isEnabled)
        .opacity(isEnabled ? 1 : 0.5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(accessibilityValue)
        .accessibilityHint("Drag around the dial to adjust. Double-tap to reset, or swipe up or down to adjust one step.")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment:
                adjust(by: step)
            case .decrement:
                adjust(by: -step)
            @unknown default:
                break
            }
        }
        .accessibilityAction(named: Text("Reset")) {
            reset()
        }
        .accessibilityIdentifier(identifier)
        .contextMenu {
            Button("Increase") { adjust(by: step) }
                .accessibilityIdentifier("\(identifier).increase")
            Button("Decrease") { adjust(by: -step) }
                .accessibilityIdentifier("\(identifier).decrease")
            Button("Reset") { reset() }
                .accessibilityIdentifier("\(identifier).reset")
        }
    }

    @ViewBuilder
    private func ringLabel(_ label: String, index: Int, fraction: Double) -> some View {
        if ringLabels.count > 1 {
            let labelFraction = Double(index) / Double(ringLabels.count - 1)
            let angle = (135 + 270 * labelFraction) * .pi / 180
            let selected = index == Int((fraction * Double(ringLabels.count - 1)).rounded())
            Text(label)
                .font(.caption2.weight(selected ? .bold : .regular))
                .foregroundStyle(selected ? Color.accentColor : .secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .position(
                    x: dialCenter + CGFloat(Double(dialDiameter) * 0.45 * cos(angle)),
                    y: dialCenter + CGFloat(Double(dialDiameter) * 0.45 * sin(angle))
                )
        }
    }

    private func indicator(at fraction: Double) -> some View {
        let angle = (135 + 270 * fraction) * .pi / 180
        return Circle()
            .fill(Color.accentColor)
            .frame(width: 7, height: 7)
            .position(
                x: dialCenter + CGFloat(Double(dialDiameter) * 0.217 * cos(angle)),
                y: dialCenter + CGFloat(Double(dialDiameter) * 0.217 * sin(angle))
            )
    }

    private var hasUsableRange: Bool {
        range.lowerBound.isFinite && range.upperBound.isFinite && range.lowerBound < range.upperBound
    }

    private var displayedFraction: Double {
        guard hasUsableRange, value.isFinite else { return 0 }
        return ((value - range.lowerBound) / (range.upperBound - range.lowerBound)).clamped(to: 0...1)
    }

    private func update(for location: CGPoint) {
        guard let fraction = fraction(for: location) else { return }
        setValue(range.lowerBound + fraction * (range.upperBound - range.lowerBound))
    }

    /// Returns nil in the center, so an imprecise touch does not change the setting.
    private func fraction(for location: CGPoint) -> Double? {
        guard hasUsableRange else { return nil }
        let dx = Double(location.x - dialCenter)
        let dy = Double(location.y - dialCenter)
        guard (dx * dx + dy * dy).squareRoot() >= Double(dialDiameter * 0.15) else { return nil }

        var angle = atan2(dy, dx) * 180 / .pi
        if angle < 0 { angle += 360 }
        let relative = (angle - 135 + 360).truncatingRemainder(dividingBy: 360)
        if relative <= 270 { return relative / 270 }

        // The 90° gap clamps to its nearest endpoint, avoiding a wrap-around jump.
        let distanceToStart = circularDistance(angle, 135)
        let distanceToEnd = circularDistance(angle, 45)
        return distanceToStart <= distanceToEnd ? 0 : 1
    }

    private func circularDistance(_ lhs: Double, _ rhs: Double) -> Double {
        abs((lhs - rhs + 180).truncatingRemainder(dividingBy: 360) - 180)
    }

    private func adjust(by amount: Double) {
        guard amount.isFinite, amount != 0 else { return }
        setValue(value + amount)
    }

    private func reset() {
        setValue(resetValue)
    }

    private func setValue(_ rawValue: Double) {
        guard isEnabled, hasUsableRange, rawValue.isFinite else { return }
        let bounded = rawValue.clamped(to: range)
        let snapped: Double
        if step.isFinite, step > 0 {
            snapped = (range.lowerBound + ((bounded - range.lowerBound) / step).rounded() * step).clamped(to: range)
        } else {
            snapped = bounded
        }
        guard snapped.isFinite else { return }
        value = snapped
    }
}

private struct DialArc: Shape {
    let endAngle: Double
    let inset: CGFloat

    func path(in rect: CGRect) -> Path {
        guard endAngle.isFinite else { return Path() }
        let radius = min(rect.width, rect.height) / 2 - inset
        let sweep = max(0, endAngle - 135)
        let segments = 72
        var path = Path()
        for index in 0...segments {
            let angle = (135 + sweep * Double(index) / Double(segments)) * .pi / 180
            let point = CGPoint(
                x: rect.midX + radius * CGFloat(cos(angle)),
                y: rect.midY + radius * CGFloat(sin(angle))
            )
            index == 0 ? path.move(to: point) : path.addLine(to: point)
        }
        return path
    }
}

private extension Double {
    func clamped(to range: ClosedRange<Double>) -> Double {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
