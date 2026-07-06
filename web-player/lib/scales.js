export const SONG_LIBRARY_PATH = "../.hooktheory_cache";

export const NOTE_NAME_TO_INTEGER_NOTATION = {
  C: 0,
  "C#": 1,
  "C##": 2,
  Cx: 2,
  Cb: 11,
  Cbb: 10,
  Db: 1,
  D: 2,
  "D#": 3,
  "D##": 4,
  Dx: 4,
  Dbb: 0,
  Eb: 3,
  E: 4,
  "E#": 5,
  "E##": 6,
  Ex: 6,
  Ebb: 2,
  Fb: 4,
  F: 5,
  "F#": 6,
  "F##": 7,
  Fx: 7,
  Fbb: 3,
  Gb: 6,
  G: 7,
  "G#": 8,
  "G##": 9,
  Gx: 9,
  Gbb: 5,
  Ab: 8,
  A: 9,
  "A#": 10,
  "A##": 11,
  Ax: 11,
  Abb: 7,
  Bb: 10,
  B: 11,
  "B#": 0,
  "B##": 1,
  Bx: 1,
  Bbb: 9,
};

export const MAJOR_SCALE_SPECIFIC_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE_SPECIFIC_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
export const DORIAN_SCALE_SPECIFIC_INTERVALS = [0, 2, 3, 5, 7, 9, 10];
export const PHRYGIAN_SCALE_SPECIFIC_INTERVALS = [0, 1, 3, 5, 7, 8, 10];
export const LYDIAN_SCALE_SPECIFIC_INTERVALS = [0, 2, 4, 6, 7, 9, 11];
export const MIXOLYDIAN_SCALE_SPECIFIC_INTERVALS = [0, 2, 4, 5, 7, 9, 10];
export const LOCRIAN_SCALE_SPECIFIC_INTERVALS = [0, 1, 3, 5, 6, 8, 10];
export const HARMONIC_MINOR_SCALE_SPECIFIC_INTERVALS = [0, 2, 3, 5, 7, 8, 11];
export const PHRYGIAN_DOMINANT_SCALE_SPECIFIC_INTERVALS = [0, 1, 4, 5, 7, 8, 10];

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
  "major",      // V  (e.g. C locrian -> Gb major triad)
  "major",      // VI
  "minor"       // vii (e.g. C locrian -> Bb minor triad)
];

export const HARMONIC_MINOR_SCALE_CHORD_QUALITIES = [
  "minor",      // i
  "diminished", // ii°
  "augmented",  // III+
  "minor",      // iv
  "major",      // V
  "major",      // VI
  "diminished"  // vii°
];

export const PHRYGIAN_DOMINANT_SCALE_CHORD_QUALITIES = [
  "major",      // I
  "major",      // II
  "diminished", // iii°
  "minor",      // iv
  "diminished", // v°
  "augmented",  // VI+
  "minor"       // vii
];


