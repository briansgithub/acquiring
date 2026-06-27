import {
  NOTE_NAME_TO_INTEGER_NOTATION,
  MAJOR_SCALE_SPECIFIC_INTERVALS,
  MINOR_SCALE_SPECIFIC_INTERVALS,
  DORIAN_SCALE_SPECIFIC_INTERVALS,
  PHRYGIAN_SCALE_SPECIFIC_INTERVALS,
  LYDIAN_SCALE_SPECIFIC_INTERVALS,
  MIXOLYDIAN_SCALE_SPECIFIC_INTERVALS,
  LOCRIAN_SCALE_SPECIFIC_INTERVALS,
  DEFAULT_TEMPO,
  DEFAULT_KEY,
  MAJOR_SCALE_LABELS,
  MINOR_SCALE_LABELS,
  TRIAD_DEGREES,
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
import { replaceTriadThird } from "./chordSuspensions.js";
import { applyChordModifiers, applyTypeExtensions } from "./chordModifiers.js";
import { shiftNoteBySemitones } from "./chordNoteUtils.js";



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
    diatonicNames = MAJOR_SCALE_LABELS[key.tonic];
  } else if (key.scale === "minor") {
    diatonicNames = MINOR_SCALE_LABELS[key.tonic];
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

function getAbsoluteOctave(sd, relativeOctave, key, baseOctave, customIntervals = null) {

  // We need to use the MODIFIED interval (accounting for accidentals) for accurate semitone calculation
  // The modifier affects both the note label AND the actual pitch/semitone distance
  // For example, "b3" means minor third (3 semitones), not major third (4 semitones)
  const tonicSemitone = NOTE_NAME_TO_INTEGER_NOTATION[key.tonic];
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


// Calculate chord quality from custom scale intervals
// borrowedArray: original array from API
// degree: scale degree (1-7)
// Returns chord quality for a given scale degree
function getChordQualityFromCustomScale(borrowedArray, degree) {
  // Get normalized intervals [d1, d2, d3, d4, d5, d6, d7] where d1=0 (root)
  const intervals = getCustomScaleIntervals(borrowedArray);
  
  // Get intervals for the triad: root (degree), third (degree+2), fifth (degree+4)
  // intervals[0] = degree 1, intervals[1] = degree 2, etc.
  const rootIdx = (degree - 1) % 7; // degree 1 -> index 0, degree 2 -> index 1, etc.
  const thirdIdx = (degree + 1) % 7; // degree + 2 - 1 (0-indexed), wrapped
  const fifthIdx = (degree + 3) % 7; // degree + 4 - 1 (0-indexed), wrapped
  
  const rootInterval = intervals[rootIdx];
  let thirdInterval = intervals[thirdIdx];
  let fifthInterval = intervals[fifthIdx];
  
  // Handle octave wrapping for third and fifth
  if (thirdIdx < rootIdx) thirdInterval += 12;
  if (fifthIdx < rootIdx) fifthInterval += 12;
  
  // Calculate intervals relative to root
  const thirdSemitones = thirdInterval - rootInterval;
  const fifthSemitones = fifthInterval - rootInterval;
  
  // Determine chord quality based on intervals
  // Major third = 4 semitones, minor third = 3 semitones
  // Perfect fifth = 7 semitones, diminished fifth = 6 semitones
  const isMajorThird = thirdSemitones === 4;
  const isMinorThird = thirdSemitones === 3;
  const isPerfectFifth = fifthSemitones === 7;
  const isDiminishedFifth = fifthSemitones === 6;
  
  if (isMajorThird && isPerfectFifth) {
    return "major";
  } else if (isMinorThird && isPerfectFifth) {
    return "minor";
  } else if (isMinorThird && isDiminishedFifth) {
    return "diminished";
  } else {
    // Fallback: try to determine from third interval
    return isMajorThird ? "major" : "minor";
  }
}

// Generate chord qualities array for all 7 degrees from custom scale intervals
function generateChordQualitiesFromCustomScale(intervals) {
  const qualities = [];
  for (let degree = 1; degree <= 7; degree++) {
    qualities.push(getChordQualityFromCustomScale(intervals, degree));
  }
  return qualities;
}

// Generate scale-specific intervals from borrowed array
// Returns array of 7 intervals [d1, d2, d3, d4, d5, d6, d7] where each is semitone interval from root
// Format matches MAJOR_SCALE_SPECIFIC_INTERVALS = [0, 2, 4, 5, 7, 9, 11]
function getCustomScaleIntervals(borrowedArray) {
  if (!borrowedArray || borrowedArray.length === 0) {
    return [0, 2, 4, 5, 7, 9, 11]; // Default to major scale
  }
  
  // The borrowed array holds ABSOLUTE semitone offsets from the tonic for degrees 1-7
  // (verified against rendered ground truth: e.g. [1,3,4,6,8,10,11] in Ab yields a VII = G
  // because degree 7 = 11 semitones above the tonic). They are used directly, NOT re-based.
  const intervals = [];
  for (let i = 0; i < 7; i++) {
    let interval;
    if (i < borrowedArray.length) {
      interval = borrowedArray[i];
    } else {
      // Default: continue pattern from last interval
      const lastInterval = intervals[intervals.length - 1] ?? 0;
      interval = (lastInterval + 2) % 12; // Default: whole step
    }
    
    // Normalize negative values
    if (interval < 0) {
      interval = 12 + interval;
    }
    // Ensure it's within 0-11 range
    interval = interval % 12;
    intervals.push(interval);
  }
  
  return intervals; // Returns exactly 7 elements
}

// Resolves borrowed scale and returns the modified key, custom intervals, and chord qualities
function resolveBorrowedScale(key, borrowed) {
  let { tonic, scale } = key;
  let customScaleIntervals = null;
  let scaleChordQualities = null;

  if (borrowed === null || borrowed === "") {
    scale = key.scale;
  } else if (typeof borrowed === "string") {
    // Handle string mode names
    if (borrowed === "major") {
      scale = "major";
    } else if (borrowed === "minor") {
      scale = "minor";
    } else if (borrowed === "dorian") {
      scale = "dorian";
    } else if (borrowed === "phrygian") {
      scale = "phrygian";
    } else if (borrowed === "lydian") {
      scale = "lydian";
    } else if (borrowed === "mixolydian") {
      scale = "mixolydian";
    } else if (borrowed === "locrian") {
      scale = "locrian";
    } else if (borrowed === "harmonicMinor") {
      scale = "harmonicMinor";
    } else if (borrowed === "phrygianDominant") {
      scale = "phrygianDominant";
    } else {
      throw new Error(`Unsupported borrowed type: ${borrowed}`);
    }
  } else if (Array.isArray(borrowed)) {
    // Custom scale definition: array of semitone intervals for degrees 1-7
    customScaleIntervals = getCustomScaleIntervals(borrowed);
    scaleChordQualities = generateChordQualitiesFromCustomScale(borrowed);
    scale = "custom";
  } else {
    throw new Error(`Unsupported borrowed type: ${borrowed}`);
  }

  return {
    key: { tonic, scale },
    customScaleIntervals,
    scaleChordQualities
  };
}

// Gets chord qualities for a given scale
function getScaleChordQualities(scale, scaleChordQualities) {
  if (scaleChordQualities) {
    return scaleChordQualities;
  }

  if (scale === "major") {
    return MAJOR_SCALE_CHORD_QUALITIES;
  } else if (scale === "minor") {
    return MINOR_SCALE_CHORD_QUALITIES;
  } else if (scale === "dorian") {
    return DORIAN_SCALE_CHORD_QUALITIES;
  } else if (scale === "phrygian") {
    return PHRYGIAN_SCALE_CHORD_QUALITIES;
  } else if (scale === "lydian") {
    return LYDIAN_SCALE_CHORD_QUALITIES;
  } else if (scale === "mixolydian") {
    return MIXOLYDIAN_SCALE_CHORD_QUALITIES;
  } else if (scale === "locrian") {
    return LOCRIAN_SCALE_CHORD_QUALITIES;
  } else if (scale === "harmonicMinor") {
    return HARMONIC_MINOR_SCALE_CHORD_QUALITIES;
  } else if (scale === "phrygianDominant") {
    return PHRYGIAN_DOMINANT_SCALE_CHORD_QUALITIES;
  } else {
    throw new Error(`Unsupported scale type: ${scale}`);
  }
}

// Builds the triad tones (3-note chord) - returns tone names and degree indices
function buildTriadTones(chordRootNoteName, chordDegrees, baseOctave) {
  const relativeOctave = 0;
  const rootKey = { tonic: chordRootNoteName, scale: "major" };

  const firstName = sdToToneJSNoteName(chordDegrees[0], relativeOctave, rootKey, baseOctave);
  const thirdName = sdToToneJSNoteName(chordDegrees[1], relativeOctave, rootKey, baseOctave);
  const fifthName = sdToToneJSNoteName(chordDegrees[2], relativeOctave, rootKey, baseOctave);

  console.log("buildTriadTones", {
    firstName,
    thirdName,
    fifthName
  });

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

const NOTE_PC_LOCAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToPcLocal(note) {
  const m = (note || '').match(/^([A-Ga-g])(.*)$/);
  if (!m) return null;
  let pc = NOTE_PC_LOCAL[m[1].toUpperCase()];
  for (const ch of m[2]) { if (ch === '#') pc += 1; else if (ch === 'x') pc += 2; else if (ch === 'b') pc -= 1; }
  return ((pc % 12) + 12) % 12;
}

// Determine the diatonic seventh quality of the chord at `chordRootSD` within `effKey`, so the
// generated notes match the rendered symbol (e.g. I△7 = major 7th, vii°7 in harmonic minor =
// diminished 7th). Returns "7" (major), "b7" (minor/dominant), or "bb7" (diminished).
function diatonicSeventhDegreeStr(chordRootSD, effKey, customIntervals) {
  try {
    const r = noteToPcLocal(getNoteLabel(chordRootSD, effKey, customIntervals));
    const sevSD = ((chordRootSD - 1 + 6) % 7) + 1;
    const s = noteToPcLocal(getNoteLabel(sevSD, effKey, customIntervals));
    if (r == null || s == null) return "b7";
    const iv = (((s - r) % 12) + 12) % 12;
    if (iv === 11) return "7";
    if (iv === 9) return "bb7";
    return "b7";
  } catch (e) { return "b7"; }
}


function isHalfDiminishedIi(chordRootSD, modifiedKey, chordType, useSusFrame, modifierChord) {
  return !useSusFrame
    && chordRootSD === 2
    && modifiedKey.scale === "major"
    && chordType >= 7
    && !!modifierChord?.halfDim;
}

function enrichModifierChord(modifierChord, chordRootSD, modifiedKey, chordType, useSusFrame) {
  if (!modifierChord) return null;
  const alterations = [...(modifierChord.alterations || [])];
  if (modifierChord.halfDim && chordType >= 9) {
    for (const a of ["b5", "b9"]) {
      if (!alterations.includes(a)) alterations.push(a);
    }
    if (modifierChord.omits?.includes(3) && modifierChord.omits?.includes(5)) {
      const i = alterations.indexOf("b9");
      if (i >= 0) alterations.splice(i, 1);
    }
  }
  if (!modifierChord.halfDim && alterations.length === (modifierChord.alterations || []).length) {
    return modifierChord;
  }
  return { ...modifierChord, alterations };
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

// Calculates scale degrees relative to original key (label logic)
function calculateScaleDegrees(toneJSNames, degreeIndices, chordRootSD, chordDegrees, chordType, originalKey) {
  return toneJSNames.map((noteName, index) => {
    const degreeIdx = degreeIndices[index];
    let degree;

    if (degreeIdx < 3) {
      // Triad notes use chordDegrees
      degree = chordDegrees[degreeIdx];
    } else if (degreeIdx === 3 && chordType === 7) {
      // 7th note uses b7
      degree = "b7";
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

//chordRootSD is explicitely an int from 1-7 (no modifiers). 
// it indicates the tonal basis of the chord
// chordType: 5 = triad, 7 = dominant 7th (4-note chord)
// inversion: 0 = root position, 1 = first inversion, 2 = second inversion, 3 = third inversion (7th chords only)
export function rootToDiatonicTriad(chordRootSD, key, baseOctave, borrowed = null, chordType = 5, inversion = 0, applied = 0, suspensions = [], modifierChord = null) {
  // Handle applied chords (secondary dominants/functions)
  if (applied !== 0 && applied >= 1 && applied <= 7) {
    // Resolve borrowed scale to get chord qualities
    const { key: modifiedKey, customScaleIntervals, scaleChordQualities: resolvedQualities } = resolveBorrowedScale(key, borrowed);
    const scaleChordQualities = getScaleChordQualities(modifiedKey.scale, resolvedQualities);
    
    // Determine if the applied scale degree chord is major or minor
    const appliedChordQuality = scaleChordQualities[applied - 1];
    const appliedScale = appliedChordQuality === "major" ? "mixolydian" : "phrygian";
    
    // Get the note at the applied scale degree
    const chordRootSDNote = getNoteLabel(applied, modifiedKey, customScaleIntervals);
    
    // Create the new key for the applied chord
    const appliedKey = { tonic: chordRootSDNote, scale: appliedScale };
    
    // Recursively call rootToDiatonicTriad with applied as chordRootSD
    return rootToDiatonicTriad(applied, appliedKey, baseOctave, borrowed, chordType, inversion, 0, suspensions, modifierChord);
  }

  // Save the original key for scale degree calculation
  const originalKey = { ...key };

  // Resolve borrowed scale
  const { key: modifiedKey, customScaleIntervals, scaleChordQualities: resolvedQualities } = resolveBorrowedScale(key, borrowed);

  // Get chord qualities for the scale
  const scaleChordQualities = getScaleChordQualities(modifiedKey.scale, resolvedQualities);

  // Get chord root note name based on the modified key
  const chordRootNoteName = getNoteLabel(chordRootSD, modifiedKey, customScaleIntervals);

  // Get chord quality and degrees, degrees
  const chordQuality = scaleChordQualities[chordRootSD - 1];
  const useSusFrame = suspensions && suspensions.length > 0;
  const halfDimIi = isHalfDiminishedIi(chordRootSD, modifiedKey, chordType, useSusFrame, modifierChord);
  const triadQuality = halfDimIi
    ? "diminished"
    : (useSusFrame && chordQuality === "diminished" ? "major" : chordQuality);
  let chordDegrees = TRIAD_DEGREES[triadQuality];
  const effModifierChord = enrichModifierChord(modifierChord, chordRootSD, modifiedKey, chordType, useSusFrame);
  const omitTriad35 = effModifierChord?.omits?.includes(3) && effModifierChord?.omits?.includes(5);

  // Build triad tones (3-note chord)
  const { toneJSNames, degreeIndices } = buildTriadTones(chordRootNoteName, chordDegrees, baseOctave);
  console.log("toneJSNames", JSON.stringify(toneJSNames));
  console.log("degreeIndices", JSON.stringify(degreeIndices));

  // Add 7th note if needed (also the basis for 9th/11th chords). The seventh quality follows
  // the prevailing (borrowed-resolved) scale so notes agree with the rendered △7/ø7/°7 symbol.
  if (chordType >= 7 && !omitTriad35) {
    const seventhDegree = useSusFrame
      ? "b7"
      : diatonicSeventhDegreeStr(chordRootSD, modifiedKey, customScaleIntervals);
    addSeventhNote(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, seventhDegree);
  } else if (
    chordQuality === "diminished" &&
    modifierChord?.omits?.includes(5)
  ) {
    toneJSNames.push(shiftNoteBySemitones(toneJSNames[0], 6));
    degreeIndices.push(3);
  }
  // Upper extensions (9 / 11 / 13) for extended chord types.
  const skipNine = effModifierChord?.omits?.includes(3) && effModifierChord?.omits?.includes(5);
  applyTypeExtensions(
    toneJSNames, degreeIndices, chordRootNoteName, baseOctave, chordType, sdToToneJSNoteName, triadQuality,
    { natural11: modifiedKey.scale === "minor" && chordRootSD === 5, skipNine },
  );

  replaceTriadThird(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, suspensions, sdToToneJSNoteName);

  applyChordModifiers(toneJSNames, degreeIndices, chordRootNoteName, baseOctave, effModifierChord, sdToToneJSNoteName);

  // Apply secondary dominant transformations
  applySecondaryDominant(toneJSNames, degreeIndices, chordRootNoteName, chordQuality, baseOctave);

  // Apply inversion
  applyInversion(toneJSNames, degreeIndices, inversion, baseOctave);
  console.log("toneJSNames", JSON.stringify(toneJSNames));
  console.log("degreeIndices", JSON.stringify(degreeIndices));

  // Calculate scale degrees relative to original key (label logic)
  const baseKeyDegrees = calculateScaleDegrees(
    toneJSNames,
    degreeIndices,
    chordRootSD,
    chordDegrees,
    chordType,
    originalKey
  );

  console.log("CHORD DEBUG: chordRootToNotes", {
    root: chordRootSD,
    inversion,
    rootLabel: toneJSNames[0],
    toneJSNames,
    baseKeyDegrees
  });

  return { notes: toneJSNames, chordDegrees: baseKeyDegrees };
}

// --- HELPER FUNCTION ---
// Calculates the accidental difference between two notes of the same letter
// e.g., actual="Ab", diatonic="A" -> returns "b"
// e.g., actual="F#", diatonic="F" -> returns "#"
function getModifierDifference(actual, diatonic) {
  const getAccidentalValue = (note) => {
    if (note.includes('bb')) return -2;
    if (note.includes('b')) return -1;
    if (note.includes('##') || note.includes('x')) return 2;
    if (note.includes('#')) return 1;
    return 0;
  };

  const actualVal = getAccidentalValue(actual);
  const diatonicVal = getAccidentalValue(diatonic);
  const diff = actualVal - diatonicVal;

  if (diff === 0) return "";
  if (diff === -1) return "b";
  if (diff === -2) return "bb";
  if (diff === 1) return "#";
  if (diff === 2) return "##"; // or x
  return "";
}

export function chordInterpreter(chord, key) {
  const defaultChordOctave = 3;
  const borrowed = chord.borrowed || null;
  const chordType = chord.type || 5; // Default to triad (5) if type not specified
  const inversion = chord.inversion || 0; // Default to root position (0) if inversion not specified
  const suspensions = chord.suspensions || [];
  
  // Handle Applied Chords (Secondary Dominants/Functions)
  // HOOKTHEORY DATA MODEL: `applied` is the NUMERATOR chord degree; `root` is the
  // tonicization TARGET (denominator). The tonicized key's tonic is the note at degree
  // `root` in the original key, treated as MAJOR; the chord is then degree `applied` of it.
  if (chord.applied && chord.applied !== 0 && chord.applied >= 1 && chord.applied <= 7) {
    // The tonicization target note = scale degree `root` in the original key.
    const targetTonicNote = getNoteLabel(chord.root, key);

    // The tonicized key is treated as major.
    const appliedKey = { tonic: targetTonicNote, scale: "major" };

    // The actual chord root = scale degree `applied` within the tonicized (major) key.
    const actualRootNote = getNoteLabel(chord.applied, appliedKey);

    // Quality comes from the major scale of the tonicized key at the chord's degree.
    const chordQuality = MAJOR_SCALE_CHORD_QUALITIES[chord.applied - 1];

    // Leading-tone applied chords (vii°7/x) are fully diminished (use a diminished 7th).
    const fullyDiminished = chord.applied === 7 && chordQuality === 'diminished';

    return buildChordFromNoteName(actualRootNote, chordQuality, key, defaultChordOctave, chordType, inversion, fullyDiminished, suspensions, chord);
  }
  
  const applied = chord.applied || 0;
  return rootToDiatonicTriad(chord.root, key, defaultChordOctave, borrowed, chordType, inversion, applied, suspensions, chord);
}

// Helper function to build a chord directly from a note name and quality
function buildChordFromNoteName(rootNoteName, quality, originalKey, baseOctave, chordType, inversion, fullyDiminished = false, suspensions = [], modifierChord = null) {
  const useSusFrame = suspensions && suspensions.length > 0;
  const triadQuality = useSusFrame && quality === "diminished" ? "major" : quality;
  const chordDegrees = TRIAD_DEGREES[triadQuality];
  
  // Create a temporary key with the root note as tonic (major scale)
  const rootKey = { tonic: rootNoteName, scale: "major" };
  
  // Build the chord notes
  const firstName = sdToToneJSNoteName(chordDegrees[0], 0, rootKey, baseOctave);
  const thirdName = sdToToneJSNoteName(chordDegrees[1], 0, rootKey, baseOctave);
  const fifthName = sdToToneJSNoteName(chordDegrees[2], 0, rootKey, baseOctave);
  
  let toneJSNames = [firstName, thirdName, fifthName];
  let degreeIndices = [0, 1, 2];
  
  // Add 7th if needed. Fully-diminished sevenths (vii°7) use a diminished 7th (bb7);
  // all others use a minor 7th (b7), which covers dominant and half-diminished sevenths.
  if (chordType >= 7) {
    const seventhDegree = fullyDiminished ? "bb7" : "b7";
    const seventhName = sdToToneJSNoteName(seventhDegree, 0, rootKey, baseOctave);
    toneJSNames.push(seventhName);
    degreeIndices.push(3);
  } else if (triadQuality === "diminished" && modifierChord?.omits?.includes(5)) {
    toneJSNames.push(shiftNoteBySemitones(toneJSNames[0], 6));
    degreeIndices.push(3);
  }
  applyTypeExtensions(toneJSNames, degreeIndices, rootNoteName, baseOctave, chordType, sdToToneJSNoteName);

  replaceTriadThird(toneJSNames, degreeIndices, rootNoteName, baseOctave, suspensions, sdToToneJSNoteName);

  applyChordModifiers(toneJSNames, degreeIndices, rootNoteName, baseOctave, modifierChord, sdToToneJSNoteName);
  
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

  // Calculate scale degrees relative to original key
  const baseKeyDegrees = toneJSNames.map((noteName, index) => {
    const degreeIdx = degreeIndices[index];
    let degree;
    
    if (degreeIdx < 3) {
      degree = chordDegrees[degreeIdx];
    } else if (degreeIdx === 3 && chordType === 7) {
      degree = "b7";
    } else {
      degree = "1";
    }
    
    const rawNumber = rawDegree(degree);
    
    // Find which scale degree in original key corresponds to this note
    const actualNote = noteName.replace(/[0-9]/g, '');
    let calculatedDegree = 1;
    let found = false;
    
    for (let sd = 1; sd <= 7; sd++) {
      const diatonicNote = getNoteLabel(sd, originalKey);
      if (diatonicNote === actualNote) {
        calculatedDegree = sd;
        found = true;
        break;
      }
    }
    
    // If not found, calculate based on root note position
    if (!found) {
      const rootNoteInKey = getNoteLabel(1, originalKey);
      // This is a fallback - might not be perfect for chromatic notes
      calculatedDegree = (((rawNumber - 1) % 7) + 1);
    }
    
    const modifier = found ? getModifierDifference(actualNote, getNoteLabel(calculatedDegree, originalKey)) : "";
    return `${modifier}${calculatedDegree}`;
  });
  
  return { notes: toneJSNames, chordDegrees: baseKeyDegrees };
}


export function getSongLength(metadata) {
  return metadata?.endBeat ?? 0;
}

