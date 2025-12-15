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
  generateScaleLabels,
} from "./scales.js";



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
  sd = sd.toString()
  return sd.startsWith("b") ? -1 : sd.startsWith("#") ? 1 : 0;
}
function modifierString(sd) {
  sd = sd.toString()
  if (sd.startsWith("b")) return "b";
  if (sd.startsWith("#")) return "#";
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
  } else if (scale === "custom" && customIntervals) {
    scaleSpecificIntervals = customIntervals;
  } else {
    throw new Error(`Unsupported scale type: ${scale}`);
  }

  const specficInterval = scaleSpecificIntervals[(rawDegreeNumber - 1)] + accidentalShift;
  return specficInterval;
}

function appendAccidental(label, shift) {
  // label: e.g., F, F#, Bb, etc.
  // Returns Tone.js format: note name with accidental after the letter (e.g., "F#", "Bb")
  if (shift === 0) return label;
  
  const base = label.replace(/[#bx]+/g, "").replace(/b+/g, ""); // Remove all accidentals to get base letter
  
  if (label.includes("b")) {
    if (shift === -1) {
      // single flat → double flat
      return label.startsWith("bb") ? label : `${base}bb`;
    } else if (shift === 1) {
      // flat to natural
      return base;
    }
  } else if (label.includes("#") || label.includes("x")) {
    if (shift === 1) {
      // sharp → double sharp (Tone.js uses "##" for double sharp)
      return label.includes("##") || label.includes("x") ? label : `${base}x`;
    } else if (shift === -1) {
      // sharp to natural
      return base;
    }
  } else {
    // Natural, so add accidental after the letter (Tone.js format)
    if (shift === 1) return `${base}#`;
    if (shift === -1) return `${base}b`;
  }
  return label;
}

function getNoteLabel(sd, key, customIntervals = null) {
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
  
  // The borrowed array represents intervals from root for degrees 1-7
  // If the first element is not 0, we normalize by subtracting it
  // (assuming degree 1 should be at root = 0)
  const firstValue = borrowedArray[0];
  const baseOffset = firstValue !== 0 ? firstValue : 0;
  
  const intervals = [];
  for (let i = 0; i < 7; i++) {
    let interval;
    if (i < borrowedArray.length) {
      interval = borrowedArray[i] - baseOffset;
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

//chordRootSD is explicitely an int from 1-7 (no modifiers). 
// it indicates the tonal basis of the chord
// chordType: 5 = triad, 7 = dominant 7th (4-note chord)
// inversion: 0 = root position, 1 = first inversion, 2 = second inversion, 3 = third inversion (7th chords only)
export function rootToDiatonicTriad(chordRootSD, key, baseOctave, borrowed = null, chordType = 5, inversion = 0) {

  // 1. SAVE THE ORIGINAL KEY
  // We need to keep a reference to the original key to calculate 
  // the final scale degrees relative to it.
  const originalKey = { ...key };

  // swap out the scale for the borrowed scale
  let {tonic, scale} = key;
  let customScaleIntervals = null;
  let scaleChordQualities = null;

  if(borrowed === null || borrowed === "") {
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
    } else {
      throw new Error(`Unsupported borrowed type: ${borrowed}`);
    }
  } else if (Array.isArray(borrowed)) {
    // Custom scale definition: array of semitone intervals for degrees 1-7
    customScaleIntervals = getCustomScaleIntervals(borrowed);
    scaleChordQualities = generateChordQualitiesFromCustomScale(borrowed);
    // Use a placeholder scale name for custom scales
    scale = "custom";
  } else {
    throw new Error(`Unsupported borrowed type: ${borrowed}`);
  }
  key = { tonic, scale };

  // Get chord qualities
  if (!scaleChordQualities) {
    if (key.scale === "major") {
      scaleChordQualities = MAJOR_SCALE_CHORD_QUALITIES;
    } else if (key.scale === "minor") {
      scaleChordQualities = MINOR_SCALE_CHORD_QUALITIES;
    } else if (key.scale === "dorian") {
      scaleChordQualities = DORIAN_SCALE_CHORD_QUALITIES;
    } else if (key.scale === "phrygian") {
      scaleChordQualities = PHRYGIAN_SCALE_CHORD_QUALITIES;
    } else if (key.scale === "lydian") {
      scaleChordQualities = LYDIAN_SCALE_CHORD_QUALITIES;
    } else if (key.scale === "mixolydian") {
      scaleChordQualities = MIXOLYDIAN_SCALE_CHORD_QUALITIES;
    } else if (key.scale === "locrian") {
      scaleChordQualities = LOCRIAN_SCALE_CHORD_QUALITIES;
    } else {
      throw new Error(`Unsupported scale type: ${key.scale}`);
    }
  }

  // This gets the note name based on the NEW (borrowed) key
  const chordRootNoteName = getNoteLabel(chordRootSD, key, customScaleIntervals);

  const chordQuality = scaleChordQualities[chordRootSD - 1];

  const chordDegrees = TRIAD_DEGREES[chordQuality];
  const chordDegree1 = chordDegrees[0];
  const chordDegree2 = chordDegrees[1];
  const chordDegree3 = chordDegrees[2];
  
  // Prepare Note Names
  const relativeOctave = 0;
  // The local key for the chord construction is always Major based on the root note
  const rootKey = { tonic: chordRootNoteName, scale: "major"};

  const firstName = sdToToneJSNoteName(chordDegree1, relativeOctave, rootKey, baseOctave);
  const thirdName = sdToToneJSNoteName(chordDegree2, relativeOctave, rootKey, baseOctave);
  const fifthName = sdToToneJSNoteName(chordDegree3, relativeOctave, rootKey, baseOctave);
  
  let toneJSNames = [firstName, thirdName, fifthName];
  let degreeIndices = [0, 1, 2]; // Track which degree each note represents

  // Add 7th note if chord type is 7 (dominant 7th)
  if (chordType === 7) {
    // Dominant 7th = minor 7th interval above root (b7)
    // In the root key (major scale), degree 7 is the leading tone (major 7th)
    // For dominant 7th, we need b7 (minor 7th), which is one semitone lower
    const seventhDegree = "b7";
    const seventhName = sdToToneJSNoteName(seventhDegree, relativeOctave, rootKey, baseOctave);
    toneJSNames.push(seventhName);
    degreeIndices.push(3); // 7th is index 3
  }

  // Apply inversion by reordering notes and adjusting octaves
  if (inversion > 0) {
    const numNotes = toneJSNames.length;
    
    // Create reordered arrays
    const reorderedNotes = [];
    const reorderedDegreeIndices = [];
    
    // For inversions, move the bass note down an octave and upper notes up an octave
    // Triad inversions:
    //   Inv 0: [1, 3, 5] -> [1, 3, 5]
    //   Inv 1: [3, 5, 1] -> [3↓, 5, 1↑]
    //   Inv 2: [5, 1, 3] -> [5↓, 1↑, 3↑]
    // 7th chord inversions:
    //   Inv 0: [1, 3, 5, 7] -> [1, 3, 5, 7]
    //   Inv 1: [3, 5, 7, 1] -> [3↓, 5, 7, 1↑]
    //   Inv 2: [5, 7, 1, 3] -> [5↓, 7, 1↑, 3↑]
    //   Inv 3: [7, 1, 3, 5] -> [7↓, 1↑, 3↑, 5↑]
    
    for (let i = 0; i < numNotes; i++) {
      const sourceIndex = (inversion + i) % numNotes;
      const noteName = toneJSNames[sourceIndex];
      const degreeIdx = degreeIndices[sourceIndex];
      
      // Extract note name and octave
      // Tone.js format: "C4", "C#4", "Bb4", "F##4", "Bbb4", etc.
      const noteMatch = noteName.match(/^([A-G](?:[#bx]+|[b]+)?)(\d+)$/);
      if (!noteMatch) {
        // Fallback if parsing fails
        reorderedNotes.push(noteName);
        reorderedDegreeIndices.push(degreeIdx);
        continue;
      }
      
      const [, noteBase, octaveStr] = noteMatch;
      let octave = parseInt(octaveStr, 10);
      
      // Bass note (i === 0) moves down an octave, upper notes move up
      if (i === 0) {
        octave = Math.max(1, octave - 1); // Lower bass note, but not below octave 1
      } else {
        octave = octave + 1; // Raise upper notes
      }
      
      reorderedNotes.push(`${noteBase}${octave}`);
      reorderedDegreeIndices.push(degreeIdx);
    }
    
    toneJSNames = reorderedNotes;
    degreeIndices = reorderedDegreeIndices;
  }

  // 2. REVISED SCALE DEGREE CALCULATION
  // We iterate through the generated notes and compare them to the ORIGINAL key
  const baseKeyDegrees = toneJSNames.map((noteName, index) => {
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
    
    // A. Get the ACTUAL note name (strip octave, e.g., "Ab4" -> "Ab")
    const actualNote = noteName.replace(/[0-9]/g, '');

    // B. Get the EXPECTED diatonic note for this degree in the ORIGINAL key
    // (This assumes getNoteLabel returns the standard diatonic note, e.g., "A" for degree 6 in C Maj)
    const diatonicNote = getNoteLabel(calculatedDegree, originalKey);

    // C. Calculate the modifier by comparing the actual vs diatonic note
    const modifier = getModifierDifference(actualNote, diatonicNote);

    return `${modifier}${calculatedDegree}`;
  });

  console.log("CHORD DEBUG: chordRootToNotes", {
    root: chordRootSD,
    inversion,
    rootLabel: firstName,
    toneJSNames,
    baseKeyDegrees // Now contains correct modifiers (e.g., "b6", "#4")
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
  return rootToDiatonicTriad(chord.root, key, defaultChordOctave, borrowed, chordType, inversion);
}


export function getSongLength(metadata) {
  return metadata?.endBeat ?? 0;
}

