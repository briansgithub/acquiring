import Foundation

public final class QuizPCMRenderer: @unchecked Sendable {
    public enum Phase: Sendable, Equatable { case stopped, playing, paused }

    private struct PreparedEvent {
        let onsetFrame: Int64
        let onsetSeconds: Double
        let durationFrames: Int64
        let gain: Double
        let channel: AudioPlaybackChannel
        let frequenciesHz: [Double]
        let waveform: SynthWaveform
        var voices: [SynthVoice]
        var arpeggioOption: QuizArpeggioOption
        var outgoingVoices: [SynthVoice] = []
        var outgoingArpeggioOption: QuizArpeggioOption = .off
        var soundTransitionFramesRemaining = 0
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
    private var nativeBeatsPerSecond = 2.0
    private var events: [PreparedEvent] = []
    private var soundConfiguration: QuizSoundConfiguration?
    private var currentMelodyGain = 1.0
    private var currentChordGain = 1.0
    private var targetMelodyGain = 1.0
    private var targetChordGain = 1.0
    private var gainTransitionFramesRemaining = 0
    private let attackFrames: Int64
    private let releaseFrames: Int64
    private let soundTransitionFrames: Int

    public init(sampleRate: Double) {
        let validSampleRate = sampleRate.isFinite && sampleRate > 0 ? sampleRate : 48_000
        self.sampleRate = validSampleRate
        attackFrames = max(Int64(validSampleRate * 0.004), 1)
        releaseFrames = max(Int64(validSampleRate * 0.024), 1)
        soundTransitionFrames = max(Int((validSampleRate * 0.024).rounded()), 1)
    }

    public func configure(_ timeline: QuizTimeline) {
        loopFrames = max(Int64((timeline.durationSeconds * sampleRate).rounded()), 1)
        nativeBeatsPerSecond = timeline.nativeBeatsPerSecond
        events = timeline.events.map { event in
            let frequencies = event.frequenciesHz.filter { $0.isFinite && $0 > 0 }
            let waveform = soundConfiguration?.waveform ?? event.waveform
            let pitchMultiplier = Self.pitchMultiplier(for: soundConfiguration?.transposeSemitones ?? 0)
            return PreparedEvent(
                onsetFrame: max(Int64((event.onsetSeconds * sampleRate).rounded()), 0),
                onsetSeconds: max(event.onsetSeconds, 0),
                durationFrames: max(Int64((event.durationSeconds * sampleRate).rounded()), 1),
                gain: Double(min(max(event.gain, 0), 1)),
                channel: event.channel,
                frequenciesHz: frequencies,
                waveform: event.waveform,
                voices: frequencies.map {
                    SynthVoice(frequencyHz: $0 * pitchMultiplier, waveform: waveform, sampleRate: sampleRate)
                },
                arpeggioOption: soundConfiguration?.arpeggioOption ?? .off
            )
        }
        snapLayerGainsToTargets()
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

    /// Applies timbre, layer balance, and absolute transposition without
    /// replacing the timeline or resetting transport and envelope age.
    public func setSoundConfiguration(_ configuration: QuizSoundConfiguration) {
        let previousConfiguration = soundConfiguration
        soundConfiguration = configuration
        targetMelodyGain = configuration.melodyGain
        targetChordGain = configuration.chordGain

        if phase == .playing, events.contains(where: \.isActive) {
            gainTransitionFramesRemaining = soundTransitionFrames
        } else {
            snapLayerGainsToTargets()
        }

        for index in events.indices {
            let previousWaveform = previousConfiguration?.waveform ?? events[index].waveform
            let previousTranspose = previousConfiguration?.transposeSemitones ?? 0
            let waveformOrPitchChanged = previousWaveform != configuration.waveform ||
                previousTranspose != configuration.transposeSemitones
            let arpeggioChanged = events[index].channel == .chord &&
                events[index].arpeggioOption != configuration.arpeggioOption
            guard waveformOrPitchChanged || arpeggioChanged else { continue }

            let multiplier = Self.pitchMultiplier(for: configuration.transposeSemitones)
            let frequencies = events[index].frequenciesHz.map { $0 * multiplier }
            let replacementVoices = zip(events[index].voices, frequencies).map { voice, frequency in
                voice.replacing(frequencyHz: frequency, waveform: configuration.waveform)
            }
            if events[index].isActive {
                events[index].outgoingVoices = events[index].voices
                events[index].outgoingArpeggioOption = events[index].arpeggioOption
                events[index].soundTransitionFramesRemaining = soundTransitionFrames
            } else {
                events[index].outgoingVoices.removeAll(keepingCapacity: true)
                events[index].outgoingArpeggioOption = .off
                events[index].soundTransitionFramesRemaining = 0
            }
            events[index].voices = replacementVoices
            events[index].arpeggioOption = configuration.arpeggioOption
        }
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
                let elapsedBeats = max(
                    (self.timelineFrame / sampleRate - events[eventIndex].onsetSeconds) * nativeBeatsPerSecond,
                    0
                )
                let incoming = sampleSum(
                    events[eventIndex].voices,
                    envelope: envelope,
                    elapsedSeconds: elapsed,
                    elapsedBeats: elapsedBeats,
                    channel: events[eventIndex].channel,
                    arpeggioOption: events[eventIndex].arpeggioOption
                )
                let transitioned: Double
                if events[eventIndex].soundTransitionFramesRemaining > 0 {
                    let remaining = events[eventIndex].soundTransitionFramesRemaining
                    let incomingWeight = 1 - Double(remaining) / Double(soundTransitionFrames)
                    let outgoing = sampleSum(
                        events[eventIndex].outgoingVoices,
                        envelope: envelope,
                        elapsedSeconds: elapsed,
                        elapsedBeats: elapsedBeats,
                        channel: events[eventIndex].channel,
                        arpeggioOption: events[eventIndex].outgoingArpeggioOption
                    )
                    transitioned = outgoing * (1 - incomingWeight) + incoming * incomingWeight
                    events[eventIndex].soundTransitionFramesRemaining -= 1
                    if events[eventIndex].soundTransitionFramesRemaining == 0 {
                        events[eventIndex].outgoingVoices.removeAll(keepingCapacity: true)
                    }
                } else {
                    transitioned = incoming
                }
                mixed += transitioned * voiceScale * envelope * events[eventIndex].gain * layerGain(for: events[eventIndex].channel)
                events[eventIndex].ageFrames += 1
                if outputFramesRemaining <= Double(releaseFrames) {
                    let releaseStep = events[eventIndex].releaseGain / max(outputFramesRemaining, 1)
                    events[eventIndex].releaseGain = max(events[eventIndex].releaseGain - releaseStep, 0)
                }
            }
            output[outputIndex] = Float(min(max(mixed, -1), 1))
            advanceLayerGainTransition()
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
            events[index].outgoingVoices.removeAll(keepingCapacity: true)
            events[index].outgoingArpeggioOption = .off
            events[index].soundTransitionFramesRemaining = 0
        }
    }

