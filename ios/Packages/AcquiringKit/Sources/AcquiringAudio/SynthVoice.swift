import Foundation

final class SynthVoice {
    let frequencyHz: Double
    private let waveform: SynthWaveform
    private let sampleRate: Double
    private let outputGain: Double
    private var phase = 0.0
    private var modulationPhase = 0.0
    private var delayLine: [Double]
    private var delayPointer = 0
    private let activeChurchOrganPartials: [(ratio: Double, weight: Double)]

    init(frequencyHz: Double, waveform: SynthWaveform, sampleRate: Double) {
        self.frequencyHz = frequencyHz
        self.waveform = waveform
        self.sampleRate = sampleRate
        outputGain = Self.outputGain(for: waveform)
        if waveform == .churchOrgan {
            let nyquist = sampleRate * 0.5
            activeChurchOrganPartials = [
                (ratio: 1, weight: 0.16),
                (ratio: 2, weight: 0.44),
                (ratio: 4, weight: 0.18),
                (ratio: 6, weight: 0.10),
                (ratio: 8, weight: 0.07),
                (ratio: 12, weight: 0.035),
                (ratio: 16, weight: 0.015),
            ].filter { frequencyHz * 0.5 * $0.ratio < nyquist }
        } else {
            activeChurchOrganPartials = []
        }
        let period = max(Int(sampleRate / frequencyHz), 2)
        switch waveform {
        case .strings, .nylonGuitar:
            var generator = LinearCongruentialGenerator(seed: UInt64(frequencyHz.bitPattern))
            var noise = (0..<period).map { _ in generator.nextUnit() * 2 - 1 }
            if waveform == .nylonGuitar {
                for index in 1..<noise.count {
                    noise[index] = noise[index] * 0.35 + noise[index - 1] * 0.65
                }
            }
            delayLine = noise
        default:
            delayLine = []
        }
    }

    func replacing(frequencyHz: Double, waveform: SynthWaveform) -> SynthVoice {
        let replacement = SynthVoice(frequencyHz: frequencyHz, waveform: waveform, sampleRate: sampleRate)
        replacement.phase = phase
        replacement.modulationPhase = modulationPhase
        return replacement
    }

    func nextSample(envelope: Double, elapsedSeconds: Double, arpeggiated: Bool = false) -> Double {
        let wave: Double
        switch waveform {
        case .sine:
            wave = sin(2 * .pi * phase)
        case .square:
            wave = phase < 0.5 ? 1 : -1
        case .sawtooth:
            wave = phase * 2 - 1
        case .triangle:
            wave = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase
        case .strings:
            wave = pluckedSample(attenuation: arpeggiated ? 0.498 : 0.496)
        case .electricPiano:
            let ratio = arpeggiated ? 1.5 : 2
            let index = (arpeggiated ? 3 : 2) * envelope
            wave = sin(2 * .pi * phase + sin(2 * .pi * modulationPhase) * index)
            modulationPhase = wrap(modulationPhase + frequencyHz * ratio / sampleRate)
        case .warmOrgan:
            let radians = 2 * Double.pi * phase
            wave = 0.68 * sin(radians) + 0.22 * sin(radians * 2) + 0.10 * sin(radians * 3)
        case .marimba:
            let radians = 2 * Double.pi * phase
            wave = 0.82 * sin(radians) * exp(-3 * elapsedSeconds)
                + 0.18 * sin(radians * 3) * exp(-9 * elapsedSeconds)
        case .vibraphone:
            let ring = exp(-0.75 * elapsedSeconds)
            let tremolo = 0.88 + 0.12 * sin(2 * Double.pi * 5.5 * elapsedSeconds)
            let index = 1.35 * exp(-1.6 * elapsedSeconds)
            wave = sin(2 * .pi * phase + sin(2 * .pi * modulationPhase) * index) * ring * tremolo
            modulationPhase = wrap(modulationPhase + frequencyHz * 4 / sampleRate)
        case .nylonGuitar:
            wave = pluckedSample(attenuation: 0.497)
        case .flute:
            let vibratoPhase = phase + 0.0025 * sin(2 * .pi * modulationPhase)
            let radians = 2 * Double.pi * vibratoPhase
            wave = 0.91 * sin(radians) + 0.07 * sin(radians * 2) + 0.02 * sin(radians * 4)
            modulationPhase = wrap(modulationPhase + 5.2 / sampleRate)
        case .clarinet:
            let radians = 2 * Double.pi * phase
            wave = 0.74 * sin(radians) + 0.19 * sin(radians * 3) + 0.07 * sin(radians * 5)
        case .oboe:
            let radians = 2 * Double.pi * phase
            wave = 0.54 * sin(radians) + 0.25 * sin(radians * 2)
                + 0.14 * sin(radians * 3) + 0.07 * sin(radians * 4)
        case .churchOrgan:
            let radians = 2 * Double.pi * modulationPhase
            var organ = 0.0
            for partial in activeChurchOrganPartials {
                organ += partial.weight * sin(radians * partial.ratio)
            }
            wave = organ
            modulationPhase = wrap(modulationPhase + frequencyHz * 0.5 / sampleRate)
        }
        phase = wrap(phase + frequencyHz / sampleRate)
        return wave * outputGain
    }

    /// Perceived-level calibration for reference notes at MIDI pitches 48, 55,
    /// 60, 64, 69, and 72. Strings, nylon guitar, and marimba use their 100 ms
    /// attack/body; other timbres use 300 ms. Values are geometric-mean ratios
    /// to sine after A-weighting.
    private static func outputGain(for waveform: SynthWaveform) -> Double {
        switch waveform {
        case .sine: 1.00
        case .square: 0.49
        case .sawtooth: 0.74
        case .triangle: 1.18
        case .strings: 1.33
        case .electricPiano: 0.61
        case .warmOrgan: 1.22
        case .marimba: 1.31
        case .vibraphone: 0.65
        case .nylonGuitar: 1.74
        case .flute: 1.09
        case .clarinet: 1.13
        case .oboe: 1.26
        case .churchOrgan: 1.00
        }
    }

    private func pluckedSample(attenuation: Double) -> Double {
        let output = delayLine[delayPointer]
        let next = (delayPointer + 1) % delayLine.count
        delayLine[delayPointer] = (output + delayLine[next]) * attenuation
        delayPointer = next
        return output
    }

    private func wrap(_ value: Double) -> Double {
        value - floor(value)
    }
}

private struct LinearCongruentialGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        state = seed == 0 ? 0x9e3779b97f4a7c15 : seed
    }

    mutating func nextUnit() -> Double {
        state = state &* 6_364_136_223_846_793_005 &+ 1
        return Double(state >> 11) / Double(UInt64.max >> 11)
    }
}
