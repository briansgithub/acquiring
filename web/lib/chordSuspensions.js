import { shiftNoteBySemitones } from "./chordNoteUtils.js";

/**
 * Replace the triad third with sus2/sus4 in the chord-root major frame.
 * Mutates toneJSNames in place. Call after triad/7th build, before inversion.
 * Both suspensions sound when both are present (Gorillaz 5/4 live keyboard).
 */
export function replaceTriadThird(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, suspensions, sdToToneJSNoteName, context = {}) {
  if (!Array.isArray(suspensions) || suspensions.length === 0) return;

  const thirdSlot = degreeIndices.indexOf(1);
  if (thirdSlot === -1) return;

  let replaceDegree;
  if (suspensions.includes(4)) replaceDegree = "4";
  else if (suspensions.includes(2)) replaceDegree = "2";
  else return;

  const rootKey = { tonic: chordRootNoteName, scale: "major" };
  toneJSNames[thirdSlot] = sdToToneJSNoteName(replaceDegree, 0, rootKey, baseOctave);
  // Preserve the replacement's role through omissions, inversion and sorting.
  degreeIndices[thirdSlot] = replaceDegree === "4" ? 8 : 7;
  if (replaceDegree === "2" && context.phdmIImaj7) {
    toneJSNames[thirdSlot] = shiftNoteBySemitones(toneJSNames[thirdSlot], 1);
  }
  if (suspensions.includes(2) && suspensions.includes(4)) {
    toneJSNames.push(sdToToneJSNoteName("2", 0, rootKey, baseOctave));
    degreeIndices.push(7);
    // The harmonic-minor VI double suspension follows that scale's #2, #4
    // and major seventh (live Gorillaz 5/4, Chorus/13.5). Its printed seventh
    // still uses Hooktheory's suspended-chord naming convention.
    if (context.scale === "harmonicMinor" && context.degree === 6) {
      for (let i = 0; i < toneJSNames.length; i++) {
        if ([3, 7, 8].includes(degreeIndices[i])) {
          toneJSNames[i] = shiftNoteBySemitones(toneJSNames[i], 1);
        }
      }
    }
  }
}
