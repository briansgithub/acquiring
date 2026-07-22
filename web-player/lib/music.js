import { applyChordSubstitutions, resolveTriSubRoot } from "./chordSubstitutions.js";
import {
  parseKey,
  getNoteLabel,
  sdToToneJSNoteName,
  scaleDegreeToSpecificInterval,
  getCustomBorrowedIntervals,
  resolveBorrowedScale,
  getScaleChordQualities,
} from "./musicScale.js";
import { rootToDiatonicTriad, buildChordFromNoteName } from "./chordBuild.js";

export {
  parseKey,
  getNoteLabel,
  sdToToneJSNoteName,
  scaleDegreeToSpecificInterval,
  getCustomBorrowedIntervals,
  rootToDiatonicTriad,
};
export { borrowedModeDimSeventhDegree } from "./chordPolicy.js";

export function chordInterpreter(chord, key, opts = {}) {
  const effective = applyChordSubstitutions(
    opts.forceRootPosition ? { ...chord, inversion: 0 } : chord,
    key,
  );
  const defaultChordOctave = 3;
  const borrowed = effective.borrowed || null;
  const chordType = effective.type || 5;
  const inversion = effective.inversion || 0;
  const suspensions = effective.suspensions || [];

  // Handle Applied Chords (Secondary Dominants/Functions)
  // HOOKTHEORY DATA MODEL: `applied` is the NUMERATOR chord degree; `root` is the
  // tonicization TARGET (denominator). The tonicized key's tonic is the note at degree
  // `root` in the original key, treated as MAJOR; the chord is then degree `applied` of it.
  if (effective.applied && effective.applied !== 0 && effective.applied >= 1 && effective.applied <= 7 && !borrowed) {
    const { key: borrowedKey, scaleChordQualities: parentQualities } = resolveBorrowedScale(key, borrowed);
    const parentChordQualities = getScaleChordQualities(borrowedKey.scale, parentQualities);
    const targetTonicNote = getNoteLabel(effective.root, borrowedKey);

    if (effective._triSubDominant && effective.applied === 5) {
      const subRoot = resolveTriSubRoot(targetTonicNote);
      return buildChordFromNoteName(
        subRoot, "major", key, defaultChordOctave, chordType, inversion,
        false, suspensions, effective,
      );
    }

    const targetQual = parentChordQualities[effective.root - 1];
    const appliedDenomMaj = effective.appliedDenomMaj
      || (effective.applied === 5 && chordType >= 7 && targetQual === 'minor');
    const useMinorTonicization = (targetQual === "minor" || targetQual === "diminished")
      && [2, 3].includes(effective.applied);
    const appliedScale = useMinorTonicization ? "minor" : "major";
    const appliedKey = { tonic: targetTonicNote, scale: appliedScale };

    const actualRootNote = getNoteLabel(effective.applied, appliedKey);
    const appliedQualities = getScaleChordQualities(appliedScale);
    const chordQuality = appliedQualities[effective.applied - 1];

    const fullyDiminished = effective.applied === 7 && chordQuality === "diminished";
    const halfDimApplied = chordType >= 7 && chordQuality === "diminished" && effective.applied !== 7;
    const useMaj7 = effective.useMaj7
      || (chordType >= 7 && chordQuality === "major" && effective.applied === 4);

    return buildChordFromNoteName(
      actualRootNote, chordQuality, key, defaultChordOctave, chordType, inversion,
      fullyDiminished, suspensions, {
        ...effective,
        appliedDenomMaj,
        useMaj7,
        halfDim: effective.halfDim || halfDimApplied,
      },
    );
  }

  const applied = effective.applied || 0;
  return rootToDiatonicTriad(effective.root, key, defaultChordOctave, borrowed, chordType, inversion, applied, suspensions, effective);
}

export function getSongLength(metadata) {
  return metadata?.endBeat ?? 0;
}
