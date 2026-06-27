/**
 * Replace the triad third with sus2/sus4 in the chord-root major frame.
 * Mutates toneJSNames in place. Call after triad/7th build, before inversion.
 * When both sus2 and sus4 are present, sus4 wins (Hooktheory voicing convention).
 */
export function replaceTriadThird(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, suspensions, sdToToneJSNoteName) {
  if (!Array.isArray(suspensions) || suspensions.length === 0) return;

  const thirdSlot = degreeIndices.indexOf(1);
  if (thirdSlot === -1) return;

  let replaceDegree;
  if (suspensions.includes(4)) replaceDegree = "4";
  else if (suspensions.includes(2)) replaceDegree = "2";
  else return;

  const rootKey = { tonic: chordRootNoteName, scale: "major" };
  toneJSNames[thirdSlot] = sdToToneJSNoteName(replaceDegree, 0, rootKey, baseOctave);
}
