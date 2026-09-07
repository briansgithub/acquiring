import AcquiringCore
import SwiftUI

/// A fast-scroll track for one expanded All Songs group.
///
/// Dragging the track flies through a group that is thousands of songs deep,
/// the way the Contacts index does: the label under the thumb is the run the
/// list jumps to, and the list moving underneath reports where that landed. A
/// track too short to name every run shows an even sample of them.
struct BrowseScrubber: View {
    let targets: [BrowseSubgroup]
    let onScrub: (BrowseSubgroup) -> Void

    @State private var activeID: String?
    @State private var isScrubbing = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Wide enough to hit without looking, narrow enough to leave the rows
    /// alone: a flick anywhere else in the list still scrolls it.
    static let touchWidth: CGFloat = 34
    private let trackWidth: CGFloat = 22

    var body: some View {
        GeometryReader { geometry in
            let height = geometry.size.height
            let entries = BrowseSubgrouping.condensed(targets, limit: capacity(for: height))

            track(entries: entries)
                .frame(width: Self.touchWidth, height: height, alignment: .trailing)
                .contentShape(Rectangle())
                .gesture(scrub(entries: entries, height: height))
        }
        .frame(width: Self.touchWidth)
        .padding(.vertical, 10)
        .sensoryFeedback(.selection, trigger: activeID)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Song index")
        .accessibilityValue(activeTarget?.label ?? targets.first?.label ?? "")
        .accessibilityHint("Adjust to jump through the open heading")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment:
                step(by: 1)
            case .decrement:
                step(by: -1)
            @unknown default:
                break
            }
        }
        .accessibilityIdentifier("allSongs.scrubber")
    }

    private func track(entries: [BrowseSubgroup]) -> some View {
        VStack(spacing: 0) {
            ForEach(entries) { entry in
                Text(entry.label)
                    .font(.system(size: labelSize, weight: entry.id == activeID ? .heavy : .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(entry.id == activeID ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.secondary))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(width: trackWidth)
        .padding(.vertical, 6)
        .background {
            Capsule()
                .fill(.thinMaterial)
                .opacity(isScrubbing ? 1 : 0.7)
                .overlay {
                    Capsule().strokeBorder(.separator.opacity(isScrubbing ? 0.6 : 0.3), lineWidth: 0.5)
                }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: isScrubbing)
    }

    // MARK: Scrubbing

    private func scrub(entries: [BrowseSubgroup], height: CGFloat) -> some Gesture {
        // A zero-distance drag covers the tap as well: touching a label is the
        // shortest possible scrub to it.
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                guard !entries.isEmpty, height > 0 else { return }
                let slot = Int(value.location.y / height * CGFloat(entries.count))
                let entry = entries[min(max(slot, 0), entries.count - 1)]
                if !isScrubbing {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.15)) { isScrubbing = true }
                }
                guard entry.id != activeID else { return }
                activeID = entry.id
                onScrub(entry)
            }
            .onEnded { _ in
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { isScrubbing = false }
            }
    }

    /// VoiceOver moves run by run through the whole group, not the sample.
    private func step(by offset: Int) {
        guard !targets.isEmpty else { return }
        let current = targets.firstIndex { $0.id == activeID } ?? 0
        let next = min(max(current + offset, 0), targets.count - 1)
        guard next != current || activeID == nil else { return }
        activeID = targets[next].id
        onScrub(targets[next])
    }

    private var activeTarget: BrowseSubgroup? {
        targets.first { $0.id == activeID }
    }

    // MARK: Geometry

    private var labelSize: CGFloat {
        dynamicTypeSize.isAccessibilitySize ? 13 : 10
    }

    private var rowHeight: CGFloat {
        dynamicTypeSize.isAccessibilitySize ? 22 : 14
    }

    private func capacity(for height: CGFloat) -> Int {
        max(2, Int((height - 12) / rowHeight))
    }
}
