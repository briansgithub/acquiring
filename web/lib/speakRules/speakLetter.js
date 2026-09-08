import { getChordLetterName } from '../jsonToSymbol.js';
import { buildSpeakParts } from './buildParts.js';

const NOTE_NAMES = {
  C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', A: 'A', B: 'B',
};
const NUMBER_WORDS = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six',
  7: 'seven', 9: 'nine', 11: 'eleven', 13: 'thirteen',
};

function speakModifier(token) {
  const match = token.match(/^(add|no)?([#b]*)(\d+)$/);
  if (!match) return token;
  const [, kind, accidental, number] = match;
  if (kind === 'no') return `no ${{ 3: 'third', 5: 'fifth' }[number] || NUMBER_WORDS[number] || number}`;
  const words = [...accidental].map(value => value === '#' ? 'sharp' : 'flat');
  // Retain established alteration readings; additions and suspensions use
  // number words so their musical operation remains explicit.
  words.push(kind === 'add' ? NUMBER_WORDS[number] || number : number);
  return [kind, ...words].filter(Boolean).join(' ');
}

export function speakNoteName(note) {
  if (!note) return '';
  const m = note.match(/^([A-Ga-g])([#bx]*)/);
  if (!m) return note;
  const letter = NOTE_NAMES[m[1].toUpperCase()] || m[1].toUpperCase();
  const acc = m[2] || '';
  const words = [letter];
  for (const ch of acc) {
    if (ch === '#') words.push('sharp');
    else if (ch === 'b') words.push('flat');
    else if (ch === 'x') words.push('double sharp');
  }
  return words.join(' ');
}

/** Speak a letter chord symbol like "F#m7/E" or "D9(#11)". */
export function speakLetterSymbol(letterSymbol) {
  if (!letterSymbol) return '';
  // A 6/9 suffix is an extension, while a slash followed by a note is a bass.
  const bassMatch = letterSymbol.match(/\/([A-Ga-g][#bx]*)$/);
  const bass = bassMatch?.[1];
  const head = bassMatch ? letterSymbol.slice(0, bassMatch.index) : letterSymbol;
  const parens = [];
  const body = head.replace(/\(([^)]+)\)/g, (_, inner) => {
    for (const token of inner.match(/(?:add|no)?[#b]*(?:13|11|9|[1-7])/g) || [inner]) {
      parens.push(speakModifier(token));
    }
    return '';
  });

  const rootMatch = body.match(/^([A-Ga-g][#bx]*)/);
  const rootSpoken = rootMatch ? speakNoteName(rootMatch[1]) : '';
  const rest = body.slice(rootMatch?.[0]?.length || 0);
  const qualityBody = rest.replace(/sus[#b]*[24]/g, '');
  const quality = [];
  if (qualityBody.includes('°')) quality.push('diminished');
  if (qualityBody.includes('ø')) quality.push('half-diminished');
  if (qualityBody.includes('+')) quality.push('augmented');
  if (/^5/.test(qualityBody)) quality.push('five');
  else if (/^m(?!aj)/.test(qualityBody)) quality.push('minor');
  const extMatch = qualityBody.match(/(maj)?(13|11|9|7|6\/9|6)/);
  if (extMatch) {
    if (extMatch[1]) quality.push('major');
    quality.push(extMatch[2] === '6/9' ? 'six nine' : NUMBER_WORDS[extMatch[2]]);
  }
  const suspensions = [...rest.matchAll(/sus([#b]*)([24])/g)].sort((a, b) => Number(a[2]) - Number(b[2]));
  for (const [, accidental, degree] of suspensions) {
    quality.push(['suspended', ...[...accidental].map(value => value === '#' ? 'sharp' : 'flat'), NUMBER_WORDS[degree]].join(' '));
  }

  const words = [rootSpoken, ...quality, ...parens];
  if (bass) words.push('over', speakNoteName(bass));
  return words.filter(Boolean).join(' ');
}

export function speakLetterChord(chord, key) {
  const letterName = getChordLetterName(chord, key);
  const spoken = speakLetterSymbol(letterName);
  if (!/^[A-Ga-g][#bx]*$/.test(letterName || '')) return spoken;

  const { parts } = buildSpeakParts(chord, key);
  if (!parts) return spoken;

  const tail = [];
  if (parts.caseQuality) tail.push(parts.caseQuality);
  for (const g of parts.glyphs) {
    if (g === 'augmented' || g === 'half-diminished' || g === 'major seven') tail.push(g);
  }

  return [spoken, ...tail].filter(Boolean).join(' ');
}
