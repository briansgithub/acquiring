/**
 * Layer B — Hooktheory voicing policy (when symbol semantics ≠ voiced notes).
 * Layer A diatonic defaults live in scales.js + chordSeventh.js.
 */

/** ø symbol, dim7 voice — catalog Fixes 025–027, 036d. */
const DIM7_BB7_ENTRIES = [
  { scale: "custom", degree: null },
  { scale: "dorian", degree: 6 },
  { scale: "lydian", degree: 4 },
  { scale: "minor", degree: 2 },
  { scale: "phrygian", degree: 5 },
  { scale: "locrian", degree: 1 },
];

export function borrowedModeDimSeventhDegree(chordRootSD, scale, chordQuality, chordType, opts = {}) {
  if (chordType < 7 || chordQuality !== "diminished") return null;
  // Major-key iiø: diatonic quality is minor — falls through to b7. Nat-dim + ø (e.g. minor ii°) → dim7.
  if (!opts.halfDim) {
    for (const entry of DIM7_BB7_ENTRIES) {
      if (scale !== entry.scale) continue;
      if (entry.degree === null || entry.degree === chordRootSD) return "bb7";
    }
    return null;
  }
  for (const entry of DIM7_BB7_ENTRIES) {
    if (scale !== entry.scale) continue;
    if (entry.degree === null || entry.degree === chordRootSD) return "bb7";
  }
  return null;
}

export function isHalfDiminishedIi(chordRootSD, modifiedKey, chordType, useSusFrame, modifierChord) {
  return !useSusFrame
    && chordRootSD === 2
    && modifiedKey.scale === "major"
    && chordType >= 7
    && !!modifierChord?.halfDim;
}

export function enrichModifierChord(modifierChord, chordType, opts = {}) {
  if (!modifierChord) return null;
  let alterations = [...(modifierChord.alterations || [])];
  // Custom-array ø: HT voices without implicit b9; ø7/ø11 need explicit b5 on minor frame.
  if (opts.customBorrowed && modifierChord.halfDim) {
    alterations = alterations.filter((a) => a !== "b9");
    if (chordType >= 7 && !alterations.includes("b5")) alterations.push("b5");
  } else if (modifierChord.halfDim && chordType >= 9 && !opts.customBorrowed) {
    for (const a of ["b5", "b9"]) {
      if (!alterations.includes(a)) alterations.push(a);
    }
    if (modifierChord.omits?.includes(3) && modifierChord.omits?.includes(5)) {
      const i = alterations.indexOf("b9");
      if (i >= 0) alterations.splice(i, 1);
    }
  }
  if (opts.autoAlterations?.length) {
    for (const a of opts.autoAlterations) {
      if (!alterations.includes(a)) alterations.push(a);
    }
  }
  if (!modifierChord.halfDim && alterations.length === (modifierChord.alterations || []).length
    && !opts.autoAlterations?.length
    && !(opts.customBorrowed && modifierChord.halfDim)) {
    return modifierChord;
  }
  const flattenHalfDimB5 = (opts.customBorrowed && modifierChord.halfDim)
    ? false
    : modifierChord.flattenHalfDimB5;
  return { ...modifierChord, alterations, flattenHalfDimB5 };
}

/**
 * @param {object} ctx
 * @param {object} ctx.key — song key
 * @param {object} ctx.originalKey
 * @param {string|null} ctx.borrowed
 * @param {object} ctx.modifiedKey — borrowed-resolved key
 * @param {number} ctx.chordRootSD
 * @param {number} ctx.chordType
 * @param {number} ctx.inversion
 * @param {string} ctx.chordQuality — diatonic scale quality at degree
 * @param {object|null} ctx.modifierChord
 * @param {boolean} ctx.useSusFrame
 * @param {boolean} ctx.omitTriad35
 */
