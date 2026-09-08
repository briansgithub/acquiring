import { getChordSymbol } from "./jsonToSymbol.js";
import { resolveAppliedChordContext } from "./appliedChordContext.js";
import { getNoteLabel, resolveBorrowedScale } from "./musicScale.js";
import { noteNameToPc } from "./chordNoteUtils.js";

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII"];

// Change the analysis frame while keeping all authored quality and modifiers.
// A matching major frame is an identity, including enharmonic root spelling.
export function getChordSymbolForDisplayContext(chord, key, context) {
  const symbol = getChordSymbol(chord, key);
  if (!symbol || !context || (key.scale === "major" && key.tonic === context.tonic)) return symbol;
  const applied = chord.applied >= 1 && chord.applied <= 7;
  const borrowed = resolveBorrowedScale(key, chord.borrowed || null);
  const rootName = applied ? resolveAppliedChordContext(chord, key).targetTonic
    : getNoteLabel(chord.root, borrowed.key, borrowed.customScaleIntervals);
  const letters = "CDEFGAB";
  const degree = (letters.indexOf(rootName[0]) - letters.indexOf(context.tonic[0]) + 7) % 7;
  const reference = getNoteLabel(degree + 1, { tonic: context.tonic, scale: "major" });
  let accidental = noteNameToPc(rootName) - noteNameToPc(reference);
  while (accidental > 6) accidental -= 12;
  while (accidental < -6) accidental += 12;
  const offset = applied ? symbol.indexOf("/") + 1 : 0;
  const fragment = symbol.slice(offset);
  const replacement = fragment.replace(/^[♭♯b#]*([ivIV]+)/, (_, roman) => {
    const numeral = roman === roman.toLowerCase() ? ROMANS[degree].toLowerCase() : ROMANS[degree];
    return (accidental < 0 ? "♭".repeat(-accidental) : "♯".repeat(accidental)) + numeral;
  });
  return symbol.slice(0, offset) + replacement;
}
