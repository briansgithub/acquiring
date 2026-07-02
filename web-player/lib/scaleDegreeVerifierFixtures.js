/**
 * Regression fixtures for scaleDegreeVerifier.
 * Each case runs chordInterpreter + independent pitch-class verification.
 */

export const SCALE_DEGREE_FIXTURES = [
  {
    id: "c-major-I",
    description: "I triad in C major",
    key: { tonic: "C", scale: "major" },
    chord: { root: 1, type: 5, inversion: 0, applied: 0, borrowed: null, isRest: false },
    expectOk: true,
    expectDegrees: ["1", "3", "5"],
  },
  {
    id: "g-major-V-ii",
    description: "V/ii (E major) in G major — chromatic third must not duplicate B's degree",
    key: { tonic: "G", scale: "major" },
    chord: { root: 2, applied: 5, type: 5, inversion: 0, borrowed: null, isRest: false },
    expectOk: true,
    expectDegrees: ["6", "#1", "3"],
  },
  {
    id: "c-major-V",
    description: "V triad in C major",
    key: { tonic: "C", scale: "major" },
    chord: { root: 5, type: 5, inversion: 0, applied: 0, borrowed: null, isRest: false },
    expectOk: true,
    expectDegrees: ["5", "7", "2"],
  },
  {
    id: "a-minor-i",
    description: "i triad in A minor",
    key: { tonic: "A", scale: "minor" },
    chord: { root: 1, type: 5, inversion: 0, applied: 0, borrowed: null, isRest: false },
    expectOk: true,
    expectDegrees: ["1", "3", "5"],
  },
  {
    id: "g-major-V-V",
    description: "V/V (D major) in G major",
    key: { tonic: "G", scale: "major" },
    chord: { root: 5, applied: 5, type: 5, inversion: 0, borrowed: null, isRest: false },
    expectOk: true,
  },
  {
    id: "b-hmin-borrowed-i7",
    description: "i7 with borrowed minor in B harmonic minor",
    key: { tonic: "B", scale: "harmonicMinor" },
    chord: {
      root: 1, type: 7, inversion: 0, applied: 0, borrowed: "minor",
      adds: [], omits: [], alterations: [], suspensions: [], isRest: false,
    },
    expectOk: true,
  },
  {
    id: "dsharp-minor-III7-inv1",
    description: "III△7 first inversion in D# minor (labels track key, not bass letter)",
    key: { tonic: "D#", scale: "minor" },
    chord: {
      root: 3, type: 7, inversion: 1, applied: 0, borrowed: "",
      adds: [], omits: [], alterations: [], suspensions: [], isRest: false,
    },
    expectOk: true,
  },
  {
    id: "c-major-I-force-root",
    description: "I in C major with forceRootPosition (player default)",
    key: { tonic: "C", scale: "major" },
    chord: { root: 1, type: 5, inversion: 2, applied: 0, borrowed: null, isRest: false },
    opts: { forceRootPosition: true },
    expectOk: true,
    expectDegrees: ["1", "3", "5"],
  },
];
