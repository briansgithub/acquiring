import {
  MAJOR_SCALE_CHORD_QUALITIES,
  MINOR_SCALE_CHORD_QUALITIES,
  DORIAN_SCALE_CHORD_QUALITIES,
  PHRYGIAN_SCALE_CHORD_QUALITIES,
  LYDIAN_SCALE_CHORD_QUALITIES,
  MIXOLYDIAN_SCALE_CHORD_QUALITIES,
  LOCRIAN_SCALE_CHORD_QUALITIES,
  HARMONIC_MINOR_SCALE_CHORD_QUALITIES,
  PHRYGIAN_DOMINANT_SCALE_CHORD_QUALITIES,
  ROMAN_NUMERALS_MAJOR,
  ROMAN_NUMERALS_MINOR,
  ROMAN_NUMERALS_DORIAN,
  ROMAN_NUMERALS_PHRYGIAN,
  ROMAN_NUMERALS_LYDIAN,
  ROMAN_NUMERALS_MIXOLYDIAN,
  ROMAN_NUMERALS_LOCRIAN,
  ROMAN_NUMERALS_HARMONIC_MINOR,
  ROMAN_NUMERALS_PHRYGIAN_DOMINANT,
} from '../scales.js';
import { getNoteLabel } from '../music.js';

const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BORROWED_TAG = {
  minor: 'min', dorian: 'dor', phrygian: 'phr',
  lydian: 'lyd', mixolydian: 'mix', locrian: 'loc', major: 'maj',
  harmonicMinor: 'hmin', phrygianDominant: 'phdm',
};
const SUPPORTED_BORROWED = new Set([
  'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
  'major', 'harmonicMinor', 'phrygianDominant',
]);

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function getChordQualitiesForScale(scaleType) {
  const map = {
    minor: MINOR_SCALE_CHORD_QUALITIES,
    dorian: DORIAN_SCALE_CHORD_QUALITIES,
    phrygian: PHRYGIAN_SCALE_CHORD_QUALITIES,
    lydian: LYDIAN_SCALE_CHORD_QUALITIES,
    mixolydian: MIXOLYDIAN_SCALE_CHORD_QUALITIES,
    locrian: LOCRIAN_SCALE_CHORD_QUALITIES,
    harmonicMinor: HARMONIC_MINOR_SCALE_CHORD_QUALITIES,
    phrygianDominant: PHRYGIAN_DOMINANT_SCALE_CHORD_QUALITIES,
  };
  return map[scaleType] || MAJOR_SCALE_CHORD_QUALITIES;
}

function getRomanNumeralsForScale(scaleType) {
  const map = {
    minor: ROMAN_NUMERALS_MINOR,
    dorian: ROMAN_NUMERALS_DORIAN,
    phrygian: ROMAN_NUMERALS_PHRYGIAN,
    lydian: ROMAN_NUMERALS_LYDIAN,
    mixolydian: ROMAN_NUMERALS_MIXOLYDIAN,
    locrian: ROMAN_NUMERALS_LOCRIAN,
    harmonicMinor: ROMAN_NUMERALS_HARMONIC_MINOR,
    phrygianDominant: ROMAN_NUMERALS_PHRYGIAN_DOMINANT,
  };
  return map[scaleType] || ROMAN_NUMERALS_MAJOR;
}

function noteToPc(note) {
  const m = (note || '').match(/^([A-Ga-g])(.*)$/);
  if (!m) return null;
  let pc = NOTE_BASE[m[1].toUpperCase()];
  for (const ch of m[2]) {
    if (ch === '#') pc += 1;
    else if (ch === 'b') pc -= 1;
    else if (ch === 'x') pc += 2;
  }
  return ((pc % 12) + 12) % 12;
}

function isMajorSeventh(degree, effKey) {
  try {
    const root = getNoteLabel(degree, effKey);
    const seventhDeg = ((degree - 1 + 6) % 7) + 1;
    const sev = getNoteLabel(seventhDeg, effKey);
    const r = noteToPc(root);
    const s = noteToPc(sev);
    if (r == null || s == null) return false;
    return ((s - r + 12) % 12) === 11;
  } catch {
    return false;
  }
}

function customArrayTriadQuality(arr, degree) {
  const at = (i) => arr[(((i - 1) % 7) + 7) % 7];
  const r = at(degree);
  let third = at(degree + 2) - r;
  let fifth = at(degree + 4) - r;
  third = ((third % 12) + 12) % 12;
  fifth = ((fifth % 12) + 12) % 12;
  if (third === 4 && fifth === 7) return 'major';
  if (third === 3 && fifth === 7) return 'minor';
  if (third === 3 && fifth === 6) return 'diminished';
  if (third === 4 && fifth === 8) return 'augmented';
  return third <= 3 ? 'minor' : 'major';
}

