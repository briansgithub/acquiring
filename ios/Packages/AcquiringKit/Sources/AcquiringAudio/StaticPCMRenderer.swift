import Foundation

public enum StaticPCMRenderer {
    public static func render(
        request: PreviewRequest,
        sampleRate: Double,
        shouldCancel: @Sendable () -> Bool = { false }
    ) throws -> [Float] {
        let frequencies = request.frequenciesHz.filter { $0.isFinite && $0 > 0 }
        guard !frequencies.isEmpty, sampleRate.isFinite, (1...384_000).contains(sampleRate) else {
            throw AcquiringAudioError.invalidRequest("At least one valid frequency and sample rate are required.")
        }
        let durationSeconds = request.duration.secondsValue
        let maximumSamples = Int(sampleRate * 30)
        let boundedStepSeconds = min(max(request.arpeggioStep.secondsValue, 0.001), 30)
        let stepSamples = min(max(Int(sampleRate * boundedStepSeconds), 200), maximumSamples)
        let requested: Int
        if request.arpeggiates && frequencies.count > 1 {
            requested = frequencies.count > maximumSamples / stepSamples
                ? maximumSamples
                : frequencies.count * stepSamples
        } else {
            let boundedDuration = min(max(durationSeconds, 0.001), 30)
            requested = Int(sampleRate * boundedDuration)
        }
        let sampleCount: Int
        if request.arpeggiates && frequencies.count > 1 {
            sampleCount = max(min(requested, maximumSamples) / stepSamples, 1) * stepSamples
        } else {
            sampleCount = min(max(requested, 200), maximumSamples)
        }

        let gain = Double(min(max(request.gain, 0), 1))
        let voices = frequencies.map { SynthVoice(frequencyHz: $0, waveform: request.waveform, sampleRate: sampleRate) }
        var samples = [Float](repeating: 0, count: sampleCount)

        for index in samples.indices {
            if index & 2_047 == 0, shouldCancel() { throw CancellationError() }
            let sum: Double
            if !request.arpeggiates || voices.count <= 1 {
                let envelope: Double
                if index < 200 {
                    envelope = Double(index) / 200
                } else if index > sampleCount - 1_000 {
                    envelope = max(Double(sampleCount - index) / 1_000, 0)
                } else {
                    envelope = 1
                }
                let elapsed = Double(index) / sampleRate
                sum = voices.reduce(0) { $0 + $1.nextSample(envelope: envelope, elapsedSeconds: elapsed) * 0.15 * envelope }
            } else {
                let voiceIndex = min(index / stepSamples, voices.count - 1)
                let noteIndex = index % stepSamples
                let attack = min(max(Int(Double(stepSamples) * 0.08), 10), 80)
                let release = min(max(Int(Double(stepSamples) * 0.12), 15), 120)
                let envelope: Double
                if noteIndex < attack {
                    envelope = Double(noteIndex) / Double(attack)
                } else if noteIndex > stepSamples - release {
                    envelope = Double(stepSamples - noteIndex) / Double(release)
                } else {
                    envelope = 1
                }
                sum = voices[voiceIndex].nextSample(
                    envelope: envelope,
                    elapsedSeconds: Double(noteIndex) / sampleRate,
                    arpeggiated: true
                ) * 0.25 * envelope
            }
            samples[index] = Float(min(max(sum * gain, -1), 1))
        }
        return samples
    }
}

private extension Duration {
    var secondsValue: Double {
        let parts = components
        return Double(parts.seconds) + Double(parts.attoseconds) / 1e18
    }
}
