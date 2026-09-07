import AcquiringCore
import SwiftUI

extension Color {
    /// The app's single pitch-accuracy palette, so the card gauge, the timeline marker, its
    /// readout, the banked run scores, and the singing dock never disagree about what
    /// "close" looks like.
    ///
    /// Bands come from `PersistentPitchFeedback.band(centsError:)` - 15 and 50 cents, matching
    /// Android. The hues are system colours rather than Android's hex so the palette follows
    /// dark mode and the accessibility colour settings; the band boundaries are what carry the
    /// meaning, and those are identical across platforms.
    static func pitchFeedback(_ band: PitchFeedbackBand) -> Color {
        switch band {
        case .accurate: .green
        case .close: .yellow
        case .far: .red
        }
    }

    /// For the call sites that hold a cents error rather than an already-resolved band. Routing
    /// them through here is what stops a second set of cut-points growing back.
    static func pitchFeedback(centsError: Double) -> Color {
        pitchFeedback(PersistentPitchFeedback.band(centsError: centsError))
    }
}

/// The live cents-off readout: how far the sung pitch sits from the target note, signed sharp
/// or flat. A dark pill keeps the number legible over the melody bars and over a card's tint,
/// and the accuracy band is carried by the text colour so it reads as one object with the
/// marker or gauge it labels.
///
/// Shared by the melody timeline marker and the on-card pitch gauge so the two can never
/// print the same reading differently.
struct LivePitchErrorReadout: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2.weight(.bold).monospacedDigit())
            .foregroundStyle(color)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(.black.opacity(0.76), in: Capsule())
            .fixedSize()
    }
}