function customArrayPrefix(arr, degree) {
  const diff = arr[degree - 1] - MAJOR_OFFSETS[degree - 1];
  if (diff === -1) return '♭';
  if (diff === -2) return '♭♭';
  if (diff === 1) return '♯';
  if (diff === 2) return '♯♯';
  return '';
}

function customArraySeventhMajor(arr, degree) {
  const at = (i) => arr[(((i - 1) % 7) + 7) % 7];
  const iv = (((at(degree + 6) - at(degree)) % 12) + 12) % 12;
  return iv === 11;
}

function accidentalValue(note) {
  if (/bb/.test(note)) return -2;
  if (/x|##/.test(note)) return 2;
  if (note.includes('b')) return -1;
  if (note.includes('#')) return 1;
  return 0;
}

function borrowedPrefix(degree, key, borrowedScale) {
  try {
    const borrowedNote = getNoteLabel(degree, { tonic: key.tonic, scale: borrowedScale });
    const refNote = getNoteLabel(degree, { tonic: key.tonic, scale: key.scale || 'major' });
    const diff = accidentalValue(borrowedNote) - accidentalValue(refNote);
    if (diff === -1) return '♭';
    if (diff === -2) return '♭♭';
    if (diff === 1) return '♯';
    if (diff === 2) return '♯♯';
  } catch { /* fall through */ }
  return '';
}

/** Resolve semantic chord context mirroring jsonToSymbol branches. */
export function resolveChordContext(chord, key) {
  if (!chord || !chord.root) return null;

  const ctx = {
    degree: chord.root,
    appliedDegree: null,
    denominatorDegree: null,
    quality: 'major',
    prefix: '',
    borrowedMode: null,
    borrowedTag: null,
    isApplied: false,
    fullyDiminished: false,
    majorSeventh: false,
    isCustomBorrowed: false,
  };

  if (chord.applied && chord.applied >= 1 && chord.applied <= 7) {
    ctx.isApplied = true;
    ctx.appliedDegree = chord.applied;
    ctx.denominatorDegree = chord.root;
    ctx.degree = chord.applied;
    ctx.quality = MAJOR_SCALE_CHORD_QUALITIES[chord.applied - 1];
    ctx.fullyDiminished = chord.applied === 7;
    const targetTonic = getNoteLabel(chord.root, key);
    const numeratorKey = { tonic: targetTonic, scale: 'major' };
    ctx.majorSeventh = chord.type >= 7 && isMajorSeventh(chord.applied, numeratorKey);
    ctx.denominatorQuality = getChordQualitiesForScale(key.scale)[chord.root - 1] || 'major';
    return ctx;
  }

  const borrowed = chord.borrowed;
  let scale = key.scale;

  if (typeof borrowed === 'string' && borrowed && BORROWED_TAG[borrowed]) {
    ctx.borrowedMode = borrowed;
    ctx.borrowedTag = BORROWED_TAG[borrowed];
    if (SUPPORTED_BORROWED.has(borrowed)) {
      scale = borrowed;
      ctx.prefix = borrowedPrefix(chord.root, key, borrowed);
    }
  } else if (Array.isArray(borrowed)) {
    ctx.isCustomBorrowed = true;
    ctx.borrowedTag = 'bor';
    ctx.quality = customArrayTriadQuality(borrowed, chord.root);
    ctx.prefix = customArrayPrefix(borrowed, chord.root);
    ctx.majorSeventh = chord.type >= 7 && ctx.quality !== 'diminished'
      && customArraySeventhMajor(borrowed, chord.root);
    return ctx;
  }

  const qualities = getChordQualitiesForScale(scale);
  ctx.quality = (chord.root >= 1 && chord.root <= 7) ? qualities[chord.root - 1] : 'major';
  ctx.majorSeventh = chord.type >= 7 && ctx.quality !== 'diminished'
    && isMajorSeventh(chord.root, { tonic: key.tonic, scale });
  ctx.romanNumerals = getRomanNumeralsForScale(key.scale);
  return ctx;
}

export function denominatorDegreeWord(chord, key) {
  const romans = getRomanNumeralsForScale(key.scale);
  const roman = romans[chord.root - 1] || '';
  const m = roman.match(/[ivxIVX]+/);
  return m ? m[0] : roman;
}
