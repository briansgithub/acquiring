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



export function applyAlterations(toneJSNames, degreeIndices, alterations, chordRootNoteName, baseOctave, sdToToneJSNoteName) {

  if (!alterations?.length) return;

  const rootPc = noteNameToPc(noteLabel(chordRootNoteName));

  if (rootPc == null) return;

  const rk = rootKey(chordRootNoteName);



  for (const raw of alterations) {

    const key = String(raw).toLowerCase();

    const rule = ALT_RULES[key];

    if (!rule) continue;



    if (key === "b5" || key === "#5") {

      const fifthPcs = [(rootPc + 7) % 12, (rootPc + 6) % 12];

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

