import Foundation

public struct CatalogSong: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public let artist: String?
    public let title: String?
    public let url: URL?
    public let status: String

    public init(
        id: String,
        artist: String?,
        title: String?,
        url: URL? = nil,
        status: String = "ready"
    ) {
        self.id = id
        self.artist = artist
        self.title = title
        self.url = url
        self.status = status
    }

    public var displayTitle: String { title?.nilIfBlank ?? "Unknown Title" }
    public var displayArtist: String { artist?.nilIfBlank ?? "Unknown Artist" }
}

public struct KeyInfo: Codable, Equatable, Sendable {
    public let tonic: String
    public let scale: String

    public init(tonic: String, scale: String) {
        self.tonic = tonic
        self.scale = scale
    }
}

public struct KeyInfoWithBeat: Codable, Equatable, Sendable {
    public let key: KeyInfo
    public let beat: Double

    public init(key: KeyInfo, beat: Double) {
        self.key = key
        self.beat = beat
    }
}

public struct MelodyNote: Codable, Equatable, Sendable {
    public let sd: String
    public let beat: Double
    public let duration: Double
    public let octave: Int
    public let isRest: Bool

    public init(sd: String, beat: Double, duration: Double, octave: Int = 0, isRest: Bool = false) {
        self.sd = sd
        self.beat = beat
        self.duration = duration
        self.octave = octave
        self.isRest = isRest
    }
}

public struct ExtractedSection: Codable, Equatable, Sendable, Identifiable {
    public let songId: JSONValue?
    public let numericId: JSONValue?
    public let sectionName: String?
    public let sectionIndex: Int?
    public let songInfo: String?
    public let chords: [[String: JSONValue]]
    public let notes: JSONValue?
    public let metadata: [String: JSONValue]?

    public init(
        songId: JSONValue? = nil,
        numericId: JSONValue? = nil,
        sectionName: String? = nil,
        sectionIndex: Int? = nil,
        songInfo: String? = nil,
        chords: [[String: JSONValue]] = [],
        notes: JSONValue? = nil,
        metadata: [String: JSONValue]? = nil
    ) {
        self.songId = songId
        self.numericId = numericId
        self.sectionName = sectionName
        self.sectionIndex = sectionIndex
        self.songInfo = songInfo
        self.chords = chords
        self.notes = notes
        self.metadata = metadata
    }

    public var id: String { "\(safeNumericID):\(safeSectionName):\(sectionIndex ?? -1)" }
    public var safeSongID: String { songId?.stringValue ?? "" }
    public var safeNumericID: String { numericId?.stringValue ?? "" }
    public var safeSectionName: String { sectionName?.nilIfBlank ?? "Section" }
    public var safeSongInfo: String { songInfo ?? "" }

    public var keys: [KeyInfoWithBeat] {
        let parsed = metadata?["keys"]?.arrayValue?.compactMap { element -> KeyInfoWithBeat? in
            guard let object = element.objectValue else { return nil }
            return KeyInfoWithBeat(
                key: KeyInfo(
                    tonic: object["tonic"]?.stringValue ?? "C",
                    scale: object["scale"]?.stringValue ?? "major"
                ),
                beat: object["beat"]?.doubleValue ?? 1
            )
        }.sorted { $0.beat < $1.beat } ?? []
        return parsed.isEmpty ? [KeyInfoWithBeat(key: KeyInfo(tonic: "C", scale: "major"), beat: 1)] : parsed
    }

    public var bpm: Double {
        metadata?["tempos"]?.arrayValue?.first?.objectValue?["bpm"]?.doubleValue ?? 120
    }

    public var melodyNotes: [MelodyNote] {
        let values = notes?.arrayValue ?? notes?.objectValue?["melody1"]?.arrayValue ?? []
        return values.compactMap { value in
            guard let object = value.objectValue else { return nil }
            return MelodyNote(
                sd: object["sd"]?.stringValue ?? "1",
                beat: object["beat"]?.doubleValue ?? 1,
                duration: object["duration"]?.doubleValue ?? 1,
                octave: object["octave"]?.intValue ?? 0,
                isRest: object["isRest"]?.boolValue == true || object["rest"]?.boolValue == true
            )
        }
    }

    public var endBeat: Double? { metadata?["endBeat"]?.doubleValue }

    public func key(at beat: Double) -> KeyInfo {
        keys.last(where: { $0.beat <= beat })?.key ?? keys[0].key
    }
}

public struct SongDocument: Equatable, Sendable {
    public let song: CatalogSong
    public let sections: [String: ExtractedSection]

    public init(song: CatalogSong, sections: [String: ExtractedSection]) {
        self.song = song
        self.sections = sections
    }

    public var orderedSections: [(key: String, section: ExtractedSection)] {
        SectionOrdering.ordered(sections)
    }
}

public struct BrowseGroupCount: Equatable, Sendable {
    public let key: String
    public let count: Int

    public init(key: String, count: Int) {
        self.key = key
        self.count = count
    }
}

public struct BrowseMetadataStatus: Equatable, Sendable {
    public let browseCount: Int
    public let ratedSongCount: Int
    public let modeMembershipCount: Int

    public init(browseCount: Int, ratedSongCount: Int, modeMembershipCount: Int) {
        self.browseCount = browseCount
        self.ratedSongCount = ratedSongCount
        self.modeMembershipCount = modeMembershipCount
    }
}

public enum BrowseMode: String, CaseIterable, Codable, Sendable {
    case alphabetical
    case complexity
    case mode
}

public enum DiatonicMode: String, CaseIterable, Codable, Sendable {
    case ionian, dorian, phrygian, lydian, mixolydian, aeolian, locrian

    public var displayName: String {
        switch self {
        case .ionian: "Ionian (Major)"
        case .dorian: "Dorian"
        case .phrygian: "Phrygian"
        case .lydian: "Lydian"
        case .mixolydian: "Mixolydian"
        case .aeolian: "Aeolian (minor)"
        case .locrian: "Locrian"
        }
    }
}

extension String {
    fileprivate var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : self
    }
}
