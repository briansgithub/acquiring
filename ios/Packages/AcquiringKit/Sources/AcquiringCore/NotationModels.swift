import Foundation

public enum RomanNumeralPartKind: String, Equatable, Sendable {
    case base
    case superscript
    case subscriptPart
    case suffix
}

public struct RomanNumeralPart: Equatable, Sendable {
    public let kind: RomanNumeralPartKind
    public let text: String

    public init(kind: RomanNumeralPartKind, text: String) {
        self.kind = kind
        self.text = text
    }
}

public struct RomanNumeralDisplay: Equatable, Sendable {
    public let symbol: String
    public let borrowedLabel: String?

    public init(symbol: String, borrowedLabel: String? = nil) {
        self.symbol = symbol
        self.borrowedLabel = borrowedLabel
    }

    public init(symbol: String, borrowed: JSONValue?) {
        let borrowedTags = [
            "minor": "min",
            "dorian": "dor",
            "phrygian": "phr",
            "lydian": "lyd",
            "mixolydian": "mix",
            "locrian": "loc",
            "major": "maj",
            "harmonicMinor": "hmin",
            "phrygianDominant": "phdm"
        ]

        let label: String?
        switch borrowed {
        case .array:
            label = "(bor)"
        case let .string(value):
            label = borrowedTags[value].map { "(\($0))" } ?? (value.hasPrefix("[") ? "(bor)" : nil)
        default:
            label = nil
        }

        borrowedLabel = label
        self.symbol = label == nil
            ? symbol
            : symbol.replacingOccurrences(
                of: #"\((min|mix|dor|phr|lyd|loc|maj|hmin|phdm|bor)\)"#,
                with: "",
                options: .regularExpression
            )
    }

    public var accessibilityLabel: String {
        [symbol, borrowedLabel].compactMap { $0 }.joined(separator: " ")
    }
}

public enum RomanNumeralTokenizer {
    private static let figuredBass: [String: (String, String)] = [
        "64": ("6", "4"),
        "46": ("6", "4"),
        "65": ("6", "5"),
        "43": ("4", "3"),
        "42": ("4", "2")
    ]

    private static let normalizedDigits: [Character: Character] = [
        "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
        "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
        "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
        "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9"
    ]

    public static func normalizeDigits(_ symbol: String) -> String {
        String(symbol.map { normalizedDigits[$0] ?? $0 })
    }

    public static func tokenize(_ symbol: String) -> [RomanNumeralPart] {
        let characters = Array(normalizeDigits(symbol))
        guard !characters.isEmpty else { return [] }

        var parts: [RomanNumeralPart] = []
        var index = 0
        let firstBase = readBase(characters, from: index)
        if !firstBase.text.isEmpty {
            parts.append(.init(kind: .base, text: firstBase.text))
            index = firstBase.next
        }

        while index < characters.count {
            if let cluster = suspensionCluster(characters, from: index) {
                parts.append(contentsOf: cluster.parts)
                index = cluster.next
                continue
            }

            let character = characters[index]
            if character == "°" || character == "ø" {
                let digits = readDigits(characters, from: index + 1)
                pushQualityParts(into: &parts, glyph: String(character), digits: digits.text)
                index = digits.next
                continue
            }

            if character == "△" {
                let digits = readDigits(characters, from: index + 1)
                if let pair = figuredBass[digits.text] {
                    parts.append(.init(kind: .superscript, text: "△"))
                    pushFiguredBass(into: &parts, pair: pair)
                } else {
                    parts.append(.init(kind: .superscript, text: "△\(digits.text)"))
                }
                index = digits.next
                continue
            }

            if character.isNumber {
                let digits = readDigits(characters, from: index)
                if let pair = figuredBass[digits.text] {
                    pushFiguredBass(into: &parts, pair: pair)
                } else {
                    parts.append(.init(kind: .superscript, text: digits.text))
                }
                index = digits.next
                continue
            }

            if character == "/" {
                parts.append(.init(kind: .base, text: "/"))
                index += 1
                let denominator = readBase(characters, from: index)
                if !denominator.text.isEmpty {
                    parts.append(.init(kind: .base, text: denominator.text))
                    index = denominator.next
                }
                continue
            }

            if character == "(" {
                let suffix = readParenthetical(characters, from: index)
                parts.append(.init(kind: .suffix, text: suffix.text))
                index = suffix.next
                continue
            }

            if let suspension = prefixMatch(#"^sus\d+"#, in: characters, from: index) {
                parts.append(.init(kind: .subscriptPart, text: suspension))
                index += suspension.count
                continue
            }

            let plain = readPlainRun(characters, from: index)
            if !plain.text.isEmpty {
                parts.append(.init(kind: .base, text: plain.text))
                index = plain.next
                continue
            }

            parts.append(.init(kind: .base, text: String(character)))
            index += 1
        }

        return parts
    }

    public static func stackSpan(in parts: [RomanNumeralPart], at index: Int) -> Int {
        guard parts.indices.contains(index), parts[index].kind == .superscript else { return 0 }
        if parts.indices.contains(index + 1), parts[index + 1].kind == .subscriptPart { return 2 }
        if parts.indices.contains(index + 2),
           parts[index + 1].kind == .suffix,
           parts[index + 2].kind == .subscriptPart {
            return 3
        }
        return 0
    }

    private static func pushFiguredBass(
        into parts: inout [RomanNumeralPart],
        pair: (String, String)
    ) {
        parts.append(.init(kind: .superscript, text: pair.0))
        parts.append(.init(kind: .subscriptPart, text: pair.1))
    }

