import Foundation

/// Display-only cleanup. Catalog IDs, URLs, and stored names remain unchanged.
public enum CatalogDisplayName {
    public static func title(_ value: String?) -> String {
        format(value) ?? "Unknown Title"
    }

    public static func artist(_ value: String?) -> String {
        if let value {
            let text = clean(value)
            // Names such as blink-182 legitimately contain this hyphen. Without
            // source provenance, preserving it is safer than treating it as a slug.
            if text.range(of: "^[a-z]+-[0-9]+$", options: .regularExpression) != nil {
                return text
            }
        }
        return format(value) ?? "Unknown Artist"
    }

    public static func format(_ value: String?) -> String? {
        guard let value else { return nil }
        let text = clean(value)
        guard !text.isEmpty else { return nil }

        // Separator-only lowercase text is a legacy slug. Do not title-case
        // readable metadata: source styling such as AC/DC and tUnE-yArDs matters.
        guard text.range(of: "^[a-z0-9]+(?:[-_]+[a-z0-9]+)+$", options: .regularExpression) != nil
        else { return text }
        return text.replacingOccurrences(of: "[-_]+", with: " ", options: .regularExpression)
            .capitalized(with: Locale(identifier: "en_US_POSIX"))
    }

    /// Decode display entities and normalize text without changing its spelling or case.
    public static func clean(_ value: String) -> String {
        let decoded = decodeEntities(value).precomposedStringWithCanonicalMapping
        let text = decoded.unicodeScalars.map { scalar -> String in
            if CharacterSet.whitespacesAndNewlines.contains(scalar) { return " " }
            if scalar.value < 0x20 || (0x7f...0x9f).contains(scalar.value) { return "" }
            return String(scalar)
        }.joined()
        return text.components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private static func decodeEntities(_ value: String) -> String {
        guard let expression = try? NSRegularExpression(pattern: "&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);")
        else { return value }
        var text = value
        // A bounded second pass handles doubly escaped source text such as &amp;#39;.
        for _ in 0..<2 {
            let matches = expression.matches(in: text, range: NSRange(text.startIndex..., in: text))
            var changed = false
            for match in matches.reversed() {
                guard let tokenRange = Range(match.range(at: 1), in: text),
                      let entityRange = Range(match.range, in: text)
                else { continue }
                let token = String(text[tokenRange])
                let replacement: String?
                if token.hasPrefix("#") {
                    let isHex = token.lowercased().hasPrefix("#x")
                    let digits = token.dropFirst(isHex ? 2 : 1)
                    replacement = UInt32(digits, radix: isHex ? 16 : 10)
                        .flatMap(Unicode.Scalar.init)
                        .map(String.init)
                } else {
                    replacement = entities[token]
                }
                if let replacement {
                    text.replaceSubrange(entityRange, with: replacement)
                    changed = true
                }
            }
            if !changed { break }
        }
        return text
    }

    private static let entities: [String: String] = [
        "amp": "&", "quot": "\"", "apos": "'", "lt": "<", "gt": ">", "nbsp": " ",
        "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”", "ndash": "–", "mdash": "—",
        "hellip": "…", "eacute": "é", "Eacute": "É", "aacute": "á", "Aacute": "Á",
        "agrave": "à", "Agrave": "À", "egrave": "è", "Egrave": "È", "iacute": "í", "Iacute": "Í",
        "oacute": "ó", "Oacute": "Ó", "uacute": "ú", "Uacute": "Ú", "ntilde": "ñ", "Ntilde": "Ñ",
        "auml": "ä", "Auml": "Ä", "ouml": "ö", "Ouml": "Ö", "uuml": "ü", "Uuml": "Ü",
        "ccedil": "ç", "Ccedil": "Ç", "szlig": "ß", "oslash": "ø", "Oslash": "Ø",
        "aring": "å", "Aring": "Å", "aelig": "æ", "AElig": "Æ"
    ]
}
