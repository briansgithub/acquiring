import { resolveTriSubRoot } from "./chordSubstitutions.js";
import { TRIAD_DEGREES, MAJOR_SCALE_CHORD_QUALITIES } from "./scales.js";
import { replaceTriadThird } from "./chordSuspensions.js";
import { applyChordModifiers, applyTypeExtensions } from "./chordModifiers.js";
import { shiftNoteBySemitones, shiftPitchClass, noteLabel, noteNameToPc } from "./chordNoteUtils.js";
import { applySuspendedExtensionVoicing, finalizeVoicing } from "./chordVoicing.js";
import { resolveChordPolicy, enrichModifierChord } from "./chordPolicy.js";
import {
  resolveSeventhDegree, resolveOmitTriad35Seventh, resolveAppliedSeventhDegree,
  applySeventhToChord,
} from "./chordSeventh.js";
import {
  sdToToneJSNoteName,
  getNoteLabel,
  resolveBorrowedScale,
  getScaleChordQualities,
  calculateScaleDegrees,
} from "./musicScale.js";

// Builds the triad tones (3-note chord) - returns tone names and degree indices
function buildTriadTones(chordRootNoteName, chordDegrees, baseOctave) {
  const relativeOctave = 0;
  const rootKey = { tonic: chordRootNoteName, scale: "major" };

  const firstName = sdToToneJSNoteName(chordDegrees[0], relativeOctave, rootKey, baseOctave);
  const thirdName = sdToToneJSNoteName(chordDegrees[1], relativeOctave, rootKey, baseOctave);
  const fifthName = sdToToneJSNoteName(chordDegrees[2], relativeOctave, rootKey, baseOctave);

  return {
    toneJSNames: [firstName, thirdName, fifthName],
    degreeIndices: [0, 1, 2]
  };
}

// Adds the 7th note to make a 4-note chord - modifies toneJSNames and degreeIndices arrays.
// seventhDegree selects the seventh quality in the chord-root major frame:
//   "7" = major 7th (I△7), "b7" = minor 7th (dominant/half-dim), "bb7" = diminished 7th (vii°7).
function addSeventhNote(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, seventhDegree = "b7") {
  const relativeOctave = 0;
  const rootKey = { tonic: chordRootNoteName, scale: "major" };
  const seventhName = sdToToneJSNoteName(seventhDegree, relativeOctave, rootKey, baseOctave);
  toneJSNames.push(seventhName);
  degreeIndices.push(3);
}

// Applies inversion to chord tones - modifies toneJSNames and degreeIndices arrays
function applyInversion(toneJSNames, degreeIndices, inversion, baseOctave) {
  // If no inversion is needed, exit early
  if (!inversion || inversion <= 0) return;

  // Loop exactly 'inversion' times
  for (let i = 0; i < inversion; i++) {
    // 1. Rotate the degree index
    // Take the first element and move it to the back
    const movedDegreeIndex = degreeIndices.shift();
    degreeIndices.push(movedDegreeIndex);

    // 2. Rotate and modify the Note Name
    const note = toneJSNames.shift();

    // specific regex to capture pitch (Group 1) and octave (Group 2)
    // e.g. "C#4" -> "C#" and "4", or "Bbb3" -> "Bbb" and "3"
    const match = note.match(/^([^\d]+)(-?\d+)$/);

    if (match) {
      const pitchClass = match[1]; // The note name (e.g., C, F#, Bb)
      const currentOctave = parseInt(match[2], 10);
      
      // Increment the octave
      const newOctave = currentOctave + 1;
      
      // Reconstruct the note and push to the end of the array
      toneJSNames.push(`${pitchClass}${newOctave}`);
    } else {
      // Fallback: If for some reason the note format is invalid, just rotate it
      console.warn("applyInversion: Invalid note format encountered", note);
      toneJSNames.push(note);
    }
  }
}

