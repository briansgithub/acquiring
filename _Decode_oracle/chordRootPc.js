/**
 * Resolve chord root pitch-class from JSON chord + key (matches engine scale-degree root).
 */
const { noteToPc } = require('./svgTruth');

const MAJOR_LABELS = {
  C: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  D: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  E: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  F: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
  G: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  A: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  B: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
  'C#': ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'],
  Db: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],
  Eb: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
  'F#': ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'],
  Gb: ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'],
  Ab: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
  Bb: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
};

const BORROWED_SCALE = {
  major: 'major',
  maj: 'major',
  minor: 'minor',
  min: 'minor',
  dorian: 'dorian',
  dor: 'dorian',
  phrygian: 'phrygian',
  phr: 'phrygian',
  lydian: 'lydian',
  mixolydian: 'mixolydian',
  mix: 'mixolydian',
  locrian: 'locrian',
  loc: 'locrian',
  harmonicminor: 'harmonicMinor',
  'harmonic minor': 'harmonicMinor',
};

const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

function normTonic(t) {
  return String(t || 'C').replace(/♭/g, 'b').replace(/♯/g, '#').trim();
}

function scaleNoteAtDegree(tonic, scaleName, sd) {
  const t = normTonic(tonic);
  const ivs = SCALE_INTERVALS[scaleName] || SCALE_INTERVALS.major;
  const rootPc = noteToPc(t);
  if (rootPc == null || sd < 1 || sd > 7) return null;
  return (rootPc + ivs[sd - 1]) % 12;
}

function resolveBorrowedScale(key, borrowed) {
  if (!borrowed) return key;
  const b = String(borrowed).toLowerCase().replace(/[()]/g, '');
  const scale = BORROWED_SCALE[b] || (b.includes('minor') ? 'minor' : key.scale || 'major');
  return { tonic: key.tonic, scale };
}

function customArrayRootPc(tonic, borrowedArray, degree) {
  if (!Array.isArray(borrowedArray) || degree < 1 || degree > 7) return null;
  const tonicPc = noteToPc(normTonic(tonic));
  if (tonicPc == null) return null;
  let offset = borrowedArray[degree - 1];
  if (offset == null) return null;
  if (offset < 0) offset = 12 + offset;
  return (tonicPc + (offset % 12)) % 12;
}

function chordRootPc(chord, key) {
  if (!chord?.root || chord.root < 1 || chord.root > 7) return null;
  if (Array.isArray(chord.borrowed)) {
    return customArrayRootPc(key.tonic, chord.borrowed, chord.root);
  }
  const effKey = resolveBorrowedScale(key, chord.borrowed);
  if (chord.applied && chord.applied >= 1 && chord.applied <= 7) {
    const targetPc = scaleNoteAtDegree(effKey.tonic, effKey.scale || 'major', chord.root);
    if (targetPc == null) return null;
    const targetName = Object.entries(MAJOR_LABELS).find(([, labels]) =>
      noteToPc(labels[chord.root - 1]) === targetPc)?.[1]?.[chord.root - 1];
    if (!targetName) return scaleNoteAtDegree(effKey.tonic, effKey.scale || 'major', chord.applied);
    const appliedKey = { tonic: targetName, scale: 'major' };
    return scaleNoteAtDegree(appliedKey.tonic, 'major', chord.applied);
  }
  return scaleNoteAtDegree(effKey.tonic, effKey.scale || 'major', chord.root);
}

/** Hooktheory "G6" letter = Em7/G (figured-sixth), not a G add-6 chord. */
function isFiguredSixthLetter(letterRaw, chord) {
  if (!letterRaw || !chord?.inversion || chord.inversion < 1) return false;
  if ((chord.type ?? 5) < 7) return false;
  const s = String(letterRaw).split('/')[0].replace(/\([^)]*\)/g, '');
  return /^[A-Ga-g][b#x]*6$/.test(s);
}

/** Prefer JSON scale-degree root when slash letter disagrees (Hooktheory X/bass layout). */
function resolveTruthRootPc(letterParsed, chord, key) {
  const jsonPc = chordRootPc(chord, key);
  if (jsonPc == null) return letterParsed?.rootPc ?? null;
  if (isFiguredSixthLetter(letterParsed?.letter, chord)) return jsonPc;
  if (letterParsed?.bassName && letterParsed.rootPc != null && letterParsed.rootPc !== jsonPc) {
    return jsonPc;
  }
  return letterParsed?.rootPc ?? jsonPc;
}

module.exports = { chordRootPc, resolveTruthRootPc, scaleNoteAtDegree, isFiguredSixthLetter };
