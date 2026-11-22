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
        let rootFrequencyHz: Double?
        let waveform: SynthWaveform
        let cueContext: PlaybackCueContext
        var pulseVoices: [SynthVoice] = []
        var outgoingPulseVoices: [SynthVoice] = []
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
    private struct SpeechState {
        let phrase: PreparedSpeech
        var position: Double = 0
        var renderedFrames = 0
        var started = false
    }
    private var speech: [SpeechState] = []

    /// Prepared off the callback. Preserve phrase progress across tempo/pitch edits.
    public func setPreparedSpeech(_ phrases: [PreparedSpeech], preserveProgress: Bool = true) {
        speech = phrases.map { phrase in
            if preserveProgress, let old = speech.first(where: { $0.phrase.identity == phrase.identity }), old.started {
                let fraction = old.position / Double(max(old.phrase.totalFrames, 1))
                return SpeechState(phrase: phrase, position: fraction * Double(phrase.totalFrames),
                                   renderedFrames: old.renderedFrames, started: true)
            }
            return SpeechState(phrase: phrase)
        }
    }
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
        speech.removeAll(keepingCapacity: true)
        loopFrames = max(Int64((timeline.durationSeconds * sampleRate).rounded()), 1)
        nativeBeatsPerSecond = timeline.nativeBeatsPerSecond
        events = timeline.events.map { event in
            let frequencies = event.frequenciesHz.filter { $0.isFinite && $0 > 0 }
            let rootFrequency = event.rootFrequencyHz.flatMap { frequency in
                frequency.isFinite && frequency > 0 ? frequency : nil
            }
            let waveform = soundConfiguration?.waveform ?? event.waveform
            let pitchMultiplier = Self.pitchMultiplier(for: soundConfiguration?.transposeSemitones ?? 0)
            let selectedFrequencies = Self.selectedFrequencies(
                channel: event.channel,
                frequenciesHz: frequencies,
                rootFrequencyHz: rootFrequency,
                chordMode: soundConfiguration?.cue.pulsesRoots == true ? .rootOnly : (soundConfiguration?.chordMode ?? .full)
            )
            return PreparedEvent(
                onsetFrame: max(Int64((event.onsetSeconds * sampleRate).rounded()), 0),
                onsetSeconds: max(event.onsetSeconds, 0),
                durationFrames: max(Int64((event.durationSeconds * sampleRate).rounded()), 1),
                gain: Double(min(max(event.gain, 0), 1)),
                channel: event.channel,
                frequenciesHz: frequencies,
                rootFrequencyHz: rootFrequency,
                waveform: event.waveform,
                cueContext: event.cueContext,
                voices: selectedFrequencies.map {
                    SynthVoice(frequencyHz: $0 * pitchMultiplier, waveform: waveform, sampleRate: sampleRate)
                },
                arpeggioOption: soundConfiguration?.arpeggioOption ?? .off
            )
        }
        if let configuration = soundConfiguration {
            soundConfiguration = nil
            setSoundConfiguration(configuration)
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
                events[index].arpeggioOption != (configuration.cue.pulsesRoots ? .off : configuration.arpeggioOption)
            let chordModeChanged = events[index].channel == .chord &&
                previousConfiguration?.chordMode != configuration.chordMode
            let pulsesChanged = previousConfiguration?.cue != configuration.cue ||
                previousConfiguration?.majorLocked != configuration.majorLocked
            guard waveformOrPitchChanged || arpeggioChanged || chordModeChanged || pulsesChanged else { continue }

            let multiplier = Self.pitchMultiplier(for: configuration.transposeSemitones)
            let frequencies = Self.selectedFrequencies(
                channel: events[index].channel,
                frequenciesHz: events[index].frequenciesHz,
                rootFrequencyHz: events[index].rootFrequencyHz,
                chordMode: configuration.cue.pulsesRoots ? .rootOnly : configuration.chordMode
            ).map { $0 * multiplier }
            let replacementVoices = replacementVoices(
                for: frequencies,
                waveform: configuration.waveform,
                preserving: events[index].voices
            )
            if events[index].isActive {
                events[index].outgoingPulseVoices = events[index].pulseVoices
                events[index].outgoingVoices = events[index].voices
                events[index].outgoingArpeggioOption = events[index].arpeggioOption
                events[index].soundTransitionFramesRemaining = soundTransitionFrames
            } else {
                events[index].outgoingPulseVoices.removeAll(keepingCapacity: true)
                events[index].outgoingVoices.removeAll(keepingCapacity: true)
                events[index].outgoingArpeggioOption = .off
                events[index].soundTransitionFramesRemaining = 0
            }
            let count = events[index].channel == .chord
                ? events[index].cueContext.pulseCount(cue: configuration.cue, majorLocked: configuration.majorLocked) : 0
            let previousPulses = events[index].pulseVoices
            events[index].pulseVoices = (0..<count).compactMap { pulse in
                guard let frequency = frequencies.first else { return nil }
                return previousPulses.indices.contains(pulse)
                    ? previousPulses[pulse].replacing(frequencyHz: frequency, waveform: configuration.waveform)
                    : SynthVoice(frequencyHz: frequency, waveform: configuration.waveform, sampleRate: sampleRate)
            }
            events[index].voices = count > 0 ? [] : replacementVoices
            events[index].arpeggioOption = configuration.cue.pulsesRoots ? .off : configuration.arpeggioOption
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

    var preparedVoiceFrequenciesForTesting: [[Double]] {
        events.map { $0.voices.map(\.frequencyHz) }
    }

    var preparedEventAgesForTesting: [Int64] {
        events.map(\.ageFrames)
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
                // Keep the outgoing side audible when a live mode change has no
                // replacement voice (for example, root-only with no resolved root).
                let voiceScale = 0.15
                let elapsedBeats = max(
                    (self.timelineFrame / sampleRate - events[eventIndex].onsetSeconds) * nativeBeatsPerSecond,
                    0
                )
                let incoming = pulseSample(events[eventIndex].pulseVoices, relativeFrame: relativeFrame,
                    durationFrames: events[eventIndex].durationFrames, envelope: envelope) + sampleSum(
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
                    let outgoing = pulseSample(events[eventIndex].outgoingPulseVoices, relativeFrame: relativeFrame,
                        durationFrames: events[eventIndex].durationFrames, envelope: envelope) + sampleSum(
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
                        events[eventIndex].outgoingPulseVoices.removeAll(keepingCapacity: true)
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
            mixed += speechSample() * (soundConfiguration?.voiceVolume ?? 0.5) * PlaybackCueMath.voiceMaximumGain
            output[outputIndex] = Float(PlaybackCueMath.softLimit(mixed))
            advanceLayerGainTransition()
            self.timelineFrame += playbackRate
            if self.timelineFrame >= Double(loopFrames) {
                self.timelineFrame.formTruncatingRemainder(dividingBy: Double(loopFrames))
                resetEventActivity()
            }
            currentFrame = Int64(self.timelineFrame.rounded(.down))
        }
    }

    private func pulseSample(_ voices: [SynthVoice], relativeFrame: Int64,
                             durationFrames: Int64, envelope: Double) -> Double {
        guard !voices.isEmpty else { return 0 }
        let slot = min(Double(relativeFrame) / Double(durationFrames) * Double(voices.count),
                       Double(voices.count).nextDown)
        let index = Int(slot), progress = slot - Double(index)
        guard progress < 0.8 else { return 0 }
        let pulseEnvelope = max(0, min(progress / 0.08, (0.8 - progress) / 0.12, 1))
        let elapsed = progress * Double(durationFrames) / (Double(voices.count) * sampleRate * playbackRate)
        return voices[index].nextSample(envelope: envelope * pulseEnvelope,
                                        elapsedSeconds: elapsed) * pulseEnvelope
    }

    private func speechSample() -> Double {
        let seconds = timelineFrame / sampleRate
        var sum = 0.0
        for i in speech.indices {
            let phrase = speech[i].phrase
            guard seconds >= phrase.onsetSeconds, seconds < phrase.endSeconds else { continue }
            if !speech[i].started {
                speech[i].started = true
                speech[i].position = max(0, seconds - phrase.onsetSeconds) / playbackRate * 24000
            }
            let position = speech[i].position, absoluteIndex = Int(position)
            guard absoluteIndex < phrase.totalFrames else { continue }
            let index = absoluteIndex - phrase.sampleOffset
            guard index >= 0, index < phrase.samples.count else {
                speech[i].position += 24000 / sampleRate
                continue
            }
            let first = Double(phrase.samples[index])
            let next = index + 1 < phrase.samples.count ? Double(phrase.samples[index + 1]) : 0
            let fade = sampleRate * 0.005
            let envelope = max(0, min(Double(speech[i].renderedFrames) / fade,
                                     (phrase.endSeconds - seconds) / playbackRate * sampleRate / fade,
                                     (Double(phrase.totalFrames) - position) * sampleRate / 24000 / fade, 1))
            sum += (first + (next - first) * (position - Double(absoluteIndex))) / 32767 * envelope
            speech[i].position += 24000 / sampleRate
            speech[i].renderedFrames += 1
        }
        return sum
    }

    private func resetEventActivity() {
        for index in speech.indices {
            speech[index].started = false
            speech[index].position = 0
            speech[index].renderedFrames = 0
        }
        for index in events.indices {
            events[index].isActive = false
            events[index].ageFrames = 0
            events[index].releaseGain = 1
            events[index].outgoingPulseVoices.removeAll(keepingCapacity: true)
            events[index].outgoingVoices.removeAll(keepingCapacity: true)
            events[index].outgoingArpeggioOption = .off
            events[index].soundTransitionFramesRemaining = 0
        }
    }

    static func arpeggioPosition(
        elapsedBeats: Double,
        toneCount: Int,
        option: QuizArpeggioOption
    ) -> (toneIndex: Int, progress: Double) {
        guard toneCount > 1, option.cyclesPerBeat > 0 else { return (0, 0) }
        let rawSlot = max(elapsedBeats, 0) * Double(toneCount) * option.cyclesPerBeat
        // Frame → seconds → beats conversion can land a few ULPs below an
        // integer. Snap only roundoff at a boundary, never a musical subdivision:
        // the last tone owns [lastSlot, cycleEnd), and cycleEnd starts tone zero.
        let nearestSlot = rawSlot.rounded()
        let tolerance = 32 * max(rawSlot, 1).ulp
        let exactSlot = abs(rawSlot - nearestSlot) <= tolerance ? nearestSlot : rawSlot
        let slot = floor(exactSlot)
        return (Int(slot.truncatingRemainder(dividingBy: Double(toneCount))), exactSlot - slot)
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
            let position = Self.arpeggioPosition(
                elapsedBeats: elapsedBeats,
                toneCount: voices.count,
                option: arpeggioOption
            )
            let slotProgress = position.progress
            let slotEnvelope = min(
                min(max(slotProgress / 0.08, 0), 1),
                min(max((1 - slotProgress) / 0.12, 0), 1)
            )
            let voiceIndex = position.toneIndex
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

    private static func selectedFrequencies(
        channel: AudioPlaybackChannel,
        frequenciesHz: [Double],
        rootFrequencyHz: Double?,
        chordMode: QuizChordMode
    ) -> [Double] {
        if channel == .chord, chordMode == .rootOnly {
            return rootFrequencyHz.map { [$0] } ?? []
        }
        return frequenciesHz
    }

    private func replacementVoices(
        for frequenciesHz: [Double],
        waveform: SynthWaveform,
        preserving previousVoices: [SynthVoice]
    ) -> [SynthVoice] {
        frequenciesHz.enumerated().map { index, frequency in
            let matchingVoice = previousVoices.first { voice in
                abs(voice.frequencyHz - frequency) < 1e-9
            }
            let source = matchingVoice
                ?? (previousVoices.indices.contains(index) ? previousVoices[index] : previousVoices.first)
            return source?.replacing(frequencyHz: frequency, waveform: waveform)
                ?? SynthVoice(frequencyHz: frequency, waveform: waveform, sampleRate: sampleRate)
        }
    }
}
