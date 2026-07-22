/**

 * Apply JSON alterations[] — replace chord tones (b5, #5, b9, #9, #11, …).

 */

import { hasPc, noteLabel, noteNameToPc, rootKey, shiftNoteBySemitones } from "./chordNoteUtils.js";



const ALT_RULES = {

  b5: { src: 7, delta: -1 },

  "#5": { src: 7, delta: 1 },

  b9: { src: 2, delta: -1, addSd: "b2", addOct: 1 },

  "#9": { src: 2, delta: 1, addSd: "#2", addOct: 1 },

  "9": { src: 2, delta: 0 },

  "#11": { src: 5, delta: 1, addSd: "#4", addOct: 1 },

  "11": { src: 5, delta: 0 },

  b13: { src: 9, delta: -1, addSd: "b6", addOct: 1 },

  "#13": { src: 9, delta: 1, addSd: "#6", addOct: 1 },

};



export function applyAlterations(toneJSNames, degreeIndices, alterations, chordRootNoteName, baseOctave, sdToToneJSNoteName, chord = null) {

  if (!alterations?.length) return;

  const rootPc = noteNameToPc(noteLabel(chordRootNoteName));

  if (rootPc == null) return;

  const rk = rootKey(chordRootNoteName);



  for (const raw of alterations) {

    const key = String(raw).toLowerCase();

    const rule = ALT_RULES[key];

    if (!rule) continue;



    if (key === "b5" || key === "#5") {
      if (key === "b5" && chord?.customBorrowedHalfDim) {
        for (let i = 0; i < toneJSNames.length; i++) {
          if (degreeIndices[i] === 2) {
            toneJSNames[i] = shiftNoteBySemitones(toneJSNames[0], 6);
            break;
          }
        }
        continue;
      }
      if (key === "b5" && chord?.halfDim && chord?.flattenHalfDimB5) {
        // ø with an explicit (b5) renders as a full diminished seventh: force the
        // fifth to dim5 (in case the triad came out perfect) and the m7 down to dim7.
        const perfectFifthPc = (rootPc + 7) % 12;
        const minorSeventhPc = (rootPc + 10) % 12;
        for (let i = 0; i < toneJSNames.length; i++) {
          if (noteNameToPc(toneJSNames[i]) === perfectFifthPc) {
            toneJSNames[i] = shiftNoteBySemitones(toneJSNames[i], -1);
            break;
          }
        }
        for (let i = 0; i < toneJSNames.length; i++) {
          if (noteNameToPc(toneJSNames[i]) === minorSeventhPc) {
            toneJSNames[i] = shiftNoteBySemitones(toneJSNames[i], -1);
            break;
          }
        }
        continue;
      }

      // b5 only flattens a perfect fifth; dim triads already carry the b5 at +6.
      const fifthPcs = key === "b5"
        ? [(rootPc + 7) % 12]
        : [(rootPc + 7) % 12, (rootPc + 6) % 12];

      let found = false;

      for (let i = 0; i < toneJSNames.length; i++) {

        const pc = noteNameToPc(toneJSNames[i]);

        if (fifthPcs.includes(pc)) {

          found = true;

          if (rule.delta !== 0) toneJSNames[i] = shiftNoteBySemitones(toneJSNames[i], rule.delta);

          break;

        }

      }

      if (!found && sdToToneJSNoteName) {

        const targetPc = (rootPc + 6 + rule.delta + 12) % 12;

        if (!hasPc(toneJSNames, targetPc)) {

          toneJSNames.push(sdToToneJSNoteName(key === "b5" ? "b5" : "#5", 0, rk, baseOctave));

          degreeIndices.push(2);

        }

      }

      continue;

    }



    if (key === "b9" || key === "#9" || key === "9") {
      const ninthPc = (rootPc + 2) % 12;
      let found = false;
      for (let i = 0; i < toneJSNames.length; i++) {
        if (noteNameToPc(toneJSNames[i]) === ninthPc) {
          found = true;
          if (rule.delta !== 0) toneJSNames[i] = shiftNoteBySemitones(toneJSNames[i], rule.delta);
          break;
        }
      }
      if (!found && rule.addSd && sdToToneJSNoteName) {
        const targetPc = (ninthPc + rule.delta + 12) % 12;
        if (!hasPc(toneJSNames, targetPc)) {
          toneJSNames.push(sdToToneJSNoteName(rule.addSd, rule.addOct ?? 1, rk, baseOctave));
          degreeIndices.push(degreeIndices.length);
        }
      }
      continue;
    }

    if (key === "b13" && (chord?.minorV13Stack || chord?.minorI13B13 || chord?.hmBorrowedDominant13)) {
      const flat13Pc = (rootPc + 8) % 12;
      if (!hasPc(toneJSNames, flat13Pc) && sdToToneJSNoteName) {
        toneJSNames.push(sdToToneJSNoteName("b6", 1, rk, baseOctave));
        degreeIndices.push(degreeIndices.length);
      }
      continue;
    }

    const srcPc = (rootPc + rule.src) % 12;

    let found = false;

    for (let i = 0; i < toneJSNames.length; i++) {

      if (noteNameToPc(toneJSNames[i]) === srcPc) {

        found = true;

        if (rule.delta !== 0) toneJSNames[i] = shiftNoteBySemitones(toneJSNames[i], rule.delta);

        break;

      }

    }

    if (!found && rule.addSd && sdToToneJSNoteName) {

      const targetPc = (srcPc + rule.delta + 12) % 12;

      if (!hasPc(toneJSNames, targetPc)) {

        toneJSNames.push(sdToToneJSNoteName(rule.addSd, rule.addOct ?? 1, rk, baseOctave));

        degreeIndices.push(degreeIndices.length);

      }

    }

  }

}

