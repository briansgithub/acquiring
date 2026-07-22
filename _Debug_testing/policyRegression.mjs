#!/usr/bin/env node
/**
 * Fast PC regression gate for chord policy refactors.
 * Run: node _Debug_testing/policyRegression.mjs
 *
 * Baseline gates (2026-07-22 post policy refactor):
 *   policyRegression.mjs — all fixtures pass
 *   corpus4 notesOk >= 98.5% (rebuild: node _Decode_oracle/buildChordDb.js ...)
 *   tier-1 eleanor-rigby + 500-miles 100%
 *   catalog resync: engine failures trend down vs 488 baseline (781 slugs)
 */
import { chordInterpreter } from "../web-player/lib/music.js";
import { noteNameToPc } from "../web-player/lib/chordNoteUtils.js";

const BASELINE = {
  holst: { chord: { root: 2, type: 7, inversion: 3 }, key: { tonic: "C", scale: "phrygianDominant" }, pcs: [1, 2, 6, 9] },
  hmIII7: { chord: { root: 3, type: 7 }, key: { tonic: "C", scale: "harmonicMinor" }, pcs: [2, 3, 7, 10] },
  bIIphdm: { chord: { root: 2, type: 7, borrowed: "phrygianDominant" }, key: { tonic: "C", scale: "major" }, pcs: [0, 1, 5, 8] },
  bIbor: { chord: { root: 1, type: 5, borrowed: [-1, 1, 3, 5, 6, 8, 10] }, key: { tonic: "B", scale: "minor" }, pcs: [2, 5, 10] },
  BphdmII: { chord: { root: 2, type: 7 }, key: { tonic: "B", scale: "phrygianDominant" }, pcs: [0, 4, 7, 11] },
  triSub9: {
    chord: { root: 1, type: 9, applied: 5, substitutions: ["tri"] },
    key: { tonic: "G", scale: "minor" },
    pcs: [0, 3, 6, 8, 10],
  },
  viiHalfDim: {
    chord: { root: 7, type: 7, halfDim: true, flattenHalfDimB5: true, alterations: ["b5"] },
    key: { tonic: "C", scale: "major" },
    pcs: [2, 5, 8, 11],
  },
  v13minor: {
    chord: { root: 5, type: 13 },
    key: { tonic: "C#", scale: "minor" },
    pcs: [1, 3, 4, 5, 6, 8, 9, 11],
  },
  iisus4no5: {
    chord: { root: 2, type: 5, suspensions: [4], omits: [5] },
    key: { tonic: "G#", scale: "minor" },
    pcs: [3, 10],
  },
  i13minor: {
    chord: { root: 1, type: 13 },
    key: { tonic: "E", scale: "minor" },
    pcs: [0, 1, 2, 4, 6, 7, 9, 11],
  },
  appliedSharp5Aug: {
    chord: { root: 3, type: 5, applied: 5, alterations: ["#5"] },
    key: { tonic: "G", scale: "mixolydian" },
    pcs: [2, 6, 10],
  },
  appliedViiSharp5: {
    chord: { root: 6, type: 5, applied: 7, inversion: 2, alterations: ["#5"] },
    key: { tonic: "E", scale: "harmonicMinor" },
    pcs: [2, 7, 11],
  },
  iiDimNo5: {
    chord: { root: 2, type: 5, omits: [5] },
    key: { tonic: "B", scale: "minor" },
    pcs: [1, 4],
  },
  III13notMinorStack: {
    chord: { root: 3, type: 13 },
    key: { tonic: "C", scale: "minor" },
    pcs: [0, 2, 3, 5, 7, 8, 10],
  },
  triSubBorMinor: {
    chord: { root: 1, type: 9, applied: 5, borrowed: "minor", substitutions: ["tri"] },
    key: { tonic: "G", scale: "minor" },
    pcs: [0, 3, 6, 8, 10],
  },
  ivHalfDim7Custom: {
    chord: { root: 4, type: 7, borrowed: [-1, 1, 3, 5, 6, 8, 10], halfDim: true },
    key: { tonic: "E", scale: "major" },
    pcs: [0, 3, 6, 9],
  },
  customHalfDim11: {
    chord: { root: 1, type: 11, borrowed: [1, 2, 4, 6, 7, 9, 11], halfDim: true },
    key: { tonic: "A", scale: "minor" },
    pcs: [1, 4, 7, 10, 11],
  },
  iio65minor: {
    chord: { root: 2, type: 7, inversion: 1, halfDim: true },
    key: { tonic: "D", scale: "minor" },
    pcs: [1, 4, 7, 10],
  },
  iv13minor: {
    chord: { root: 4, type: 13 },
    key: { tonic: "E", scale: "minor" },
    pcs: [0, 2, 4, 6, 7, 9, 11],
  },
  viiDimNo35: {
    chord: { root: 7, type: 5, omits: [3, 5] },
    key: { tonic: "A", scale: "major" },
    pcs: [8],
  },
  iio7no5: {
    chord: { root: 2, type: 7, omits: [5], halfDim: true },
    key: { tonic: "B", scale: "minor" },
    pcs: [1, 4, 7, 10],
  },
  customDim11bor: {
    chord: { root: 1, type: 11, borrowed: [0, 1, 3, 4, 6, 8, 9], dimTriad: true, alterations: ["b9", "b11"] },
    key: { tonic: "C", scale: "phrygianDominant" },
    pcs: [0, 1, 3, 5, 6, 9],
  },
  hmV13bor: {
    chord: { root: 5, type: 13, borrowed: "harmonicMinor", alterations: ["b9", "b13"] },
    key: { tonic: "E", scale: "minor" },
    pcs: [0, 3, 4, 6, 7, 8, 9, 11],
  },
};

function pcs(chord, key) {
  return chordInterpreter(chord, key).notes.map((n) => noteNameToPc(n)).sort((a, b) => a - b);
}

let failed = 0;
for (const [name, { chord, key, pcs: want }] of Object.entries(BASELINE)) {
  const got = pcs(chord, key);
  const ok = got.length === want.length && got.every((v, i) => v === want[i]);
  if (!ok) {
    console.error(`FAIL ${name}: want [${want}] got [${got}]`);
    failed++;
  } else {
    console.log(`ok ${name}`);
  }
}

if (failed) {
  console.error(`\n${failed} policy regression failure(s)`);
  process.exit(1);
}
console.log("\nAll policy regression fixtures passed.");
