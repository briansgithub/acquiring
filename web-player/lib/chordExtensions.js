/**
 * Upper extensions from chord type (9 / 11 / 13) beyond triad+7th.
 */
import { hasPc, noteLabel, noteNameToPc, rootKey, shiftNoteBySemitones } from "./chordNoteUtils.js";

export function applyTypeExtensions(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, chordType, sdToToneJSNoteName, triadQuality = "major", opts = {}) {
  const rk = rootKey(chordRootNoteName);
  const rootPc = noteNameToPc(noteLabel(chordRootNoteName));

  if (chordType >= 9 && !opts.skipNine && !hasPc(toneJSNames, (rootPc + 2) % 12)) {
    toneJSNames.push(sdToToneJSNoteName("2", 1, rk, baseOctave));
    degreeIndices.push(4);
  }
  if (chordType >= 11) {
    const natural11Pc = triadQuality === "diminished"
      ? (rootPc + (opts.skipNine ? 1 : 9)) % 12
      : triadQuality === "minor"
        ? (rootPc + 5) % 12
        : (rootPc + 10) % 12;
    const sharp11Pc = (rootPc + 5) % 12;
    const useNatural11 = triadQuality === "diminished" || !!opts.natural11;
    const targetPc = useNatural11 ? natural11Pc : sharp11Pc;
    if (!hasPc(toneJSNames, targetPc)) {
      if (useNatural11 && triadQuality === "diminished") {
        const semis = opts.skipNine ? 1 : 9;
        toneJSNames.push(shiftNoteBySemitones(toneJSNames[0], semis));
      } else if (useNatural11 && triadQuality === "minor") {
        toneJSNames.push(shiftNoteBySemitones(toneJSNames[0], 5));
      } else {
        const sd = useNatural11 ? "6" : "4";
        const relOct = useNatural11 ? 0 : 1;
        toneJSNames.push(sdToToneJSNoteName(sd, relOct, rk, baseOctave));
      }
      degreeIndices.push(5);
    }
  }
  if (chordType >= 13 && !opts.skipThirteenth && !hasPc(toneJSNames, (rootPc + 9) % 12)) {
    toneJSNames.push(sdToToneJSNoteName("6", 1, rk, baseOctave));
    degreeIndices.push(6);
  }
}
