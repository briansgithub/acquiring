import Foundation

final class SynthVoice {
    let frequencyHz: Double
    private let waveform: SynthWaveform
    private let sampleRate: Double
    private var phase = 0.0
    private var modulationPhase = 0.0
    private var delayLine: [Double]
    private var delayPointer = 0

    init(frequencyHz: Double, waveform: SynthWaveform, sampleRate: Double) {
        self.frequencyHz = frequencyHz
        self.waveform = waveform
        self.sampleRate = sampleRate
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
        }
        phase = wrap(phase + frequencyHz / sampleRate)
        return wave
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
