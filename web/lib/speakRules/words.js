/** Spoken word tables for chord pronunciation. */

export const DEGREE_WORDS = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
};

export const EXTENSION_WORDS = {
  7: 'seven',
  9: 'nine',
  11: 'eleven',
  13: 'thirteen',
};

export const FIGURED_ANALYTIC = {
  6: ['six'],
  64: ['six', 'four'],
  65: ['six', 'five'],
  43: ['four', 'three'],
  42: ['four', 'two'],
};

export const BORROWED_SPOKEN = {
  minor: 'minor',
  dorian: 'dorian',
  phrygian: 'phrygian',
  lydian: 'lydian',
  mixolydian: 'mixolydian',
  locrian: 'locrian',
  major: 'major',
  harmonicMinor: 'harmonic minor',
  phrygianDominant: 'phrygian dominant',
  bor: 'custom scale',
};

export const ALTERATION_WORDS = {
  b5: 'flat five',
  '#5': 'sharp five',
  b9: 'flat nine',
  '#9': 'sharp nine',
  9: 'nine',
  '#11': 'sharp eleven',
  11: 'eleven',
  b13: 'flat thirteen',
  '#13': 'sharp thirteen',
  '#2': 'sharp two',
  2: 'two',
  3: 'three',
  '#3': 'sharp three',
  '#23': 'sharp two three',
  b2: 'flat two',
  b3: 'flat three',
  5: 'five',
};

export const OMIT_WORDS = {
  3: 'no third',
  5: 'no fifth',
};

export function speakAccidentalPrefix(prefix) {
  if (!prefix) return [];
  const out = [];
  for (const ch of prefix) {
    if (ch === '♭') out.push('flat');
    else if (ch === '♯') out.push('sharp');
  }
  return out;
}

export function speakDegree(degree) {
  return DEGREE_WORDS[degree] || String(degree);
}

export function speakExtension(type) {
  return EXTENSION_WORDS[type] || String(type);
}

export function speakAlteration(token) {
  if (ALTERATION_WORDS[token]) return ALTERATION_WORDS[token];
  const m = String(token).match(/^([#b]?)(\d+)$/);
  if (m) {
    const acc = m[1] === '#' ? 'sharp ' : m[1] === 'b' ? 'flat ' : '';
    const n = EXTENSION_WORDS[Number(m[2])] || ADD_WORDS[Number(m[2])] || m[2];
    return `${acc}${n}`.trim();
  }
  return token;
}

export const ADD_WORDS = {
  2: 'two',
  4: 'four',
  6: 'six',
  9: 'nine',
  11: 'eleven',
  13: 'thirteen',
};

export function speakAdd(value, chordType) {
  const n = (value <= 6 && chordType >= 7) ? value + 7 : value;
  return `add ${ADD_WORDS[n] || EXTENSION_WORDS[n] || n}`;
}

export function speakSus(value) {
  return `suspended ${value === 2 ? 'two' : value === 4 ? 'four' : value}`;
}

/** Applied-chord denominator: degree + quality, e.g. "two diminished". */
export function speakAppliedTarget(degree, quality) {
  const words = [speakDegree(degree)];
  if (quality === 'minor') words.push('minor');
  else if (quality === 'diminished') words.push('diminished');
  else if (quality === 'augmented') words.push('augmented');
  return words.join(' ');
}
