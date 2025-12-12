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

export function chordRootToNotes(root, key, octave = 3) {
  const { scale } = key;
  const scaleSteps = scale === "minor" ? MINOR_SCALE : MAJOR_SCALE;
  const rootIndex = ((root - 1) % 7 + 7) % 7;
  const tonic = key.tonic ?? DEFAULT_KEY.tonic;
  const tonicOffset = TONIC_TO_SEMITONE[tonic] ?? 0;

  const rootSemitone = (tonicOffset + scaleSteps[rootIndex]) % 12;
  const third = scaleSteps[(rootIndex + 2) % 7];
  const fifth = scaleSteps[(rootIndex + 4) % 7];

  return [
    `${NOTE_NAMES[rootSemitone % 12]}${octave}`,
    `${NOTE_NAMES[(tonicOffset + third) % 12]}${octave}`,
    `${NOTE_NAMES[(tonicOffset + fifth) % 12]}${octave}`,
  ];
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

