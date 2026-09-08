import AcquiringCore
import SwiftUI

/// Offline reference for the notation shown on quiz cards and in song analysis.
struct HelpView: View {
    var body: some View {
        List {
            Section {
                HelpTopicLink(
                    id: "help.topic.scaleDegrees",
                    title: "Scale degrees",
                    detail: "Numbers, accidentals, and chord-tone reference"
                ) { ScaleDegreesHelpView() }
                HelpTopicLink(
                    id: "help.topic.intervals",
                    title: "Intervals",
                    detail: "Quality, number, direction, and compound intervals"
                ) { IntervalsHelpView() }
                HelpTopicLink(
                    id: "help.topic.romanNumerals",
                    title: "Roman numerals",
                    detail: "Chord quality, figures, alterations, and applied chords"
                ) { RomanNumeralsHelpView() }
                HelpTopicLink(
                    id: "help.topic.modes",
                    title: "Modes, borrowing & major lock",
                    detail: "Parallel and relative contexts in a song"
                ) { ModesHelpView() }
                HelpTopicLink(
                    id: "help.topic.tessitura",
                    title: "Tessitura",
                    detail: "Choose a comfortable octave for singing targets"
                ) { TessituraHelpView() }
            } header: {
                Text("Card notation")
            } footer: {
                Text("This reference is built into Acquiring and works offline.")
            }
        }
        .navigationTitle("Help")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("help.contents")
    }
}

private struct HelpTopicLink<Destination: View>: View {
    let id: String
    let title: String
    let detail: String
    @ViewBuilder let destination: () -> Destination

    var body: some View {
        NavigationLink(destination: destination) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.body.weight(.semibold))
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier(id)
    }
}

private struct HelpArticle<Content: View>: View {
    let title: String
    let id: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                content()
            }
            .frame(maxWidth: 680, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(id)
    }
}

private struct HelpSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.title3.weight(.bold)).accessibilityAddTraits(.isHeader)
            content().foregroundStyle(.primary)
        }
    }
}

