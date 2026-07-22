import {
  NOTE_NAME_TO_INTEGER_NOTATION,
  MAJOR_SCALE_SPECIFIC_INTERVALS,
  MINOR_SCALE_SPECIFIC_INTERVALS,
  DORIAN_SCALE_SPECIFIC_INTERVALS,
  PHRYGIAN_SCALE_SPECIFIC_INTERVALS,
  LYDIAN_SCALE_SPECIFIC_INTERVALS,
  MIXOLYDIAN_SCALE_SPECIFIC_INTERVALS,
  LOCRIAN_SCALE_SPECIFIC_INTERVALS,
  DEFAULT_KEY,
  MAJOR_SCALE_LABELS,
  MINOR_SCALE_LABELS,
  MAJOR_SCALE_CHORD_QUALITIES,
  MINOR_SCALE_CHORD_QUALITIES,
  DORIAN_SCALE_CHORD_QUALITIES,
  PHRYGIAN_SCALE_CHORD_QUALITIES,
  LYDIAN_SCALE_CHORD_QUALITIES,
  MIXOLYDIAN_SCALE_CHORD_QUALITIES,
  LOCRIAN_SCALE_CHORD_QUALITIES,
  HARMONIC_MINOR_SCALE_SPECIFIC_INTERVALS,
  HARMONIC_MINOR_SCALE_CHORD_QUALITIES,
  PHRYGIAN_DOMINANT_SCALE_SPECIFIC_INTERVALS,
  PHRYGIAN_DOMINANT_SCALE_CHORD_QUALITIES,
  generateScaleLabels,
} from "./scales.js";
import {
  getCustomBorrowedIntervals,
  resolveBorrowedScale,
  getScaleChordQualities,
} from "./scaleBorrowed.js";

export { getCustomBorrowedIntervals, resolveBorrowedScale, getScaleChordQualities };

function normalizeTonic(tonic) {
  if (!tonic || typeof tonic !== "string") return tonic;
  // Normalize Unicode flat/sharp symbols to ASCII equivalents
  return tonic
    .trim()
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/♮/g, "");
}

export function parseKey(metadata) {
  const entry = metadata?.keys?.[0];
  if (!entry) {
    console.warn("No key found in metadata, using DEFAULT_KEY", DEFAULT_KEY);
    return DEFAULT_KEY;
  }
  const rawTonic = entry.tonic ?? DEFAULT_KEY.tonic;
  const tonic = normalizeTonic(rawTonic);
  const scale = entry.scale ?? DEFAULT_KEY.scale;
  const key = { tonic, scale };
  if (NOTE_NAME_TO_INTEGER_NOTATION[tonic] === undefined) {
    console.error(`Parsed key has invalid tonic "${tonic}" (normalized from "${rawTonic}"). Available keys:`, Object.keys(INTEGER_NOTATION));
  }
  return key;
}

