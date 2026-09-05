import AcquiringAudio
import Foundation

/// The app-level interactions that can temporarily own the single hardware input.
enum MicrophoneOwner: Sendable {
    case singingTool
    case tessitura
    case persistentPractice
}

/// A capability for one microphone acquisition. Only this exact identifier may
/// release its capture, so delayed cleanup from an older interaction is harmless.
struct MicrophoneLease: Sendable {
    let id: UUID
    let readings: AsyncThrowingStream<PitchReading, any Error>
}
