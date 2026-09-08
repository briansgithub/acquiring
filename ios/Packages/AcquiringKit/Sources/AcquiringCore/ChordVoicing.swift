import Foundation

/// A tone retains its authored role through modification and inversion.
struct ChordTone: Equatable, Sendable {
    var midi: Int
    let slot: Int
    let degree: Int
    let writtenOctave: Int
    let shiftMidi: Int

    init(midi: Int, slot: Int, degree: Int, writtenOctave: Int? = nil, shiftMidi: Int? = nil) {
        self.midi = midi
        self.slot = slot
        self.degree = degree
        self.writtenOctave = writtenOctave ?? Int(floor(Double(midi) / 12)) - 1
        self.shiftMidi = shiftMidi ?? midi
    }

    func shifted(_ semitones: Int, degree: Int? = nil) -> ChordTone {
        let newDegree = degree ?? self.degree
        let newSlot = degree == nil ? slot : newDegree == 9 ? 4 : newDegree == 11 ? 5 : newDegree == 13 ? 6 : slot
        return .init(midi: shiftMidi + semitones, slot: newSlot, degree: newDegree)
    }

    func raisedOctave() -> ChordTone {
        .init(midi: midi + 12, slot: slot, degree: degree, writtenOctave: writtenOctave + 1, shiftMidi: shiftMidi + 12)
    }
}

struct VoicedChord: Equatable, Sendable {
    let rootName: String
    let rootMidi: Int
    var tones: [ChordTone]

    var labels: [String] {
        tones.map { tone in
            let natural = [0, 2, 4, 5, 7, 9, 11][(tone.degree - 1) % 7]
            var alteration = ((tone.midi - rootMidi - natural) % 12 + 12) % 12
            if alteration > 6 { alteration -= 12 }
            let prefix = String(repeating: alteration < 0 ? "♭" : "♯", count: abs(alteration))
            return "\(prefix)\(tone.degree)\u{0302}"
        }
    }
}

