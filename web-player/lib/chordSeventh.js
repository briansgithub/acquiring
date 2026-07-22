/**
 * Seventh selection — unified diatonic + policy override resolution.
 */
import { shiftNoteBySemitones, hasPc, noteLabel, noteNameToPc } from "./chordNoteUtils.js";
import { borrowedModeDimSeventhDegree } from "./chordPolicy.js";

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

/** Layer A — diatonic seventh from prevailing scale. Returns "7" | "b7" | "bb7". */
export function diatonicSeventhDegreeStr(chordRootSD, effKey, customIntervals, getNoteLabel) {
  try {
    const r = noteToPc(getNoteLabel(chordRootSD, effKey, customIntervals));
    const sevSD = ((chordRootSD - 1 + 6) % 7) + 1;
    const s = noteToPc(getNoteLabel(sevSD, effKey, customIntervals));
    if (r == null || s == null) return "b7";
    const iv = (((s - r) % 12) + 12) % 12;
    if (iv === 11) return "7";
    if (iv === 9) return "bb7";
    return "b7";
  } catch (e) {
    return "b7";
  }
}

/**
 * Unified seventh resolver for diatonic path (rootToDiatonicTriad).
 * Returns degree string or "augMaj7Stack" for HT +△7 voicing.
 */
export function resolveSeventhDegree({
  policy, useSusFrame, effModifierChord, chordRootSD, modifiedKey, chordQuality,
  customScaleIntervals, getNoteLabel,
}) {
  if (policy.augMaj7Voicing) return "augMaj7Stack";
  if (policy.halfDimInv1M6Stack) return "m6Stack";
  if (useSusFrame) return "b7";
  if (policy.hmBorrowedMinor7) return "b7";
  if (policy.customBorrowedHalfDim) {
    return policy.customBorrowedHalfDimM7 ? "customHalfDimM7" : "bb7";
  }
  if (effModifierChord?.dimTriad) return "bb7";
  if (policy.customDimMaj7) return "7";
  if (policy.phdmIImaj7) return "7";
  const hasSharp5 = effModifierChord?.alterations?.includes("#5");
  if ((policy.triadQuality === "diminished" && hasSharp5) || policy.sharp5Minor) return "b7";
  return borrowedModeDimSeventhDegree(
    chordRootSD, modifiedKey.scale, chordQuality, 7,
    { halfDim: effModifierChord?.halfDim },
  )
    ?? diatonicSeventhDegreeStr(chordRootSD, modifiedKey, customScaleIntervals, getNoteLabel);
}

/** Seventh for omit-3+5 frames. */
export function resolveOmitTriad35Seventh({
  useSusFrame, effModifierChord, chordRootSD, modifiedKey, chordQuality,
  customScaleIntervals, getNoteLabel,
}) {
  if (effModifierChord?.halfDim) return "bb7";
  if (useSusFrame) return "b7";
  return borrowedModeDimSeventhDegree(
    chordRootSD, modifiedKey.scale, chordQuality, 7,
    { halfDim: effModifierChord?.halfDim },
  )
    ?? diatonicSeventhDegreeStr(chordRootSD, modifiedKey, customScaleIntervals, getNoteLabel);
}

/**
 * Unified seventh resolver for applied-chord path (buildChordFromNoteName).
 */
export function resolveAppliedSeventhDegree({
  fullyDiminished, modifierChord, quality, chordType,
}) {
  if (chordType < 7) return null;
  const hasSharp5 = modifierChord?.alterations?.includes("#5");
  if (fullyDiminished) return "bb7";
  if (modifierChord?.halfDim) return "b7";
  if (modifierChord?.dimTriad) return "bb7";
  if (quality === "diminished" && hasSharp5) return "b7";
  if (modifierChord?.useMaj7) return "7";
  return "b7";
}

export function addSeventhNote(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, seventhDegree, sdToToneJSNoteName) {
  const rootKey = { tonic: chordRootNoteName, scale: "major" };
  const seventhName = sdToToneJSNoteName(seventhDegree, 0, rootKey, baseOctave);
  toneJSNames.push(seventhName);
  degreeIndices.push(3);
}

/** HT +△7 on augmented: omit #5, stack maj7 (+11) + scale b7 (+7). */
export function applyAugMaj7Stack(toneJSNames, degreeIndices) {
  toneJSNames.push(shiftNoteBySemitones(toneJSNames[0], 11));
  degreeIndices.push(3);
  toneJSNames.push(shiftNoteBySemitones(toneJSNames[0], 7));
  degreeIndices.push(4);
}

/** HT mix-borrowed ø65: letter m6 — dim5 (+6) + 6th (+9), not ø7 stack. */
export function applyMixBorrowedM6Voicing(toneJSNames, degreeIndices) {
  const rootPc = noteNameToPc(noteLabel(toneJSNames[0]));
  if (rootPc == null) return;
  const fifthPc = (rootPc + 7) % 12;
  const sixthPc = (rootPc + 9) % 12;
  for (let i = 0; i < toneJSNames.length; i++) {
    if (noteNameToPc(toneJSNames[i]) === fifthPc) {
      toneJSNames[i] = shiftNoteBySemitones(toneJSNames[i], -1);
      break;
    }
  }
  if (!hasPc(toneJSNames, sixthPc)) {
    toneJSNames.push(shiftNoteBySemitones(toneJSNames[0], 9));
    degreeIndices.push(3);
  }
}

export function applySeventhToChord(toneJSNames, degreeIndices, seventhKind, chordRootNoteName, baseOctave, sdToToneJSNoteName) {
  if (seventhKind === "augMaj7Stack") {
    applyAugMaj7Stack(toneJSNames, degreeIndices);
    return;
  }
  if (seventhKind === "m6Stack") {
    applyMixBorrowedM6Voicing(toneJSNames, degreeIndices);
    return;
  }
  if (seventhKind === "customHalfDimM7") {
    toneJSNames.push(shiftNoteBySemitones(toneJSNames[0], 9));
    degreeIndices.push(3);
    return;
  }
  if (seventhKind) {
    addSeventhNote(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, seventhKind, sdToToneJSNoteName);
  }
}
