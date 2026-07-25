import { resolveHarmonicIntent } from "./harmonicIntent.js";
import { applyChordSubstitutions, resolveTriSubRoot } from "./chordSubstitutions.js";
import { MAJOR_SCALE_CHORD_QUALITIES } from "./scales.js";
import {
  parseKey,
  getNoteLabel,
  sdToToneJSNoteName,
  scaleDegreeToSpecificInterval,
  getCustomBorrowedIntervals,
  resolveBorrowedScale,
  getScaleChordQualities,
} from "./musicScale.js";
import { rootToDiatonicTriad, buildChordFromNoteName, voicingWithSlashBass } from "./chordBuild.js";

export {
  parseKey,
  getNoteLabel,
  sdToToneJSNoteName,
  scaleDegreeToSpecificInterval,
  getCustomBorrowedIntervals,
  rootToDiatonicTriad,
  resolveHarmonicIntent,
};
export { borrowedModeDimSeventhDegree } from "./chordPolicy.js";

export function chordInterpreter(chord, key, opts = {}) {
  const intent = resolveHarmonicIntent(chord, key, opts);
  const effective = intent.rawChord;
  const defaultChordOctave = intent.baseOctave || 3;
  const borrowed = intent.borrowed;
  const chordType = intent.chordType;
  const inversion = intent.inversion;
  const suspensions = intent.suspensions;

  // Letter-anchored chords (Hooktheory root=0): build from scraped letter name.
  if (intent.isLetterAnchored) {
    const quality = effective._letterQuality || "major";
    const fullyDim = effective.dimTriad && chordType >= 7 && !effective.halfDim;
    const built = buildChordFromNoteName(
      intent.rootNoteName, quality, key, defaultChordOctave, chordType, inversion,
      fullyDim, suspensions, effective,
    );
    if (intent.slashBassName) {
      const voiced = voicingWithSlashBass(built.notes, built.chordDegrees, intent.slashBassName);
      return { notes: voiced.notes, chordDegrees: voiced.chordDegrees };
    }
    return built;
  }

  // Handle Applied Chords (Secondary Dominants/Functions)
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
    const appliedKey = { tonic: targetTonicNote, scale: "major" };

    const actualRootNote = getNoteLabel(effective.applied, appliedKey);
    const chordQuality = MAJOR_SCALE_CHORD_QUALITIES[effective.applied - 1];

    const sharp5AppliedMinorTriad = effective.applied === 7
      && chordQuality === "diminished"
      && (effective.alterations || []).includes("#5")
      && chordType < 7;
    const useSusFrame = suspensions.length > 0;
    const fullyDiminished = !sharp5AppliedMinorTriad
      && effective.applied === 7 && chordQuality === "diminished"
      && !useSusFrame;
    const halfDimApplied = chordType >= 7 && chordQuality === "diminished" && effective.applied !== 7;
    const useMaj7 = effective.useMaj7
      || (chordType >= 7 && chordQuality === "major" && effective.applied !== 5 && !useSusFrame);

    return buildChordFromNoteName(
      actualRootNote, sharp5AppliedMinorTriad ? "minor" : chordQuality, key, defaultChordOctave, chordType, inversion,
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
