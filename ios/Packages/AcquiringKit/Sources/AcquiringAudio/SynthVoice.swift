import Foundation

final class SynthVoice {
    let frequencyHz: Double
    private let waveform: SynthWaveform
    private let sampleRate: Double
    private var phase = 0.0
    private var modulationPhase = 0.0
    private var filterState = 0.0
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

    func replacing(frequencyHz: Double, waveform: SynthWaveform) -> SynthVoice {
        let replacement = SynthVoice(frequencyHz: frequencyHz, waveform: waveform, sampleRate: sampleRate)
        replacement.phase = phase
        replacement.modulationPhase = modulationPhase
        replacement.filterState = filterState
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
        case .brass:
            let radians = 2 * Double.pi * phase
            let brightness = 0.55 + 0.45 * envelope
            wave = 0.62 * sin(radians) + brightness * (
                0.22 * sin(radians * 2) + 0.11 * sin(radians * 3) + 0.05 * sin(radians * 4)
            )
        case .bell:
            let ring = exp(-0.42 * elapsedSeconds)
            let index = 2.1 * exp(-1.1 * elapsedSeconds)
            wave = sin(2 * .pi * phase + sin(2 * .pi * modulationPhase) * index) * ring
            modulationPhase = wrap(modulationPhase + frequencyHz * 2.71 / sampleRate)
        case .synthBass:
            let raw = 0.68 * (phase * 2 - 1) + 0.32 * (phase < 0.5 ? 1.0 : -1.0)
            let cutoff = min(max(frequencyHz * 5 / sampleRate, 0.02), 0.35)
            filterState += (raw - filterState) * cutoff
            wave = filterState
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
