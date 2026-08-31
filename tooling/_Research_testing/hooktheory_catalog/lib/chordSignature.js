/**
 * Canonical chord signatures and transition counting.
 */

function stableJson(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${k}:${stableJson(value[k])}`).join(',')}}`;
  }
  return String(value);
}

function chordSignature(chord) {
  if (!chord || chord.isRest) return null;
  const parts = [
    chord.root,
    chord.type,
    chord.inversion ?? 0,
    chord.applied ?? 0,
    stableJson(chord.borrowed),
    stableJson(chord.adds || []),
    stableJson(chord.omits || []),
    stableJson(chord.alterations || []),
    stableJson(chord.suspensions || []),
  ];
  return parts.join('|');
}

function computeStatsFromSections(sections) {
  const signatures = [];
  const transitions = new Set();

  for (const section of sections) {
    const chords = (section.chords || []).filter((c) => !c.isRest);
    const sigs = chords.map(chordSignature).filter(Boolean);
    signatures.push(...sigs);
    for (let i = 1; i < sigs.length; i++) {
      transitions.add(`${sigs[i - 1]}->${sigs[i]}`);
    }
  }

  const uniqueChordSet = new Set(signatures);
  return {
    unique_chords: uniqueChordSet.size,
    unique_transitions: transitions.size,
    total_chords: signatures.length,
    section_count: sections.length,
  };
}

module.exports = {
  chordSignature,
  computeStatsFromSections,
};
