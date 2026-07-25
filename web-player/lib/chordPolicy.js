/**
 * Layer B — Hooktheory voicing policy (when symbol semantics ≠ voiced notes).
 * Layer A diatonic defaults live in scales.js + chordSeventh.js.
 *
 * Invariant (symbol-frame): halfDim / dimTriad / explicit alts choose voicing frame;
 * borrowed scale quality chooses root spelling and roman prefix only.
 */

import {
  matchesDim7Bb7,
  matchesHalfDimM6Stack,
  lookupTriadFrameOverride,
} from "./borrowedVoicingRules.js";

export function borrowedModeDimSeventhDegree(chordRootSD, scale, chordQuality, chordType, opts = {}) {
  return matchesDim7Bb7(chordRootSD, scale, chordQuality, chordType, opts) ? "bb7" : null;
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
    if (!alterations.includes("b5")) alterations.push("b5");
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
    : (modifierChord.flattenHalfDimB5 ?? (modifierChord.halfDim && alterations.includes('b5') && chordType <= 7));
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
  const triadOverride = lookupTriadFrameOverride({
    key, borrowed, modifiedKey, chordRootSD, chordType, inversion, modifierChord,
  });
  const phdmMaj7 = triadOverride?.id === "phdmBVImaj7";
  const phdmIImaj7 = triadOverride?.id === "nativePhdmIImaj7";
  const sharp5Minor = alterations.includes("#5") && chordQuality === "diminished";
  const halfDimIi = isHalfDiminishedIi(chordRootSD, modifiedKey, chordType, useSusFrame, modifierChord);

  // Custom-array ø: HT may mark halfDim on a degree whose custom scale quality is minor (e.g. #ivø in major).
  const customBorrowedHalfDim = Array.isArray(borrowed) && !!modifierChord?.halfDim;
  const customBorrowedHalfDimM7 = customBorrowedHalfDim && chordType >= 11;
  const customBorrowedDimNatural11 = Array.isArray(borrowed)
    && modifierChord?.dimTriad
    && !modifierChord?.halfDim
    && chordType >= 11;
  const hmBorrowedDominant13 = borrowed === "harmonicMinor"
    && chordRootSD === 5
    && chordType >= 13
    && !useSusFrame
    && !omitTriad35;
  const halfDimInv1M6Stack = matchesHalfDimM6Stack({
    borrowed, modifiedKey, chordRootSD, chordType, inversion,
    modifierChord, useSusFrame, omitTriad35,
  });

  const triadQuality = halfDimIi
    ? "diminished"
    : customBorrowedHalfDim
      ? "minor"
      : sharp5Minor
        ? "minor"
      : (modifierChord?.dimTriad || modifierChord?.halfDim)
        ? "diminished"
      : phdmMaj7 || phdmIImaj7
        ? "major"
        : (useSusFrame && (chordQuality === "diminished" || chordQuality === "augmented") ? "major" : chordQuality);

  const augMaj7Base = triadQuality === "augmented" && chordType >= 7 && !useSusFrame && !omitTriad35;
  const augMaj7StackVoicing = augMaj7Base && inversion !== 3;
  const augMaj7Inv3Voicing = augMaj7Base && inversion === 3;
  const minorV13Stack = modifiedKey.scale === "minor"
    && chordType >= 13
    && chordQuality === "minor"
    && chordRootSD === 5
    && !useSusFrame
    && !omitTriad35;
  const minorI13B13 = modifiedKey.scale === "minor"
    && chordType >= 13
    && chordQuality === "minor"
    && chordRootSD === 1
    && !useSusFrame
    && !omitTriad35;

  return {
    triadQuality,
    rootShiftSemitones: triadOverride?.rootShift ?? 0,
    phdmIImaj7,
    sharp5Minor,
    halfDimIi,
    augMaj7StackVoicing,
    augMaj7Inv3Voicing,
    hmBorrowedMinor7: borrowed === "minor" && originalKey.scale === "harmonicMinor" && chordRootSD === 1,
    customDimMaj7: Array.isArray(borrowed) && chordQuality === "diminished",
    natural11: modifiedKey.scale === "minor" && (chordRootSD === 5 || chordRootSD === 1),
    customBorrowedHalfDim,
    customBorrowedHalfDimM7,
    customBorrowedDimNatural11,
    dim11Natural: (borrowed === "harmonicMinor" || borrowed === "phrygianDominant") && chordType >= 11 && triadQuality === "diminished",
    hmBorrowedDominant13,
    halfDimInv1M6Stack,
    minorV13Stack,
    minorI13B13,
    autoAlterations: minorV13Stack ? ["b9", "b13"] : minorI13B13 ? ["b13"] : [],
    skipNine: (borrowed === "lydian" && (modifierChord?.halfDim || triadQuality === "diminished") && chordType >= 11)
      || ((borrowed === "harmonicMinor" || borrowed === "phrygianDominant") && chordType >= 11 && triadQuality === "diminished"),
    skipThirteenth: false,
    dimSeventh: chordType >= 7 && !customBorrowedHalfDim && !sharp5Minor && (
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
