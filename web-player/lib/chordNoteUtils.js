/**
 * Shared pitch-class / note helpers for chord modifier modules.
 */
import { NOTE_NAME_TO_INTEGER_NOTATION } from "./scales.js";

const PC_SPELL = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function noteLabel(noteName) {
  return String(noteName).replace(/[0-9-]+$/, "");
}

export function noteNameToPc(noteName) {
  const pc = NOTE_NAME_TO_INTEGER_NOTATION[noteLabel(noteName)];
  return pc != null ? ((pc % 12) + 12) % 12 : null;
}

export function rootKey(chordRootNoteName) {
  return { tonic: noteLabel(chordRootNoteName), scale: "major" };
}

export function hasSeventh(degreeIndices) {
  return degreeIndices.includes(3);
}

export function hasPc(toneJSNames, pc) {
  return toneJSNames.some((n) => noteNameToPc(n) === pc);
}

export function shiftNoteBySemitones(noteName, delta) {
  const m = String(noteName).match(/^([A-G](?:x|#|b)*)(\d+)$/);
  if (!m) return noteName;
  let abs = NOTE_NAME_TO_INTEGER_NOTATION[m[1]];
  if (abs == null) return noteName;
  const oct = parseInt(m[2], 10);
  let total = abs + (oct + 1) * 12 + delta;
  const newOct = Math.max(1, Math.floor(total / 12) - 1);
  const newPc = ((total % 12) + 12) % 12;
  return `${PC_SPELL[newPc]}${newOct}`;
}

/** Shift a pitch-class label (no octave), e.g. Db +1 → D. */
export function shiftPitchClass(label, delta) {
  const abs = NOTE_NAME_TO_INTEGER_NOTATION[noteLabel(label)];
  if (abs == null) return label;
  const newPc = ((abs + delta) % 12 + 12) % 12;
  return PC_SPELL[newPc];
}

/** Remove indices from parallel arrays (high to low). */
export function spliceIndices(toneJSNames, degreeIndices, indices) {
  const sorted = [...new Set(indices)].sort((a, b) => b - a);
  for (const i of sorted) {
    if (i >= 0 && i < toneJSNames.length) {
      toneJSNames.splice(i, 1);
      degreeIndices.splice(i, 1);
    }
  }
}
