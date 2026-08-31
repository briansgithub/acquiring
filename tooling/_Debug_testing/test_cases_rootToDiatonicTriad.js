/**
 * Test Cases for rootToDiatonicTriad function
 * 
 * This file contains comprehensive test cases covering various scenarios:
 * - Different keys (major and minor)
 * - Different scale degrees (1-7)
 * - Different chord types (triads and 7th chords)
 * - Different inversions (0, 1, 2, 3)
 * - Borrowed chords (mode borrowing)
 * - Custom scales
 * - Edge cases
 */

export const testCases = [
  // ==========================================
  // BASIC MAJOR KEY TRIADS
  // ==========================================
  {
    description: "I chord in C major (root position)",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0,
    expected: {
      notes: ["C3", "E3", "G3"],
      chordDegrees: ["1", "3", "5"]
    }
  },
  {
    description: "ii chord in C major (root position)",
    chordRootSD: 2,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0,
    expected: {
      notes: ["D3", "F3", "A3"],
      chordDegrees: ["2", "4", "6"]
    }
  },
  {
    description: "V chord in C major (root position)",
    chordRootSD: 5,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0,
    expected: {
      notes: ["G3", "B3", "D4"],
      chordDegrees: ["5", "7", "2"]
    }
  },
  {
    description: "vii° chord in C major (diminished)",
    chordRootSD: 7,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },

  // ==========================================
  // INVERSIONS
  // ==========================================
  {
    description: "I chord in C major (first inversion)",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 1
  },
  {
    description: "I chord in C major (second inversion)",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 2
  },
  {
    description: "V7 chord in C major (first inversion)",
    chordRootSD: 5,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 7,
    inversion: 1
  },
  {
    description: "V7 chord in C major (third inversion)",
    chordRootSD: 5,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 7,
    inversion: 3
  },

  // ==========================================
  // 7TH CHORDS
  // ==========================================
  {
    description: "V7 chord in C major (root position)",
    chordRootSD: 5,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 7,
    inversion: 0
  },
  {
    description: "ii7 chord in C major (root position)",
    chordRootSD: 2,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 7,
    inversion: 0
  },

  // ==========================================
  // MINOR KEY TRIADS
  // ==========================================
  {
    description: "i chord in A minor (root position)",
    chordRootSD: 1,
    key: { tonic: "A", scale: "minor" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0,
    expected: {
      notes: ["A3", "C4", "E4"],
      chordDegrees: ["1", "b3", "5"]
    }
  },
  {
    description: "V chord in A minor (root position)",
    chordRootSD: 5,
    key: { tonic: "A", scale: "minor" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "iv chord in A minor (root position)",
    chordRootSD: 4,
    key: { tonic: "A", scale: "minor" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },

  // ==========================================
  // DIFFERENT KEYS
  // ==========================================
  {
    description: "I chord in G major",
    chordRootSD: 1,
    key: { tonic: "G", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in F major",
    chordRootSD: 1,
    key: { tonic: "F", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in D major",
    chordRootSD: 1,
    key: { tonic: "D", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in Bb major",
    chordRootSD: 1,
    key: { tonic: "Bb", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in F# major",
    chordRootSD: 1,
    key: { tonic: "F#", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in Eb major",
    chordRootSD: 1,
    key: { tonic: "Eb", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },

  // ==========================================
  // BORROWED CHORDS (MODE MIXING)
  // ==========================================
  {
    description: "iv chord in C major (borrowed from minor)",
    chordRootSD: 4,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: "minor",
    chordType: 5,
    inversion: 0
  },
  {
    description: "bVII chord in C major (borrowed from minor)",
    chordRootSD: 7,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: "minor",
    chordType: 5,
    inversion: 0
  },
  {
    description: "bVI chord in A minor (borrowed from major)",
    chordRootSD: 6,
    key: { tonic: "A", scale: "minor" },
    baseOctave: 3,
    borrowed: "major",
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in C major (borrowed from dorian)",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: "dorian",
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in C major (borrowed from mixolydian)",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: "mixolydian",
    chordType: 5,
    inversion: 0
  },

  // ==========================================
  // CUSTOM SCALES
  // ==========================================
  {
    description: "I chord with custom scale (major intervals)",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: [0, 2, 4, 5, 7, 9, 11], // Major scale intervals
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord with custom scale (minor intervals)",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: [0, 2, 3, 5, 7, 8, 10], // Minor scale intervals
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord with custom scale (whole tone-like)",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: [0, 2, 4, 6, 8, 10, 0], // Whole tone scale (simplified)
    chordType: 5,
    inversion: 0
  },

  // ==========================================
  // EDGE CASES
  // ==========================================
  {
    description: "I chord in C major with baseOctave 4",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 4,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in C major with baseOctave 2",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 2,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "All scale degrees in C major (triads)",
    chordRootSD: 1,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "All scale degrees in C major (triads) - degree 2",
    chordRootSD: 2,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "All scale degrees in C major (triads) - degree 3",
    chordRootSD: 3,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "All scale degrees in C major (triads) - degree 4",
    chordRootSD: 4,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "All scale degrees in C major (triads) - degree 5",
    chordRootSD: 5,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "All scale degrees in C major (triads) - degree 6",
    chordRootSD: 6,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "All scale degrees in C major (triads) - degree 7",
    chordRootSD: 7,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },

  // ==========================================
  // MODAL SCALES
  // ==========================================
  {
    description: "I chord in C dorian",
    chordRootSD: 1,
    key: { tonic: "C", scale: "dorian" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in C mixolydian",
    chordRootSD: 1,
    key: { tonic: "C", scale: "mixolydian" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in C lydian",
    chordRootSD: 1,
    key: { tonic: "C", scale: "lydian" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in C phrygian",
    chordRootSD: 1,
    key: { tonic: "C", scale: "phrygian" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },
  {
    description: "I chord in C locrian",
    chordRootSD: 1,
    key: { tonic: "C", scale: "locrian" },
    baseOctave: 3,
    borrowed: null,
    chordType: 5,
    inversion: 0
  },

  // ==========================================
  // COMPLEX COMBINATIONS
  // ==========================================
  {
    description: "V7 first inversion in G major",
    chordRootSD: 5,
    key: { tonic: "G", scale: "major" },
    baseOctave: 3,
    borrowed: null,
    chordType: 7,
    inversion: 1
  },
  {
    description: "Borrowed iv chord with first inversion in C major",
    chordRootSD: 4,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: "minor",
    chordType: 5,
    inversion: 1
  },
  {
    description: "Borrowed bVII7 chord in C major",
    chordRootSD: 7,
    key: { tonic: "C", scale: "major" },
    baseOctave: 3,
    borrowed: "minor",
    chordType: 7,
    inversion: 0
  }
];

/**
 * Helper function to get test cases by category
 */
export function getTestCasesByCategory(category) {
  const categories = {
    basic: testCases.filter(tc => tc.description.includes("Basic") || 
                                   (tc.description.includes("I chord") && !tc.borrowed && tc.inversion === 0)),
    inversions: testCases.filter(tc => tc.inversion > 0),
    sevenths: testCases.filter(tc => tc.chordType === 7),
    minor: testCases.filter(tc => tc.key.scale === "minor"),
    borrowed: testCases.filter(tc => tc.borrowed !== null),
    custom: testCases.filter(tc => Array.isArray(tc.borrowed)),
    modal: testCases.filter(tc => ["dorian", "mixolydian", "lydian", "phrygian", "locrian"].includes(tc.key.scale)),
    edge: testCases.filter(tc => tc.description.includes("edge") || 
                                 tc.description.includes("Edge") ||
                                 tc.baseOctave !== 3)
  };
  
  return categories[category] || [];
}

/**
 * Get test cases for a specific scale degree
 */
export function getTestCasesByScaleDegree(degree) {
  return testCases.filter(tc => tc.chordRootSD === degree);
}

/**
 * Get test cases for a specific key
 */
export function getTestCasesByKey(tonic, scale) {
  return testCases.filter(tc => tc.key.tonic === tonic && tc.key.scale === scale);
}
