/**
 * Verify entryRootDegree maps applied-chord roots to song-key scale degrees.
 */
import { chordInterpreter } from "../web-player/lib/music.js";
import { normalizeToneNotes } from "../web-player/lib/chordVoicing.js";
import { entryRootDegree } from "../web-player/components/quiz/quizPool.js";

const key = { tonic: "C", scale: "major" };

function makeEntry(chord) {
  const data = chordInterpreter(chord, key);
  const rootData = chordInterpreter(chord, key, { forceRootPosition: true });
  return {
    chord,
    key,
    symbol: "test",
    notes: normalizeToneNotes(data.notes || []),
    rootNotes: normalizeToneNotes(rootData.notes || []),
    degrees: rootData.chordDegrees || [],
  };
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
    process.exit(1);
  }
}

// V/ii in C: JSON root=2 (ii target), sounding root=A → degree 6 in C
const vOfIi = makeEntry({ root: 2, applied: 5, type: 7, inversion: 0, beat: 1, duration: 4 });
assertEq(entryRootDegree(vOfIi), 6, "V/ii root degree");
assertEq(vOfIi.chord.root, 2, "V/ii JSON root is denominator");
if (entryRootDegree(vOfIi) === vOfIi.chord.root) {
  console.error("FAIL: entryRootDegree must not equal JSON root for applied chord");
  process.exit(1);
}

// V/V in C: JSON root=5 (V target), sounding root=D → degree 2 in C
const vOfV = makeEntry({ root: 5, applied: 5, type: 7, inversion: 0, beat: 9, duration: 4 });
assertEq(entryRootDegree(vOfV), 2, "V/V root degree");
assertEq(vOfV.chord.root, 5, "V/V JSON root is denominator");

// Plain IV: JSON root matches sounding root degree
const iv = makeEntry({ root: 4, type: 5, inversion: 0, beat: 5, duration: 4 });
assertEq(entryRootDegree(iv), 4, "IV root degree");

console.log("PASS: entryRootDegree correct for applied and diatonic chords");
