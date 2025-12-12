import { MAJOR_SCALE, MINOR_SCALE, TONIC_TO_SEMITONE, DEFAULT_KEY } from "./config.js";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function parseKey(metadata) {
  const entry = metadata?.keys?.[0];
  if (!entry) return DEFAULT_KEY;
  const tonic = entry.tonic ?? DEFAULT_KEY.tonic;
  const scale = entry.scale ?? DEFAULT_KEY.scale;
  return { tonic, scale };
}

export function scaleDegreeToSemitone(sd, key) {
  const { tonic, scale } = key;
  const tonicOffset = TONIC_TO_SEMITONE[tonic] ?? 0;
  const degree = parseInt(sd.replace(/[^0-9]/g, ""), 10) || 1;
  const accidental = sd.startsWith("b") ? -1 : sd.startsWith("#") ? 1 : 0;
  const scaleSteps = scale === "minor" ? MINOR_SCALE : MAJOR_SCALE;
  const step = scaleSteps[(degree - 1) % 7] + accidental;
  return (tonicOffset + step + 12) % 12;
}

export function chordRootToNotes(root, key, octave = 4, chordType = 5) {
  // Root is already a chromatic note (0-11: 0=C, 1=C#, 2=D, etc.)
  // Build triad based on root and chord type
  const rootSemitone = root % 12;
  
  // Determine if chord is major or minor based on type
  // type 5 = major triad, other values might indicate minor
  // For now, assume major triad (type 5)
  // Major triad: root, major third (+4 semitones), perfect fifth (+7 semitones)
  const thirdInterval = 4;
  const fifthInterval = 7;
  
  const thirdSemitone = (rootSemitone + thirdInterval) % 12;
  const fifthSemitone = (rootSemitone + fifthInterval) % 12;

  const notes = [
    `${NOTE_NAMES[rootSemitone]}${octave}`,
    `${NOTE_NAMES[thirdSemitone]}${octave}`,
    `${NOTE_NAMES[fifthSemitone]}${octave}`,
  ];
  
  console.log("CHORD DEBUG: chordRootToNotes", {
    root,
    rootSemitone: NOTE_NAMES[rootSemitone],
    thirdSemitone: NOTE_NAMES[thirdSemitone],
    fifthSemitone: NOTE_NAMES[fifthSemitone],
    notes,
  });
  
  return notes;
}

export function sdToNoteName(sd, octave, key) {
  const semitone = scaleDegreeToSemitone(sd, key);
  const noteName = NOTE_NAMES[semitone];
  const targetOctave = 4 + (octave || 0);
  return `${noteName}${targetOctave}`;
}

export function getSongLength(metadata) {
  return metadata?.endBeat ?? 0;
}

