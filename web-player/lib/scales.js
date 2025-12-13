export const SONG_LIBRARY_PATH = "../.hooktheory_cache";

export const NOTE_NAME_TO_INTEGER_NOTATION = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  "E#": 5,
  Fb: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  "B#": 0,
  Cb: 11,
};

export const MAJOR_SCALE_SPECIFIC_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE_SPECIFIC_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

export const DEFAULT_TEMPO = 120;
export const DEFAULT_KEY = { tonic: "C", scale: "major" };

export const MAJOR_SCALE_LABELS = {
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

export const MINOR_SCALE_LABELS = {
  // Naturals
  C:  ["C", "D", "Eb", "F", "G", "Ab", "Bb"],
  D:  ["D", "E", "F", "G", "A", "Bb", "C"],
  E:  ["E", "F#", "G", "A", "B", "C", "D"],
  F:  ["F", "G", "Ab", "Bb", "C", "Db", "Eb"],
  G:  ["G", "A", "Bb", "C", "D", "Eb", "F"],
  A:  ["A", "B", "C", "D", "E", "F", "G"],
  B:  ["B", "C#", "D", "E", "F#", "G", "A"],

  // Sharps
  "C#": ["C#", "D#", "E", "F#", "G#", "A", "B"],
  "D#": ["D#", "E#", "F#", "G#", "A#", "B", "C#"],
  "E#": ["E#", "F##", "G#", "A#", "B#", "C#", "D#"],
  "F#": ["F#", "G#", "A", "B", "C#", "D", "E"],
  "G#": ["G#", "A#", "B", "C#", "D#", "E", "F#"],
  "A#": ["A#", "B#", "C#", "D#", "E#", "F#", "G#"],
  "B#": ["B#", "C##", "D#", "E#", "F##", "G#", "A#"],

  // Flats
  Cb: ["Cb", "Db", "Ebb", "Fb", "Gb", "Abb", "Bbb"],
  Db: ["Db", "Eb", "Fb", "Gb", "Ab", "Bbb", "Cb"],
  Eb: ["Eb", "F", "Gb", "Ab", "Bb", "Cb", "Db"],
  Fb: ["Fb", "Gb", "Abb", "Bbb", "Cb", "Dbb", "Ebb"],
  Gb: ["Gb", "Ab", "Bbb", "Cb", "Db", "Ebb", "Fb"],
  Ab: ["Ab", "Bb", "Cb", "Db", "Eb", "Fb", "Gb"],
  Bb: ["Bb", "C", "Db", "Eb", "F", "Gb", "Ab"],
};