private struct HelpCallout: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.subheadline)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.accentColor.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct ScaleDegreesHelpView: View {
    var body: some View {
        HelpArticle(title: "Scale degrees", id: "help.topic.scaleDegrees") {
            HelpSection(title: "A position in a scale") {
                Text("A scale is an ordered set of notes, with its home note called the tonic. Scale degrees 1 through 7 count from that home note: 1 is the tonic, 2 is the next scale note, and so on. The hat above a number identifies it as a scale degree, not a fixed note name.")
                Text("A flat (♭) lowers a degree by one semitone, the smallest step between neighboring piano keys. A sharp (♯) raises it by one. Double flats (♭♭) and double sharps (♯♯) change it by two semitones.")
                HStack(spacing: 5) {
                    ForEach(["1", "2", "3", "4", "5", "6", "7"], id: \.self) { degree in
                        FittedScaleDegree(degree, maximumFontSize: 27, minimumFontSize: 12)
                            .frame(height: 38)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Scale positions one through seven")
                degreeAlignment(notes: ["C", "D", "E", "F", "G", "A", "B"], degrees: ["1", "2", "3", "4", "5", "6", "7"], label: "C major: C D E F G A B align with scale degrees one through seven")
            }
            HelpSection(title: "Chord tones use the chord root") {
                Text("On chord-tone cards, degrees are measured from the chord’s root using a major-scale reference. G–B–D is 5–7–2 in C major, but 1–3–5 within the G-major chord. A–C–E is 1–♭3–5 within the A-minor chord.")
                VStack(spacing: 8) {
                    chordDegreeRow(notes: "G–B–D", degrees: "5–7–2", label: "in C major")
                    chordDegreeRow(notes: "G–B–D", degrees: "1–3–5", label: "inside G chord")
                    chordDegreeRow(notes: "A–C–E", degrees: "1–♭3–5", label: "inside A minor chord")
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("G B D is five seven two in C major and one three five inside G chord. A C E is one flat three five inside A minor chord")
            }
            HelpCallout(text: "Read the surrounding label first: a melody degree uses its section context; a chord-tone degree uses the chord root.")
        }
    }

    private func chordDegreeRow(notes: String, degrees: String, label: String) -> some View {
        HStack(spacing: 10) {
            Text(notes).font(.headline.monospaced())
            Image(systemName: "arrow.right").foregroundStyle(.secondary).accessibilityHidden(true)
            Text(degrees).font(.headline.monospaced()).foregroundStyle(.tint)
            Spacer(minLength: 2)
            Text(label).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 8).padding(.horizontal, 10)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
    }

    private func degreeAlignment(notes: [String], degrees: [String], label: String) -> some View {
        HStack(spacing: 4) {
            ForEach(Array(notes.enumerated()), id: \.offset) { index, note in
                VStack(spacing: 2) {
                    Text(note).font(.caption.weight(.semibold))
                    FittedScaleDegree(degrees[index], maximumFontSize: 18, minimumFontSize: 9)
                        .frame(height: 24)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 8).padding(.horizontal, 5)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .ignore).accessibilityLabel(label)
    }
}

private struct IntervalReference: Identifiable {
    let number: Int
    let name: String
    let qualities: String
    let family: String
    var id: Int { number }
}

private struct IntervalsHelpView: View {
    private let reference = [
        IntervalReference(number: 1, name: "unison", qualities: "d1  P1  A1", family: "perfect family"),
        IntervalReference(number: 2, name: "second", qualities: "d2  m2  M2  A2", family: "major/minor family"),
        IntervalReference(number: 3, name: "third", qualities: "d3  m3  M3  A3", family: "major/minor family"),
        IntervalReference(number: 4, name: "fourth", qualities: "d4  P4  A4", family: "perfect family"),
        IntervalReference(number: 5, name: "fifth", qualities: "d5  P5  A5", family: "perfect family"),
        IntervalReference(number: 6, name: "sixth", qualities: "d6  m6  M6  A6", family: "major/minor family"),
        IntervalReference(number: 7, name: "seventh", qualities: "d7  m7  M7  A7", family: "major/minor family"),
        IntervalReference(number: 8, name: "octave", qualities: "d8  P8  A8", family: "perfect family"),
        IntervalReference(number: 9, name: "ninth", qualities: "d9  m9  M9  A9", family: "major/minor family"),
        IntervalReference(number: 10, name: "tenth", qualities: "d10  m10  M10  A10", family: "major/minor family"),
        IntervalReference(number: 11, name: "eleventh", qualities: "d11  P11  A11", family: "perfect family"),
        IntervalReference(number: 12, name: "twelfth", qualities: "d12  P12  A12", family: "perfect family"),
        IntervalReference(number: 13, name: "thirteenth", qualities: "d13  m13  M13  A13", family: "major/minor family"),
        IntervalReference(number: 14, name: "fourteenth", qualities: "d14  m14  M14  A14", family: "major/minor family"),
        IntervalReference(number: 15, name: "fifteenth (double octave)", qualities: "d15  P15  A15", family: "perfect family")
    ]

    var body: some View {
        HelpArticle(title: "Intervals", id: "help.topic.intervals") {
            HelpSection(title: "Quality + number + direction") {
                Text("An interval names the distance between two notes. Its number counts note letters, including both ends: C–D–E spans a third. Its quality describes the size more precisely: P is perfect, M major, m minor, A augmented, and d diminished.")
                Text("For unisons, fourths, fifths, and octaves, augmented is one semitone wider than perfect; diminished is one narrower. For seconds, thirds, sixths, and sevenths, minor is one semitone narrower than major; augmented is one wider than major, and diminished one narrower than minor. AA and dd mean doubly augmented and doubly diminished: one further semitone of change.")
                intervalExamples
                Text("↑ is ascending, ↓ is descending, and · is a unison. Numbers can continue beyond 15; each added octave adds 7 to the number and 12 semitones.")
            }
            HelpSection(title: "Reference") {
                Text("The quality family depends on the number. Here is the reference through 15.")
                VStack(spacing: 6) {
                    ForEach(reference) { item in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("\(item.number)").font(.headline.monospacedDigit()).frame(width: 24, alignment: .trailing)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name.capitalized).font(.subheadline.weight(.semibold))
                                Text(item.qualities).font(.caption.monospaced()).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 4)
                            Text(item.family).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
                        }
                        .padding(.vertical, 7).padding(.horizontal, 9)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 9))
                        .accessibilityLabel("\(item.number), \(item.name): \(item.family); \(expandedQualities(item.qualities))")
                    }
                }
            }
            HelpSection(title: "Spelling matters") {
                Text("A4 and d5 can span the same number of semitones, but they are named differently because their letters differ. Interval names describe both letter distance and chromatic distance.")
                VStack(spacing: 10) {
                    intervalNotePair(from: "C4", to: "F♯4", interval: named("C", 0, 4, "F", 1, 4))
                    intervalNotePair(from: "C4", to: "G♭4", interval: named("C", 0, 4, "G", -1, 4))
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("C4 to F sharp 4 is augmented fourth ascending; C4 to G flat 4 is diminished fifth ascending")
            }
        }
    }

