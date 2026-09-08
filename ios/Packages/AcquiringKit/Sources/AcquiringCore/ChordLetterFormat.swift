import Foundation

/// Source-compatible letter notation from the resolved harmonic context.
enum ChordLetterFormat {
    private static func unique<T: Hashable>(_ values: [T]) -> [T] {
        var seen = Set<T>()
        return values.filter { seen.insert($0).inserted }
    }
    private static func number(_ value: String) -> Int { Int(value.filter(\.isNumber)) ?? 0 }
    private static func group(_ values: [String]) -> String { values.isEmpty ? "" : "(\(values.joined()))" }
    private static func pitchClass(_ note: String) -> Int? {
        guard let natural = ["C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11][String(note.prefix(1)).uppercased()] else { return nil }
        return ((natural + MusicTheory.modifierValue(String(note.dropFirst()))) % 12 + 12) % 12
    }

    static func format(
        _ chord: [String: JSONValue], rootName: String, quality: String, degree: Int,
        effectiveKey: KeyInfo, customIntervals: [Int]?,
        majorSeventh contextMajorSeventh: Bool, augmentedMajorSeventh: Bool,
        tritoneSubstitution: Bool, voiced: VoicedChord?, bassName contextBassName: String?
    ) -> String {
        let type = chord["type"]?.intValue ?? 5
        let inversion = chord["inversion"]?.intValue ?? 0
        let suspensions = unique(chord["suspensions"]?.arrayValue?.compactMap(\.intValue) ?? [])
        let suspended = !suspensions.isEmpty
        let alterations = unique(chord["alterations"]?.arrayValue?.compactMap(\.stringValue) ?? [])
        let omits = unique(chord["omits"]?.arrayValue?.compactMap(\.intValue) ?? [])
        let adds = unique(chord["adds"]?.arrayValue?.compactMap(\.intValue) ?? [])
        func symbolicNote(_ relativeDegree: Int) -> String {
            let scaleDegree = ((degree + relativeDegree - 2) % 7 + 7) % 7 + 1
            return MusicTheory.noteLabel(degree: scaleDegree, tonic: effectiveKey.tonic,
                                         scale: effectiveKey.scale, customIntervals: customIntervals)
        }
        func symbolicInterval(_ relativeDegree: Int) -> Int? {
            let note = symbolicNote(relativeDegree)
            guard let notePC = pitchClass(note), let rootPC = pitchClass(rootName) else { return nil }
            return ((notePC - rootPC) % 12 + 12) % 12
        }
        func rootNote(_ degree: Int, _ alteration: Int = 0) -> String {
            let base = MusicTheory.noteLabel(degree: degree, tonic: rootName, scale: "major")
            guard alteration != 0 else { return base }
            let modifier = MusicTheory.modifierValue(String(base.dropFirst())) + alteration
            let accidental = modifier == 2 ? "x" : String(repeating: modifier < 0 ? "b" : "#", count: abs(modifier))
            return String(base.prefix(1)) + accidental
        }
        let seventhInterval = symbolicInterval(7)
        let majorSeventh = type >= 7 && !suspended && !tritoneSubstitution && (seventhInterval == 11 || contextMajorSeventh || augmentedMajorSeventh)
        let diminishedSeventh = type >= 7 && !suspended && (chord["applied"]?.intValue == 7 || seventhInterval == 9)
        let diminished = quality == "diminished"
        let halfDiminished = diminished && type >= 7 && !majorSeventh && !diminishedSeventh
        let minor = quality == "minor"
        let augmented = quality == "augmented" || (quality == "major" && alterations.contains("#5"))
        let bassRole: Int? = inversion == 1 ? (suspensions.contains(4) ? 4 : suspensions.contains(2) ? 2 : 3)
            : inversion == 2 ? 5 : inversion == 3 ? 7 : nil
        var bassName = bassRole == nil ? nil : contextBassName
        if let bassRole, bassName != nil {
            if tritoneSubstitution { bassName = rootNote(bassRole, bassRole == 7 ? -1 : 0) }
            else if chord["applied"]?.intValue == 7 && bassRole == 7 { bassName = rootNote(7, -2) }
            else if bassRole == 3 { bassName = rootNote(3, minor || diminished ? -1 : 0) }
            else if bassRole == 5 && (diminished || (chord["applied"]?.intValue ?? 0) > 0)
                && type >= 7 && !suspended && alterations.contains("b5") { bassName = rootNote(5, -1) }
            else { bassName = symbolicNote(bassRole) }
        }
        if type == 11 && !majorSeventh && quality == "major" && (degree == 5 || tritoneSubstitution)
            && !suspended && alterations.isEmpty && omits.isEmpty && adds.isEmpty && inversion == 0 {
            return rootNote(7, -1) + "/" + rootName
        }
        let plainMinorSeventh = type == 7 && inversion == 1 && !suspended && !majorSeventh && !diminishedSeventh
            && (minor || halfDiminished) && adds.isEmpty && omits.isEmpty && alterations.allSatisfy { $0 == "b5" }
        if plainMinorSeventh, let bassName { return bassName + (halfDiminished ? "m" : "") + "6" }
        let thirdInversion = type == 7 && inversion == 3 && !suspended && bassName != nil
        let power = type < 7 && omits.contains(3) && !omits.contains(5) && !suspended
            && !diminished && alterations.isEmpty
        var qualityText = ""
        if power { qualityText = "5" }
        else if !suspended {
            if diminished && (thirdInversion || type < 7 || diminishedSeventh) { qualityText = "°" }
            else if minor || halfDiminished || (diminished && majorSeventh) { qualityText = "m" }
            else if augmented && (!majorSeventh || thirdInversion) { qualityText = "+" }
        }
        var implicitAlterations: [String] = []
        if !suspended && (halfDiminished || (diminished && majorSeventh)) { implicitAlterations.append("b5") }
        for extensionDegree in [9, 11, 13] where extensionDegree <= type {
            if alterations.contains(where: { number($0) == extensionDegree }) { continue }
            guard let interval = symbolicInterval(extensionDegree) else { continue }
            let difference = interval - (extensionDegree == 9 ? 2 : extensionDegree == 11 ? 5 : 9)
            if difference != 0 {
                let accidental = String(repeating: difference > 0 ? "#" : "b", count: abs(difference))
                implicitAlterations.append("\(accidental)\(extensionDegree)")
            }
        }
        var writtenType = type
        while writtenType >= 9 && (alterations + implicitAlterations).contains(where: { number($0) == writtenType }) {
            writtenType -= 2
        }
        if thirdInversion || type < 7 { writtenType = 0 }
        let additionTokens = adds.filter { !(($0 == 2 && type >= 9) || ($0 == 4 && type >= 11) || ($0 == 6 && type >= 13)) }
            .map { "add\($0 == 2 ? 9 : type >= 7 && $0 == 4 ? 11 : type >= 7 && $0 == 6 ? 13 : $0)" }
        let plainSixth = type < 7 && adds == [6] && !suspended && !diminished && omits.isEmpty && alterations.isEmpty
        let sixNine = type < 7 && adds.count == 2 && adds.contains(6) && adds.contains(9)
            && !suspended && omits.isEmpty && alterations.isEmpty
        let extensionText = writtenType >= 7 ? (majorSeventh ? "maj" : "") + String(writtenType) : sixNine ? "6/9" : plainSixth ? "6" : ""
        let omissionTokens = omits.filter { !(power && $0 == 3) }.map { "no\($0)" }
        var modifierTokens = unique(alterations + implicitAlterations)
        if thirdInversion && diminished, let fifth = modifierTokens.firstIndex(of: "b5") { modifierTokens.remove(at: fifth) }
        if thirdInversion && augmented, let fifth = modifierTokens.firstIndex(of: "#5") { modifierTokens.remove(at: fifth) }
        if augmented && majorSeventh && !thirdInversion && alterations.contains("#5") && !modifierTokens.contains("#5") { modifierTokens.append("#5") }
        let suspensionText = suspensions.map { suspension in
            let difference = symbolicInterval(suspension).map { $0 - (suspension == 2 ? 2 : 5) } ?? 0
            var accidental = String(repeating: difference > 0 ? "#" : "b", count: abs(difference))
            if suspension == 4 && suspensions.count == 1 && alterations.contains("#11") { accidental = "#" }
            return "sus\(accidental)\(suspension)"
        }.joined()
        return rootName + qualityText + extensionText + group(plainSixth || sixNine ? [] : additionTokens) + group(omissionTokens)
            + group(modifierTokens) + suspensionText + (bassName.map { "/" + $0 } ?? "")
    }
}
