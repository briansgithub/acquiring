import Foundation
import CryptoKit

public enum AuralError: Error, LocalizedError, Sendable {
    case invalid(String)
    public var errorDescription: String? { if case let .invalid(message) = self { return message }; return nil }
}

public enum AuralSkill: String, Codable, CaseIterable, Sendable {
    case guided, compare, identify, recall, complete, audiate, reproduce
    public var mode: AuralMode {
        switch self { case .guided, .compare, .identify: .recognize
        case .recall, .complete, .audiate: .recall
        case .reproduce: .sing }
    }
}
public enum AuralMode: String, Codable, CaseIterable, Sendable {
    case recognize, recall, sing
    public var title: String { rawValue.capitalized }
    public var skills: [AuralSkill] {
        switch self { case .recognize: [.compare, .identify]
        case .recall: [.recall, .complete, .audiate]
        case .sing: [.reproduce] }
    }
}
public enum AuralMicrophoneKind: String, Codable, CaseIterable, Sendable {
    case root, bass, scaleDegree, rootSequence
}
public struct AuralSettings: Codable, Equatable, Sendable {
    public var popularity = true
    public var variety = true
    public var favorites = false
    public var distinguishInversions = false
    public var flatList = false
    private var analysisSelection: String?
    private var sourceModeSelection: String?
    public var analysis: String {
        get { analysisSelection ?? "relativeMajor" }
        set { analysisSelection = newValue }
    }
    public var modeFilter: String {
        get { sourceModeSelection ?? "major" }
        set { sourceModeSelection = newValue }
    }
    public init() {}
    public var view: String { (analysis == "relativeMajor" ? "relative_" : "") + (distinguishInversions ? "harmony_bass" : "harmony") }
}
public struct AuralPattern: Codable, Equatable, Hashable, Sendable, Identifiable {
    public let id: String
    public let view: String
    public let tokens: [String]
    public let labels: [String]
    public let start: Int
    public let end: Int
    public let snapshotId: String
    public init(id: String, view: String, tokens: [String], labels: [String], start: Int, end: Int, snapshotId: String) {
        self.id=id; self.view=view; self.tokens=tokens; self.labels=labels
        self.start=start; self.end=end; self.snapshotId=snapshotId
    }
    public var mode: String? {
        if view.hasPrefix("relative_") { return "major" }
        guard let token = tokens.first else { return nil }
        return try? JSONDecoder().decode(AuralToken.self, from: Data(token.utf8)).mode
    }
}
public struct AuralToken: Decodable, Sendable {
    public let mode: String
    public let rootPc: Int
    public let intervals: [Int]
    public let bassInterval: Int?
    private enum CodingKeys: String, CodingKey { case mode, rootPc, intervals, bassInterval, version }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let version = try values.decodeIfPresent(String.self, forKey: .version)
        mode = version == "aural-relative-1" ? "major" : try values.decode(String.self, forKey: .mode)
        rootPc = try values.decode(Int.self, forKey: .rootPc)
        intervals = try values.decode([Int].self, forKey: .intervals)
        bassInterval = try values.decodeIfPresent(Int.self, forKey: .bassInterval)
    }
}
public struct AuralEvent: Codable, Equatable, Hashable, Sendable {
    public var notes: [Int]
    public var rootMidi: Int
    public var bassMidi: Int
    public var degree: String
    public var beats: Double
    public init(notes: [Int], rootMidi: Int, bassMidi: Int, degree: String, beats: Double = 2) {
        self.notes=notes; self.rootMidi=rootMidi; self.bassMidi=bassMidi; self.degree=degree; self.beats=beats
    }
    public func shifted(_ semitones: Int) throws -> Self {
        guard beats.isFinite, beats > 0, !notes.isEmpty, notes.count <= 16,
              notes.min() == bassMidi, (notes + [rootMidi]).allSatisfy({ (1...127).contains($0 + semitones) })
        else { throw AuralError.invalid("Invalid sounding harmony.") }
        return .init(notes: notes.map { $0 + semitones }, rootMidi: rootMidi + semitones,
                     bassMidi: bassMidi + semitones, degree: degree, beats: beats)
    }
}
public struct AuralPassage: Codable, Equatable, Hashable, Sendable {
    public var occurrenceId: String
    public var patternId: String
    public var songId: String
    public var title: String
    public var artist: String
    public var sectionId: String
    public var sectionName: String
    public var sourceRevision: String
    public var startIndex: Int
    public var endIndex: Int
    public var view: String
    public var keyTonic: String
    public var keyScale: String
    public var events: [AuralEvent]
    public var context: [AuralEvent]
    public var startBeat: Double
    public var endBeat: Double
    public var sourceId: String { "\(songId)|\(sectionId)|\(startIndex)|\(endIndex)" }
    public init(occurrenceId: String, patternId: String, songId: String, title: String, artist: String,
                sectionId: String, sectionName: String, sourceRevision: String, startIndex: Int, endIndex: Int,
                view: String, keyTonic: String, keyScale: String, events: [AuralEvent], context: [AuralEvent],
                startBeat: Double, endBeat: Double) {
        self.occurrenceId=occurrenceId; self.patternId=patternId; self.songId=songId; self.title=title; self.artist=artist
        self.sectionId=sectionId; self.sectionName=sectionName; self.sourceRevision=sourceRevision
        self.startIndex=startIndex; self.endIndex=endIndex; self.view=view; self.keyTonic=keyTonic; self.keyScale=keyScale
        self.events=events; self.context=context; self.startBeat=startBeat; self.endBeat=endBeat
    }
}
public struct AuralSelectionContext: Codable, Equatable, Sendable {
    public var recentSongIds: [String] = []
    public var heardSourceIds: Set<String> = []
    public var favoriteSongIds: Set<String> = []
    public var assessment = false
    public var supportedOccurrenceId: String?
    public init() {}
}
public struct AuralPopularity: Codable, Sendable {
    public var score: Double?
    public var confidence: Double
    public init(score: Double?, confidence: Double = 0) { self.score=score; self.confidence=confidence }
    public func factor(enabled: Bool) -> Double {
        guard enabled, let score, score.isFinite else { return 1 }
        let c = confidence.isFinite ? min(1,max(0,confidence)) : 0
        return 1 + c * (min(1,max(0,score)) - 0.5)
    }
}
public struct AuralOccurrence: Equatable, Sendable, Identifiable {
    public let id: String
    public let songId: String
    public let sectionId: String
    public let sourceId: String
    public init(id: String, songId: String, sectionId: String, sourceId: String) {
        self.id=id; self.songId=songId; self.sectionId=sectionId; self.sourceId=sourceId
    }
}
public struct AuralRandom: Sendable {
    private var state: UInt32
    public init(seed: UInt64) { let n=UInt32(truncatingIfNeeded: seed); state = n == 0 ? 0x6d2b79f5 : n }
    public mutating func next() -> Double {
        state ^= state << 13; state ^= state >> 17; state ^= state << 5
        return Double(state) / 4_294_967_296
    }
    public mutating func index(_ count: Int) -> Int { precondition(count > 0); return Int(next() * Double(count)) }
    public mutating func shuffled<T>(_ input: [T]) -> [T] {
        var a=input
        if a.count > 1 { for i in stride(from: a.count-1, through: 1, by: -1) { a.swapAt(i,index(i+1)) } }
        return a
    }
}
public enum AuralIdentity {
    public static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format:"%02x",$0) }.joined()
    }
    public static func pattern(tokens: [String], view: String) -> String {
        let m: [UInt32] = [16777619,2246822519,3266489917,668265263]
        var h=[UInt32](repeating:0,count:4)
        for token in tokens {
            let b=Array(SHA256.hash(data: Data(token.utf8)))
            for i in 0..<4 {
                let j=i*4
                let n=UInt32(b[j]) | (UInt32(b[j+1]) << 8) | (UInt32(b[j+2]) << 16) | (UInt32(b[j+3]) << 24)
                h[i] = (h[i] &* m[i]) &+ n
            }
        }
        let namespace=digest("aural-normalizer-1\u{0000}\(view)").prefix(12)
        return "p_\(namespace)_\(tokens.count)_" + h.map { String(format:"%08x",$0) }.joined()
    }
}
public struct AuralExposureIndex: Sendable {
    private struct Span: Sendable { var start: Int64; var end: Int64 }
    private let exact: Set<String>
    private var spans: [String:[Span]] = [:]
    private static func parse(_ id: String) -> (String,Span)? {
        let p=id.split(separator:"|",omittingEmptySubsequences:false)
        guard p.count == 4, !p[0].isEmpty, !p[1].isEmpty,
              p[2].allSatisfy({ $0.isASCII && $0.isNumber }), p[3].allSatisfy({ $0.isASCII && $0.isNumber }),
              let start=Int64(p[2]), let end=Int64(p[3]), start >= 0, end > start, end <= 9_007_199_254_740_991 else { return nil }
        return ("\(p[0])|\(p[1])",Span(start:start,end:end))
    }
    public init(_ ids: Set<String>) {
        exact=ids
        for id in ids { if let (key,span)=Self.parse(id) { spans[key,default:[]].append(span) } }
        for key in Array(spans.keys) {
            var merged: [Span]=[]
            for next in spans[key]!.sorted(by:{ $0.start < $1.start }) {
                if let last=merged.last, next.start <= last.end { merged[merged.count-1].end=max(last.end,next.end) }
                else { merged.append(next) }
            }
            spans[key]=merged
        }
    }
    public func contains(_ id: String) -> Bool {
        if exact.contains(id) { return true }
        guard let (key,target)=Self.parse(id), let a=spans[key] else { return false }
        var lo=0; var hi=a.count
        while lo < hi { let m=(lo+hi)/2; if a[m].start < target.end { lo=m+1 } else { hi=m } }
        return lo > 0 && a[lo-1].end > target.start
    }
}
public enum AuralSelector {
    public static func songFactor(_ id: String, popularity: [String:AuralPopularity], settings: AuralSettings,
                                  context: AuralSelectionContext) -> Double {
        let rank=context.recentSongIds.firstIndex(of:id) ?? 10
        let recency = settings.variety && rank < 10 ? (rank < 3 ? 0.25 : 0.6) : 1
        return (popularity[id]?.factor(enabled:settings.popularity) ?? 1) * recency *
            (settings.favorites && context.favoriteSongIds.contains(id) ? 1.5 : 1)
    }
    public static func select(_ refs: [AuralOccurrence], songs: [String:AuralPopularity],
                              sections: [String:AuralPopularity] = [:], settings: AuralSettings,
                              context: AuralSelectionContext, seed: UInt64) -> AuralOccurrence? {
        guard !refs.isEmpty else { return nil }
        if !context.assessment, let id=context.supportedOccurrenceId, let reused=refs.first(where:{$0.id==id}) { return reused }
        let exposure=AuralExposureIndex(context.heardSourceIds)
        let fresh=context.assessment ? refs.filter { !exposure.contains($0.sourceId) } : refs
        let eligible=fresh.isEmpty ? refs : fresh
        var rng=AuralRandom(seed:seed)
        func choose(_ ids: [String], _ weight: (String)->Double) -> String {
            let ordered=Array(Set(ids)).sorted()
            let weights=ordered.map(weight); let draw=rng.next()*weights.reduce(0,+)
            var total=0.0
            for (i,id) in ordered.enumerated() { total += weights[i]; if draw < total { return id } }
            return ordered.last!
        }
        let song=choose(eligible.map(\.songId)) { songFactor($0,popularity:songs,settings:settings,context:context) }
        let inSong=eligible.filter{$0.songId==song}
        let section=choose(inSong.map(\.sectionId)) { sections[$0]?.factor(enabled:settings.popularity) ?? 1 }
        let occurrences=inSong.filter{$0.sectionId==section}
        let id=choose(occurrences.map(\.id)) { _ in 1 }
        return occurrences.first{$0.id==id}
    }
}
