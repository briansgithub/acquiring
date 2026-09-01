import AcquiringCore
import Foundation
import SwiftSoup

struct HarvestedSong: Sendable {
    let song: CatalogSong
    let sections: [String: ExtractedSection]
}

struct HooktheoryHarvester: Sendable {
    private let session: URLSession

    init(session: URLSession) {
        self.session = session
    }

    func harvest(
        url: URL,
        progress: @escaping @Sendable (Int, Int) -> Void
    ) async throws -> HarvestedSong {
        let cleanURL = url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let marker = cleanURL.range(of: "theorytab/view/") else { throw CatalogError.invalidURL }
        let slug = cleanURL[marker.upperBound...].replacingOccurrences(of: "/", with: "__")
        guard !slug.isEmpty else { throw CatalogError.invalidURL }

        let pageData = try await fetch(url)
        guard let html = String(data: pageData, encoding: .utf8) else {
            throw CatalogError.harvest("The TheoryTab page was not valid UTF-8.")
        }
        let references = try Self.sectionReferences(html: html)
        guard !references.isEmpty else { throw CatalogError.harvest("No sections were found on the page.") }

        var cached: [String: HooktheoryAPIResult] = [:]
        var sections: [String: ExtractedSection] = [:]
        var title = "Unknown"
        var artist = "Unknown"
        for (index, reference) in references.enumerated() {
            try Task.checkCancellation()
            progress(index + 1, references.count)
            let result: HooktheoryAPIResult
            if let existing = cached[reference.id] {
                result = existing
            } else {
                guard var components = URLComponents(string: "https://api.hooktheory.com/v1/songs/public/\(reference.id)") else {
                    throw CatalogError.invalidURL
                }
                components.queryItems = [URLQueryItem(name: "fields", value: "ID,song,section,jsonData")]
                guard let apiURL = components.url else { throw CatalogError.invalidURL }
                result = try JSONDecoder().decode(HooktheoryAPIResult.self, from: try await fetch(apiURL))
                cached[reference.id] = result
            }
            let sectionName = (reference.name ?? result.section ?? "Section \(index + 1)").capitalizingFirstCharacter
            let extracted = try Self.extract(result: result, name: sectionName, index: index)
            var key = reference.id
            var duplicate = 1
            while sections[key] != nil {
                key = "\(reference.id)#\(index)-\(duplicate)"
                duplicate += 1
            }
            sections[key] = extracted
            if index == 0 {
                title = result.song
                artist = result.artist ?? slug.split(separator: "__").first.map(String.init) ?? "Unknown"
            }
        }

        return HarvestedSong(
            song: CatalogSong(id: slug, artist: artist, title: title, url: url, status: "enriched"),
            sections: sections
        )
    }

    private func fetch(_ url: URL) async throws -> Data {
        let (data, response) = try await session.data(from: url)
        guard let response = response as? HTTPURLResponse else { throw CatalogError.emptyResponse }
        guard (200..<300).contains(response.statusCode) else { throw CatalogError.http(response.statusCode) }
        guard !data.isEmpty else { throw CatalogError.emptyResponse }
        return data
    }

    static func sectionReferences(html: String) throws -> [SectionReference] {
        let document = try SwiftSoup.parse(html)
        var result: [SectionReference] = []
        var seenTypes = Set<String>()
        for tab in try document.select("a.tb-section-tab").array() {
            let href = try tab.attr("href")
            guard href.hasPrefix("#tab-") else { continue }
            let id = String(href.dropFirst(5))
            let name = try tab.text().trimmingCharacters(in: .whitespacesAndNewlines)
            guard !id.isEmpty, name.lowercased() != "all sections" else { continue }
            let normalized = SectionOrdering.sectionTypeKey(name)
            if seenTypes.insert(normalized).inserted {
                result.append(SectionReference(id: id, name: name))
            }
        }
        if result.isEmpty {
            for container in try document.select("[id^=tab-]").array() {
                let id = String(container.id().dropFirst(4))
                if !id.isEmpty, id != "player", !result.contains(where: { $0.id == id }) {
                    result.append(SectionReference(id: id, name: nil))
                }
            }
        }
        return result
    }

    private static func extract(result: HooktheoryAPIResult, name: String, index: Int) throws -> ExtractedSection {
        guard let rawJSON = result.jsonData, let data = rawJSON.data(using: .utf8) else {
            throw CatalogError.harvest("Section \(result.id.stringValue ?? "unknown") has no jsonData.")
        }
        let root = try JSONDecoder().decode([String: JSONValue].self, from: data)
        let keys = ["version", "keys", "tempos", "meters", "sections", "endBeat", "youtube", "lyrics", "bands", "breaks", "pickup"]
        var metadata = Dictionary(uniqueKeysWithValues: keys.compactMap { key in root[key].map { (key, $0) } })
        if let settings = root["settings"]?.objectValue {
            metadata["externalMp3Url"] = settings["externalMP3URL"]
            metadata["externalMp3StartBeat"] = settings["externalMP3StartBeat"]
            metadata["externalMp3Duration"] = settings["externalMP3Duration"]
        }
        return ExtractedSection(
            songId: result.id,
            numericId: result.id,
            sectionName: name,
            sectionIndex: index,
            songInfo: result.song,
            chords: root["chords"]?.arrayValue?.compactMap(\.objectValue) ?? [],
            notes: root["notes"],
            metadata: metadata
        )
    }
}

struct SectionReference: Equatable, Sendable {
    let id: String
    let name: String?
}

private struct HooktheoryAPIResult: Decodable, Sendable {
    let id: JSONValue
    let song: String
    let artist: String?
    let section: String?
    let jsonData: String?

    private enum CodingKeys: String, CodingKey {
        case id = "ID"
        case song, artist, section, jsonData
    }
}

private extension String {
    var capitalizingFirstCharacter: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