// Applies secondary dominant transformations to chord tones
// Modifies toneJSNames and degreeIndices arrays if needed for secondary dominant behavior
function applySecondaryDominant(toneJSNames, degreeIndices, chordRootNoteName, chordQuality, baseOctave) {
  // Secondary dominants are typically dominant 7th chords (major triad + minor 7th)
  // If the chord quality is already "major", ensure it functions as a dominant
  // This function can be extended to handle other secondary dominant transformations
  
  // For now, if it's a major chord, we ensure it has dominant characteristics
  // The 7th note addition is handled separately, so this function focuses on
  // any additional tone modifications needed for secondary dominant behavior
  
  // Secondary dominants typically don't require tone modification beyond
  // what's already done in buildTriadTones and addSeventhNote
  // This function serves as a placeholder for future secondary dominant logic
  // that might modify intervals or add tensions
  
  // No modifications needed for basic secondary dominant behavior
  // The chord tones are already correct from buildTriadTones/addSeventhNote
}

function noteToMidiLocal(noteName) {
  const pc = noteNameToPc(noteLabel(noteName));
  const m = String(noteName).match(/(\d+)$/);
  if (pc == null || !m) return 0;
  return (parseInt(m[1], 10) + 1) * 12 + pc;
}

/** omit-3 power chord: inv2 = 6/4 → fifth in the bass (D5/A not A/D). */
function applyOmit3PowerInv2Bass(toneJSNames, degreeIndices) {
  if (toneJSNames.length !== 2) return;
  const rootIdx = degreeIndices.findIndex((d) => d === 0);
  const fifthIdx = degreeIndices.findIndex((d) => d === 2);
  if (rootIdx < 0 || fifthIdx < 0) return;
  const root = toneJSNames[rootIdx];
  const fifth = toneJSNames[fifthIdx];
  let bass = fifth;
  while (noteToMidiLocal(bass) >= noteToMidiLocal(root)) {
    bass = shiftNoteBySemitones(bass, -12);
  }
  let upper = root;
  if (noteToMidiLocal(upper) <= noteToMidiLocal(bass)) {
    upper = shiftNoteBySemitones(root, 12);
  }
  toneJSNames.length = 0;
  degreeIndices.length = 0;
  toneJSNames.push(bass, upper);
  degreeIndices.push(2, 0);
}

/** Rotate voicing so slash-bass letter matches lowest note (when bass PC is in the chord). */
export function voicingWithSlashBass(notes, chordDegrees, bassName) {
  if (!bassName || !notes?.length) return { notes, chordDegrees };
  const bassPc = noteNameToPc(bassName);
  if (bassPc == null) return { notes, chordDegrees };
  const idx = notes.findIndex((n) => noteNameToPc(noteLabel(n)) === bassPc);
  if (idx < 0) return { notes, chordDegrees };
  const paired = notes.map((n, i) => ({ n, d: chordDegrees?.[i] ?? 0 }));
  const rotated = [...paired.slice(idx), ...paired.slice(0, idx)];
  let bass = rotated[0].n;
  while (rotated.length > 1 && noteToMidiLocal(bass) >= noteToMidiLocal(rotated[1].n)) {
    bass = shiftNoteBySemitones(bass, -12);
  }
  rotated[0] = { ...rotated[0], n: bass };
  return {
    notes: rotated.map((p) => p.n),
    chordDegrees: rotated.map((p) => p.d),
  };
}

// Applied + borrowed: numerator from major of the borrowed-scale target; locrian applied===root → i(min7).
function resolveAppliedBorrowedChord(targetSD, appliedSD, key, baseOctave, borrowed, chordType, inversion, suspensions, modifierChord) {
  if (borrowed === "locrian" && targetSD === 1 && appliedSD === 1 && chordType < 7) {
    const { key: modifiedKey, customScaleIntervals } = resolveBorrowedScale(key, borrowed);
    const tonicNote = getNoteLabel(1, modifiedKey, customScaleIntervals);
    return buildChordFromNoteName(tonicNote, "minor", key, baseOctave, chordType, inversion, false, suspensions, modifierChord);
  }

  const { key: modifiedKey, customScaleIntervals } = resolveBorrowedScale(key, borrowed);
  const targetNote = getNoteLabel(targetSD, modifiedKey, customScaleIntervals);

  if (modifierChord?._triSubDominant && appliedSD === 5) {
    const subRoot = resolveTriSubRoot(targetNote);
    return buildChordFromNoteName(
      subRoot, "major", key, baseOctave, chordType, inversion, false, suspensions, modifierChord,
    );
  }

  const appliedKey = { tonic: targetNote, scale: "major" };
  const appliedQuality = MAJOR_SCALE_CHORD_QUALITIES[appliedSD - 1];
  const sharp5MinorApplied = modifierChord?.alterations?.includes("#5")
    && appliedSD === 7 && appliedQuality === "diminished";
  if (sharp5MinorApplied) {
    const appliedRoot = getNoteLabel(appliedSD, appliedKey);
    return buildChordFromNoteName(
      appliedRoot, "minor", key, baseOctave, chordType, inversion, false, suspensions, modifierChord,
    );
  }
  // Custom-array applied inv1/inv2: HT voices major triad on borrowed denominator, not V/target.
  if (Array.isArray(borrowed) && (inversion === 1 || inversion === 2)) {
    return buildChordFromNoteName(
      targetNote, "major", key, baseOctave, chordType, inversion, false, suspensions, modifierChord,
    );
  }
  return rootToDiatonicTriad(appliedSD, appliedKey, baseOctave, null, chordType, inversion, 0, suspensions, modifierChord);
}

