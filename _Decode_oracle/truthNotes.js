/**
 * truthNotes.js
 * Derive expected pitch-class sets from letter + Roman + JSON chord object.
 */

const { noteToPc } = require('./svgTruth');
const {
  triadQualityFromLetter, triadQualityFromRoman, seventhKind, extensionsFromType, mergeMods,
} = require('./truthLetterParse');
const { resolveTruthRootPc, isFiguredSixthLetter } = require('./chordRootPc');

const TRIAD_SEMIS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
};

const SEVEN_MAP = { maj7: 11, min7: 10, dim7: 9, halfdim7: 10 };

// Chord extension / alteration semitones above root (Hooktheory conventions).
const EXT_SEMIS = { 9: 14, 11: 17, 13: 21 };
const ALT_SEMIS = {
  b9: 13, '#9': 15, '9': 14,
  '#11': 18, '11': 17, b5: 6, '#5': 8, b13: 20, '#13': 22,
};

function triadSemis(quality, suspensions, omits) {
  let semis = [...TRIAD_SEMIS[quality]];
  if (suspensions.includes(4)) {
    semis = semis.filter((s) => s !== 4 && s !== 3);
    semis.push(quality === 'major' ? 5 : 5);
  } else if (suspensions.includes(2)) {
    semis = semis.filter((s) => s !== 4 && s !== 3);
    semis.push(2);
  }
  if (omits.includes(3)) semis = semis.filter((s) => s !== 3 && s !== 4);
  if (omits.includes(5)) semis = semis.filter((s) => s !== 7);
  return semis;
}

function applyAdds(semis, adds, hasSeventh, chordType = 5) {
  for (const a of adds) {
    const ext = (a <= 6 && hasSeventh) ? a + 7 : a;
    const s = EXT_SEMIS[ext] ?? (ext === 2 ? 2 : ext === 4 ? 5 : ext === 6 ? 9 : null);
    if (s != null && !semis.includes(s)) semis.push(s);
  }
  if (adds.includes(6) && chordType < 7 && !adds.includes(9)) {
    semis = semis.filter((x) => x !== 7);
  }
  return semis;
}

function applyAlts(semis, alterations, quality) {
  for (const a of alterations) {
    const key = String(a).toLowerCase();
    const s = ALT_SEMIS[key];
    if (s == null) continue;
    if (key === 'b5' || key === '#5') {
      semis = semis.filter((x) => x !== 7);
      semis.push(s);
    } else if (key === 'b9' || key === '#9' || key === '9') {
      semis = semis.filter((x) => x !== 14);
      semis.push(s);
    } else if (key === '#11' || key === '11') {
      semis = semis.filter((x) => x !== 17);
      semis.push(s);
    } else {
      semis.push(s);
    }
  }
  return semis;
}

function expectedPcs(truthLetter, roman, chord, key = null) {
  const rootPc = key
    ? resolveTruthRootPc(truthLetter, chord, key)
    : truthLetter?.rootPc;
  if (rootPc == null) return null;
  const romanLower = String(roman || '').toLowerCase();
  const isHalfDim = /ø|m7b5|half/.test(romanLower + (truthLetter?.letter || ''));
  const figuredSix = isFiguredSixthLetter(truthLetter.letter, chord);
  let quality = figuredSix
    ? triadQualityFromRoman(roman)
    : triadQualityFromLetter(truthLetter.letter, roman);
  if (isHalfDim) quality = 'diminished';
  const mods = mergeMods(truthLetter.letter, roman, chord);
  let semis = triadSemis(quality, mods.suspensions, mods.omits);

  const sev = seventhKind(quality, truthLetter.letter, roman, mods.type);
  if (sev) semis.push(SEVEN_MAP[sev]);

  for (const ext of extensionsFromType(mods.type)) {
    if (ext === 11 && (isHalfDim || mods.alterations.some((a) => String(a).toLowerCase() === "b5"))) {
      if (!semis.includes(9)) semis.push(9);
    } else {
      const s = EXT_SEMIS[ext];
      if (s != null) semis.push(s);
    }
  }

  semis = applyAdds(semis, mods.adds, !!sev, mods.type);
  semis = applyAlts(semis, mods.alterations, quality);

  return [...new Set(semis.map((i) => (rootPc + i) % 12))].sort((a, b) => a - b);
}

function pcsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function noteNamesToPcs(names) {
  if (!names?.length) return null;
  return [...new Set(names.map((n) => noteToPc(String(n).replace(/-?\d+$/, ''))).filter((x) => x != null))].sort((a, b) => a - b);
}

function notesExact(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  const norm = (arr) => [...arr].map(String).sort().join(',');
  return norm(a) === norm(b);
}

module.exports = {
  expectedPcs, pcsEqual, noteNamesToPcs, notesExact,
  triadQualityFromLetter, mergeMods,
};
