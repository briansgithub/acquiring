/**
 * Pre-process Hooktheory substitution[] before chord construction.
 * substitutions:["tri"] = tritone sub (∆-sub): V/x → ♭II/x (root a tritone below V).
 */

import { shiftPitchClass } from "./chordNoteUtils.js";
import { getNoteLabel } from "./musicScale.js";

/** Tritone-sub dominant root: ♭II of a major tonicization target (V of target → +6 semitones). */
export function resolveTriSubRoot(targetTonicNote) {
  const domRoot = getNoteLabel(5, { tonic: targetTonicNote, scale: "major" });
  return shiftPitchClass(domRoot, 6);
}

/** Mark chord for tritone-sub rewrite in chordInterpreter applied path. */
function applyTritoneSub(chord) {
  if (!chord?.applied || chord.applied !== 5) return chord;
  const subs = chord.substitutions || [];
  if (!subs.includes("tri")) return chord;
  return { ...chord, _triSubDominant: true };
}

/** Apply all known substitution transforms; returns a shallow copy when changed. */
export function applyChordSubstitutions(chord, key) {
  if (!chord || !Array.isArray(chord.substitutions) || !chord.substitutions.length) {
    return chord;
  }
  let out = chord;
  if (chord.substitutions.includes("tri")) {
    out = applyTritoneSub(out);
  }
  return out === chord ? chord : out;
}