    private var intervalExamples: some View {
        VStack(spacing: 8) {
            intervalNotePair(from: "C4", to: "E4", interval: named("C", 0, 4, "E", 0, 4))
            intervalNotePair(from: "E4", to: "C4", interval: named("E", 0, 4, "C", 0, 4))
            intervalNotePair(from: "C4", to: "E♭4", interval: named("C", 0, 4, "E", -1, 4))
            intervalNotePair(from: "C4", to: "G4", interval: named("C", 0, 4, "G", 0, 4))
        }
    }

    private func intervalNotePair(from: String, to: String, interval: NamedInterval) -> some View {
        HStack(spacing: 10) {
            Text(from).font(.headline.monospaced())
            Image(systemName: "arrow.right").foregroundStyle(.secondary).accessibilityHidden(true)
            Text(to).font(.headline.monospaced())
            Spacer(minLength: 6)
            Text(interval.shorthand).font(.headline.monospaced()).foregroundStyle(.tint)
        }
        .padding(.vertical, 8).padding(.horizontal, 10)
        .background(Color.accentColor.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(from) to \(to), \(interval.spokenName)")
    }

    private func named(_ fromLetter: Character, _ fromAccidental: Int, _ fromOctave: Int, _ toLetter: Character, _ toAccidental: Int, _ toOctave: Int) -> NamedInterval {
        IntervalAnalysis.named(
            from: SpelledPitch(letter: DiatonicLetter(character: fromLetter)!, accidental: fromAccidental, octave: fromOctave),
            to: SpelledPitch(letter: DiatonicLetter(character: toLetter)!, accidental: toAccidental, octave: toOctave)
        )
    }

    private func expandedQualities(_ qualities: String) -> String {
        qualities.split(separator: " ").map { short in
            let value = String(short)
            let quality: String
            if value.hasPrefix("P") { quality = "perfect" }
            else if value.hasPrefix("M") { quality = "major" }
            else if value.hasPrefix("m") { quality = "minor" }
            else if value.hasPrefix("A") { quality = "augmented" }
            else { quality = "diminished" }
            return "\(quality) \(value.drop(while: { $0.isLetter }))"
        }.joined(separator: ", ")
    }
}

private struct RomanExample: Identifiable {
    let symbol: String
    let meaning: String
    var id: String { symbol + meaning }
}

private struct RomanNumeralsHelpView: View {
    var body: some View {
        HelpArticle(title: "Roman numerals", id: "help.topic.romanNumerals") {
            HelpSection(title: "Root, quality & extensions") {
                Text("Roman numerals name the chord root’s scale position: I = 1, II = 2, III = 3, IV = 4, V = 5, VI = 6, VII = 7. The root is the note from which the chord is built; the bass is the lowest sounding note. They need not be the same.")
                Text("Uppercase normally marks a major chord and lowercase a minor chord. ♭, ♯, ♭♭, and ♯♯ before the numeral alter its root. + marks an augmented triad (1–3–♯5); ° a diminished triad (1–♭3–♭5). °7 adds a diminished seventh (♭♭7), while ø adds a minor seventh (♭7). △ marks a major seventh (7), not merely a major triad.")
                romanRow([
                    .init(symbol: "I", meaning: "major one"), .init(symbol: "ii", meaning: "minor two"), .init(symbol: "♭VII", meaning: "flat seven"), .init(symbol: "♯♯IV", meaning: "double sharp four"),
                    .init(symbol: "V+", meaning: "augmented five"), .init(symbol: "vii°7", meaning: "fully diminished seven"), .init(symbol: "iiø7", meaning: "half-diminished two seven"), .init(symbol: "I△7", meaning: "one major seventh")
                ])
                Text("7, 9, 11, and 13 count chord extensions above the root: a seventh, ninth, eleventh, or thirteenth.")
                romanRow([
                    .init(symbol: "I7", meaning: "one with a seventh"), .init(symbol: "ii9", meaning: "minor two with a ninth"), .init(symbol: "V11", meaning: "five with an eleventh"), .init(symbol: "I13", meaning: "one with a thirteenth")
                ])
            }
            HelpSection(title: "Figures, suspensions & added tones") {
                Text("6 and 64 are triad inversions; 65, 43, and 42 are seventh-chord inversions. These figures describe intervals above the bass, not literal fractions or exponents.")
                figureRow
                Text("sus2 and sus4 replace the third; sus2sus4 combines both labels. add2, add4, add6, add9, add11, and add13 add tones; no3, no5, and grouped (no5no3) omit tones.")
                romanRow([
                    .init(symbol: "Vsus2", meaning: "five with suspended second"), .init(symbol: "Vsus4", meaning: "five with suspended fourth"),
                    .init(symbol: "I(add2)", meaning: "one with added second"), .init(symbol: "I(add6)", meaning: "one with added sixth"), .init(symbol: "I(add13)", meaning: "one with added thirteenth"),
                    .init(symbol: "I(no5no3)", meaning: "one without fifth and third")
                ])
            }
            HelpSection(title: "Alterations, borrowing & applied chords") {
                Text("Alterations appear in parentheses: (♭5), (♯5), (♭9), (♯9), (♯11), (♭13), or combinations. A mode tag below the numeral marks borrowing: min minor, dor Dorian, phr Phrygian, lyd Lydian, mix Mixolydian, loc Locrian, maj major, hmin harmonic minor, phdm Phrygian dominant, or bor for a grouped source.")
                romanRow([
                    .init(symbol: "V7(♭9♯11)", meaning: "five seven with flat nine and sharp eleven"), .init(symbol: "♭VI", meaning: "flat six"), .init(symbol: "iv", meaning: "minor four")
                ])
                FittedRomanNumeral(display: RomanNumeralDisplay(symbol: "iv", borrowedLabel: "(min)"), maximumFontSize: 38, minimumFontSize: 14)
                    .frame(width: 110, height: 65)
                    .accessibilityLabel("Minor four, borrowed from minor")
                Text("A dominant is the chord built on degree 5. A secondary dominant temporarily treats another chord as home: V/V means “five of five.” In C major, D7 can lead to G, so D7 is V7/V. V7/vi similarly points toward the minor chord on degree 6.")
                Text("A leading tone lies one semitone below its target. vii°7/V is a diminished leading-tone seventh chord pointing toward V. Read the slash as “of”: the numeral to its right supplies a temporary reference. A Roman slash therefore does not always mean a secondary dominant, and it is different from a bass-note slash in a letter-name symbol such as C/E.")
                romanRow([
                    .init(symbol: "V/V", meaning: "dominant of five"), .init(symbol: "V7/vi", meaning: "dominant seventh of six"), .init(symbol: "vii°7/V", meaning: "leading-tone seventh of five"), .init(symbol: "♭ii7/V(∆-sub)", meaning: "tritone substitution for five seven")
                ])
                HelpCallout(text: "A tritone substitution replaces a dominant chord with a chord whose root is a tritone away; (∆-sub) names that substitution and is separate from △. (maj) can label borrowing or appear in an applied context such as V7/vi(maj); it does not change vi into a major chord.")
            }
        }
    }

