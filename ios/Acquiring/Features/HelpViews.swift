import AcquiringCore
import SwiftUI

/// Offline reference for the notation shown on quiz cards and in song analysis.
struct HelpView: View {
    var body: some View {
        List {
            Section {
                HelpTopicLink(
                    id: "help.topic.instructions",
                    title: "Instructions",
                    detail: "How to use quiz cards and singing practice"
                ) { IntroductionView() }
                HelpTopicLink(
                    id: "help.topic.scaleDegrees",
                    title: "Scale degrees",
                    detail: "Numbers, accidentals, and chord-tone reference"
                ) { ScaleDegreesHelpView() }
                HelpTopicLink(
                    id: "help.topic.intervals",
                    title: "Intervals",
                    detail: "Abbreviations, names, and semitone distances"
                ) { IntervalsHelpView() }
                HelpTopicLink(
                    id: "help.topic.romanNumerals",
                    title: "Roman numerals",
                    detail: "Chord quality, figures, alterations, and applied chords"
                ) { RomanNumeralsHelpView() }
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

private struct IntervalsHelpView: View {
    private let shorthand = [
        ("P1", "Perfect unison", 0), ("m2", "Minor second", 1),
        ("M2", "Major second", 2), ("m3", "Minor third", 3),
        ("M3", "Major third", 4), ("P4", "Perfect fourth", 5),
        ("A4", "Augmented fourth", 6), ("d5", "Diminished fifth", 6),
        ("P5", "Perfect fifth", 7), ("m6", "Minor sixth", 8),
        ("M6", "Major sixth", 9), ("m7", "Minor seventh", 10),
        ("M7", "Major seventh", 11), ("P8", "Perfect octave", 12)
    ]

    var body: some View {
        HelpArticle(title: "Intervals", id: "help.topic.intervals") {
            Text("P = perfect, M = major, m = minor, A = augmented, and d = diminished.")
                .foregroundStyle(.secondary)
            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 8) {
                GridRow {
                    Text("Abbrev.").font(.subheadline.weight(.bold))
                    Text("Meaning").font(.subheadline.weight(.bold))
                    Text("Semitones").font(.subheadline.weight(.bold))
                }
                Divider().gridCellColumns(3)
                ForEach(shorthand, id: \.0) { interval in
                    GridRow {
                        Text(interval.0).font(.body.monospaced().weight(.semibold))
                        Text(interval.1)
                        Text("\(interval.2)").monospacedDigit()
                    }
                    .accessibilityLabel("\(interval.0), \(interval.1), \(interval.2) semitones")
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
        }
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
