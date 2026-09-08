import { getNoteLabel, resolveBorrowedScale, getScaleChordQualities } from "./musicScale.js";
import { noteNameToPc } from "./chordNoteUtils.js";

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII"];

// In Hooktheory JSON, root is the target and applied is the numerator.
// Borrowing changes the target before the numerator's major scale is built.
export function resolveAppliedChordContext(chord, key) {
  const resolved = resolveBorrowedScale(key, chord.borrowed || null);
  const targetTonic = getNoteLabel(chord.root, resolved.key, resolved.customScaleIntervals);
  const quality = getScaleChordQualities(resolved.key.scale, resolved.scaleChordQualities)[chord.root - 1];
  const originalTarget = getNoteLabel(chord.root, key);
  let shift = noteNameToPc(targetTonic) - noteNameToPc(originalTarget);
  while (shift > 6) shift -= 12;
  while (shift < -6) shift += 12;
  const accidental = shift < 0 ? "♭".repeat(-shift) : "♯".repeat(shift);
  let denominator = ROMANS[chord.root - 1];
  if (quality === "minor" || quality === "diminished") denominator = denominator.toLowerCase();
  if (quality === "diminished") denominator += "°";
  return { targetTonic, quality, denominator: accidental + denominator };
}