    private var figureRow: some View {
        VStack(spacing: 7) {
            figure(symbol: "I6", bass: "third in bass", meaning: "first inversion triad")
            figure(symbol: "I64", bass: "fifth in bass", meaning: "second inversion triad")
            figure(symbol: "V65", bass: "third in bass", meaning: "first inversion seventh chord")
            figure(symbol: "V43", bass: "fifth in bass", meaning: "second inversion seventh chord")
            figure(symbol: "V42", bass: "seventh in bass", meaning: "third inversion seventh chord")
        }
    }

    private func figure(symbol: String, bass: String, meaning: String) -> some View {
        HStack(spacing: 12) {
            FittedRomanNumeral(display: RomanNumeralDisplay(symbol: symbol), maximumFontSize: 30, minimumFontSize: 12)
                .frame(width: 78, height: 42)
            VStack(alignment: .leading, spacing: 1) {
                Text(bass).font(.subheadline.weight(.semibold))
                Text(meaning).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6).padding(.horizontal, 8)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 9))
        .accessibilityElement(children: .combine)
    }

    private func romanRow(_ examples: [RomanExample]) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
            ForEach(examples) { example in
                VStack(spacing: 3) {
                    FittedRomanNumeral(display: RomanNumeralDisplay(symbol: example.symbol), maximumFontSize: 38, minimumFontSize: 16)
                        .frame(height: 58)
                    Text(example.meaning).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, minHeight: 68)
                .padding(.horizontal, 3).padding(.vertical, 4)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 9))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(example.symbol): \(example.meaning)")
            }
        }
    }
}

