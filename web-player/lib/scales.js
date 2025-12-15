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
export const DORIAN_SCALE_SPECIFIC_INTERVALS = [0, 2, 3, 5, 7, 9, 10];
export const PHRYGIAN_SCALE_SPECIFIC_INTERVALS = [0, 1, 3, 5, 7, 8, 10];
export const LYDIAN_SCALE_SPECIFIC_INTERVALS = [0, 2, 4, 6, 7, 9, 11];
export const MIXOLYDIAN_SCALE_SPECIFIC_INTERVALS = [0, 2, 4, 5, 7, 9, 10];
export const LOCRIAN_SCALE_SPECIFIC_INTERVALS = [0, 1, 3, 5, 6, 8, 10];

export const DEFAULT_TEMPO = 120;
export const DEFAULT_KEY = { tonic: "C", scale: "major" };

export const MAJOR_SCALE_LABELS = {
  // Naturals
  C: ["C", "D", "E", "F", "G", "A", "B"],
  D: ["D", "E", "F#", "G", "A", "B", "C#"],
  E: ["E", "F#", "G#", "A", "B", "C#", "D#"],
  F: ["F", "G", "A", "Bb", "C", "D", "E"],
  G: ["G", "A", "B", "C", "D", "E", "F#"],
  A: ["A", "B", "C#", "D", "E", "F#", "G#"],
  B: ["B", "C#", "D#", "E", "F#", "G#", "A#"],

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
  C: ["C", "D", "Eb", "F", "G", "Ab", "Bb"],
  D: ["D", "E", "F", "G", "A", "Bb", "C"],
  E: ["E", "F#", "G", "A", "B", "C", "D"],
  F: ["F", "G", "Ab", "Bb", "C", "Db", "Eb"],
  G: ["G", "A", "Bb", "C", "D", "Eb", "F"],
  A: ["A", "B", "C", "D", "E", "F", "G"],
  B: ["B", "C#", "D", "E", "F#", "G", "A"],

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

export const MAJOR_SCALE_CHORD_QUALITIES = [
  "major",      // I
  "minor",      // ii
  "minor",      // iii
  "major",      // IV
  "major",      // V
  "minor",      // vi
  "diminished"  // vii°
];

export const MINOR_SCALE_CHORD_QUALITIES = [
  "minor",      // i
  "diminished", // ii°
  "major",      // III
  "minor",      // iv
  "minor",      // v
  "major",      // VI
  "major"       // VII
];

export const DORIAN_SCALE_CHORD_QUALITIES = [
  "minor",      // i
  "minor",      // ii
  "major",      // III
  "major",      // IV
  "minor",      // v
  "diminished", // vi°
  "major"       // VII
];

export const PHRYGIAN_SCALE_CHORD_QUALITIES = [
  "minor",      // i
  "major",      // II
  "major",      // III
  "minor",      // iv
  "diminished", // v°
  "major",      // VI
  "minor"       // vii
];

export const LYDIAN_SCALE_CHORD_QUALITIES = [
  "major",      // I
  "major",      // II
  "minor",      // iii
  "diminished", // iv°
  "major",      // V
  "minor",      // vi
  "minor"       // vii
];

export const MIXOLYDIAN_SCALE_CHORD_QUALITIES = [
  "major",      // I
  "minor",      // ii
  "diminished", // iii°
  "major",      // IV
  "minor",      // v
  "minor",      // vi
  "major"       // VII
];

export const LOCRIAN_SCALE_CHORD_QUALITIES = [
  "diminished", // i°
  "major",      // II
  "minor",      // iii
  "minor",      // iv
  "diminished", // v°
  "major",      // VI
  "major"       // VII
];


// Triad degree patterns
export const TRIAD_DEGREES = {
  major: [1, 3, 5],           // Root, Major 3rd, Perfect 5th
  minor: [1, "b3", 5],        // Root, minor 3rd, Perfect 5th
  diminished: [1, "b3", "b5"] // Root, minor 3rd, diminished 5th
};

export const SCALE_DEGREE_COLORS = {
  1: "#ff0000",
  2: "#ffb014",
  3: "#EFE600",
  4: "#00D300",
  5: "#4800FF",
  6: "#B800E5",
  7: "#FF00CB"
};

export const ROMAN_NUMERALS_MAJOR = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
export const ROMAN_NUMERALS_MINOR = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
export const ROMAN_NUMERALS_DORIAN = ["i", "ii", "III", "IV", "v", "vi°", "VII"];
export const ROMAN_NUMERALS_PHRYGIAN = ["i", "II", "III", "iv", "v°", "VI", "vii"];
export const ROMAN_NUMERALS_LYDIAN = ["I", "II", "iii", "iv°", "V", "vi", "vii"];
export const ROMAN_NUMERALS_MIXOLYDIAN = ["I", "ii", "iii°", "IV", "v", "vi", "VII"];
export const ROMAN_NUMERALS_LOCRIAN = ["i°", "II", "iii", "iv", "v°", "VI", "VII"];


export function getScaleDegreeColor(degree, scaleType) {
  // Map colors based on the relative major (tonic of relative major starts with red)
  // The relative major's degree 1 should always be colored red.
  // We need to find which mode degree corresponds to the relative major's degree 1:
  // 
  // Major (Ionian): degree 1 = relative major degree 1 (red)
  // Minor (Aeolian): degree 3 = relative major degree 1 (red) → shift mode degrees by +5
  // Dorian: degree 7 = relative major degree 1 (red) → shift mode degrees by +1
  // Phrygian: degree 4 = relative major degree 1 (red) → shift mode degrees by +4
  // Lydian: degree 5 = relative major degree 1 (red) → shift mode degrees by +3
  // Mixolydian: degree 4 = relative major degree 1 (red) → shift mode degrees by +4
  // Locrian: degree 2 = relative major degree 1 (red) → shift mode degrees by +6
  //
  // Formula: majorDegree = ((modeDegree - 1 + shift) mod 7) + 1
  // We want: when modeDegree = relativeMajorDegree1, majorDegree should be 1
  // So: ((relativeMajorDegree1 - 1 + shift) mod 7) + 1 = 1
  //     (relativeMajorDegree1 - 1 + shift) mod 7 = 0
  //     shift = -(relativeMajorDegree1 - 1) mod 7

  let shift = 0;
  if (scaleType === 'minor') {
    // Minor degree 3 = Major degree 1, so shift = -(3-1) = -2 mod 7 = 5
    shift = 5;
  } else if (scaleType === 'dorian') {
    // Dorian degree 7 = Major degree 1, so shift = -(7-1) = -6 mod 7 = 1
    shift = 1;
  } else if (scaleType === 'phrygian') {
    // Phrygian degree 4 = Major degree 1, so shift = -(4-1) = -3 mod 7 = 4
    shift = 4;
  } else if (scaleType === 'lydian') {
    // Lydian degree 5 = Major degree 1, so shift = -(5-1) = -4 mod 7 = 3
    shift = 3;
  } else if (scaleType === 'mixolydian') {
    // Mixolydian degree 4 = Major degree 1, so shift = -(4-1) = -3 mod 7 = 4
    shift = 4;
  } else if (scaleType === 'locrian') {
    // Locrian degree 2 = Major degree 1, so shift = -(2-1) = -1 mod 7 = 6
    shift = 6;
  }
  // For major, shift = 0 (no change)

  const majorDegree = ((degree - 1 + shift) % 7) + 1;
  return SCALE_DEGREE_COLORS[majorDegree];
}

// Generate scale labels dynamically from intervals
export function generateScaleLabels(tonic, intervals) {
  const noteOrder = ["C", "D", "E", "F", "G", "A", "B"];
  const tonicBase = tonic.replace(/[#bx]+/g, "").replace(/b+/g, "");
  const tonicIndex = noteOrder.indexOf(tonicBase);
  
  // Get tonic semitone value
  const tonicSemitone = NOTE_NAME_TO_INTEGER_NOTATION[tonic];
  if (tonicSemitone === undefined) {
    throw new Error(`Invalid tonic: ${tonic}`);
  }
  
  const labels = [];
  for (let i = 0; i < 7; i++) {
    const semitone = (tonicSemitone + intervals[i]) % 12;
    const letterIndex = (tonicIndex + i) % 7;
    const letter = noteOrder[letterIndex];
    
    // Find the note name that matches this semitone and letter
    let noteName = null;
    let fallbackName = null;
    
    for (const [name, value] of Object.entries(NOTE_NAME_TO_INTEGER_NOTATION)) {
      if (value === semitone) {
        const nameBase = name.replace(/[#bx]+/g, "").replace(/b+/g, "");
        // Prefer the name that starts with the expected letter
        if (nameBase === letter) {
          noteName = name;
          break;
        }
        // Keep a fallback
        if (!fallbackName) {
          fallbackName = name;
        }
      }
    }
    
    // Use fallback if no exact letter match found
    if (!noteName) {
      noteName = fallbackName;
    }
    
    if (!noteName) {
      throw new Error(`Could not find note name for semitone ${semitone} at degree ${i + 1}`);
    }
    
    labels.push(noteName);
  }
  
  return labels;
}

