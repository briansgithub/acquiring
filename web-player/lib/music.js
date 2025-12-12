import { MAJOR_SCALE, MINOR_SCALE, TONIC_TO_SEMITONE, DEFAULT_KEY } from "./config.js";

// Sharp note names (for sharp keys)
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// Flat note names (for flat keys)
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Lookup table: maps each tonic to its preferred note name set
// Keys that use sharps: C#, D#, E#, F#, G#, A#, B#
// Keys that use flats: Cb, Db, Eb, Fb, Gb, Ab, Bb
// Natural keys default to sharps (common convention)
const TONIC_TO_NOTE_NAMES = {
  // Natural keys (default to sharps)
  C: SHARP_NAMES,
  D: SHARP_NAMES,
  E: SHARP_NAMES,
  F: FLAT_NAMES,
  G: SHARP_NAMES,
  A: SHARP_NAMES,
  B: SHARP_NAMES,
  // Sharp keys
  "C#": SHARP_NAMES,
  "D#": SHARP_NAMES,
  "E#": SHARP_NAMES,
  "F#": SHARP_NAMES,
  "G#": SHARP_NAMES,
  "A#": SHARP_NAMES,
  "B#": SHARP_NAMES,
  // Flat keys
  Cb: FLAT_NAMES,
  Db: FLAT_NAMES,
  Eb: FLAT_NAMES,
  Fb: FLAT_NAMES,
  Gb: FLAT_NAMES,
  Ab: FLAT_NAMES,
  Bb: FLAT_NAMES,
};

// Fallback to sharp names if tonic not found
const DEFAULT_NOTE_NAMES = FLAT_NAMES;

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
    console.warn("No key entry found in metadata, using DEFAULT_KEY", DEFAULT_KEY);
    return DEFAULT_KEY;
  }
  const rawTonic = entry.tonic ?? DEFAULT_KEY.tonic;
  const tonic = normalizeTonic(rawTonic);
  const scale = entry.scale ?? DEFAULT_KEY.scale;
  const key = { tonic, scale };
  if (TONIC_TO_SEMITONE[tonic] === undefined) {
    console.error(`Parsed key has invalid tonic "${tonic}" (normalized from "${rawTonic}"). Available keys:`, Object.keys(TONIC_TO_SEMITONE));
  }
  return key;
}

export function scaleDegreeToSemitone(sd, key) {
  const { tonic, scale } = key;
  const tonicOffset = TONIC_TO_SEMITONE[tonic];
  if (tonicOffset === undefined) {
    console.error(`Invalid tonic "${tonic}" not found in TONIC_TO_SEMITONE. Available keys:`, Object.keys(TONIC_TO_SEMITONE));
    // Fallback to C, but this should not happen in normal operation
    return scaleDegreeToSemitone(sd, DEFAULT_KEY);
  }
  const degree = parseInt(sd.replace(/[^0-9]/g, ""), 10) || 1; //extracts the unmodified scale degree 
  const accidental = sd.startsWith("b") ? -1 : sd.startsWith("#") ? 1 : 0;
  const scaleSteps = scale === "minor" ? MINOR_SCALE : MAJOR_SCALE;
  const step = scaleSteps[(degree - 1) % 7] + accidental;
  return (tonicOffset + step + 12) % 12; // java mod can return negative values, so we add 12 to ensure it returns a positive value
}

export function sdToNoteName(sd, octave, key) {
  const semitone = scaleDegreeToSemitone(sd, key);
  // Get the appropriate note name set based on the tonic
  const noteNames = TONIC_TO_NOTE_NAMES[key.tonic] || DEFAULT_NOTE_NAMES;
  const noteName = noteNames[semitone];
  const targetOctave = 4 + (octave || 0);
  return `${noteName}${targetOctave}`;
}

export function chordRootToNotes(root, key, octave = 4, chordType = 5) {
  // Root is already a chromatic note (0-11: 0=C, 1=C#, 2=D, etc.)
  // Build triad based on root and chord type
  const rootSemitone = root % 12;
  
  // Get the appropriate note name set based on the tonic
  const noteNames = TONIC_TO_NOTE_NAMES[key.tonic] || DEFAULT_NOTE_NAMES;
  
  // Determine if chord is major or minor based on type
  // type 5 = major triad, other values might indicate minor
  // For now, assume major triad (type 5)
  // Major triad: root, major third (+4 semitones), perfect fifth (+7 semitones)
  const thirdInterval = 4;
  const fifthInterval = 7;
  
  const thirdSemitone = (rootSemitone + thirdInterval) % 12;
  const fifthSemitone = (rootSemitone + fifthInterval) % 12;

  const notes = [
    `${noteNames[rootSemitone]}${octave}`,
    `${noteNames[thirdSemitone]}${octave}`,
    `${noteNames[fifthSemitone]}${octave}`,
  ];
  
  console.log("CHORD DEBUG: chordRootToNotes", {
    root,
    rootSemitone: noteNames[rootSemitone],
    thirdSemitone: noteNames[thirdSemitone],
    fifthSemitone: noteNames[fifthSemitone],
    notes,
  });
  
  return notes;
}


export function getSongLength(metadata) {
  return metadata?.endBeat ?? 0;
}