private struct ModePattern: Identifiable {
    let name: String
    let tag: String
    let degrees: [String]
    var id: String { tag }
}

private struct ModesHelpView: View {
    private let patterns = [
        ModePattern(name: "Ionian (major)", tag: "maj", degrees: ["1", "2", "3", "4", "5", "6", "7"]),
        ModePattern(name: "Dorian", tag: "dor", degrees: ["1", "2", "♭3", "4", "5", "6", "♭7"]),
        ModePattern(name: "Phrygian", tag: "phr", degrees: ["1", "♭2", "♭3", "4", "5", "♭6", "♭7"]),
        ModePattern(name: "Lydian", tag: "lyd", degrees: ["1", "2", "3", "♯4", "5", "6", "7"]),
        ModePattern(name: "Mixolydian", tag: "mix", degrees: ["1", "2", "3", "4", "5", "6", "♭7"]),
        ModePattern(name: "Aeolian (minor)", tag: "min", degrees: ["1", "2", "♭3", "4", "5", "♭6", "♭7"]),
        ModePattern(name: "Locrian", tag: "loc", degrees: ["1", "♭2", "♭3", "4", "♭5", "♭6", "♭7"]),
        ModePattern(name: "Harmonic minor", tag: "hmin", degrees: ["1", "2", "♭3", "4", "5", "♭6", "7"]),
        ModePattern(name: "Phrygian dominant", tag: "phdm", degrees: ["1", "♭2", "3", "4", "5", "♭6", "♭7"])
    ]