//chordRootSD is explicitely an int from 1-7 (no modifiers). 
// it indicates the tonal basis of the chord
// chordType: 5 = triad, 7 = dominant 7th (4-note chord)
// inversion: 0 = root position, 1 = first inversion, 2 = second inversion, 3 = third inversion (7th chords only)
export function rootToDiatonicTriad(chordRootSD, key, baseOctave, borrowed = null, chordType = 5, inversion = 0, applied = 0, suspensions = [], modifierChord = null) {
  // Handle applied chords (secondary dominants/functions)
  if (applied !== 0 && applied >= 1 && applied <= 7) {
    if (borrowed) {
      return resolveAppliedBorrowedChord(chordRootSD, applied, key, baseOctave, borrowed, chordType, inversion, suspensions, modifierChord);
    }

    const { key: modifiedKey, customScaleIntervals, scaleChordQualities: resolvedQualities } = resolveBorrowedScale(key, borrowed);
    const scaleChordQualities = getScaleChordQualities(modifiedKey.scale, resolvedQualities);
    const appliedChordQuality = scaleChordQualities[applied - 1];
    const appliedScale = appliedChordQuality === "major" ? "mixolydian" : "phrygian";
    const chordRootSDNote = getNoteLabel(applied, modifiedKey, customScaleIntervals);
    const appliedKey = { tonic: chordRootSDNote, scale: appliedScale };
    return rootToDiatonicTriad(applied, appliedKey, baseOctave, null, chordType, inversion, 0, suspensions, modifierChord);
  }

  // Save the original key for scale degree calculation
  const originalKey = { ...key };

  // Resolve borrowed scale
  const { key: modifiedKey, customScaleIntervals, scaleChordQualities: resolvedQualities } = resolveBorrowedScale(key, borrowed);

  // Get chord qualities for the scale
  const scaleChordQualities = getScaleChordQualities(modifiedKey.scale, resolvedQualities);

  // Get chord root note name based on the modified key
  let chordRootNoteName = getNoteLabel(chordRootSD, modifiedKey, customScaleIntervals);

  // Get chord quality and degrees, degrees
  const chordQuality = scaleChordQualities[chordRootSD - 1];
  const useSusFrame = suspensions && suspensions.length > 0;
  const omitTriad35 = modifierChord?.omits?.includes(3) && modifierChord?.omits?.includes(5);

  const policy = resolveChordPolicy({
    key, originalKey, borrowed, modifiedKey, chordRootSD, chordType, inversion,
    chordQuality, modifierChord, useSusFrame, omitTriad35,
  });
  const effBase = enrichModifierChord(modifierChord, chordType, {
    customBorrowed: Array.isArray(borrowed),
    autoAlterations: policy.autoAlterations,
  });
  const effModifierChord = policy.minorV13Stack
    ? { ...effBase, minorV13Stack: true }
    : policy.minorI13B13
      ? { ...effBase, minorI13B13: true }
      : policy.hmBorrowedDominant13
        ? { ...effBase, hmBorrowedDominant13: true }
        : policy.customBorrowedHalfDim
          ? { ...effBase, customBorrowedHalfDim: true }
          : effBase;

  if (policy.rootShiftSemitones) {
    chordRootNoteName = shiftPitchClass(chordRootNoteName, policy.rootShiftSemitones);
  }

  const triadQuality = policy.triadQuality;
  let chordDegrees = TRIAD_DEGREES[triadQuality];

  // Build triad tones (3-note chord)
  let { toneJSNames, degreeIndices } = buildTriadTones(chordRootNoteName, chordDegrees, baseOctave);
  if (policy.augMaj7StackVoicing) {
    toneJSNames.splice(2, 1);
    degreeIndices.splice(2, 1);
  }

  // Add 7th note if needed (also the basis for 9th/11th chords). The seventh quality follows
  // the prevailing (borrowed-resolved) scale so notes agree with the rendered △7/ø7/°7 symbol.
  if (chordType >= 7 && !omitTriad35) {
    const seventhKind = resolveSeventhDegree({
      policy, useSusFrame, effModifierChord, chordRootSD, modifiedKey, chordQuality,
      customScaleIntervals, getNoteLabel,
    });
    applySeventhToChord(toneJSNames, degreeIndices, seventhKind, chordRootNoteName, baseOctave, sdToToneJSNoteName, effModifierChord);
  } else if (omitTriad35 && chordType >= 7) {
    const seventh = resolveOmitTriad35Seventh({
      useSusFrame, effModifierChord, chordRootSD, modifiedKey, chordQuality,
      customScaleIntervals, getNoteLabel,
    });
    addSeventhNote(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, seventh);
  }
  // Upper extensions (9 / 11 / 13) for extended chord types.
  const skipNine = effModifierChord?.omits?.includes(3) && effModifierChord?.omits?.includes(5)
    && (!!effModifierChord?.halfDim || policy.halfDim);
  applyTypeExtensions(
    toneJSNames, degreeIndices, chordRootNoteName, baseOctave, chordType, sdToToneJSNoteName, triadQuality,
    { natural11: policy.natural11, skipNine: skipNine || policy.skipNine, skipThirteenth: policy.skipThirteenth, customBorrowedHalfDimM7: policy.customBorrowedHalfDimM7, customBorrowedDimNatural11: policy.customBorrowedDimNatural11, dim11Natural: policy.dim11Natural, alterations: effModifierChord?.alterations, applied: !!effModifierChord?.appliedContext, halfDim: !!effModifierChord?.halfDim || policy.halfDim, borrowed },
  );

  replaceTriadThird(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, suspensions, sdToToneJSNoteName);

  applyChordModifiers(
    toneJSNames, degreeIndices, chordRootNoteName, baseOctave,
    { ...effModifierChord, triadQuality, halfDim: !effModifierChord?.dimTriad && (!!effModifierChord?.halfDim || policy.halfDim), augmentedTriad: triadQuality === "augmented" },
    sdToToneJSNoteName,
  );

  applySuspendedExtensionVoicing(toneJSNames, degreeIndices, chordRootNoteName, modifierChord);

  // Apply secondary dominant transformations
  applySecondaryDominant(toneJSNames, degreeIndices, chordRootNoteName, chordQuality, baseOctave);

  // Apply inversion
  applyInversion(toneJSNames, degreeIndices, inversion, baseOctave);
  const omit3Power = modifierChord?.omits?.includes(3)
    && !modifierChord?.omits?.includes(5)
    && chordType < 7;
  if (omit3Power && inversion === 2) {
    applyOmit3PowerInv2Bass(toneJSNames, degreeIndices);
  }

  const dimSeventh = policy.dimSeventh;
  [toneJSNames, degreeIndices] = finalizeVoicing(toneJSNames, degreeIndices, {
    triadDiminished: dimSeventh,
    inversion,
    chordType,
  });

  const baseKeyDegrees = calculateScaleDegrees(
    toneJSNames,
    degreeIndices,
    chordRootNoteName,
    chordDegrees,
    chordType,
  );

  return { notes: toneJSNames, chordDegrees: baseKeyDegrees };
}