//takes in an int or string and returns an integer (via parseInt)
function rawDegree(sd) {
  sd = sd.toString()
  return parseInt(sd.replace(/[^0-9]/g, ""), 10) || 1;
}
function modifierValue(sd) {
  // Count leading accidentals before the degree digit: bb7 -> -2, b7 -> -1, #7 -> +1.
  const m = sd.toString().match(/^([#b]+)/);
  if (!m) return 0;
  let v = 0;
  for (const ch of m[1]) {
    if (ch === '#') v += 1;
    else if (ch === 'b') v -= 1;
  }
  return v;
}
function modifierString(sd) {
  const v = modifierValue(sd);
  if (v > 0) return '#'.repeat(v);
  if (v < 0) return 'b'.repeat(-v);
  return "";
}

// Scale degree 1-7 may be modified with #/b, so processing is more than just a lookup table
// may return negative if flats or above 12 if sharps
export function scaleDegreeToSpecificInterval(sd, scale, customIntervals = null) {
/*
  const tonicOffset = NOTE_NAME_TO_INTEGER_NOTATION[key.tonic];
  if (tonicOffset === undefined) {
    console.error(`Invalid tonic "${key.tonic}" not found in NOTE_NAME_TO_INTEGER_NOTATION`);
  }
    */

  const rawDegreeNumber = rawDegree(sd);
  const accidentalShift = modifierValue(sd);

  let scaleSpecificIntervals;
  if (scale === "major") {
    scaleSpecificIntervals = MAJOR_SCALE_SPECIFIC_INTERVALS;
  } else if (scale === "minor") {
    scaleSpecificIntervals = MINOR_SCALE_SPECIFIC_INTERVALS;
  } else if (scale === "dorian") {
    scaleSpecificIntervals = DORIAN_SCALE_SPECIFIC_INTERVALS;
  } else if (scale === "phrygian") {
    scaleSpecificIntervals = PHRYGIAN_SCALE_SPECIFIC_INTERVALS;
  } else if (scale === "lydian") {
    scaleSpecificIntervals = LYDIAN_SCALE_SPECIFIC_INTERVALS;
  } else if (scale === "mixolydian") {
    scaleSpecificIntervals = MIXOLYDIAN_SCALE_SPECIFIC_INTERVALS;
  } else if (scale === "locrian") {
    scaleSpecificIntervals = LOCRIAN_SCALE_SPECIFIC_INTERVALS;
  } else if (scale === "harmonicMinor") {
    scaleSpecificIntervals = HARMONIC_MINOR_SCALE_SPECIFIC_INTERVALS;
  } else if (scale === "phrygianDominant") {
    scaleSpecificIntervals = PHRYGIAN_DOMINANT_SCALE_SPECIFIC_INTERVALS;
  } else if (scale === "custom" && customIntervals) {
    scaleSpecificIntervals = customIntervals;
  } else {
    throw new Error(`Unsupported scale type: ${scale}`);
  }

  const specficInterval = scaleSpecificIntervals[(rawDegreeNumber - 1)] + accidentalShift;
  return specficInterval;
}

function appendAccidental(label, shift) {
  // label: e.g., F, F#, Bb, Fx (double-sharp), Bbb (double-flat).
  // Returns Tone.js format: letter + accidental(s). Uses proper accidental arithmetic so that
  // shifting a double-accidental works (e.g. lowering "Fx" by 1 -> "F#", not "F").
  if (shift === 0) return label;
  const letter = label[0];
  let value = 0;
  for (const ch of label.slice(1)) {
    if (ch === '#') value += 1;
    else if (ch === 'x') value += 2;
    else if (ch === 'b') value -= 1;
  }
  value += shift;
  let acc = '';
  if (value > 0) acc = value === 2 ? 'x' : '#'.repeat(value); // Tone.js double-sharp = "x"
  else if (value < 0) acc = 'b'.repeat(-value);
  return letter + acc;
}

export function getNoteLabel(sd, key, customIntervals = null) {
  const rawDegreeNumber = rawDegree(sd);
  const accidentalShift = modifierValue(sd);

  let diatonicNames;
  if(key.scale === "major") {
    // Theoretical/enharmonic tonics (e.g. D# major, borrowed-minor flat keys) are absent
    // from the hardcoded label tables; fall back to dynamic generation so they don't crash.
    diatonicNames = MAJOR_SCALE_LABELS[key.tonic]
      ?? generateScaleLabels(key.tonic, MAJOR_SCALE_SPECIFIC_INTERVALS);
  } else if (key.scale === "minor") {
    diatonicNames = MINOR_SCALE_LABELS[key.tonic]
      ?? generateScaleLabels(key.tonic, MINOR_SCALE_SPECIFIC_INTERVALS);
  } else {
    // For other modes or custom scales, generate labels dynamically
    let intervals;
    if (key.scale === "dorian") {
      intervals = DORIAN_SCALE_SPECIFIC_INTERVALS;
    } else if (key.scale === "phrygian") {
      intervals = PHRYGIAN_SCALE_SPECIFIC_INTERVALS;
    } else if (key.scale === "lydian") {
      intervals = LYDIAN_SCALE_SPECIFIC_INTERVALS;
    } else if (key.scale === "mixolydian") {
      intervals = MIXOLYDIAN_SCALE_SPECIFIC_INTERVALS;
    } else if (key.scale === "locrian") {
      intervals = LOCRIAN_SCALE_SPECIFIC_INTERVALS;
    } else if (key.scale === "harmonicMinor") {
      intervals = HARMONIC_MINOR_SCALE_SPECIFIC_INTERVALS;
    } else if (key.scale === "phrygianDominant") {
      intervals = PHRYGIAN_DOMINANT_SCALE_SPECIFIC_INTERVALS;
    } else if (key.scale === "custom" && customIntervals) {
      intervals = customIntervals;
    } else {
      throw new Error(`Unsupported scale type: ${key.scale}`);
    }
    diatonicNames = generateScaleLabels(key.tonic, intervals);
  }

  const baseLabel = diatonicNames[rawDegreeNumber - 1];
  const retval = appendAccidental(baseLabel, accidentalShift);
  return retval;
}

const NOTE_PC_LOCAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToPcLocal(note) {
  const m = (note || '').match(/^([A-Ga-g])(.*)$/);
  if (!m) return null;
  let pc = NOTE_PC_LOCAL[m[1].toUpperCase()];
  for (const ch of m[2]) { if (ch === '#') pc += 1; else if (ch === 'x') pc += 2; else if (ch === 'b') pc -= 1; }
  return ((pc % 12) + 12) % 12;
}

function getAbsoluteOctave(sd, relativeOctave, key, baseOctave, customIntervals = null) {

  // We need to use the MODIFIED interval (accounting for accidentals) for accurate semitone calculation
  // The modifier affects both the note label AND the actual pitch/semitone distance
  // For example, "b3" means minor third (3 semitones), not major third (4 semitones)
  const tonicSemitone = NOTE_NAME_TO_INTEGER_NOTATION[key.tonic] ?? noteToPcLocal(key.tonic);
  const modifiedSD_SpecificInterval = scaleDegreeToSpecificInterval(sd, key.scale, customIntervals);
  
  /* The note name and octave must be calculated together to properly handle the B--C boundary.
   The B--C boundary is where octaves change in standard notation and Tone.js.
   We need to check if the resulting note name crosses this boundary upward.
   
   For example:
   - G#3 + minor third (b3) = B3 (not B4), because B comes before C in the same octave
   - G#3 + major third (3) = B#3, which is enharmonically C4, so we've crossed the boundary
   */

  // Calculate base octave from semitone math using the MODIFIED interval
  let octaveOffset = Math.floor((tonicSemitone + modifiedSD_SpecificInterval) / 12);
  
  // Get the note name that will be generated to check for B--C boundary crossing
  const noteLabel = getNoteLabel(sd, key, customIntervals);
  const noteLetter = noteLabel.replace(/[#bx]+/g, "").replace(/b+/g, ""); // Extract base letter (C, D, E, etc.)

  // Extract tonic base letter
  const tonicBase = key.tonic.replace(/[#bx]+/g, "").replace(/b+/g, "");
  const noteOrder = ["C", "D", "E", "F", "G", "A", "B"];
  const tonicIndex = noteOrder.indexOf(tonicBase);
  const noteIndex = noteOrder.indexOf(noteLetter);
  
  // Check if we've crossed the B--C boundary upward based on note letter names
  // This happens when the note letter wraps around from B back to C (or later)
  // If the note letter index is less than the tonic index, we've wrapped around
  const hasLetterWrappedAround = noteIndex < tonicIndex;
  const totalSemitones = tonicSemitone + modifiedSD_SpecificInterval;
  
  // If the letter has wrapped around (e.g., B -> C), we've crossed the boundary upward
  // But we need to make sure we're actually going forward (not backward with negative intervals)
  if (hasLetterWrappedAround && totalSemitones >= 0) {
    // We've crossed the B--C boundary upward
    // Math.floor should have already added the octave if totalSemitones >= 12
    // But if totalSemitones < 12 and we've wrapped around, we need to add an octave
    if (totalSemitones < 12 && octaveOffset === 0) {
      octaveOffset = 1;
    }
  }

  const retval = baseOctave + relativeOctave + octaveOffset;
  return retval;
}

export function sdToToneJSNoteName(sd, relOctave, key, baseOctave, customIntervals = null) {
  const noteLabel = getNoteLabel(sd, key, customIntervals);
  const absoluteOctave = getAbsoluteOctave(sd, relOctave, key, baseOctave, customIntervals);
  return `${noteLabel}${absoluteOctave}`;
}

// Calculates scale degrees relative to original key (label logic)
export function resolveChordRootSD(rootNoteName, key) {
  for (let sd = 1; sd <= 7; sd++) {
    if (getNoteLabel(sd, key) === rootNoteName) return sd;
  }
  for (let sd = 1; sd <= 7; sd++) {
    const diatonic = getNoteLabel(sd, key);
    if (rootNoteName[0] === diatonic[0] && getModifierDifference(rootNoteName, diatonic)) {
      return sd;
    }
  }
  return 1;
}

export function calculateScaleDegrees(toneJSNames, degreeIndices, chordRootSD, chordDegrees, chordType, originalKey) {
  const extensionBaseDegree = {
    3: "7", // chord seventh
    4: "2", // 9th
    5: "4", // 11th
    6: "6", // 13th
  };
  return toneJSNames.map((noteName, index) => {
    const degreeIdx = degreeIndices[index];
    let degree;

    if (degreeIdx < 3) {
      // Triad notes use chordDegrees
      degree = chordDegrees[degreeIdx];
    } else if (extensionBaseDegree[degreeIdx]) {
      // Upper structure indices come from the chord-root major frame.
      degree = extensionBaseDegree[degreeIdx];
    } else {
      // Fallback (shouldn't happen)
      degree = "1";
    }

    const rawNumber = rawDegree(degree);

    // Calculate the generic scale degree integer (1-7)
    const calculatedDegree = ((((chordRootSD - 1) + (rawNumber - 1)) % 7) + 1);

    // Get the ACTUAL note name (strip octave, e.g., "Ab4" -> "Ab")
    const actualNote = noteName.replace(/[0-9]/g, '');

    // Get the EXPECTED diatonic note for this degree in the ORIGINAL key
    const diatonicNote = getNoteLabel(calculatedDegree, originalKey);

    // Calculate the modifier by comparing the actual vs diatonic note
    const modifier = getModifierDifference(actualNote, diatonicNote);

    return `${modifier}${calculatedDegree}`;
  });
}

// --- HELPER FUNCTION ---
// Calculates the accidental difference between two notes of the same letter
// e.g., actual="Ab", diatonic="A" -> returns "b"
// e.g., actual="F#", diatonic="F" -> returns "#"
function getModifierDifference(actual, diatonic) {
  const actualPc = noteToPcLocal(actual);
  const diatonicPc = noteToPcLocal(diatonic);
  if (actualPc == null || diatonicPc == null) return "";
  let diff = actualPc - diatonicPc;
  while (diff > 6) diff -= 12;
  while (diff < -6) diff += 12;

  if (diff === 0) return "";
  if (diff === -1) return "b";
  if (diff === -2) return "bb";
  if (diff === 1) return "#";
  if (diff === 2) return "##"; // or x
  return "";
}