    private func sampleSum(
        _ voices: [SynthVoice],
        envelope: Double,
        elapsedSeconds: Double,
        elapsedBeats: Double,
        channel: AudioPlaybackChannel,
        arpeggioOption: QuizArpeggioOption
    ) -> Double {
        if channel == .chord, voices.count > 1, arpeggioOption.cyclesPerBeat > 0 {
            let exactSlot = max(elapsedBeats, 0) * Double(voices.count) * arpeggioOption.cyclesPerBeat
            let slotProgress = exactSlot - floor(exactSlot)
            let slotEnvelope = min(
                min(max(slotProgress / 0.08, 0), 1),
                min(max((1 - slotProgress) / 0.12, 0), 1)
            )
            let voiceIndex = Int(floor(exactSlot).truncatingRemainder(dividingBy: Double(voices.count)))
            return voices[voiceIndex].nextSample(
                envelope: envelope * slotEnvelope,
                elapsedSeconds: elapsedSeconds,
                arpeggiated: true
            ) * slotEnvelope
        }

        var result = 0.0
        for voice in voices {
            result += voice.nextSample(envelope: envelope, elapsedSeconds: elapsedSeconds)
        }
        return result
    }

    private func layerGain(for channel: AudioPlaybackChannel) -> Double {
        guard soundConfiguration != nil else { return 1 }
        switch channel {
        case .melody: return currentMelodyGain
        case .chord: return currentChordGain
        case .preview: return 1
        }
    }

    private func advanceLayerGainTransition() {
        guard gainTransitionFramesRemaining > 0 else { return }
        currentMelodyGain += (targetMelodyGain - currentMelodyGain) /
            Double(gainTransitionFramesRemaining)
        currentChordGain += (targetChordGain - currentChordGain) /
            Double(gainTransitionFramesRemaining)
        gainTransitionFramesRemaining -= 1
        if gainTransitionFramesRemaining == 0 {
            currentMelodyGain = targetMelodyGain
            currentChordGain = targetChordGain
        }
    }

    private func snapLayerGainsToTargets() {
        targetMelodyGain = soundConfiguration?.melodyGain ?? 1
        targetChordGain = soundConfiguration?.chordGain ?? 1
        currentMelodyGain = targetMelodyGain
        currentChordGain = targetChordGain
        gainTransitionFramesRemaining = 0
    }

    private static func pitchMultiplier(for transposeSemitones: Int) -> Double {
        pow(2, Double(transposeSemitones) / 12)
    }
}