/// Native counterpart of chordBuild, chordPolicy and the ordered modifier pipeline.
enum ChordVoicing {
    private static let major = [0, 2, 4, 5, 7, 9, 11]
    private static let pcs = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    private static func mod(_ value: Int, _ divisor: Int = 12) -> Int { (value % divisor + divisor) % divisor }
    private static func floorDiv(_ value: Int, _ divisor: Int) -> Int { (value - mod(value, divisor)) / divisor }
    private static func absolutePC(_ name: String) -> Int {
        let natural = ["C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11][String(name.prefix(1)).uppercased()] ?? 0
        return natural + MusicTheory.modifierValue(String(name.dropFirst()))
    }
    private static func pc(_ name: String) -> Int { mod(absolutePC(name)) }
    private static func note(_ degree: Int, _ key: KeyInfo, _ custom: [Int]? = nil) -> String {
        MusicTheory.noteLabel(degree: degree, tonic: key.tonic, scale: key.scale, customIntervals: custom)
    }
    private static func custom(_ chord: [String: JSONValue]) -> [Int]? {
        guard let source = chord["borrowed"]?.arrayValue else { return nil }
        if source.isEmpty { return major }
        var result: [Int] = []
        for index in 0..<7 {
            result.append(mod(source.indices.contains(index) ? source[index].intValue ?? ((result.last ?? 0) + 2) : ((result.last ?? 0) + 2)))
        }
        return result
    }
    private static func qualities(_ intervals: [Int]) -> [String] {
        (0..<7).map { index in
            let third = mod(intervals[(index + 2) % 7] - intervals[index])
            let fifth = mod(intervals[(index + 4) % 7] - intervals[index])
            if third == 3 && fifth == 6 { return "diminished" }
            if third == 4 && fifth == 8 { return "augmented" }
            return third == 4 ? "major" : "minor"
        }
    }

    static func build(_ chord: [String: JSONValue], key: KeyInfo) -> VoicedChord? {
        let root = chord.chordInt("root")
        guard !chord.chordFlag("isRest"), !chord.chordFlag("rest") else { return nil }
        guard (1...7).contains(root) else {
            let letterRoot = chord.chordString("_letterRootName")
            guard root == 0, letterRoot.range(of: "^[A-G][#bx]*$", options: .regularExpression) != nil else { return nil }
            let quality = chord.chordString("_letterQuality")
            var built = buildFrame(chord, key: key, rootName: letterRoot, rawQuality: quality.isEmpty ? "major" : quality,
                                   root: 1, custom: nil, appliedFrame: true, fullyDim: chord.chordFlag("dimTriad") && !chord.chordFlag("halfDim"))
            let slash = chord.chordString("_letterBassName")
            if !slash.isEmpty, let index = built.tones.firstIndex(where: { mod($0.midi) == pc(slash) }) {
                built.tones = Array(built.tones[index...]) + Array(built.tones[..<index])
                while built.tones.count > 1 && built.tones[0].shiftMidi >= built.tones[1].shiftMidi {
                    built.tones[0] = built.tones[0].shifted(-12)
                }
            }
            return built
        }
        let custom = custom(chord)
        let borrowed = chord.chordString("borrowed")
        let hasBorrowed = !borrowed.isEmpty || custom != nil
        let resolvedKey = KeyInfo(tonic: key.tonic, scale: custom != nil ? "custom" : borrowed.isEmpty ? key.scale : borrowed)
        let applied = chord.chordInt("applied")
        let target = note(root, resolvedKey, custom)
        let type = chord.chordInt("type", fallback: 5)
        let sus = !chord.chordInts("suspensions").isEmpty
        if (1...7).contains(applied) {
            let targetKey = KeyInfo(tonic: target, scale: "major")
            if applied == 5 && chord.chordStrings("substitutions").contains("tri") {
                return buildFrame(chord, key: key, rootName: pcs[(pc(target) + 1) % 12], rawQuality: "major", root: 1, custom: nil, appliedFrame: true, fullyDim: false)
            }
            let actualRoot = note(applied, targetKey)
            let quality = MusicTheory.chordQualities["major"]![applied - 1]
            let sharp5 = chord.chordStrings("alterations").contains("#5") && applied == 7
            if !hasBorrowed {
                let minorSharp5 = sharp5 && type < 7
                var effective = chord
                effective["useMaj7"] = .bool(chord.chordFlag("useMaj7") || (type >= 7 && quality == "major" && applied != 5 && !sus))
                return buildFrame(effective, key: key, rootName: actualRoot, rawQuality: minorSharp5 ? "minor" : quality,
                                  root: applied, custom: nil, appliedFrame: true, fullyDim: !minorSharp5 && applied == 7 && !sus)
            }
            if borrowed == "locrian" && root == 1 && applied == 1 && type < 7 {
                return buildFrame(chord, key: key, rootName: target, rawQuality: "minor", root: 1, custom: nil, appliedFrame: true, fullyDim: false)
            }
            if sharp5 {
                return buildFrame(chord, key: key, rootName: actualRoot, rawQuality: "minor", root: applied, custom: nil, appliedFrame: true, fullyDim: false)
            }
            if custom != nil && (1...2).contains(chord.chordInt("inversion")) {
                return buildFrame(chord, key: key, rootName: target, rawQuality: "major", root: 1, custom: nil, appliedFrame: true, fullyDim: false)
            }
            return buildFrame(chord, key: targetKey, rootName: actualRoot, rawQuality: quality,
                              root: applied, custom: nil, appliedFrame: false, fullyDim: false, borrowedOverride: "")
        }
        let quality = (custom.map(qualities) ?? MusicTheory.chordQualities[resolvedKey.scale] ?? MusicTheory.chordQualities["major"]!)[root - 1]
        return buildFrame(chord, key: key, rootName: target, rawQuality: quality, root: root, custom: custom, appliedFrame: false, fullyDim: false)
    }

    private static func buildFrame(
        _ chord: [String: JSONValue], key: KeyInfo, rootName: String, rawQuality: String, root: Int,
        custom: [Int]?, appliedFrame: Bool, fullyDim: Bool, borrowedOverride: String? = nil
    ) -> VoicedChord {
        let type = chord.chordInt("type", fallback: 5)
        let inversion = max(0, chord.chordInt("inversion"))
        let suspensions = chord.chordInts("suspensions")
        let sus = !suspensions.isEmpty
        let omits = chord.chordInts("omits")
        let omit35 = omits.contains(3) && omits.contains(5)
        let adds = chord.chordInts("adds")
        var alts = chord.chordStrings("alterations")
        let borrowed = borrowedOverride ?? chord.chordString("borrowed")
        let scale = custom != nil ? "custom" : borrowed.isEmpty ? key.scale : borrowed
        let halfDim = chord.chordFlag("halfDim")
        let dimTriad = chord.chordFlag("dimTriad")
        let sharp5Minor = alts.contains("#5") && rawQuality == "diminished"
        let halfDimIi = !sus && root == 2 && scale == "major" && type >= 7 && halfDim
        let customHalf = custom != nil && halfDim
        let phdmBVI = borrowed == "phrygianDominant" && root == 6 && type >= 7 && inversion != 3 && !alts.contains("#5")
        let phdmII = borrowed.isEmpty && key.scale == "phrygianDominant" && root == 2 && type >= 7 && inversion == 3
        let quality: String
        if appliedFrame {
            quality = halfDim || dimTriad ? "diminished" : sus && rawQuality == "diminished" ? "major" : rawQuality
        } else if halfDimIi { quality = "diminished" }
        else if customHalf || sharp5Minor { quality = "minor" }
        else if dimTriad || halfDim { quality = "diminished" }
        else if phdmBVI || phdmII || (sus && ["diminished", "augmented"].contains(rawQuality)) { quality = "major" }
        else { quality = rawQuality }
        let policyHalf = halfDim || halfDimIi || (rawQuality == "diminished" && type >= 7 && !sharp5Minor && !customHalf)
        let augStack = !appliedFrame && quality == "augmented" && type >= 7 && !sus && !omit35
        let minorV13 = !appliedFrame && scale == "minor" && root == 5 && rawQuality == "minor" && type >= 13 && !sus
        let minorI13 = !appliedFrame && scale == "minor" && root == 1 && rawQuality == "minor" && type >= 13 && !sus && !omit35
        let hmV13 = !appliedFrame && borrowed == "harmonicMinor" && root == 5 && type >= 13 && !sus && !omit35
        if !appliedFrame {
            if customHalf {
                alts.removeAll { $0 == "b9" }
                if type >= 7 && !alts.contains("b5") { alts.append("b5") }
            } else if halfDim && type >= 9 {
                if !alts.contains("b5") { alts.append("b5") }
                if omit35, let index = alts.firstIndex(of: "b9") { alts.remove(at: index) }
            }
            if minorV13 {
                if !alts.contains("b9") { alts.append("b9") }
                if !alts.contains("b13") { alts.append("b13") }
            }
            if minorI13 && !alts.contains("b13") { alts.append("b13") }
        }
        let flattenB5 = !customHalf && (chord["flattenHalfDimB5"]?.boolValue ?? (halfDim && alts.contains("b5") && type <= 7))
        let rootMidi = 48 + pc(rootName)
        func scaleTone(_ offset: Int, _ slot: Int, _ degree: Int) -> ChordTone {
            let simple = mod(degree - 1, 7) + 1
            let octave = floorDiv(degree - 1, 7)
            let natural = major[simple - 1]
            let accidental = offset - natural - octave * 12
            let unaltered = note(simple, KeyInfo(tonic: rootName, scale: "major"))
            let modifier = MusicTheory.modifierValue(String(unaltered.dropFirst())) + accidental
            let label = String(unaltered.prefix(1)) + String(repeating: modifier < 0 ? "b" : "#", count: abs(modifier))
            let absolute = pc(rootName) + natural + accidental
            var octaveOffset = floorDiv(absolute, 12)
            let order = Array("CDEFGAB")
            if let labelLetter = label.first, let rootLetter = rootName.first,
               let labelIndex = order.firstIndex(of: labelLetter), let rootIndex = order.firstIndex(of: rootLetter),
               labelIndex < rootIndex, absolute >= 0, absolute < 12, octaveOffset == 0 { octaveOffset = 1 }
            let written = 3 + octave + octaveOffset
            return .init(midi: (written + 1) * 12 + absolutePC(label), slot: slot, degree: degree,
                         writtenOctave: written, shiftMidi: (written + 1) * 12 + pc(label))
        }
        var tones: [ChordTone] = []
        func tone(_ offset: Int, _ slot: Int, _ degree: Int, _ scaleNote: Bool = false) {
            tones.append(scaleNote ? scaleTone(offset, slot, degree) : .init(midi: rootMidi + offset, slot: slot, degree: degree))
        }
        func has(_ offset: Int) -> Bool { tones.contains { mod($0.midi - rootMidi) == mod(offset) } }
        func append(_ offset: Int, _ slot: Int, _ degree: Int, _ scaleNote: Bool = false) { if !has(offset) { tone(offset, slot, degree, scaleNote) } }
        func removeFirst(_ offset: Int) { if let index = tones.firstIndex(where: { mod($0.midi - rootMidi) == offset }) { tones.remove(at: index) } }
        tone(0, 0, 1, !appliedFrame)
        tone(quality == "minor" || quality == "diminished" ? 3 : 4, 1, 3, !appliedFrame)
        if !(augStack && inversion != 3) { tone(quality == "diminished" ? 6 : quality == "augmented" ? 8 : 7, 2, 5, !appliedFrame) }
        let dimScale = rawQuality == "diminished" && (scale == "custom" || ["dorian": 6, "lydian": 4, "minor": 2, "harmonicMinor": 2, "major": 7, "phrygian": 5, "locrian": 1][scale] == root)
        let m6Stack = !appliedFrame && halfDim && type >= 7 && inversion == 1 && !sus && !omit35
            && (borrowed == "mixolydian" || ["harmonicMinor": 2, "major": 7, "mixolydian": 3][scale] == root)
        let intervals = custom ?? MusicTheory.scaleIntervals[scale] ?? major
        let seventhInterval = mod(intervals[(root + 5) % 7] - intervals[root - 1])
        let diatonic7 = seventhInterval == 11 ? 11 : seventhInterval == 9 ? 9 : 10
        if type >= 7 {
            if augStack && inversion != 3 {
                tone(11, 3, 7)
                if !omits.contains(5) { tone(7, 2, 5) }
            } else {
                let seventh: Int
                if appliedFrame {
                    if fullyDim { seventh = 9 }
                    else if halfDim { seventh = 10 }
                    else if dimTriad { seventh = 9 }
                    else if rawQuality == "diminished" && alts.contains("#5") { seventh = 10 }
                    else { seventh = chord.chordFlag("useMaj7") ? 11 : 10 }
                } else if omit35 {
                    seventh = halfDim ? 9 : sus ? 10 : dimScale ? 9 : diatonic7
                } else if augStack { seventh = 11 }
                else if m6Stack { seventh = 9 }
                else if phdmII && suspensions.contains(2) && !suspensions.contains(4) { seventh = 11 }
                else if sus || (chord.chordInt("applied") == 5 && !chord.chordFlag("useMaj7")) { seventh = 10 }
                else if borrowed == "minor" && key.scale == "harmonicMinor" && root == 1 { seventh = 10 }
                else if customHalf { seventh = 9 }
                else if sharp5Minor { seventh = 10 }
                else if dimTriad { seventh = 9 }
                else if custom != nil && rawQuality == "diminished" { seventh = diatonic7 }
                else if phdmII { seventh = 11 }
                else { seventh = dimScale ? 9 : diatonic7 }
                tone(seventh, m6Stack ? 9 : 3, m6Stack ? 6 : 7, !appliedFrame && omit35)
            }
        }
        let customHalf11 = !appliedFrame && customHalf && type >= 11
        let dimNatural11 = !appliedFrame && type >= 11 && ((custom != nil && dimTriad && !halfDim)
            || (["harmonicMinor", "phrygianDominant"].contains(borrowed) && quality == "diminished"))
        let skipNine = !appliedFrame && ((borrowed == "lydian" && (halfDim || quality == "diminished") && type >= 11)
            || (["harmonicMinor", "phrygianDominant"].contains(borrowed) && type >= 11 && quality == "diminished")
            || (omit35 && (halfDim || policyHalf)))
        if type >= 9 && !skipNine && !customHalf11 { append(14, 4, 9, true) }
        if customHalf11 && quality == "minor" { append(1, 4, 9) }
        else if dimNatural11 && quality == "diminished" { append(1, 4, 9); append(5, 5, 11) }
        else if type >= 11 {
            if policyHalf && skipNine && borrowed != "lydian" { append(1, 4, 9) } else { append(5, 5, 11) }
        }
        if type >= 13 { append(21, 6, 13, true) }
        else if type >= 11 && appliedFrame && alts.contains("b5") && !has(9) { removeFirst(5); tone(21, 6, 13, true) }
        if !appliedFrame && type == 11 && scale == "minor" && root == 2 && !dimTriad && !sus,
           let rootTone = tones.first(where: { $0.slot == 0 }) {
            for (role, semitones, degree) in [(3, 10, 7), (4, 1, 9), (5, 5, 11)] {
                if let index = tones.firstIndex(where: { $0.slot == role }) {
                    var shift = mod(pc(rootName) + semitones) - mod(tones[index].midi)
                    if shift > 6 { shift -= 12 }
                    if shift < -6 { shift += 12 }
                    if shift != 0 { tones[index] = tones[index].shifted(shift) }
                } else {
                    tones.append(.init(midi: rootTone.shiftMidi + (role == 4 ? 13 : semitones), slot: role, degree: degree))
                }
            }
        }
        if !appliedFrame && type < 13 && !halfDim && !dimTriad && !sus {
            let customExtensions = chord["borrowed"]?.arrayValue != nil
            for index in tones.indices {
                let role = tones[index].slot
                guard role == 4 || role == 5 else { continue }
                if !customExtensions && role == 5 && scale != "lydian" { continue }
                let minorSupertonicNinth = role == 4 && scale == "minor" && root == 2
                if !customExtensions && quality == "diminished" && !minorSupertonicNinth { continue }
                let extensionDegree = role == 4 ? 9 : 11
                let targetDegree = mod(root + extensionDegree - 2, 7) + 1
                let desired = pc(note(targetDegree, KeyInfo(tonic: key.tonic, scale: scale), custom))
                var shift = desired - mod(tones[index].midi)
                if shift > 6 { shift -= 12 }
                if shift < -6 { shift += 12 }
                if shift != 0 { tones[index] = tones[index].shifted(shift) }
            }
        }
        if suspensions.contains(4) || suspensions.contains(2), let index = tones.firstIndex(where: { $0.slot == 1 }) {
            let degree = suspensions.contains(4) ? 4 : 2
            tones[index] = scaleTone(degree == 4 ? 5 : 2, degree == 4 ? 8 : 7, degree)
            if degree == 2 && !appliedFrame && phdmII { tones[index] = tones[index].shifted(1) }
            if suspensions.contains(2) && suspensions.contains(4) {
                tones.append(scaleTone(2, 7, 2))
                if !appliedFrame && scale == "harmonicMinor" && root == 6 {
                    for index in tones.indices where [3, 7, 8].contains(tones[index].slot) {
                        tones[index] = tones[index].shifted(1)
                    }
                }
            }
        }
        let modifierHalf = appliedFrame ? halfDim : !dimTriad && (halfDim || policyHalf)
        var effectiveOmits = omits
        if modifierHalf && omits.contains(5) { effectiveOmits = omits.filter { $0 != 5 } }
        if omits.contains(3) && (suspensions.contains(2) || suspensions.contains(4)) { effectiveOmits = omits.filter { $0 != 3 } }
        if !appliedFrame && quality == "augmented" && omits.contains(5) && ((!omits.contains(3) && type < 7) || omits.contains(3)) {
            effectiveOmits = omits.filter { $0 != 5 }
        }
        tones.removeAll { ($0.slot == 1 && effectiveOmits.contains(3)) || ($0.slot == 2 && effectiveOmits.contains(5)) }
        @discardableResult func shiftFirst(_ offset: Int, _ delta: Int, _ degree: Int? = nil) -> Bool {
            guard let index = tones.firstIndex(where: { mod($0.midi - rootMidi) == offset }) else { return false }
            tones[index] = tones[index].shifted(delta, degree: degree)
            return true
        }
        for raw in alts {
            let alt = raw.lowercased().replacingOccurrences(of: "♭", with: "b").replacingOccurrences(of: "♯", with: "#")
            if alt == "b5" || alt == "#5" {
                let delta = alt == "b5" ? -1 : 1
                if alt == "b5" && customHalf && !appliedFrame {
                    if let index = tones.firstIndex(where: { $0.slot == 2 }) { tones[index] = .init(midi: (tones.first?.shiftMidi ?? rootMidi) + 6, slot: 2, degree: 5) }
                    continue
                }
                if alt == "b5" && modifierHalf && flattenB5 { shiftFirst(7, -1); shiftFirst(10, -1); continue }
                if alt == "b5" && type >= 13 { removeFirst(5) }
                if alt == "b5" && (modifierHalf || dimTriad || (!appliedFrame && quality == "diminished")) { continue }
                if alt == "#5" && chord.chordInt("applied") == 7 && type >= 7 {
                    for index in tones.indices {
                        let offset = mod(tones[index].midi - rootMidi)
                        if offset == 6 || offset == 9 { tones[index] = .init(midi: (tones.first?.shiftMidi ?? rootMidi) + (offset == 6 ? 8 : 10), slot: tones[index].slot, degree: tones[index].degree) }
                    }
                    continue
                }
                if alt == "b5" && !appliedFrame && quality == "augmented" && shiftFirst(8, -2) { continue }
                if let index = tones.firstIndex(where: { mod($0.midi - rootMidi) == 7 || (alt == "#5" && mod($0.midi - rootMidi) == 6) }) {
                    tones[index] = tones[index].shifted(delta)
                } else if !has(6 + delta) { tone(alt == "b5" ? 6 : 8, 2, 5, true) }
                continue
            }
            let spec: (offset: Int, delta: Int, degree: Int)
            switch alt {
            case "b9": spec = (2, -1, 9)
            case "#9": spec = (2, 1, 9)
            case "9": spec = (2, 0, 9)
            case "b11": spec = (5, -1, 11)
            case "#11": spec = (5, 1, 11)
            case "11": spec = (5, 0, 11)
            case "b13": spec = (9, -1, 13)
            case "#13": spec = (9, 1, 13)
            default: continue
            }
            let slot = spec.degree == 9 ? 4 : spec.degree == 11 ? 5 : 6
            if alt == "#9" && type >= 13 { append(6, 5, 11) }
            if alt == "b13" && (minorV13 || minorI13 || hmV13) { append(20, 6, 13, true); continue }
            if alt == "#11" && suspensions.contains(4) { append(18, 5, 11, true); continue }
            if !shiftFirst(spec.offset, spec.delta, spec.degree) && spec.delta != 0 { append(spec.offset + spec.delta + 12, slot, spec.degree, true) }
        }
        let hasSeventh = tones.contains { $0.slot == 3 }
        for add in adds {
            let degree = add <= 6 && hasSeventh ? add + 7 : add
            switch degree {
            case 2, 9: append(14, 4, 9, true)
            case 4: append(5, 8, 4, true)
            case 6: append(9, 9, 6, true)
            case 11: append(17, 5, 11, true)
            case 13: append(21, 6, 13, true)
            default: break
            }
        }
        if adds.contains(6) && type < 7 && !adds.contains(9),
           let index = tones.lastIndex(where: { $0.slot == 2 && mod($0.midi - rootMidi) == 7 }) { tones.remove(at: index) }
        if type >= 9 && sus && !omits.contains(5)
            && !chord.chordStrings("alterations").contains(where: { ["b5", "#5", "♭5", "♯5"].contains($0) }),
           let index = tones.firstIndex(where: { $0.slot == 2 && mod($0.midi - rootMidi) == 7 }) { tones.remove(at: index) }
        if type == 11 && inversion == 0
            && !chord.chordStrings("alterations").contains(where: { ["b5", "#5", "♭5", "♯5"].contains($0) }) {
            tones.removeAll { $0.slot == 1 || $0.slot == 2 }
        }
        if !tones.isEmpty && inversion > 0 {
            if appliedFrame {
                let rotation = inversion % tones.count
                let rotated = Array(tones[rotation...]) + Array(tones[..<rotation])
                let bassOctave = max(1, rotated[0].writtenOctave - 1)
                let upperOctave = max(rotated.dropFirst().map(\.writtenOctave).max() ?? 0, bassOctave + 1)
                tones = rotated.enumerated().map { index, tone in
                    .init(midi: ((index == 0 ? bassOctave : upperOctave) + 1) * 12 + mod(tone.midi), slot: tone.slot, degree: tone.degree)
                }
            } else {
                for _ in 0..<inversion { let moved = tones.removeFirst(); tones.append(moved.raisedOctave()) }
            }
        }
        if !appliedFrame && type < 7 && inversion == 2 && omits.contains(3) && !omits.contains(5) && tones.count == 2,
           let rootTone = tones.first(where: { $0.slot == 0 }), var fifth = tones.first(where: { $0.slot == 2 }) {
            while fifth.midi >= rootTone.midi { fifth.midi -= 12 }
            tones = [fifth, rootTone]
        }
        if inversion == 0 {
            let spread = appliedFrame ? (fullyDim || (quality == "diminished" && type >= 7))
                : type >= 7 && !customHalf && !sharp5Minor && (rawQuality == "diminished" || halfDimIi || dimScale)
            if spread && tones.count >= 4 {
                let rootOctave = tones[0].writtenOctave
                for index in [1, 2] where tones[index].writtenOctave == rootOctave { tones[index] = tones[index].shifted(12) }
            }
            tones = tones.enumerated().sorted { $0.element.midi == $1.element.midi ? $0.offset < $1.offset : $0.element.midi < $1.element.midi }.map(\.element)
        }
        return VoicedChord(rootName: rootName, rootMidi: 48 + pc(rootName), tones: tones)
    }
}

private extension Dictionary where Key == String, Value == JSONValue {
    func chordInt(_ name: String, fallback: Int = 0) -> Int { self[name]?.intValue ?? fallback }
    func chordString(_ name: String) -> String { self[name]?.stringValue ?? "" }
    func chordFlag(_ name: String) -> Bool { self[name]?.boolValue == true }
    func chordInts(_ name: String) -> [Int] { self[name]?.arrayValue?.compactMap(\.intValue) ?? [] }
    func chordStrings(_ name: String) -> [String] { self[name]?.arrayValue?.compactMap(\.stringValue) ?? [] }
}
