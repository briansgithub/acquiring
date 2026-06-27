/**
 * Apply JSON omits[] — remove chord tones at scale-degree slots (3rd, 5th).
 */
import { spliceIndices } from "./chordNoteUtils.js";

const OMIT_SLOT = { 3: 1, 5: 2 };

export function applyOmits(toneJSNames, degreeIndices, omits) {
  if (!omits?.length) return;
  const slots = new Set();
  for (const o of omits) {
    if (OMIT_SLOT[o] != null) slots.add(OMIT_SLOT[o]);
  }
  const remove = [];
  for (let i = 0; i < degreeIndices.length; i++) {
    if (slots.has(degreeIndices[i])) remove.push(i);
  }
  spliceIndices(toneJSNames, degreeIndices, remove);
}
