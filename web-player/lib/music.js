import {
  NOTE_NAME_TO_INTEGER_NOTATION,
  MAJOR_SCALE_SPECIFIC_INTERVALS,
  MINOR_SCALE_SPECIFIC_INTERVALS,
  DEFAULT_TEMPO,
  DEFAULT_KEY,
  MAJOR_SCALE_LABELS,
  MINOR_SCALE_LABELS,
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

function rawDegree(sd) {
  return parseInt(sd.replace(/[^0-9]/g, ""), 10) || 1;
}
function modifierValue(sd) {
  return sd.startsWith("b") ? -1 : sd.startsWith("#") ? 1 : 0;
}

// Scale degree 1-7 may be modified with #/b, so processing is more than just a lookup table
export function scaleDegreeToSpecificInterval(sd, key) {
  const { tonic, scale } = key;
  const tonicOffset = NOTE_NAME_TO_INTEGER_NOTATION[tonic];
  if (tonicOffset === undefined) {
    console.error(`Invalid tonic "${tonic}" not found in NOTE_NAME_TO_INTEGER_NOTATION`);
  }

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
  const retval = (tonicOffset + specficInterval + 12) % 12; // javascript mod can return negative values, so we add 12 to ensure it returns a positive value
  return retval;
}

function applyAccidental(label, shift) {
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
      return label.includes("##") || label.includes("x") ? label : `${base}##`;
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
  const retval = applyAccidental(baseLabel, accidentalShift);
  return retval;
}

function getAbsoluteOctave(sd, octave, key) {
  const specificInterval = scaleDegreeToSpecificInterval(sd, key);
  const tonicSemitone = NOTE_NAME_TO_INTEGER_NOTATION[key.tonic];

  // Calculate semitone offset from tonic (0-11)
  let offset = specificInterval - tonicSemitone;
  if (offset < 0) {
    offset += 12; // Normalize to 0-11 range
  }
  const relativeOctave = octave || 0;
  return 4 + relativeOctave + Math.floor((tonicSemitone + offset) / 12);
}

export function sdToToneJSNoteName(sd, octave, key) {
  const noteLabel = getNoteLabel(sd, key);
  const absoluteOctave = getAbsoluteOctave(sd, octave, key);
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
  
  return applyAccidental(baseLabel, accidentalShift);
}

export function rootToDiatonicTriad(root, key, octave = 4, chordType = 5) {
  let scaleIntervals;
  if(key.scale === "major") {
    scaleIntervals = MAJOR_SCALE_SPECIFIC_INTERVALS;
  } else if (key.scale === "minor") {
    scaleIntervals = MINOR_SCALE_SPECIFIC_INTERVALS;
  } else {
    throw new Error(`Unsupported scale type: ${key.scale}`);
  }

  const rootSemitone = scaleIntervals[root - 1];
  const tonicOffset = NOTE_NAME_TO_INTEGER_NOTATION[key.tonic] || 0;
  
  const thirdInterval = 4;
  const fifthInterval = 7;
  
  const rootAbsoluteSemitone = (tonicOffset + rootSemitone) % 12;
  const thirdAbsoluteSemitone = (rootAbsoluteSemitone + thirdInterval) % 12;
  const fifthAbsoluteSemitone = (rootAbsoluteSemitone + fifthInterval) % 12;

  // will fix semitoneToNoteName function later
  const rootName = semitoneToNoteName(rootAbsoluteSemitone, key);
  const thirdName = semitoneToNoteName(thirdAbsoluteSemitone, key);
  const fifthName = semitoneToNoteName(fifthAbsoluteSemitone, key);

  const notes = [
    `${rootName}${octave}`,
    `${thirdName}${octave}`,
    `${fifthName}${octave}`,
  ];
  
  console.log("CHORD DEBUG: chordRootToNotes", {
    root,
    rootSemitone: rootName,
    thirdSemitone: thirdName,
    fifthSemitone: fifthName,
    notes,
  });
  
  return notes;
}

export function chordInterpreter(chord, key) {
  return rootToDiatonicTriad(chord.root, key, 4, chord.type);
}


export function getSongLength(metadata) {
  return metadata?.endBeat ?? 0;
}

