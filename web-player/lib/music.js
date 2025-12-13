import { MAJOR_SCALE, MINOR_SCALE, TONIC_TO_SEMITONE as INTEGER_NOTATION, DEFAULT_KEY } from "./config.js";

// Lookup table: maps each tonic to its preferred chromatic note name set
const CHROMATIC_LABELS = {
  // Naturals
  C:  ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  D:  ["D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C", "C#"],
  E:  ["E", "F", "F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "D#"],
  F:  ["F", "Gb", "G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb", "E"],
  G:  ["G", "G#", "A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#"],
  A:  ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"],
  B:  ["B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#"],

  // Sharps
  "C#": ["C#", "D", "D#", "E", "E#", "F#", "G", "G#", "A", "A#", "B", "B#"],
  "D#": ["D#", "E", "E#", "F#", "G", "G#", "A", "A#", "B", "B#", "C#", "D"],
  "E#": ["E#", "F#", "G", "G#", "A", "A#", "B", "B#", "C#", "D", "D#", "E"],
  "F#": ["F#", "G", "G#", "A", "A#", "B", "B#", "C#", "D", "D#", "E", "E#"],
  "G#": ["G#", "A", "A#", "B", "B#", "C#", "D", "D#", "E", "E#", "F#", "G"],
  "A#": ["A#", "B", "B#", "C#", "D", "D#", "E", "E#", "F#", "G", "G#", "A"],
  "B#": ["B#", "C#", "D", "D#", "E", "E#", "F#", "G", "G#", "A", "A#", "B"],

  // Flats
  Cb: ["Cb", "Db", "D", "Eb", "E", "Fb", "Gb", "G", "Ab", "A", "Bb", "B"],
  Db: ["Db", "Eb", "E", "Fb", "Gb", "G", "Ab", "A", "Bb", "B", "Cb", "C"],
  Eb: ["Eb", "F", "Gb", "G", "Ab", "A", "Bb", "B", "Cb", "C", "Db", "D"],
  Fb: ["Fb", "Gb", "G", "Ab", "A", "Bb", "B", "Cb", "Db", "D", "Eb", "E"],
  Gb: ["Gb", "G", "Ab", "A", "Bb", "B", "Cb", "Db", "D", "Eb", "E", "Fb"],
  Ab: ["Ab", "A", "Bb", "B", "Cb", "Db", "D", "Eb", "E", "Fb", "Gb", "G"],
  Bb: ["Bb", "B", "Cb", "Db", "D", "Eb", "E", "Fb", "Gb", "G", "Ab", "A"]
};

// Ordered diatonic (scale degree) label sets for each tonic (useful for score display, key signatures, etc)
// Each array is [1st, 2nd, 3rd, 4th, 5th, 6th, 7th] scale degrees (unmodified, relative to tonic)
// These explicitly cover enharmonics and clef expectations for accurate scale spelling
export const DIATONIC_NOTE_NAMES_MAJOR_SCALE = {
  // Naturals
  C:  ["C", "D", "E", "F", "G", "A", "B"],
  D:  ["D", "E", "F#", "G", "A", "B", "C#"],
  E:  ["E", "F#", "G#", "A", "B", "C#", "D#"],
  F:  ["F", "G", "A", "Bb", "C", "D", "E"],
  G:  ["G", "A", "B", "C", "D", "E", "F#"],
  A:  ["A", "B", "C#", "D", "E", "F#", "G#"],
  B:  ["B", "C#", "D#", "E", "F#", "G#", "A#"],

  // Sharps
  "C#": ["C#", "D#", "E#", "F#", "G#", "A#", "B#"],
  "D#": ["D#", "E#", "F##", "G#", "A#", "B#", "C##"],
  "E#": ["E#", "F##", "G##", "A#", "B#", "C##", "D##"],
  "F#": ["F#", "G#", "A#", "B", "C#", "D#", "E#"],
  "G#": ["G#", "A#", "B#", "C#", "D#", "E#", "F##"],
  "A#": ["A#", "B#", "C##", "D#", "E#", "F##", "G##"],
  "B#": ["B#", "C##", "D##", "E#", "F##", "G##", "A##"],

  // Flats
  Cb: ["Cb", "Db", "Eb", "Fb", "Gb", "Ab", "Bb"],
  Db: ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C"],
  Eb: ["Eb", "F", "G", "Ab", "Bb", "C", "D"],
  Fb: ["Fb", "Gb", "Ab", "Bbb", "Cb", "Db", "Eb"],
  Gb: ["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"],
  Ab: ["Ab", "Bb", "C", "Db", "Eb", "F", "G"],
  Bb: ["Bb", "C", "D", "Eb", "F", "G", "A"],
};


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
  if (INTEGER_NOTATION[tonic] === undefined) {
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
  const tonicOffset = INTEGER_NOTATION[tonic];
  if (tonicOffset === undefined) {
    console.error(`Invalid tonic "${tonic}" not found in TONIC_TO_SEMITONE. Available keys:`, Object.keys(INTEGER_NOTATION));
    // Fallback to C, but this should not happen in normal operation
    return scaleDegreeToSpecificInterval(sd, DEFAULT_KEY);
  }

  const rawDegreeNumber = rawDegree(sd);
  const accidentalShift = modifierValue(sd);

  const scaleSpecificIntervals = scale === "major" ? MAJOR_SCALE : MINOR_SCALE;

  const step = scaleSpecificIntervals[(rawDegreeNumber - 1)] + accidentalShift;
  const retval = (tonicOffset + step + 12) % 12; // javascript mod can return negative values, so we add 12 to ensure it returns a positive value
  return retval;
}

function applyAccidental(label, shift) {
  // label: e.g., F, F#, Bb, etc.
  if (shift === 0) return label;
  const base = label.replace(/[#b]+/g, "");
  if (label.includes("b")) {
    if (shift === -1) {
      // single flat → double flat
      return label.startsWith("bb") ? label : `bb${base}`;
    } else if (shift === 1) {
      // flat to natural
      return base;
    }
  } else if (label.includes("#")) {
    if (shift === 1) {
      // sharp → double sharp
      return label.startsWith("x") || label.startsWith("##")
        ? label
        : `x${base}`;
    } else if (shift === -1) {
      // sharp to natural
      return base;
    }
  } else {
    // Natural, so just add accidental as prefix
    if (shift === 1) return `#${base}`;
    if (shift === -1) return `b${base}`;
  }
  return label;
}

function getNoteLabel(sd, key) {
  const rawDegreeNumber = rawDegree(sd);
  const accidentalShift = modifierValue(sd);
  const tonicMajorScale = DIATONIC_NOTE_NAMES_MAJOR_SCALE[key.tonic];
  const baseLabel = tonicMajorScale[rawDegreeNumber - 1];
  return applyAccidental(baseLabel, accidentalShift);
}

function getAbsoluteOctave(sd, octave, key) {
  const specificInterval = scaleDegreeToSpecificInterval(sd, key);
  const tonicSemitone = INTEGER_NOTATION[key.tonic] || 0;

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

export function rootToDiatonicTriad(root, key, octave = 4, chordType = 5) {
  const rootSemitone = MAJOR_SCALE[root - 1];
  
  const noteNames = CHROMATIC_LABELS[key.tonic] || DEFAULT_NOTE_NAMES;
  
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

export function chordInterpreter(chord, key) {
  return rootToDiatonicTriad(chord.root, key, 4, chord.type);
}


export function getSongLength(metadata) {
  return metadata?.endBeat ?? 0;
}

