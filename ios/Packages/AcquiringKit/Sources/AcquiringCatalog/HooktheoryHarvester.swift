import AcquiringCore
import Foundation
import SwiftSoup

struct HarvestedSong: Sendable {
    let song: CatalogSong
    let sections: [String: ExtractedSection]
    let hasSourceTitle: Bool
    let hasSourceArtist: Bool
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
        var hasSourceTitle = false
        var hasSourceArtist = false
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
                let metadata = try Self.displayMetadata(html: html, songID: slug, apiTitle: result.song)
                let sourceTitle = metadata?.title ?? Self.nonemptySourceName(result.song)
                let sourceArtist = metadata?.artist ?? Self.nonemptySourceName(result.artist)
                hasSourceTitle = sourceTitle != nil
                hasSourceArtist = sourceArtist != nil
                title = sourceTitle
                    ?? slug.components(separatedBy: "__").dropFirst().joined(separator: "__")
                artist = sourceArtist
                    ?? slug.components(separatedBy: "__").first ?? "Unknown"
            }
        }

        return HarvestedSong(
            song: CatalogSong(id: slug, artist: artist, title: title, url: url, status: "enriched"),
            sections: sections,
            hasSourceTitle: hasSourceTitle,
            hasSourceArtist: hasSourceArtist
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

    /// The public page title contains source display names, whereas the URL
    /// contains identity slugs. Validate both names against the requested song
    /// before accepting them; a generic/error page must never rename a song.
    static func displayMetadata(html: String, songID: String, apiTitle: String? = nil) throws -> HooktheoryDisplayMetadata? {
        let identity = songID.components(separatedBy: "__")
        guard identity.count == 2 else { return nil }
        let document = try SwiftSoup.parse(html)
        let pageTitle = CatalogDisplayName.clean(try document.title())
        let suffix = " Chords, Melody, and Music Theory Analysis - Hooktheory"
        guard pageTitle.hasSuffix(suffix) else { return nil }
        let names = String(pageTitle.dropLast(suffix.count))
        let parts = names.components(separatedBy: " by ")
        guard parts.count >= 2 else { return nil }
        let expectedTitles = Set([identity[1], apiTitle ?? ""].flatMap(sourceIdentityKeys).filter { !$0.isEmpty })
        let expectedArtists = sourceIdentityKeys(identity[0])
        var matches: [HooktheoryDisplayMetadata] = []
        for index in 1..<parts.count {
            let title = parts[..<index].joined(separator: " by ")
            let artist = parts[index...].joined(separator: " by ")
            guard !expectedTitles.isDisjoint(with: sourceIdentityKeys(title)),
                  !expectedArtists.isDisjoint(with: sourceIdentityKeys(artist)) else { continue }
            matches.append(HooktheoryDisplayMetadata(title: title, artist: artist))
        }
        return matches.count == 1 ? matches[0] : nil
    }

    private static func nonemptySourceName(_ value: String?) -> String? {
        guard let value else { return nil }
        let cleaned = CatalogDisplayName.clean(value)
        return cleaned.isEmpty ? nil : cleaned
    }

    private static func identityKey(_ value: String) -> String {
        let folded = value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
        return String(folded.unicodeScalars.filter(CharacterSet.alphanumerics.contains))
    }

    private static func sourceIdentityKeys(_ value: String) -> Set<String> {
        let decoded = value.removingPercentEncoding ?? value
        // TheoryTab spells these characters out in observed URL paths.
        let pathSpelling = decoded.replacingOccurrences(of: "&", with: "and")
            .replacingOccurrences(of: "/", with: "slash")
            .replacingOccurrences(of: "$", with: "s")
        return [identityKey(decoded), identityKey(pathSpelling)]
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

struct HooktheoryDisplayMetadata: Equatable, Sendable {
    let title: String
    let artist: String
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
