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
    case flute
    case clarinet
    case oboe
    case brass
    case bell
    case synthBass

    public var displayName: String {
        switch self {
        case .sine: "Sine"
        case .square: "Square"
        case .sawtooth: "Sawtooth"
        case .triangle: "Triangle"
        case .strings: "Strings"
        case .electricPiano: "Electric Piano"
        case .warmOrgan: "Warm Organ"
        case .marimba: "Marimba"
        case .vibraphone: "Vibraphone"
        case .nylonGuitar: "Nylon Guitar"
        case .flute: "Synth Flute"
        case .clarinet: "Synth Clarinet"
        case .oboe: "Synth Oboe"
        case .brass: "Synth Brass"
        case .bell: "Synth Bell"
        case .synthBass: "Synth Bass"
        }
    }
}

public enum AudioPlaybackChannel: String, CaseIterable, Sendable {
    case melody
    case chord
    case preview
}

public enum QuizArpeggioOption: String, CaseIterable, Sendable {
    case quarter = "1/4"
    case third = "1/3"
    case half = "1/2"
    case off
    case one = "1"
    case two = "2"
    case three = "3"
    case four = "4"

    public var displayName: String { rawValue }

    public var cyclesPerBeat: Double {
        switch self {
        case .quarter: 0.25
        case .third: 1.0 / 3.0
        case .half: 0.5
        case .off: 0
        case .one: 1
        case .two: 2
        case .three: 3
        case .four: 4
        }
    }
}

public enum QuizChordMode: Sendable, Equatable {
    case full
    case rootOnly
}

public struct PreviewRequest: Equatable, Sendable {
    public let frequenciesHz: [Double]
    public let duration: Duration
    public let arpeggiates: Bool
    public let arpeggioStep: Duration
    public let waveform: SynthWaveform
    public let gain: Float
    public let usesMusicalConfiguration: Bool

    public init(
        frequenciesHz: [Double],
        duration: Duration = .milliseconds(450),
        arpeggiates: Bool = false,
        arpeggioStep: Duration = .milliseconds(160),
        waveform: SynthWaveform = .sawtooth,
        gain: Float = 1,
        usesMusicalConfiguration: Bool = true
    ) {
        self.frequenciesHz = frequenciesHz
        self.duration = duration
        self.arpeggiates = arpeggiates
        self.arpeggioStep = arpeggioStep
        self.waveform = waveform
        self.gain = gain
        self.usesMusicalConfiguration = usesMusicalConfiguration
    }
}

public struct QuizSoundConfiguration: Equatable, Sendable {
    public let waveform: SynthWaveform
    public let melodyChordBalance: Double
    public let transposeSemitones: Int
    public let arpeggioOption: QuizArpeggioOption
    public let chordMode: QuizChordMode

    public init(
        waveform: SynthWaveform = .sawtooth,
        melodyChordBalance: Double = 0.5,
        transposeSemitones: Int = 0,
        arpeggioOption: QuizArpeggioOption = .off,
        chordMode: QuizChordMode = .full
    ) {
        self.waveform = waveform
        self.melodyChordBalance = melodyChordBalance.isFinite
            ? min(max(melodyChordBalance, 0), 1)
            : 0.5
        self.transposeSemitones = min(max(transposeSemitones, -12), 12)
        self.arpeggioOption = arpeggioOption
        self.chordMode = chordMode
    }

    public var melodyGain: Double { melodyChordBalance }
    public var chordGain: Double { 1 - melodyChordBalance }
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
    func load(_ timeline: QuizTimeline, position: QuizLoadPosition) async throws
    func play() async throws
    func pause() async
    func seek(to progress: Double) async
    func stop() async
}

public enum QuizLoadPosition: Sendable {
    case restart
    case preserveProgress
}

public struct QuizEvent: Equatable, Sendable {
    public let onsetSeconds: Double
    public let durationSeconds: Double
    public let frequenciesHz: [Double]
    public let waveform: SynthWaveform
    public let gain: Float
    public let channel: AudioPlaybackChannel
    public let rootFrequencyHz: Double?

    public init(
        onsetSeconds: Double,
        durationSeconds: Double,
        frequenciesHz: [Double],
        waveform: SynthWaveform,
        gain: Float = 1,
        channel: AudioPlaybackChannel = .melody,
        rootFrequencyHz: Double? = nil
    ) {
        self.onsetSeconds = onsetSeconds
        self.durationSeconds = durationSeconds
        self.frequenciesHz = frequenciesHz
        self.waveform = waveform
        self.gain = gain
        self.channel = channel
        self.rootFrequencyHz = rootFrequencyHz
    }
}

public struct QuizTimeline: Equatable, Sendable {
    public let durationSeconds: Double
    public let events: [QuizEvent]
    public let nativeBeatsPerSecond: Double

    public init(
        durationSeconds: Double,
        events: [QuizEvent],
        nativeBeatsPerSecond: Double = 2
    ) {
        self.durationSeconds = durationSeconds
        self.events = events
        self.nativeBeatsPerSecond = nativeBeatsPerSecond.isFinite && nativeBeatsPerSecond > 0
            ? nativeBeatsPerSecond
            : 2
    }
}

public protocol PitchSource: Sendable {
    func readings(profile: PitchTrackingProfile) async -> AsyncThrowingStream<PitchReading, any Error>
    func stop() async
}

public enum PitchTrackingProfile: Sendable {
    case standard
    case melodyFast
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
