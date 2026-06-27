/**
 * chordModifiers.js — post-suspension modifier pipeline for chordInterpreter.
 *
 * Hook contract (call after replaceTriadThird, before inversion):
 *   applyChordModifiers(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, chord, sdToToneJSNoteName)
 *
 * Order: omits → alterations → adds (matches truthNotes build order after triad/seventh/extensions/sus).
 */
import { applyOmits } from "./chordOmits.js";
import { applyAlterations } from "./chordAlterations.js";
import { applyAdds } from "./chordAdds.js";

export function applyChordModifiers(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, chord, sdToToneJSNoteName) {
  if (!chord) return;
  const omits = chord.omits || [];
  const alterations = chord.alterations || [];
  const adds = chord.adds || [];

  applyOmits(toneJSNames, degreeIndices, omits);
  applyAlterations(toneJSNames, degreeIndices, alterations, chordRootNoteName, baseOctave, sdToToneJSNoteName, chord);
  applyAdds(toneJSNames, degreeIndices, adds, chordRootNoteName, baseOctave, sdToToneJSNoteName, chord?.type ?? 5);
}

export { applyOmits } from "./chordOmits.js";
export { applyAlterations } from "./chordAlterations.js";
export { applyAdds } from "./chordAdds.js";
export { applyTypeExtensions } from "./chordExtensions.js";
