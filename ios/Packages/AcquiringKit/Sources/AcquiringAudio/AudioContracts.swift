import AcquiringCore
import Foundation

public enum SynthWaveform: String, CaseIterable, Codable, Sendable {
    case sine
    case square
    case sawtooth
    case triangle
    case strings
    case electricPiano
    case warmOrgan
    case marimba
    case vibraphone
    case nylonGuitar
}

public enum AudioPlaybackChannel: String, CaseIterable, Sendable {
    case melody
    case chord
    case preview
}

public struct PreviewRequest: Equatable, Sendable {
    public let frequenciesHz: [Double]
    public let duration: Duration
    public let arpeggiates: Bool
    public let arpeggioStep: Duration
    public let waveform: SynthWaveform
    public let gain: Float

    public init(
        frequenciesHz: [Double],
        duration: Duration = .milliseconds(450),
        arpeggiates: Bool = false,
        arpeggioStep: Duration = .milliseconds(160),
        waveform: SynthWaveform = .sawtooth,
        gain: Float = 1
    ) {
        self.frequenciesHz = frequenciesHz
        self.duration = duration
        self.arpeggiates = arpeggiates
        self.arpeggioStep = arpeggioStep
        self.waveform = waveform
        self.gain = gain
    }
}

public enum TransportPhase: String, Equatable, Sendable {
    case stopped
    case buffering
    case playing
    case paused
    case failed
}

public struct TransportState: Equatable, Sendable {
    public let phase: TransportPhase
    public let elapsed: Duration
    public let duration: Duration
    public let errorDescription: String?

    public init(
        phase: TransportPhase,
        elapsed: Duration = .zero,
        duration: Duration = .zero,
        errorDescription: String? = nil
    ) {
        self.phase = phase
        self.elapsed = elapsed
        self.duration = duration
        self.errorDescription = errorDescription
    }
}

public struct PitchReading: Equatable, Sendable {
    public let midi: Double
    public let confidence: Double
    public let rms: Double

    public init(midi: Double, confidence: Double, rms: Double) {
        self.midi = midi
        self.confidence = confidence
        self.rms = rms
    }
}

public protocol PreviewAudio: Sendable {
    func play(_ request: PreviewRequest) async throws
    func stop(channel: AudioPlaybackChannel) async
}

public protocol QuizTransport: Sendable {
    func states() async -> AsyncStream<TransportState>
    func load(_ timeline: QuizTimeline) async throws
    func play() async throws
    func pause() async
    func seek(to progress: Double) async
    func stop() async
}

public struct QuizEvent: Equatable, Sendable {
    public let onsetSeconds: Double
    public let durationSeconds: Double
    public let frequenciesHz: [Double]
    public let waveform: SynthWaveform
    public let gain: Float

    public init(
        onsetSeconds: Double,
        durationSeconds: Double,
        frequenciesHz: [Double],
        waveform: SynthWaveform,
        gain: Float = 1
    ) {
        self.onsetSeconds = onsetSeconds
        self.durationSeconds = durationSeconds
        self.frequenciesHz = frequenciesHz
        self.waveform = waveform
        self.gain = gain
    }
}

public struct QuizTimeline: Equatable, Sendable {
    public let durationSeconds: Double
    public let events: [QuizEvent]

    public init(durationSeconds: Double, events: [QuizEvent]) {
        self.durationSeconds = durationSeconds
        self.events = events
    }
}

public protocol PitchSource: Sendable {
    func readings() async -> AsyncThrowingStream<PitchReading, any Error>
    func stop() async
}

public enum AcquiringAudioError: Error, LocalizedError, Equatable, Sendable {
    case invalidRequest(String)
    case session(String)
    case engine(String)
    case microphonePermissionDenied
    case microphoneInUse

    public var errorDescription: String? {
        switch self {
        case let .invalidRequest(message): message
        case let .session(message): "Audio session error: \(message)"
        case let .engine(message): "Audio engine error: \(message)"
        case .microphonePermissionDenied: "Microphone access is required for vocal practice."
        case .microphoneInUse: "The microphone is already in use by another practice tool."
        }
    }
}
