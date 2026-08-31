/**
 * Apply JSON adds[] — append add2/4/6/9/13 tones in chord-root major frame.
 */
import { hasSeventh, hasPc, noteLabel, noteNameToPc, rootKey } from "./chordNoteUtils.js";

const EXT_SEMIS = { 2: 2, 4: 5, 6: 9, 9: 14, 11: 17, 13: 21 };

function addSpec(ext) {
  if (ext === 9 || ext === 2) return { sd: "2", relOct: 1, di: 4 };
  if (ext === 11) return { sd: "4", relOct: 1, di: 5 };
  if (ext === 13) return { sd: "6", relOct: 1, di: 6 };
  if (ext === 4) return { sd: "4", relOct: 0, di: 1 };
  if (ext === 6) return { sd: "6", relOct: 0, di: 6 };
  return null;
}

export function applyAdds(toneJSNames, degreeIndices, adds, chordRootNoteName, baseOctave, sdToToneJSNoteName, chordType = 5) {
  if (!adds?.length) return;
  const rk = rootKey(chordRootNoteName);
  const rootPc = noteNameToPc(noteLabel(chordRootNoteName));
  const has7 = hasSeventh(degreeIndices);

  for (const a of adds) {
    const ext = (a <= 6 && has7) ? a + 7 : a;
    const semis = EXT_SEMIS[ext];
    if (semis == null) continue;
    if (hasPc(toneJSNames, (rootPc + semis) % 12)) continue;
    const spec = addSpec(ext);
    if (!spec) continue;
    toneJSNames.push(sdToToneJSNoteName(spec.sd, spec.relOct, rk, baseOctave));
    degreeIndices.push(spec.di);
  }

  // Hooktheory add6 triads commonly omit the 5th in voicing.
  if (adds.includes(6) && chordType < 7 && !adds.includes(9)) {
    const fifthPc = (rootPc + 7) % 12;
    for (let i = toneJSNames.length - 1; i >= 0; i--) {
      if (noteNameToPc(toneJSNames[i]) === fifthPc && degreeIndices[i] === 2) {
        toneJSNames.splice(i, 1);
        degreeIndices.splice(i, 1);
        break;
      }
    }
  }
}