// Triad degree patterns
export const TRIAD_DEGREES = {
  major: [1, 3, 5],             // Root, Major 3rd, Perfect 5th
  minor: [1, "b3", 5],          // Root, minor 3rd, Perfect 5th
  diminished: [1, "b3", "b5"],  // Root, minor 3rd, diminished 5th
  augmented: [1, 3, "#5"]       // Root, Major 3rd, Augmented 5th
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

export const HOOKTHEORY_COLORS = {
  1: "#FF2300",
  2: "#FFAF00",
  3: "#F3E200",
  4: "#00CE00",
  5: "#3537FF",
  6: "#BA36E6",
  7: "#FF38CB"
};

export const BOOMWHACKER_12 = [
  "#E62B45", // 0 (P1)
  "#F6501D", // 1 (m2)
  "#F98625", // 2 (M2)
  "#FEC637", // 3 (m3)
  "#FFFD40", // 4 (M3)
  "#D1FC48", // 5 (P4)
  "#74F936", // 6 (d5)
  "#53F984", // 7 (P5)
  "#0081F9", // 8 (m6)
  "#0081F9", // 9 (M6)
  "#9062F9", // 10 (m7)
  "#EF3FF9"  // 11 (M7)
];

const RELATIVE_MAJOR_OFFSETS = {
  "major": 0, "ionian": 0,
  "dorian": 10,
  "phrygian": 8,
  "lydian": 7,
  "mixolydian": 5,
  "minor": 3, "aeolian": 3,
  "locrian": 1
};

export const SCALE_INTERVALS = {
  "major": [0, 2, 4, 5, 7, 9, 11],
  "minor": [0, 2, 3, 5, 7, 8, 10],
  "dorian": [0, 2, 3, 5, 7, 9, 10],
  "phrygian": [0, 1, 3, 5, 7, 8, 10],
  "lydian": [0, 2, 4, 6, 7, 9, 11],
  "mixolydian": [0, 2, 4, 5, 7, 9, 10],
  "locrian": [0, 1, 3, 5, 6, 8, 10],
  "ionian": [0, 2, 4, 5, 7, 9, 11],
  "aeolian": [0, 2, 3, 5, 7, 8, 10]
};

export function getHooktheoryColor(rootDegree, scaleType) {
  let shift = 0;
  if (scaleType === 'minor') shift = 5;
  else if (scaleType === 'dorian') shift = 1;
  else if (scaleType === 'phrygian') shift = 2;
  else if (scaleType === 'lydian') shift = 3;
  else if (scaleType === 'mixolydian') shift = 4;
  else if (scaleType === 'locrian') shift = 6;

  const rootStr = String(rootDegree);
  const match = rootStr.match(/^([b#]*)([\d]+)$/);
  if (!match) return HOOKTHEORY_COLORS[1]; 

  const accidental = match[1];
  const baseDegree = parseInt(match[2], 10);
  
  const majorDegree = ((baseDegree - 1 + shift) % 7) + 1;
  
  if (accidental) {
    let degreeA = baseDegree;
    let degreeB = baseDegree;
    
    if (accidental.includes('b')) {
      degreeB = baseDegree;
      degreeA = baseDegree - 1;
      if (degreeA < 1) degreeA = 7;
    } else if (accidental.includes('#')) {
      degreeA = baseDegree;
      degreeB = baseDegree + 1;
      if (degreeB > 7) degreeB = 1;
    }
    
    const majorA = ((degreeA - 1 + shift) % 7) + 1;
    const majorB = ((degreeB - 1 + shift) % 7) + 1;
    
    return {
      isPattern: true,
      color1: HOOKTHEORY_COLORS[majorA],
      color2: HOOKTHEORY_COLORS[majorB]
    };
  }

  return HOOKTHEORY_COLORS[majorDegree];
}

export function getBoomwhackerColor(root, scaleType, borrowedScale = null) {
  const baseRoot = parseInt(String(root).replace(/[#b]/g, ''), 10) || 1;
  let accidentalMod = 0;
  
  if (typeof root === 'string') {
    if (root.includes('bb')) accidentalMod = -2;
    else if (root.includes('b')) accidentalMod = -1;
    else if (root.includes('##')) accidentalMod = 2;
    else if (root.includes('#')) accidentalMod = 1;
  }

  let targetInterval;
  if (Array.isArray(borrowedScale)) {
    targetInterval = borrowedScale[baseRoot - 1];
  } else if (typeof borrowedScale === 'string' && borrowedScale.startsWith('array:')) {
    const arr = borrowedScale.replace('array:', '').split(',').map(Number);
    targetInterval = arr[baseRoot - 1];
  } else if (borrowedScale && SCALE_INTERVALS[borrowedScale]) {
    targetInterval = SCALE_INTERVALS[borrowedScale][baseRoot - 1];
  } else {
    const activeScale = SCALE_INTERVALS[scaleType] ? scaleType : "major";
    targetInterval = SCALE_INTERVALS[activeScale][baseRoot - 1];
  }

  targetInterval = (targetInterval + accidentalMod + 12) % 12;

  const relMajOffset = RELATIVE_MAJOR_OFFSETS[scaleType] || 0;
  const distance = (targetInterval - relMajOffset + 12) % 12;

  return BOOMWHACKER_12[distance];
}

export function createStripedPattern(ctx, color1, color2, hexColor) {
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = 10;
  patternCanvas.height = 10;
  const pctx = patternCanvas.getContext('2d');
  
  pctx.fillStyle = color1;
  pctx.fillRect(0, 0, 10, 10);
  
  pctx.fillStyle = color2;
  pctx.beginPath();
  pctx.moveTo(0, 10);
  pctx.lineTo(10, 0);
  pctx.lineTo(10, 4);
  pctx.lineTo(6, 10);
  pctx.fill();
  
  pctx.beginPath();
  pctx.moveTo(0, 4);
  pctx.lineTo(4, 0);
  pctx.lineTo(0, 0);
  pctx.fill();
  
  const pattern = ctx.createPattern(patternCanvas, 'repeat');
  if (!pattern) {
    return hexColor || color1 || color2 || '#ffffff';
  }
  pattern.isPattern = true;
  pattern.hexColor = hexColor || color1;
  return pattern;
}

export const ROMAN_NUMERALS_MAJOR = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
export const ROMAN_NUMERALS_MINOR = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
export const ROMAN_NUMERALS_DORIAN = ["i", "ii", "III", "IV", "v", "vi°", "VII"];
export const ROMAN_NUMERALS_PHRYGIAN = ["i", "II", "III", "iv", "v°", "VI", "vii"];
export const ROMAN_NUMERALS_LYDIAN = ["I", "II", "iii", "iv°", "V", "vi", "vii"];
export const ROMAN_NUMERALS_MIXOLYDIAN = ["I", "ii", "iii°", "IV", "v", "vi", "VII"];
export const ROMAN_NUMERALS_LOCRIAN = ["i°", "II", "iii", "iv", "V", "VI", "vii"];
export const ROMAN_NUMERALS_HARMONIC_MINOR = ["i", "ii°", "III+", "iv", "V", "VI", "vii°"];
export const ROMAN_NUMERALS_PHRYGIAN_DOMINANT = ["I", "II", "iii°", "iv", "v°", "VI+", "vii"];


export function getScaleDegreeColor(degree, scaleType) {
  // Map colors based on the relative major (tonic of relative major starts with red)
  // The relative major's degree 1 should always be colored red.
  // We need to find which mode degree corresponds to the relative major's degree 1.
  // Using C major as the reference relative major:
  //
  // Major (Ionian): C=1 → degree 1 = relative major degree 1 (red), shift = 0
  // Minor (Aeolian): A=1, B=2, C=3 → degree 3 = relative major degree 1 (red), shift = 5
  // Dorian: D=1, E=2, F=3, G=4, A=5, B=6, C=7 → degree 7 = relative major degree 1 (red), shift = 1
  // Phrygian: E=1, F=2, G=3, A=4, B=5, C=6 → degree 6 = relative major degree 1 (red), shift = 2
  // Lydian: F=1, G=2, A=3, B=4, C=5 → degree 5 = relative major degree 1 (red), shift = 3
  // Mixolydian: G=1, A=2, B=3, C=4 → degree 4 = relative major degree 1 (red), shift = 4
  // Locrian: B=1, C=2 → degree 2 = relative major degree 1 (red), shift = 6
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
    // Phrygian degree 6 = Major degree 1, so shift = -(6-1) = -5 mod 7 = 2
    shift = 2;
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
  
  // Get tonic semitone value. Double-accidental tonics (Bbb, F##) that arise from
  // borrowed/applied resolution in remote keys are not in the lookup table, so compute
  // their pitch class arithmetically instead of crashing.
  let tonicSemitone = NOTE_NAME_TO_INTEGER_NOTATION[tonic];
  if (tonicSemitone === undefined) {
    const BASE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const base = BASE_PC[tonicBase];
    if (base === undefined) {
      throw new Error(`Invalid tonic: ${tonic}`);
    }
    let acc = 0;
    for (const ch of tonic.slice(1)) {
      if (ch === '#') acc += 1;
      else if (ch === 'x') acc += 2;
      else if (ch === 'b') acc -= 1;
    }
    tonicSemitone = (((base + acc) % 12) + 12) % 12;
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

