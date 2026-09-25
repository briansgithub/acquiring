import AcquiringCore
import XCTest

final class AuralSelectionParityTests: XCTestCase {
    func testPortableSelectionFixturesAndRandomVectors() throws {
        let root = try fixture()
        let vectors = try XCTUnwrap(root["prngVectors"] as? [[String: Any]])
        for vector in vectors {
            let seed = try number(vector["seed"]).uint64Value
            var random = AuralRandom(seed: seed)
            for expected in try XCTUnwrap(vector["uint32"] as? [NSNumber]) {
                XCTAssertEqual(UInt64(random.next() * 4_294_967_296), expected.uint64Value)
            }
        }

        let scenarios = try XCTUnwrap(root["scenarios"] as? [[String: Any]])
        XCTAssertEqual(scenarios.count, 14)
        for scenario in scenarios {
            let name = try string(scenario["name"])
            let input = try dictionary(scenario["input"])
            var songs: [String: AuralPopularity] = [:]
            var sections: [String: AuralPopularity] = [:]
            var occurrences: [AuralOccurrence] = []
            for song in try dictionaries(input["songs"]) {
                let songId = try string(song["id"])
                songs[songId] = popularity(song["popularity"])
                for section in try dictionaries(song["sections"]) {
                    let sectionId = try string(section["id"])
                    let popularityObject = section["popularity"] as? [String: Any]
                    sections[sectionId] = popularityObject?["trustworthy"] as? Bool == true
                        ? popularity(popularityObject) : AuralPopularity(score: nil)
                    for occurrence in try dictionaries(section["occurrences"]) {
                        let id = try string(occurrence["id"])
                        occurrences.append(AuralOccurrence(
                            id: id,
                            songId: songId,
                            sectionId: sectionId,
                            sourceId: (occurrence["sourceId"] as? String) ?? id
                        ))
                    }
                }
            }
            var settings = AuralSettings()
            if let raw = input["settings"] as? [String: Any] {
                if let value = raw["popularity"] as? Bool { settings.popularity = value }
                if let value = raw["variety"] as? Bool { settings.variety = value }
                if let value = raw["favorites"] as? Bool { settings.favorites = value }
                if let value = raw["distinguishInversions"] as? Bool { settings.distinguishInversions = value }
                if let value = raw["flatList"] as? Bool { settings.flatList = value }
            }
            let rawContext = input["context"] as? [String: Any] ?? [:]
            var context = AuralSelectionContext()
            context.recentSongIds = strings(rawContext["recentSongIds"])
            context.heardSourceIds = Set(strings(rawContext["heardSourceIds"]))
            context.favoriteSongIds = Set(strings(input["favoriteSongIds"]))
            context.assessment = rawContext["assessment"] as? Bool ?? false
            context.supportedOccurrenceId = rawContext["supportedOccurrenceId"] as? String
            let selected = AuralSelector.select(
                occurrences,
                songs: songs,
                sections: sections,
                settings: settings,
                context: context,
                seed: try number(input["seed"]).uint64Value
            )
            let expected = try dictionary(scenario["expected"])["selection"]
            if expected is NSNull || expected == nil {
                XCTAssertNil(selected, name)
            } else {
                let result = try dictionary(expected)
                XCTAssertEqual(selected?.id, try string(result["occurrenceId"]), name)
                XCTAssertEqual(selected?.songId, try string(result["songId"]), name)
                XCTAssertEqual(selected?.sectionId, try string(result["sectionId"]), name)
                XCTAssertEqual(
                    AuralExposureIndex(context.heardSourceIds).contains(selected?.sourceId ?? ""),
                    result["familiar"] as? Bool,
                    name
                )
            }
        }
    }

    private func fixture() throws -> [String: Any] {
        var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while directory.lastPathComponent != "AcquiringKit", directory.pathComponents.count > 1 {
            directory.deleteLastPathComponent()
        }
        let url = directory
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "contracts/aural-corpus/selection-fixtures.json")
        return try dictionary(JSONSerialization.jsonObject(with: Data(contentsOf: url)))
    }

    private func popularity(_ value: Any?) -> AuralPopularity {
        guard let object = value as? [String: Any] else { return AuralPopularity(score: nil) }
        return AuralPopularity(
            score: (object["score"] as? NSNumber)?.doubleValue,
            confidence: (object["confidence"] as? NSNumber)?.doubleValue ?? 0
        )
    }

    private func dictionary(_ value: Any?) throws -> [String: Any] {
        try XCTUnwrap(value as? [String: Any])
    }

    private func dictionaries(_ value: Any?) throws -> [[String: Any]] {
        try XCTUnwrap(value as? [[String: Any]])
    }

    private func string(_ value: Any?) throws -> String {
        try XCTUnwrap(value as? String)
    }

    private func strings(_ value: Any?) -> [String] {
        value as? [String] ?? []
    }

    private func number(_ value: Any?) throws -> NSNumber {
        try XCTUnwrap(value as? NSNumber)
    }
}