const TRIAD_SEMITONES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
};

function labelWithOctave(label, octave) {
  return `${label}${octave}`;
}

// Helper function to build a chord directly from a note name and quality
export function buildChordFromNoteName(rootNoteName, quality, originalKey, baseOctave, chordType, inversion, fullyDiminished = false, suspensions = [], modifierChord = null) {
  const useSusFrame = suspensions && suspensions.length > 0;
  const triadQuality = modifierChord?.halfDim || modifierChord?.dimTriad
    ? "diminished"
    : useSusFrame && quality === "diminished" ? "major" : quality;
  const chordDegrees = TRIAD_DEGREES[triadQuality];
  const triadOffsets = TRIAD_SEMITONES[triadQuality] || TRIAD_SEMITONES.major;

  const firstName = labelWithOctave(rootNoteName, baseOctave);
  let toneJSNames = triadOffsets.map((offset) => shiftNoteBySemitones(firstName, offset));
  let degreeIndices = [0, 1, 2];
  
  // Add 7th if needed. Fully-diminished sevenths (vii°7) use a diminished 7th (bb7);
  // all others use a minor 7th (b7), which covers dominant and half-diminished sevenths.
  if (chordType >= 7) {
    const seventhDegree = resolveAppliedSeventhDegree({
      fullyDiminished, modifierChord, quality, chordType,
    });
    const seventhSemitones = seventhDegree === "bb7" ? 9
      : seventhDegree === "7" ? 11
        : 10;
    const seventhName = shiftNoteBySemitones(toneJSNames[0], seventhSemitones);
    toneJSNames.push(seventhName);
    degreeIndices.push(3);
  }
  applyTypeExtensions(
    toneJSNames, degreeIndices, rootNoteName, baseOctave, chordType, sdToToneJSNoteName, quality,
    { alterations: modifierChord?.alterations, applied: true },
  );

  replaceTriadThird(toneJSNames, degreeIndices, rootNoteName, baseOctave, suspensions, sdToToneJSNoteName);

  applyChordModifiers(toneJSNames, degreeIndices, rootNoteName, baseOctave, modifierChord, sdToToneJSNoteName);

  applySuspendedExtensionVoicing(toneJSNames, degreeIndices, rootNoteName, modifierChord);
  
  // Apply inversion
  if (inversion > 0) {
    const numNotes = toneJSNames.length;
    const reorderedNotes = [];
    const reorderedDegreeIndices = [];
    
    // First pass: extract all note info and calculate bass octave
    const noteInfos = [];
    let bassOctave = null;
    
    for (let i = 0; i < numNotes; i++) {
      const sourceIndex = (inversion + i) % numNotes;
      const noteName = toneJSNames[sourceIndex];
      const degreeIdx = degreeIndices[sourceIndex];
      
      const noteMatch = noteName.match(/^([A-G](?:[#bx]+|[b]+)?)(\d+)$/);
      if (!noteMatch) {
        noteInfos.push({ noteBase: noteName, octave: baseOctave, degreeIdx });
        if (i === 0) bassOctave = baseOctave - 1;
        continue;
      }
      
      const [, noteBase, octaveStr] = noteMatch;
      const octave = parseInt(octaveStr, 10);
      
      if (i === 0) {
        // Bass note: move down an octave
        bassOctave = Math.max(1, octave - 1);
      }
      
      noteInfos.push({ noteBase, octave, degreeIdx });
    }
    
    // Second pass: assign octaves ensuring proper voice spacing
    // Find the highest original octave among upper notes to determine target octave
    let highestUpperOctave = 0;
    for (let i = 1; i < numNotes; i++) {
      if (noteInfos[i].octave > highestUpperOctave) {
        highestUpperOctave = noteInfos[i].octave;
      }
    }
    
    // Target octave for all upper notes: use the highest original octave among upper notes
    // But ensure it's at least one octave above bass
    const targetUpperOctave = Math.max(highestUpperOctave, bassOctave + 1);
    
    for (let i = 0; i < numNotes; i++) {
      const { noteBase, degreeIdx } = noteInfos[i];
      
      let finalOctave;
      if (i === 0) {
        // Bass note uses calculated bass octave
        finalOctave = bassOctave;
      } else {
        // All upper notes go to the same target octave
        finalOctave = targetUpperOctave;
      }
      
      reorderedNotes.push(`${noteBase}${finalOctave}`);
      reorderedDegreeIndices.push(degreeIdx);
    }
    
    toneJSNames = reorderedNotes;
    degreeIndices = reorderedDegreeIndices;
  }

  [toneJSNames, degreeIndices] = finalizeVoicing(toneJSNames, degreeIndices, {
    fullyDiminished,
    triadDiminished: triadQuality === "diminished" && chordType >= 7,
    inversion,
    chordType,
  });

  const baseKeyDegrees = calculateScaleDegrees(
    toneJSNames,
    degreeIndices,
    rootNoteName,
    chordDegrees,
    chordType,
  );

  return { notes: toneJSNames, chordDegrees: baseKeyDegrees };
}