    var body: some View {
        HelpArticle(title: "Modes, borrowing & major lock", id: "help.topic.modes") {
            HelpSection(title: "Modal contexts") {
                Text("A mode is a scale pattern with its own home note and arrangement of steps. These patterns compare each mode with major on the same tonic. The tag is the abbreviation shown below a borrowed Roman numeral.")
                VStack(spacing: 8) {
                    ForEach(patterns) { pattern in modeRow(pattern) }
                }
                Text("The flats and sharps above describe differences from major. Within the chosen mode itself, its seven notes are still numbered 1 through 7.")
                Text("Parallel modes share a tonic: C major and C minor both have C as home. Relative modes share notes but have different home notes: C major and A natural minor. A borrowed chord uses notes from a parallel mode; for example, minor iv in C major borrows F–A♭–C from C minor.")
            }
            HelpSection(title: "Major lock") {
                Text("The lock keeps the section’s initial relative major as the reference, even if the music later changes key. The note and chord labels change to that reference; a minor chord remains minor.")
                VStack(alignment: .leading, spacing: 8) {
                    notationComparison(left: "A–C–E in A minor", right: "1–3–5")
                    notationComparison(left: "A–C–E in locked C major", right: "6–1–3")
                    notationComparison(left: "i in A minor", right: "vi in C major")
                }
                Text("Individual previews can move by an octave to stay playable, so a lock does not promise every register remains unchanged.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private func notationComparison(left: String, right: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(left).font(.subheadline)
            Spacer(minLength: 8)
            Text(right).font(.headline.monospaced()).foregroundStyle(.tint)
        }
        .padding(.vertical, 8).padding(.horizontal, 10)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
    }

    private func modeRow(_ pattern: ModePattern) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(pattern.name).font(.subheadline.weight(.semibold))
                Spacer()
                Text("(\(pattern.tag))").font(.caption.monospaced()).foregroundStyle(.secondary)
            }
            HStack(spacing: 3) {
                ForEach(pattern.degrees, id: \.self) { degree in
                    FittedScaleDegree(degree, maximumFontSize: 20, minimumFontSize: 9)
                        .frame(maxWidth: .infinity)
                        .frame(height: 28)
                }
            }
        }
        .padding(.vertical, 7).padding(.horizontal, 9)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 9))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(pattern.name), tag \(pattern.tag): \(pattern.degrees.joined(separator: ", "))")
    }
}

private struct TessituraHelpView: View {
    var body: some View {
        HelpArticle(title: "Tessitura", id: "help.topic.tessitura") {
            HelpSection(title: "Your comfortable octave") {
                Text("Tessitura is the register where your voice feels comfortable. Choose Set, then sing or hum a comfortable pitch until the countdown completes. Keep voicing for three seconds; after silence, the countdown may restart.")
                HStack(spacing: 12) {
                    octaveCard("C5", caption: "original target")
                    Image(systemName: "arrow.right").foregroundStyle(.secondary).accessibilityHidden(true)
                    octaveCard("C4", caption: "comfortable target")
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Example octave adjustment: original target C5, comfortable target C4")
            }
            HelpSection(title: "What changes") {
                Text("Targets may shift by octaves while keeping the same note identity. C4 and C5 are both C, one octave apart. This makes singing targets fit your range without changing the musical role being practiced.")
                HelpCallout(text: "Clear removes the octave adjustment and preserves your recordings.")
            }
        }
    }

    private func octaveCard(_ pitch: String, caption: String) -> some View {
        VStack(spacing: 6) {
            QuizExampleCard(showsPitchHint: false) {
                Text(pitch).font(.title2.monospaced().weight(.bold))
            }
            Text(caption).font(.caption).foregroundStyle(.secondary)
        }
    }
}

#Preview("Help") {
    NavigationStack { HelpView() }
}
