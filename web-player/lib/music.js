import {
  NOTE_NAME_TO_INTEGER_NOTATION,
  MAJOR_SCALE_SPECIFIC_INTERVALS,
  MINOR_SCALE_SPECIFIC_INTERVALS,
  DEFAULT_TEMPO,
  DEFAULT_KEY,
  MAJOR_SCALE_LABELS,
  MINOR_SCALE_LABELS,
  TRIAD_DEGREES,
  MAJOR_SCALE_CHORD_QUALITIES,
  MINOR_SCALE_CHORD_QUALITIES,
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
export function scaleDegreeToSpecificInterval(sd, scale) {
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

function getNoteLabel(sd, key) {
  const rawDegreeNumber = rawDegree(sd);
  const accidentalShift = modifierValue(sd);


  let diatonicNames;
  if(key.scale === "major") {
    diatonicNames = MAJOR_SCALE_LABELS[key.tonic];
  } else if (key.scale === "minor") {
    diatonicNames = MINOR_SCALE_LABELS[key.tonic];
  } else {
    throw new Error(`Unsupported scale type: ${key.scale}`);
  }

  const baseLabel = diatonicNames[rawDegreeNumber - 1];
  const retval = appendAccidental(baseLabel, accidentalShift);
  return retval;
}

function getAbsoluteOctave(sd, relativeOctave, key, baseOctave) {

  // accidental modifier and specific interval of the (modified) scale degree are not needed to compute the absolute octave number
  //const accidentalShift = modifierValue(sd);
  //const sdSpecificInterval = scaleDegreeToSpecificInterval(sd, key);


  const tonicSemitone = NOTE_NAME_TO_INTEGER_NOTATION[key.tonic];
  const rawSD_SpecificInterval = scaleDegreeToSpecificInterval(rawDegree(sd), key.scale);
  /* Raw degree specific interval is needed to properly track if the resulting note name 
   of the note after applying the musical interval to the tonic 
   is above a B--C boundary (since standard octave numbering and
   tone.js labeling changes octave at the B--C boundary). 
   For example, Ab4 + 'b3' = Cb5 (C5 flat), but the 
   calculation of 8 + 3 = 11 is below a one-octave threshold, so it's floor 
   ,+0, is added to the absoluteo ctave nuber, when in fact the accidental modification
   of the SD should be applied after the octave number addend is calculated.
   Ab + b(3) = 8 + b(4) = 12 ==> +1 octave. 
   The modifier gets factored into the note label, which is what produces the tone, 
   but must be ignored for calculating the octave shift number. 
   The note letter&&octave number take precedence over the accidental modifier 
   when in producing the pitch of the tone 
   */

  const retval = baseOctave + relativeOctave + Math.floor((tonicSemitone + rawSD_SpecificInterval) / 12);
  return retval;
}

export function sdToToneJSNoteName(sd, relOctave, key, baseOctave) {
  const noteLabel = getNoteLabel(sd, key);
  const absoluteOctave = getAbsoluteOctave(sd, relOctave, key, baseOctave);
  return `${noteLabel}${absoluteOctave}`;
}


//only used in chords right now
function semitoneToNoteName(semitone, key) {
  // Convert a semitone (0-11) to a note name using diatonic approach
  // Find which scale degree this semitone corresponds to, or the closest one
  const tonicOffset = NOTE_NAME_TO_INTEGER_NOTATION[key.tonic];
  let scaleIntervals;
  if (key.scale === "major") {
    scaleIntervals = MAJOR_SCALE_SPECIFIC_INTERVALS;
  } else if (key.scale === "minor") {
    scaleIntervals = MINOR_SCALE_SPECIFIC_INTERVALS;
  } else {
    throw new Error(`Unsupported scale type: ${key.scale}`);
  }
  const diatonicNames = MAJOR_SCALE_LABELS[key.tonic];

  
  // Check if semitone matches a diatonic scale degree
  for (let i = 0; i < scaleIntervals.length; i++) {
    const interval = (tonicOffset + scaleIntervals[i]) % 12;
    if (interval === semitone) {
      return diatonicNames[i];
    }
  }
  
  // If not diatonic, find the closest scale degree and apply accidental
  // This is a simplified approach - find the nearest scale degree
  let minDiff = Infinity;
  let closestDegree = 0;
  for (let i = 0; i < scaleIntervals.length; i++) {
    const interval = (tonicOffset + scaleIntervals[i]) % 12;
    let diff = Math.abs(semitone - interval);
    if (diff > 6) diff = 12 - diff; // Wrap around
    if (diff < minDiff) {
      minDiff = diff;
      closestDegree = i;
    }
  }
  
  const baseLabel = diatonicNames[closestDegree];
  const baseInterval = (tonicOffset + scaleIntervals[closestDegree]) % 12;
  let accidentalShift = semitone - baseInterval;
  // Normalize accidental shift to -6 to +6 range (wrapping around)
  if (accidentalShift > 6) {
    accidentalShift -= 12;
  } else if (accidentalShift < -6) {
    accidentalShift += 12;
  }
  
  return appendAccidental(baseLabel, accidentalShift);
}

//chordRootSD is explicitely an int from 1-7 (no modifiers). 
// it indicates the tonal basis of the chord
export function rootToDiatonicTriad(chordRootSD, key, baseOctave) {
  /*
  let noteNamesInKey;
  if(key.scale === "major") {
    noteNamesInKey = MAJOR_SCALE_LABELS[key.tonic];
  } else if (key.scale === "minor") {
    noteNamesInKey = MINOR_SCALE_LABELS[key.tonic];
  } else {
    throw new Error(`Unsupported scale type: ${key.scale}`);
  }
    */
   let scaleChordQualities

  if (key.scale === "major") {
    scaleChordQualities = MAJOR_SCALE_CHORD_QUALITIES;
  } else if (key.scale === "minor") {
    scaleChordQualities = MINOR_SCALE_CHORD_QUALITIES;
  } else {
    throw new Error(`Unsupported scale type: ${key.scale}`);
  }

  const chordRootNoteName = getNoteLabel(chordRootSD, key);

  const chordQuality = scaleChordQualities[chordRootSD - 1];

  // triad degrees are used instead of directly referencing 
  // the scale's labels so that sdToToneJSNoteName() can be used
  const chordDegrees = TRIAD_DEGREES[chordQuality];

  // triad interval degrees are an int 1-7 and include hooktheory-format modifiers 
  const chordDegree1 = chordDegrees[0];
  const chordDegree2 = chordDegrees[1];
  const chordDegree3 = chordDegrees[2];

  // compute chord scale degrees relative to the ORIGINAL key
  // interval modifiers not used in scale degree arithmetic
  // mathematically, INTERVAL space and SCALE space are not the same
  const baseKeyDegrees = chordDegrees.map(degree => {
    const rawNumber = rawDegree(degree);
    // XXX -  const modifier = modifierString(degree);
    const calculatedDegree = ((((chordRootSD - 1) + (rawNumber - 1)) % 7) + 1); // last +1 to make up for first -1. second -1 since that's how to add generic intervals 
    return calculatedDegree;
  });

  const relativeOctave = 0;
  const rootKey = { tonic: chordRootNoteName, scale: "major"};

  // since scale degrees contain modifiers (relative to the major key's notes),
  // the key passed is always the root note's major key
  const firstName = sdToToneJSNoteName(chordDegree1, relativeOctave, rootKey, baseOctave);
  const thirdName = sdToToneJSNoteName(chordDegree2, relativeOctave, rootKey, baseOctave);
  const fifthName = sdToToneJSNoteName(chordDegree3, relativeOctave, rootKey, baseOctave);

  const toneJSNames = [firstName, thirdName, fifthName];
  
  console.log("CHORD DEBUG: chordRootToNotes", {
    root: chordRootSD,
    rootLabel: firstName,
    thirdLabel: thirdName,
    fifthLabel: fifthName,
    toneJSNames,
  });
  
  return { notes: toneJSNames, chordDegrees: baseKeyDegrees };
}

export function chordInterpreter(chord, key) {
  const defaultChordOctave = 3;
  return rootToDiatonicTriad(chord.root, key, defaultChordOctave);
}


export function getSongLength(metadata) {
  return metadata?.endBeat ?? 0;
}

