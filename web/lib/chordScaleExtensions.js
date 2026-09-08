import { getNoteLabel } from "./musicScale.js";
import { noteNameToPc, shiftNoteBySemitones } from "./chordNoteUtils.js";

// Implicit extension accidentals come from the prevailing scale. Keep the
// explicit symbol-frame overrides in chordPolicy/chordExtensions intact.
export function applyScaleExtensionPitches(notes, roles, rootName, degree, key, intervals, chord, policy) {
  // Minor iiø11 is a four-tone root/b7/b9/11 shell, including when the source
  // writes no3/no5. REM Losing My Religion supplies independent keyboard
  // evidence; the former bb7 and missing/raised eleventh were inferred errors.
  if (chord.type === 11 && key.scale === "minor" && degree === 2
      && !chord.dimTriad && !chord.suspensions?.length) {
    const root = notes[roles.indexOf(0)];
    const rootPc = noteNameToPc(rootName);
    for (const [role, semitones] of [[3, 10], [4, 1], [5, 5]]) {
      const index = roles.indexOf(role);
      if (index < 0) {
        notes.push(shiftNoteBySemitones(root, role === 4 ? 13 : semitones));
        roles.push(role);
      } else {
        let shift = (rootPc + semitones) % 12 - noteNameToPc(notes[index]);
        while (shift > 6) shift -= 12;
        while (shift < -6) shift += 12;
        if (shift) notes[index] = shiftNoteBySemitones(notes[index], shift);
      }
    }
  }
  if (chord.type >= 13 || chord.halfDim || chord.dimTriad || chord.suspensions?.length) return;
  const custom = Array.isArray(chord.borrowed);
  const rootPc = noteNameToPc(rootName);
  for (let index = 0; index < notes.length; index++) {
    const role = roles[index];
    if (role !== 4 && role !== 5) continue;
    // Named-scale ninths and lydian elevenths have independently captured
    // examples; custom-array extensions carry their interval explicitly.
    if (!custom && role === 5 && key.scale !== "lydian") continue;
    // Captured minor iiø11 names explicitly retain b9 (Gaga, Adele, R.E.M.).
    const minorSupertonicNinth = role === 4 && key.scale === "minor" && degree === 2;
    if (!custom && policy.triadQuality === "diminished" && !minorSupertonicNinth) continue;
    const extension = role === 4 ? 9 : 11;
    const targetDegree = ((degree + extension - 2) % 7) + 1;
    const desiredPc = noteNameToPc(getNoteLabel(targetDegree, key, intervals));
    if (desiredPc == null || rootPc == null) continue;
    let shift = desiredPc - noteNameToPc(notes[index]);
    while (shift > 6) shift -= 12;
    while (shift < -6) shift += 12;
    if (shift) notes[index] = shiftNoteBySemitones(notes[index], shift);
  }
}
