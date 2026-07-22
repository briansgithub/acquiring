/**
 * Apply JSON omits[] — remove chord tones at scale-degree slots (3rd, 5th).
 */
import { spliceIndices } from "./chordNoteUtils.js";

const OMIT_SLOT = { 3: 1, 5: 2 };

export function applyOmits(toneJSNames, degreeIndices, omits, chord = null) {
  if (!omits?.length) return;
  let effective = omits;
  // HT ø(no5): letter omits perfect fifth but voices dim5 — do not strip ø fifth.
  if (chord?.halfDim && omits.includes(5)) {
    effective = omits.filter((o) => o !== 5);
  }
  const slots = new Set();
  for (const o of effective) {
    if (OMIT_SLOT[o] != null) slots.add(OMIT_SLOT[o]);
  }
  const remove = [];
  for (let i = 0; i < degreeIndices.length; i++) {
    if (slots.has(degreeIndices[i])) remove.push(i);
  }
  spliceIndices(toneJSNames, degreeIndices, remove);
}
