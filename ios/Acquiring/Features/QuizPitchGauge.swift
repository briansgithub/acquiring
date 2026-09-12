import AcquiringCore
import SwiftUI

/// The live pitch gauge worn by whichever quiz card is currently under persistent practice.
///
/// A horizontal bar rides up for sharp and down for flat against a faint centre line that is
/// the target pitch, so "am I on the note" is answered by one glance at how far the bar sits
/// from the middle, without reading a number. The colour carries the accuracy band and the
/// corner pill carries the signed cents error.
///
/// The gauge reads the practice model from the environment rather than taking the cents error
/// as a parameter. That is load-bearing: `liveCentsError` changes every 16 ms, and `@Observable`
/// tracks reads per-`body`, so keeping the read inside this view confines the 60 Hz
/// invalidation here instead of re-evaluating the whole card stack and the quiz screen above it.
struct QuizPitchGauge: View {
    @Environment(VocalPracticeModel.self) private var vocalPractice: VocalPracticeModel?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Matches Android's 8dp bar. Thick enough to read in peripheral vision on the 44pt cards.
    private static let barThickness: CGFloat = 8
    /// Keeps the bar's rounded ends clear of the card's 14pt corner radius.
    private static let horizontalInset: CGFloat = 2
    /// A semitone either way fills the gauge; beyond that the bar pins and a chevron appears.
    private static let fullScaleCents: Double = 200
    /// Android lets the bar travel slightly past the ends so a pinned reading still reads as
    /// pinned rather than as merely "at the top".
    private static let travelLimit: Double = 1.2

    var body: some View {
        GeometryReader { proxy in
            let centreY = proxy.size.height / 2
            let centsError = vocalPractice?.liveCentsError

            ZStack(alignment: .topLeading) {
                Color.black.opacity(0.10)

                // The target pitch. The bar rests here when the singer is exactly on it.
                Rectangle()
                    .fill(.white.opacity(0.5))
                    .frame(height: 1)
                    .offset(y: centreY - 0.5)

                if let centsError {
                    Capsule()
                        .fill(Color.pitchFeedback(centsError: centsError))
                        .frame(
                            width: max(proxy.size.width - Self.horizontalInset * 2, 0),
                            height: Self.barThickness
                        )
                        .offset(
                            x: Self.horizontalInset,
                            y: barCentreY(in: proxy.size, centsError: centsError) - Self.barThickness / 2
                        )
                        // Android tweens the marker over 32 ms: fast enough to feel attached to
                        // the voice, slow enough to take the jitter off a raw detector frame.
                        // Deliberately linear - a spring would overshoot and report a pitch the
                        // singer never sang.
                        .animation(reduceMotion ? nil : .linear(duration: 0.032), value: centsError)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .overlay(alignment: .top) { pinChevron(.up, centsError: centsError) }
            .overlay(alignment: .bottom) { pinChevron(.down, centsError: centsError) }
            .overlay(alignment: .bottomTrailing) { centsReadout(hasSignal: centsError != nil) }
            .overlay(alignment: .bottom) { placeholder(hasSignal: centsError != nil) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func barCentreY(in size: CGSize, centsError: Double) -> CGFloat {
        let centreY = size.height / 2
        // Half the travel the bar has before its own thickness would hang off the card.
        let usableHalfHeight = max(centreY - Self.barThickness / 2, 0)
        let normalised = min(max(centsError / Self.fullScaleCents, -Self.travelLimit), Self.travelLimit)
        // Sharp is up, which is why this subtracts: positive cents means above the target.
        return centreY - CGFloat(normalised) * usableHalfHeight
    }

    @ViewBuilder
    private func pinChevron(_ direction: PinDirection, centsError: Double?) -> some View {
        if let centsError, direction.isPinned(centsError: centsError) {
            Image(systemName: direction.symbolName)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color.pitchFeedback(centsError: centsError))
                .padding(direction == .up ? .top : .bottom, 1)
        }
    }

    @ViewBuilder
    private func centsReadout(hasSignal: Bool) -> some View {
        // Sampled rather than live: the bar tracks every frame, but a number restating itself
        // sixty times a second cannot be read. The same string the timeline marker prints, so
        // the two readouts can never disagree about the pitch the singer just sang.
        if hasSignal,
           let text = vocalPractice?.sampledLiveCentsText,
           let band = vocalPractice?.sampledFeedbackBand {
            LivePitchErrorReadout(text: text, color: .pitchFeedback(band))
                .padding(4)
        }
    }

    @ViewBuilder
    private func placeholder(hasSignal: Bool) -> some View {
        if !hasSignal {
            Text("Hum a steady note…")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.bottom, 3)
                .padding(.horizontal, 4)
        }
    }

    private enum PinDirection {
        case up
        case down

        var symbolName: String {
            switch self {
            case .up: "chevron.compact.up"
            case .down: "chevron.compact.down"
            }
        }

        func isPinned(centsError: Double) -> Bool {
            switch self {
            case .up: centsError >= QuizPitchGauge.fullScaleCents
            case .down: centsError <= -QuizPitchGauge.fullScaleCents
            }
        }
    }
}
