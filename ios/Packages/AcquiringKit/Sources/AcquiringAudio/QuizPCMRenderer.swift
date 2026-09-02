import Foundation

public final class QuizPCMRenderer: @unchecked Sendable {
    public enum Phase: Sendable { case stopped, playing, paused }

    private struct PreparedEvent {
        let onsetFrame: Int64
        let durationFrames: Int64
        let gain: Double
        var voices: [SynthVoice]
    }

    public let sampleRate: Double
    public private(set) var currentFrame: Int64 = 0
    public private(set) var phase: Phase = .stopped
    private var loopFrames: Int64 = 1
    private var events: [PreparedEvent] = []
    private let attackFrames: Int64
    private let releaseFrames: Int64

    public init(sampleRate: Double) {
        let validSampleRate = sampleRate.isFinite && sampleRate > 0 ? sampleRate : 48_000
        self.sampleRate = validSampleRate
        attackFrames = max(Int64(validSampleRate * 0.004), 1)
        releaseFrames = max(Int64(validSampleRate * 0.024), 1)
    }

    public func configure(_ timeline: QuizTimeline) {
        loopFrames = max(Int64((timeline.durationSeconds * sampleRate).rounded()), 1)
        events = timeline.events.map { event in
            PreparedEvent(
                onsetFrame: max(Int64((event.onsetSeconds * sampleRate).rounded()), 0),
                durationFrames: max(Int64((event.durationSeconds * sampleRate).rounded()), 1),
                gain: Double(min(max(event.gain, 0), 1)),
                voices: event.frequenciesHz.filter { $0.isFinite && $0 > 0 }.map {
                    SynthVoice(frequencyHz: $0, waveform: event.waveform, sampleRate: sampleRate)
                }
            )
        }
        currentFrame = 0
        phase = .paused
    }

    public func play() { phase = .playing }
    public func pause() { if phase == .playing { phase = .paused } }
    public func stop() { phase = .stopped; currentFrame = 0 }

    public func seek(progress: Double) {
        let bounded = progress.isFinite ? min(max(progress, 0), 1) : 0
        currentFrame = Int64((Double(loopFrames) * bounded).rounded())
    }

    public var progress: Double { Double(currentFrame) / Double(loopFrames) }
    public var durationSeconds: Double { Double(loopFrames) / sampleRate }

    public func render(into output: UnsafeMutableBufferPointer<Float>) {
        guard phase == .playing else {
            output.initialize(repeating: 0)
            return
        }
        for outputIndex in output.indices {
            if currentFrame >= loopFrames { currentFrame = 0 }
            var mixed = 0.0
            let timelineFrame = currentFrame
            for eventIndex in events.indices {
                let relativeFrame = timelineFrame - events[eventIndex].onsetFrame
                guard relativeFrame >= 0, relativeFrame < events[eventIndex].durationFrames else { continue }
                let envelope = min(
                    min(Double(relativeFrame) / Double(attackFrames), 1),
                    min(Double(events[eventIndex].durationFrames - relativeFrame) / Double(releaseFrames), 1)
                )
                let elapsed = Double(relativeFrame) / sampleRate
                let voiceScale = events[eventIndex].voices.isEmpty ? 0 : 0.15
                for voice in events[eventIndex].voices {
                    mixed += voice.nextSample(envelope: envelope, elapsedSeconds: elapsed) * voiceScale * envelope * events[eventIndex].gain
                }
            }
            output[outputIndex] = Float(min(max(mixed, -1), 1))
            currentFrame += 1
            if currentFrame >= loopFrames { currentFrame = 0 }
        }
    }
}