    private static func pushQualityParts(
        into parts: inout [RomanNumeralPart],
        glyph: String,
        digits: String
    ) {
        if let pair = figuredBass[digits] {
            parts.append(.init(kind: .superscript, text: glyph + pair.0))
            parts.append(.init(kind: .subscriptPart, text: pair.1))
        } else {
            parts.append(.init(kind: .superscript, text: glyph + digits))
        }
    }

    private static func readBase(_ characters: [Character], from start: Int) -> (text: String, next: Int) {
        var index = start
        var result = ""
        while index < characters.count, isAccidental(characters[index]) {
            result.append(characters[index])
            index += 1
        }
        while index < characters.count, isRomanLetter(characters[index]) {
            result.append(characters[index])
            index += 1
        }
        while index < characters.count, characters[index] == "+" {
            result.append(characters[index])
            index += 1
        }
        return (result, index)
    }

    private static func readDigits(_ characters: [Character], from start: Int) -> (text: String, next: Int) {
        var index = start
        while index < characters.count, characters[index].isNumber { index += 1 }
        return (String(characters[start..<index]), index)
    }

    private static func readParenthetical(_ characters: [Character], from start: Int) -> (text: String, next: Int) {
        var index = start
        var depth = 0
        while index < characters.count {
            switch characters[index] {
            case "(": depth += 1
            case ")": depth -= 1
            default: break
            }
            index += 1
            if depth == 0 { break }
        }
        return (String(characters[start..<index]), index)
    }

    private static func readPlainRun(_ characters: [Character], from start: Int) -> (text: String, next: Int) {
        var index = start
        while index < characters.count {
            let character = characters[index]
            if character == "(" || character == "/" || character == "△" ||
                character == "°" || character == "ø" || character.isNumber {
                break
            }
            index += 1
        }
        return (String(characters[start..<index]), index)
    }

    private static func suspensionCluster(
        _ characters: [Character],
        from start: Int
    ) -> (parts: [RomanNumeralPart], next: Int)? {
        if let extensionText = prefixMatch(#"^([79]|1[13])"#, in: characters, from: start) {
            var position = start + extensionText.count
            var parts = [RomanNumeralPart(kind: .superscript, text: extensionText)]

            if let omission = prefixMatch(#"^\(no\d+\)"#, in: characters, from: position) {
                parts.append(.init(kind: .suffix, text: omission))
                position += omission.count
            }

            let suspension = prefixMatch(#"^sus\d+sus\d"#, in: characters, from: position)
                ?? prefixMatch(#"^sus\d+"#, in: characters, from: position)
            if let suspension {
                parts.append(.init(kind: .subscriptPart, text: suspension))
                return (parts, position + suspension.count)
            }
        }

        guard let trailing = prefixMatch(#"^sus(\d)sus(\d)([79]|1[13])(?![0-9])"#, in: characters, from: start),
              let components = captureGroups(
                #"^sus(\d)sus(\d)([79]|1[13])(?![0-9])"#,
                in: trailing
              ),
              components.count == 3 else {
            return nil
        }
        return (
            [
                .init(kind: .superscript, text: components[2]),
                .init(kind: .subscriptPart, text: "sus\(components[0])sus\(components[1])")
            ],
            start + trailing.count
        )
    }

    private static func prefixMatch(_ pattern: String, in characters: [Character], from start: Int) -> String? {
        guard start < characters.count else { return nil }
        let remainder = String(characters[start...])
        guard let range = remainder.range(of: pattern, options: .regularExpression), range.lowerBound == remainder.startIndex else {
            return nil
        }
        return String(remainder[range])
    }

    private static func captureGroups(_ pattern: String, in value: String) -> [String]? {
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        guard let match = expression.firstMatch(in: value, range: range) else { return nil }
        return (1..<match.numberOfRanges).compactMap { index in
            Range(match.range(at: index), in: value).map { String(value[$0]) }
        }
    }

    private static func isRomanLetter(_ character: Character) -> Bool {
        "ivxIVX".contains(character)
    }

    private static func isAccidental(_ character: Character) -> Bool {
        "♭♯#b".contains(character)
    }
}

public struct ScaleDegreeLabel: Equatable, Sendable {
    public let source: String
    public let prefix: String
    public let degree: String
    public let suffix: String

    public init(source: String, prefix: String, degree: String, suffix: String) {
        self.source = source
        self.prefix = prefix
        self.degree = degree
        self.suffix = suffix
    }

    public static func parse(_ source: String) -> ScaleDegreeLabel {
        let plain = source.replacingOccurrences(of: "\u{0302}", with: "").replacingOccurrences(of: "^", with: "")
        let characters = Array(plain)
        guard let digitStart = characters.firstIndex(where: \Character.isNumber) else {
            return .init(source: source, prefix: "", degree: plain, suffix: "")
        }
        var digitEnd = digitStart
        while digitEnd < characters.count, characters[digitEnd].isNumber { digitEnd += 1 }
        return .init(
            source: source,
            prefix: String(characters[..<digitStart]),
            degree: String(characters[digitStart..<digitEnd]),
            suffix: String(characters[digitEnd...])
        )
    }

    public var spokenText: String {
        let accidentalText = prefix.map { character -> String in
            switch character {
            case "♭", "b": "flat "
            case "♯", "#": "sharp "
            default: String(character)
            }
        }.joined()
        return (accidentalText + degree + (suffix.isEmpty ? "" : " \(suffix)"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
