import Foundation

public final class QuizPCMRenderer: @unchecked Sendable {
    public enum Phase: Sendable, Equatable { case stopped, playing, paused }

    private struct PreparedEvent {
        let onsetFrame: Int64
        let durationFrames: Int64
        let gain: Double
        var voices: [SynthVoice]
        var isActive = false
        var ageFrames: Int64 = 0
        var releaseGain = 1.0
    }

    public let sampleRate: Double
    public private(set) var currentFrame: Int64 = 0
    public private(set) var phase: Phase = .stopped
    public private(set) var playbackRate = 1.0
    private var timelineFrame = 0.0
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
        timelineFrame = 0
        currentFrame = 0
        phase = .paused
    }

    /// Changes musical transport speed without replacing the timeline or its
    /// sounding voices. Oscillator phase and voice age remain tied to output
    /// samples, so pitch and active envelopes stay continuous.
    public func setPlaybackRate(_ rate: Double) {
        playbackRate = rate.isFinite ? max(rate, 0) : 1
    }

    public func play() { phase = .playing }
    public func pause() { if phase == .playing { phase = .paused } }
    public func stop() {
        phase = .stopped
        timelineFrame = 0
        currentFrame = 0
        resetEventActivity()
    }

    public func seek(progress: Double) {
        let bounded = progress.isFinite ? min(max(progress, 0), 1) : 0
        timelineFrame = Double(loopFrames) * bounded
        currentFrame = Int64(timelineFrame.rounded(.down))
        resetEventActivity()
    }

    public var progress: Double { timelineFrame / Double(loopFrames) }
    public var durationSeconds: Double {
        Double(loopFrames) / sampleRate / (playbackRate > 0 ? playbackRate : 1)
    }

    public func render(into output: UnsafeMutableBufferPointer<Float>) {
        guard phase == .playing, playbackRate > 0 else {
            output.initialize(repeating: 0)
            return
        }
        for outputIndex in output.indices {
            if timelineFrame >= Double(loopFrames) {
                timelineFrame.formTruncatingRemainder(dividingBy: Double(loopFrames))
                currentFrame = Int64(timelineFrame.rounded(.down))
                resetEventActivity()
            }
            var mixed = 0.0
            let timelineFrame = currentFrame
            for eventIndex in events.indices {
                let relativeFrame = timelineFrame - events[eventIndex].onsetFrame
                guard relativeFrame >= 0, relativeFrame < events[eventIndex].durationFrames else {
                    events[eventIndex].isActive = false
                    continue
                }
                if !events[eventIndex].isActive {
                    events[eventIndex].isActive = true
                    events[eventIndex].ageFrames = 0
                    events[eventIndex].releaseGain = 1
                }
                let sourceFramesRemaining = Double(events[eventIndex].durationFrames - relativeFrame)
                let outputFramesRemaining = sourceFramesRemaining / playbackRate
                let envelope = min(
                    min(
                        Double(events[eventIndex].ageFrames) / Double(attackFrames),
                        events[eventIndex].releaseGain
                    ),
                    1
                )
                let elapsed = Double(events[eventIndex].ageFrames) / sampleRate
                let voiceScale = events[eventIndex].voices.isEmpty ? 0 : 0.15
                for voice in events[eventIndex].voices {
                    mixed += voice.nextSample(envelope: envelope, elapsedSeconds: elapsed) * voiceScale * envelope * events[eventIndex].gain
                }
                events[eventIndex].ageFrames += 1
                if outputFramesRemaining <= Double(releaseFrames) {
                    let releaseStep = events[eventIndex].releaseGain / max(outputFramesRemaining, 1)
                    events[eventIndex].releaseGain = max(events[eventIndex].releaseGain - releaseStep, 0)
                }
            }
            output[outputIndex] = Float(min(max(mixed, -1), 1))
            self.timelineFrame += playbackRate
            if self.timelineFrame >= Double(loopFrames) {
                self.timelineFrame.formTruncatingRemainder(dividingBy: Double(loopFrames))
                resetEventActivity()
            }
            currentFrame = Int64(self.timelineFrame.rounded(.down))
        }
    }

    private func resetEventActivity() {
        for index in events.indices {
            events[index].isActive = false
            events[index].ageFrames = 0
            events[index].releaseGain = 1
        }
    }
}
