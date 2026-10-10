import Foundation

public struct AuralChordVariant: Hashable, Sendable, Identifiable {
    public let label: String
    public let root: String
    public var id: String { "\(root)|\(label)" }
    public init(label: String, root: String) {
        self.label = label
        self.root = root
    }
}

public struct AuralChordConstraint: Codable, Equatable, Hashable, Sendable {
    public var degree: Int
    public var accidental: String
    public var family: String
    public var exact: String?
    public var inversion: String?

    public init(degree: Int, accidental: String = "", family: String = "any", exact: String? = nil, inversion: String? = nil) {
        self.degree = degree
        self.accidental = accidental
        self.family = family
        self.exact = exact
        self.inversion = inversion
    }

    public var isValid: Bool {
        (1...7).contains(degree) && ["", "♭", "♯"].contains(accidental)
            && ["any", "major", "minor", "7", "maj7", "m7"].contains(family)
    }

    public var label: String {
        if let inversion { return inversion }
        if let exact { return exact }
        let numerals = ["I", "II", "III", "IV", "V", "VI", "VII"]
        guard (1...7).contains(degree) else { return "Invalid chord" }
        let name = ["any": "Any quality", "major": "Major", "minor": "Minor", "7": "7", "maj7": "maj7", "m7": "m7"][family] ?? "Any quality"
        return "\(accidental)\(numerals[degree - 1]) · \(name)"
    }

    public func matches(_ label: String, rootLabel: String? = nil) -> Bool {
        let canonical = Self.canonical(label)
        if let exact {
            guard Self.canonical(rootLabel ?? label) == Self.canonical(exact) else { return false }
            return inversion.map { canonical == Self.canonical($0) } ?? true
        }
        guard !canonical.contains("/"), let parsed = Self.parse(canonical),
              parsed.degree == degree, parsed.accidental == accidental else { return false }
        switch family {
        case "any": return true
        case "major", "minor": return parsed.quality == family
        case "7": return parsed.quality == "major" && parsed.seventh == "minor"
        case "maj7": return parsed.quality == "major" && parsed.seventh == "major"
        case "m7": return parsed.quality == "minor" && parsed.seventh == "minor"
        default: return false
        }
    }

    public static func canonical(_ label: String) -> String {
        let raw = label.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = raw.replacingOccurrences(of: "^[b#]+", with: "", options: .regularExpression)
        let prefix = String(raw.prefix(raw.count - normalized.count)).replacingOccurrences(of: "b", with: "♭").replacingOccurrences(of: "#", with: "♯")
        return (prefix + normalized).replacingOccurrences(of: "#", with: "♯")
            .replacingOccurrences(of: "b(?=[0-9])", with: "♭", options: .regularExpression)
    }

    public static func degreeAndAccidental(_ label: String) -> (Int, String)? {
        guard let parsed = parse(canonical(label)) else { return nil }
        return (parsed.degree, parsed.accidental)
    }

    private static func parse(_ label: String) -> (degree: Int, accidental: String, quality: String, seventh: String)? {
        var rest = label[...]
        var accidental = ""
        while let first = rest.first, first == "♭" || first == "♯" {
            accidental.append(first); rest.removeFirst()
        }
        let numeral = String(rest.prefix(while: { "ivIV".contains($0) }))
        let degree = ["I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7][numeral.uppercased()]
        guard let degree, !numeral.isEmpty else { return nil }
        rest.removeFirst(numeral.count)
        let detail = String(rest.prefix(while: { $0 != "/" && $0 != "(" }))
        let quality: String = detail.contains("ø") ? "halfDiminished" : detail.contains("°") || detail.contains("o") ? "diminished" : detail.contains("+") ? "augmented" : numeral == numeral.uppercased() ? "major" : "minor"
        let cleaned = detail.replacingOccurrences(of: "(?:add|sus)[0-9]+", with: "", options: .regularExpression)
        let seventh = cleaned.range(of: "(?:7|9|11|13|65|43|42)", options: .regularExpression) != nil
        let seventhQuality = !seventh ? "none" : detail.contains("△") || detail.contains("Δ") ? "major" : quality == "diminished" ? "diminished" : "minor"
        return (degree, accidental, quality, seventhQuality)
    }
}

public struct AuralProgressionQuery: Codable, Equatable, Hashable, Sendable {
    public var version = 1
    public var chords: [AuralChordConstraint] = []
    public init(chords: [AuralChordConstraint] = []) { self.chords = chords }
    public var isValid: Bool { version == 1 && chords.count <= 32 && chords.allSatisfy(\.isValid) }
    public func matches(_ labels: [String], rootLabels: [String]? = nil) -> Bool {
        if chords.isEmpty { return true }
        guard labels.count >= chords.count else { return false }
        let roots = rootLabels ?? labels
        guard roots.count == labels.count else { return false }
        return (0...(labels.count - chords.count)).contains { start in
            chords.indices.allSatisfy { chords[$0].matches(labels[start + $0], rootLabel: roots[start + $0]) }
        }
    }
}
