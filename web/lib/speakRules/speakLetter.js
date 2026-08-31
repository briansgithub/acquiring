import { getChordLetterName } from '../jsonToSymbol.js';
import { buildSpeakParts } from './buildParts.js';

const NOTE_NAMES = {
  C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', A: 'A', B: 'B',
};

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
  const [head, bass] = letterSymbol.split('/');
  let body = head;
  const parenMatch = body.match(/^(.+?)(\([^)]+\))+$/);
  const parens = [];
  if (parenMatch) {
    body = parenMatch[1];
    const tags = head.slice(body.length).match(/\([^)]+\)/g) || [];
    for (const tag of tags) {
      const inner = tag.slice(1, -1);
      for (const tok of inner.match(/[b#]?\d+|#11|b13|#13|b5|#5|b9|#9/g) || [inner]) {
        if (tok.startsWith('b')) parens.push(`flat ${tok.slice(1)}`);
        else if (tok.startsWith('#')) parens.push(`sharp ${tok.slice(1)}`);
        else parens.push(tok);
      }
    }
  }

  const rootMatch = body.match(/^([A-Ga-g][#bx]*)/);
  const rootSpoken = rootMatch ? speakNoteName(rootMatch[1]) : '';
  let rest = body.slice(rootMatch?.[0]?.length || 0);
  const quality = [];
  if (rest.includes('°')) quality.push('diminished');
  if (rest.includes('ø')) quality.push('half-diminished');
  if (rest.includes('+')) quality.push('augmented');
  if (/^5/.test(rest)) quality.push('five');
  else if (/maj7/.test(rest)) quality.push('major seven');
  else if (/m/.test(rest) && !/maj/.test(rest)) quality.push('minor');
  const extMatch = rest.match(/(7|9|11|13)/);
  if (extMatch && !/maj7/.test(rest)) {
    const extWords = { 7: 'seven', 9: 'nine', 11: 'eleven', 13: 'thirteen' };
    quality.push(extWords[extMatch[1]] || extMatch[1]);
  }
  if (/sus2/.test(rest)) quality.push('suspended two');
  if (/sus4/.test(rest)) quality.push('suspended four');

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
