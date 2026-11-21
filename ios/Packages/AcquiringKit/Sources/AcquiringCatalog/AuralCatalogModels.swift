import Foundation

public struct AuralPatternTarget: Codable, Equatable, Sendable {
    public let id: String
    public let view: String
    public let tokens: [String]
    public let labels: [String]
    public let start: Int
    public let end: Int
    public let snapshotId: String
}
public struct AuralCatalogPosition: Decodable, Sendable {
    public let startIndex: Int
    public let endIndex: Int
    public let startBeat: Double
    public let endBeat: Double
    public let degree: String
    public let roman: String
    public let notes: [Int]
    public let rootMidi: Int
    public let bassMidi: Int
    public let varyingBass: Bool?
}
public struct AuralCatalogKey: Codable, Equatable, Sendable {
    public let tonic: String
    public let scale: String
}
public struct AuralCatalogRun: Sendable {
    public let id: Int
    public let stableId: String
    public let view: String
    public let song: String
    public let section: String
    public let revision: String
    public let tokens: [String]
    public let positions: [AuralCatalogPosition]
    public let key: AuralCatalogKey
    public let sourceKey: AuralCatalogKey
}
public struct AuralCatalogCapabilities: Sendable {
    public let schemaVersion: Int
    public let modeAnalysis: Bool
    public let startGrouping: Bool
    public let reducedSequences: Bool
}
public struct AuralCatalogRow: Sendable {
    public let target: AuralPatternTarget
    public let songs: Int
    public let occurrences: Int
    public let sections: Int
    public let effective: Int
    public let score: Double
    public let globalSongs: Int
    public let globalOccurrences: Int
}
public struct AuralPatternSong: Sendable {
    public let id: String
    public let title: String
    public let artist: String
    public let popularityScore: Double?
}
public struct AuralOccurrence: Sendable {
    public let id: String
    public let sourceIdentity: String
    public let run: AuralCatalogRun
    public let offset: Int
    public let positions: [AuralCatalogPosition]
}
public struct AuralRankingOptions: Sendable {
    public var view = "harmony"
    public var mode: String? = nil
    public var startGroup: String? = nil
    public var minimumLength = 2
    public var maximumLength = 4096
    public var sort = "mostSongs"
    public var query = try! AuralProgressionQuery()
    public var minimumPopularityPercent: Int? = nil
    public var popularity = false
    public var variety = false
    public var favorites = false
    public var recentSongs: [String] = []
    public var favoriteSongs: Set<String> = []
    public init() {}
}
