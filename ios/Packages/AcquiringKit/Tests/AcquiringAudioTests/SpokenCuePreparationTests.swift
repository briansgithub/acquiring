import XCTest
import CryptoKit
@testable import AcquiringAudio

final class SpokenCuePreparationTests: XCTestCase {
    struct Fixture: Decodable {
        struct Case: Decodable {
            let source: Int, targetPercent: Int, pitchExponent: Double, natural: Int, target: Int
            let head: [Int16], sha256: String
        }
        let authority: String
        let cases: [Case]
    }
    func testFrozenNativeSonicPCM16() throws {
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("contracts/fixtures/b04-native-sonic.json").path) {
            guard root.path != "/" else { XCTFail("Missing native Sonic contract"); return }
            root.deleteLastPathComponent()
        }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: root.appendingPathComponent("contracts/fixtures/b04-native-sonic.json")))
        XCTAssertEqual(fixture.authority, "3c887223b2d06b4c3a1010d0f8a23ceaf8977d08")
        func synth(_ n: Int, _ seed: UInt32) -> [Int16] {
            var state = seed
            return (0..<n).map { i in
                state = state &* 1664525 &+ 1013904223
                let tri = (i % 109) * 24000 / 109 - 12000
                let tri2 = (i % 55) * 8000 / 55 - 4000
                let noise = Int((state >> 16) % 1001) - 500
                let env = i < 2400 ? i * 10 / 24 : (i > n - 2400 ? (n - i) * 10 / 24 : 1000)
                return Int16(truncatingIfNeeded: (tri + tri2) * env / 1000 + noise)
            }
        }
        let sources = [synth(7200, 12345), synth(12000, 777), try BundledVoiceClips().clip(stem: "root_degree_one", midi: 36)]
        for c in fixture.cases {
            XCTAssertEqual(sources[c.source].count, c.natural)
            let output = try SpokenCuePreparation.transform(sources[c.source], speed: Float(c.natural) / Float(c.target),
                                                            pitch: Float(pow(2, c.pitchExponent)), targetFrames: c.target)
            XCTAssertEqual([output[0], output[1], output[c.target / 2], output[c.target - 1]], c.head)
            let bytes = output.flatMap { value -> [UInt8] in
                let bits = UInt16(bitPattern: value)
                return [UInt8(truncatingIfNeeded: bits), UInt8(truncatingIfNeeded: bits >> 8)]
            }
            let digest = SHA256.hash(data: Data(bytes)).map { String(format: "%02x", $0) }.joined()
            XCTAssertEqual(digest, c.sha256, "source \(c.source), target \(c.targetPercent), pitch \(c.pitchExponent)")
        }
    }
    func testPreparationRejectsOversizedInputsBeforeConversionOrConcatenation() throws {
        let limit = SpokenCuePreparation.maximumFrames
        let oversized = [Int16](repeating: 0, count: limit + 1)
        XCTAssertThrowsError(try SpokenCuePreparation.transform(oversized, speed: 1, pitch: 1))
        XCTAssertThrowsError(try SpokenCuePreparation.phrase([oversized], midi: 48, durationSeconds: 1))
        let half = [Int16](repeating: 0, count: limit / 2 + 1)
        XCTAssertThrowsError(try SpokenCuePreparation.phrase([half, half], midi: 48, durationSeconds: 1))
        XCTAssertThrowsError(try SpokenCuePreparation.transform([1], speed: 1, pitch: 1, targetFrames: Int.max))
        XCTAssertThrowsError(try SpokenCuePreparation.transform([1], speed: .nan, pitch: 1))
    }

    func testOfflineAssetPitchSlicesAndInvalidResource() throws {
        let clips = BundledVoiceClips()
        XCTAssertEqual(try clips.clip(stem: "root_degree_one", midi: 36).count, 7920)
        XCTAssertEqual(try clips.clip(stem: "root_degree_one", midi: 60), try clips.clip(stem: "root_degree_one", midi: 48))
        XCTAssertThrowsError(try clips.clip(stem: "../root_degree_one"))
        XCTAssertTrue(try SpokenCuePreparation.phrase([], midi: 48, durationSeconds: 1).isEmpty)
    }
}