export function resolveChordPolicy(ctx) {
  const {
    key, originalKey, borrowed, modifiedKey, chordRootSD, chordType, inversion,
    chordQuality, modifierChord, useSusFrame, omitTriad35,
  } = ctx;
  const alterations = modifierChord?.alterations || [];
  const nativePhdmKey = key.scale === "phrygianDominant" && (borrowed === null || borrowed === "");

  const phdmMaj7 = borrowed === "phrygianDominant" && chordRootSD === 6 && !alterations.includes("#5");
  const phdmIImaj7 = nativePhdmKey && chordRootSD === 2 && chordType >= 7 && inversion === 3;
  const sharp5Minor = alterations.includes("#5") && chordQuality === "diminished";
  const halfDimIi = isHalfDiminishedIi(chordRootSD, modifiedKey, chordType, useSusFrame, modifierChord);

  const customBorrowedHalfDim = Array.isArray(borrowed) && modifierChord?.halfDim && chordQuality === "diminished";

  const triadQuality = halfDimIi
    ? "diminished"
    : customBorrowedHalfDim
      ? "minor"
      : modifierChord?.dimTriad
      ? "diminished"
      : sharp5Minor
        ? "minor"
        : phdmMaj7 || phdmIImaj7
          ? "major"
          : (useSusFrame && chordQuality === "diminished" ? "major" : chordQuality);

  const augMaj7Voicing = triadQuality === "augmented" && chordType >= 7 && !useSusFrame && !omitTriad35;
  const minorV13Stack = modifiedKey.scale === "minor"
    && chordType >= 13
    && chordQuality === "minor"
    && chordRootSD === 5
    && !useSusFrame
    && !omitTriad35;

  return {
    triadQuality,
    rootShiftSemitones: phdmIImaj7 ? 1 : 0,
    phdmIImaj7,
    sharp5Minor,
    halfDimIi,
    augMaj7Voicing,
    hmBorrowedMinor7: borrowed === "minor" && originalKey.scale === "harmonicMinor" && chordRootSD === 1,
    customDimMaj7: Array.isArray(borrowed) && chordQuality === "diminished",
    natural11: modifiedKey.scale === "minor" && chordRootSD === 5,
    customBorrowedHalfDim,
    minorV13Stack,
    autoAlterations: minorV13Stack ? ["b9", "b13"] : [],
    skipThirteenth: false,
    dimSeventh: chordType >= 7 && !customBorrowedHalfDim && (
      chordQuality === "diminished"
      || halfDimIi
      || borrowedModeDimSeventhDegree(
        chordRootSD, modifiedKey.scale, chordQuality, chordType,
        { halfDim: modifierChord?.halfDim },
      ) === "bb7"
    ),
  };
}

/** Symbol-layer: is this chord a major seventh (△) in Hooktheory notation? */
export function policyMajorSeventhSymbol(ctx) {
  const { chordType, triadQuality, chordRootSD, effKey, customIntervals, borrowed, degree } = ctx;
  if (chordType < 7 || triadQuality === "diminished" || triadQuality === "augmented") return false;
  if (Array.isArray(borrowed)) {
    return customArraySeventhMajor(borrowed, degree ?? chordRootSD);
  }
  return isMajorSeventhInterval(degree ?? chordRootSD, effKey, customIntervals);
}

function customArraySeventhMajor(arr, degree) {
  const at = (i) => arr[(((i - 1) % 7) + 7) % 7];
  const iv = (((at(degree + 6) - at(degree)) % 12) + 12) % 12;
  return iv === 11;
}

const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToPc(note) {
  const m = (note || "").match(/^([A-Ga-g])(.*)$/);
  if (!m) return null;
  let pc = NOTE_PC[m[1].toUpperCase()];
  for (const ch of m[2]) {
    if (ch === "#") pc += 1;
    else if (ch === "x") pc += 2;
    else if (ch === "b") pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}

function isMajorSeventhInterval(degree, effKey, customIntervals, getNoteLabel) {
  try {
    const r = noteToPc(getNoteLabel(degree, effKey, customIntervals));
    const sevSD = ((degree - 1 + 6) % 7) + 1;
    const s = noteToPc(getNoteLabel(sevSD, effKey, customIntervals));
    if (r == null || s == null) return false;
    return (((s - r) % 12) + 12) % 12 === 11;
  } catch (e) {
    return false;
  }
}

export function isMajorSeventh(degree, effKey, customIntervals, getNoteLabel) {
  return isMajorSeventhInterval(degree, effKey, customIntervals, getNoteLabel);
}
