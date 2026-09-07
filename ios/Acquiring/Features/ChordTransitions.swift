import AcquiringCore
import Foundation
import SwiftUI

/// One adjacent chord pair from a section's progression, with how often it recurs.
/// Mirrors the web player's `computeChordTransitions` entries (`web/player.js`).
struct ChordTransition: Identifiable {
    let id: String
    let from: SongDetailChord
    let to: SongDetailChord
    let count: Int
    let firstBeat: Double
}

enum ChordTransitionPresentation {
    /// Frequency-ranked adjacent transitions for a section.
    ///
    /// Matches the web behavior: rests are dropped, immediate repeats of the same chord are not a
    /// transition, and ties are broken by first occurrence so the ordering is stable across renders.
    static func transitions(in section: ExtractedSection, rootOnly: Bool) -> [ChordTransition] {
        let sequence = SongDetailPresentation.progression(in: section)
            .filter { !$0.isRest && !$0.notes.isEmpty && $0.roman != "—" }
        guard sequence.count > 1 else { return [] }

        var counts: [String: Int] = [:]
        var firstSeen: [String: (from: SongDetailChord, to: SongDetailChord, beat: Double)] = [:]
        var order: [String] = []

        for (previous, current) in zip(sequence, sequence.dropFirst()) {
            let fromLabel = identity(of: previous, rootOnly: rootOnly)
            let toLabel = identity(of: current, rootOnly: rootOnly)
            guard fromLabel != toLabel else { continue }
            let id = "\(fromLabel) → \(toLabel)"
            counts[id, default: 0] += 1
            if firstSeen[id] == nil {
                firstSeen[id] = (previous, current, current.beat == 0 ? 1 : current.beat)
                order.append(id)
            }
        }

        return order
            .compactMap { id -> ChordTransition? in
                guard let seen = firstSeen[id], let count = counts[id] else { return nil }
                return ChordTransition(
                    id: id,
                    from: seen.from,
                    to: seen.to,
                    count: count,
                    firstBeat: seen.beat
                )
            }
            .sorted {
                if $0.count != $1.count { return $0.count > $1.count }
                if $0.firstBeat != $1.firstBeat { return $0.firstBeat < $1.firstBeat }
                return $0.id < $1.id
            }
    }

    /// Root-only mode collapses voicings and qualities down to the scale degree, as the web's
    /// "Root Only" checkbox does.
    static func identity(of chord: SongDetailChord, rootOnly: Bool) -> String {
        rootOnly ? String(chord.source["root"]?.intValue ?? 0) : chord.roman
    }

    /// Spoken label for accessibility, where the fitted notation glyphs render as a Canvas.
    static func spokenName(for chord: SongDetailChord, rootOnly: Bool) -> String {
        if rootOnly { return "degree \(chord.source["root"]?.intValue ?? 0)" }
        return chord.letter.isEmpty ? chord.roman : chord.letter
    }
}

/// The Chords tab's transition list — the iOS counterpart of the web chord-ring's
/// "Chord Transitions" overlay panel.
struct ChordTransitionsSection: View {
    let section: ExtractedSection
    let showsLetterNames: Bool
    @Binding var rootOnly: Bool
    let onPlay: (ChordTransition) -> Void
    @State private var isExpanded = true

    private var transitions: [ChordTransition] {
        ChordTransitionPresentation.transitions(in: section, rootOnly: rootOnly)
    }

    /// The section only exists when the progression actually moves. Gauged on full mode so that
    /// toggling Root Only can never strand the user with the toggle hidden.
    private var hasAnyTransitions: Bool {
        !ChordTransitionPresentation.transitions(in: section, rootOnly: false).isEmpty
    }

    var body: some View {
        if hasAnyTransitions {
            DisclosureGroup("Chord Transitions", isExpanded: $isExpanded) {
                VStack(alignment: .leading, spacing: 8) {
                    Toggle("Root only", isOn: $rootOnly)
                        .accessibilityIdentifier("songDetail.chords.transitions.rootOnly")
                    let rows = transitions
                    if rows.isEmpty {
                        Text("Every root repeats in this section.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                            transitionRow(row, index: index)
                        }
                    }
                }
                .padding(.top, 8)
            }
            .font(.subheadline.weight(.medium))
            .accessibilityIdentifier("songDetail.chords.transitions")
        }
    }

    private func transitionRow(_ row: ChordTransition, index: Int) -> some View {
        Button {
            onPlay(row)
        } label: {
            HStack(spacing: 10) {
                chordLabel(row.from)
                Image(systemName: "arrow.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                chordLabel(row.to)
                Spacer(minLength: 8)
                Text("×\(row.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            "Play \(ChordTransitionPresentation.spokenName(for: row.from, rootOnly: rootOnly))"
            + " to \(ChordTransitionPresentation.spokenName(for: row.to, rootOnly: rootOnly))"
            + ", \(row.count) times"
        )
        .accessibilityIdentifier("songDetail.chords.transitions.row.\(index)")
    }

    @ViewBuilder
    private func chordLabel(_ chord: SongDetailChord) -> some View {
        Group {
            if rootOnly {
                FittedScaleDegree(
                    String(chord.source["root"]?.intValue ?? 0),
                    maximumFontSize: 22,
                    minimumFontSize: 11
                )
            } else if showsLetterNames, !chord.letter.isEmpty {
                Text(chord.letter)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            } else {
                FittedRomanNumeral(
                    display: RomanNumeralDisplay(
                        symbol: chord.roman,
                        borrowed: chord.source["borrowed"]
                    ),
                    maximumFontSize: 22,
                    minimumFontSize: 11
                )
            }
        }
        .frame(width: 56, height: 28)
    }
}
