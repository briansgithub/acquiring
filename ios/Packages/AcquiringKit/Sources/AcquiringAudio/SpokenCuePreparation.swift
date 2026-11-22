import AcquiringSonic
import Foundation

/// Runs before installing a timeline, never from the render callback.
public enum SpokenCuePreparation {
    public static let sampleRate = 24_000
    public static let maximumFrames = 48 * sampleRate

    public static func transform(_ source: [Int16], speed: Float, pitch: Float,
                                 targetFrames: Int? = nil) throws -> [Int16] {
        guard source.count <= maximumFrames,
              speed.isFinite, (Float(0.05)...100).contains(speed),
              Double(source.count) / Double(speed) <= Double(maximumFrames),
              pitch.isFinite, (Float(0.125)...8).contains(pitch),
              targetFrames.map({ (0...maximumFrames).contains($0) }) ?? true else {
            throw AcquiringAudioError.invalidRequest("Speech transform exceeded its preparation bounds.")
        }
        guard !source.isEmpty else { return [] }
        var count: Int32 = 0
        let output = source.withUnsafeBufferPointer {
            acquiring_sonic($0.baseAddress, Int32($0.count), 24_000, speed, pitch, &count)
        }
        guard let output else { throw AcquiringAudioError.invalidRequest("Speech transform exceeded its preparation bounds.") }
        defer { acquiring_sonic_free(output) }
        let target = targetFrames ?? Int(count)
        guard target >= 0, target <= maximumFrames else {
            throw AcquiringAudioError.invalidRequest("Speech phrase exceeds the PCM budget.")
        }
        var result = [Int16](repeating: 0, count: target)
        for i in 0..<min(target, Int(count)) { result[i] = output[i] }
        return result
    }

    public static func phrase(_ parts: [[Int16]], midi: Int, durationSeconds: Double) throws -> [Int16] {
        var naturalFrames = 0
        for part in parts {
            guard part.count <= maximumFrames - naturalFrames else {
                throw AcquiringAudioError.invalidRequest("Speech phrase exceeds the PCM budget.")
            }
            naturalFrames += part.count
        }
        let source = parts.flatMap { $0 }
        guard !source.isEmpty, durationSeconds.isFinite, durationSeconds > 0 else { return [] }
        let available = Int(min(durationSeconds * Double(sampleRate), Double(Int32.max)).rounded())
        guard available > 0 else { return [] }
        let target = min(max(available / 3, source.count), source.count * 4, available)
        let shift = midi - PlaybackCueMath.samplePitch(midi)
        if target == source.count && shift == 0 { return source }
        return try transform(source, speed: Float(source.count) / Float(target),
                             pitch: Float(pow(2, Double(shift) / 12)), targetFrames: target)
    }

    public static func mode(_ source: [Int16], tonicMidi: Int) throws -> [Int16] {
        guard let hz = estimatedPitch(source) else { return source }
        let target = 440 * pow(2, Double(PlaybackCueMath.keyTonicMidi(tonicMidi) - 69) / 12)
        let ratio = Float(target / hz)
        if (Float(0.97)...Float(1.03)).contains(ratio) { return source }
        return try transform(source, speed: 1, pitch: ratio)
    }

    static func estimatedPitch(_ samples: [Int16]) -> Double? {
        let minLag = sampleRate / 500, maxLag = sampleRate / 70
        guard samples.count > maxLag * 2 else { return nil }
        let start = samples.count / 4, length = samples.count / 2
        let window = samples[start..<(start + length)].map { Double($0) / 32768 }
        let energy = window.reduce(0) { $0 + $1 * $1 }
        guard energy >= 1e-4 else { return nil }
        var scores = [Double](repeating: 0, count: maxLag + 1)
        var best = 0.0, bestLag = -1
        for lag in minLag...maxLag {
            var correlation = 0.0
            for i in 0..<(length - lag) { correlation += window[i] * window[i + lag] }
            scores[lag] = correlation / energy
            if scores[lag] > best { best = scores[lag]; bestLag = lag }
        }
        guard bestLag >= 0, best >= 0.25 else { return nil }
        var lag = bestLag
        while lag / 2 >= minLag && scores[lag / 2] > best * 0.8 { lag /= 2 }
        return Double(sampleRate) / Double(lag)
    }
}

/// Exact Android assets packaged by SwiftPM for offline app and package use.
/// The caller owns this loader on its preparation executor, outside audio locks.
public final class BundledVoiceClips {
    public init() {}

    public func clip(stem: String, midi: Int? = nil) throws -> [Int16] {
        guard !stem.contains("/"), !stem.contains(".."),
              let url = Bundle.module.url(forResource: stem, withExtension: "pcm", subdirectory: "Voice") else {
            throw AcquiringAudioError.invalidRequest("Missing bundled voice clip: \(stem)")
        }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard !data.isEmpty, data.count % 2 == 0 else {
            throw AcquiringAudioError.invalidRequest("Invalid voice PCM: \(stem)")
        }
        var offset = 0, frames = data.count / 2
        if let midi {
            guard frames % 24 == 0 else { throw AcquiringAudioError.invalidRequest("Invalid pitched voice bank: \(stem)") }
            frames /= 24
            offset = (PlaybackCueMath.samplePitch(midi) - 36) * frames * 2
        }
        return (0..<frames).map { i in
            Int16(bitPattern: UInt16(data[offset + i * 2]) | UInt16(data[offset + i * 2 + 1]) << 8)
        }
    }
}
