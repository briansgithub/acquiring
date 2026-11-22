import Foundation

public struct AuralStartGroup: Equatable, Hashable, Sendable {
    public let id: String
    public let label: String
    public let degree: Int
    public let accidental: String
    public let quality: String
    public let seventhQuality: String

    public static func parse(_ label: String) -> Self? {
        let normalized = auralCanonicalChord(label)
        guard let match = normalized.range(of: "^([♭♯]*)([ivIV]+)([^/(]*)", options: .regularExpression) else { return nil }
        let text = String(normalized[match])
        let accidental = String(text.prefix { $0 == "♭" || $0 == "♯" })
        let rest = text.dropFirst(accidental.count)
        let numeral = String(rest.prefix { "ivIV".contains($0) })
        guard let index = ["I", "II", "III", "IV", "V", "VI", "VII"].firstIndex(of: numeral.uppercased()) else { return nil }
        let detail = String(rest.dropFirst(numeral.count))
        let major = numeral == numeral.uppercased()
        let quality = detail.contains("ø") ? "halfDiminished" : (detail.contains("°") || detail.contains("o")) ? "diminished" : detail.contains("+") ? "augmented" : major ? "major" : "minor"
        let stripped = detail.replacingOccurrences(of: "(?:add|sus)[0-9]+", with: "", options: .regularExpression)
        let seventh = stripped.range(of: "(?:7|9|11|13|65|43|42)", options: .regularExpression) != nil
        let seventhQuality = !seventh ? "none" : (detail.contains("△") || detail.contains("Δ")) ? "major" : quality == "diminished" ? "diminished" : "minor"
        let symbol = quality == "halfDiminished" ? "ø" : quality == "diminished" ? "°" : quality == "augmented" ? "+" : ""
        return Self(id: "\(accidental.isEmpty ? "natural" : accidental):\(index + 1):\(major ? "upper" : "lower"):\(quality):\(seventhQuality)",
                    label: accidental + (major ? numeral.uppercased() : numeral.lowercased()) + symbol + (seventhQuality == "major" ? "△" : "") + (seventh ? "7" : ""),
                    degree: index + 1, accidental: accidental, quality: quality, seventhQuality: seventhQuality)
    }
    public static func ordered(_ a: Self, _ b: Self) -> Bool {
        func key(_ g: Self) -> [Int] {
            [g.degree, g.accidental.filter { $0 == "♯" }.count - g.accidental.filter { $0 == "♭" }.count,
             ["major", "minor", "diminished", "halfDiminished", "augmented"].firstIndex(of: g.quality) ?? -1,
             ["none", "minor", "major", "diminished"].firstIndex(of: g.seventhQuality) ?? -1]
        }
        return key(a) == key(b) ? a.id < b.id : key(a).lexicographicallyPrecedes(key(b))
    }
}

public func auralCanonicalChord(_ label: String) -> String {
    var text = label.trimmingCharacters(in: .whitespacesAndNewlines)
    let prefix = text.prefix { $0 == "b" || $0 == "#" }
    text = prefix.replacingOccurrences(of: "b", with: "♭").replacingOccurrences(of: "#", with: "♯") + text.dropFirst(prefix.count)
    return text.replacingOccurrences(of: "#", with: "♯").replacingOccurrences(of: "b(?=[0-9])", with: "♭", options: .regularExpression)
}

public struct AuralChordConstraint: Codable, Equatable, Hashable, Sendable {
    public let degree: Int
    public let accidental: String
    public let family: String
    public let exact: String?
    public let inversion: String?
    public init(degree: Int, accidental: String = "", family: String = "any", exact: String? = nil, inversion: String? = nil) throws {
        guard (1...7).contains(degree), ["", "♭", "♯"].contains(accidental), ["any", "major", "minor", "7", "maj7", "m7"].contains(family),
              (exact?.utf8.count ?? 0) <= 4096, (inversion?.utf8.count ?? 0) <= 4096 else { throw AuralCatalogError.invalid("chord constraint") }
        self.degree = degree; self.accidental = accidental; self.family = family; self.exact = exact; self.inversion = inversion
    }
    private enum CodingKeys: String, CodingKey { case degree, accidental, family, exact, inversion }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(degree: c.decode(Int.self, forKey: .degree), accidental: c.decodeIfPresent(String.self, forKey: .accidental) ?? "",
                      family: c.decodeIfPresent(String.self, forKey: .family) ?? "any", exact: c.decodeIfPresent(String.self, forKey: .exact), inversion: c.decodeIfPresent(String.self, forKey: .inversion))
    }
    public func matches(_ label: String, rootLabel: String? = nil) -> Bool {
        let canonical = auralCanonicalChord(label)
        if let exact { return auralCanonicalChord(rootLabel ?? label) == auralCanonicalChord(exact) && (inversion == nil || canonical == auralCanonicalChord(inversion!)) }
        guard !canonical.contains("/"), let group = AuralStartGroup.parse(canonical), group.degree == degree, group.accidental == accidental else { return false }
        switch family {
        case "any": return true
        case "major", "minor": return group.quality == family
        case "7": return group.quality == "major" && group.seventhQuality == "minor"
        case "maj7": return group.quality == "major" && group.seventhQuality == "major"
        case "m7": return group.quality == "minor" && group.seventhQuality == "minor"
        default: return false
        }
    }
}

public struct AuralProgressionQuery: Codable, Equatable, Hashable, Sendable {
    public let version: Int
    public let chords: [AuralChordConstraint]
    public init(version: Int = 1, chords: [AuralChordConstraint] = []) throws {
        guard version == 1, chords.count <= 32 else { throw AuralCatalogError.invalid("query version/length") }
        self.version = version; self.chords = chords
    }
    private enum CodingKeys: String, CodingKey { case version, chords }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(version: c.decodeIfPresent(Int.self, forKey: .version) ?? 1, chords: c.decodeIfPresent([AuralChordConstraint].self, forKey: .chords) ?? [])
    }
    public func matches(labels: [String], rootLabels: [String]? = nil) -> Bool {
        let roots = rootLabels ?? labels
        guard roots.count == labels.count else { return false }
        if chords.isEmpty { return true }
        guard labels.count >= chords.count else { return false }
        return (0...(labels.count - chords.count)).contains { start in
            chords.indices.allSatisfy { chords[$0].matches(labels[start + $0], rootLabel: roots[start + $0]) }
        }
    }
}
