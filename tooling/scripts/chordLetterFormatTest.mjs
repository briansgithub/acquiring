import assert from "node:assert/strict";
import { formatChordLetter } from "../../web/lib/chordLetterFormat.js";

function label(chord, overrides = {}) {
  return formatChordLetter(chord, { tonic: "C", scale: "major" }, {
    rootNoteName: "C", quality: "major", degree: 1, effKey: { tonic: "C", scale: "mixolydian" },
    interpreted: { notes: [], chordDegrees: ["1", "3", "5", "b7"] }, ...overrides,
  });
}
assert.equal(label({ type: 5, adds: [9] }), "C(add9)");
assert.equal(label({ type: 5, adds: [6] }), "C6");
assert.equal(label({ type: 5, adds: [6, 9] }), "C6/9");
assert.equal(label({ type: 7, adds: [4, 6] }), "C7(add11add13)");
assert.equal(label({ type: 5, omits: [3, 5] }), "C(no3no5)");
assert.equal(label({ type: 5, omits: [3] }), "C5");
assert.equal(label({ type: 5, omits: [5], suspensions: [4] }, { quality: "minor", interpreted: { chordDegrees: ["1", "4"] } }), "C(no5)sus4");
assert.equal(label({ type: 7 }, { quality: "diminished", interpreted: { chordDegrees: ["1", "b3", "b5", "b7"] } }), "Cm7(b5)");
assert.equal(label({ type: 7, applied: 7 }, { quality: "diminished", interpreted: { chordDegrees: ["1", "b3", "b5", "bb7"] } }), "C°7");
assert.equal(label({ type: 7 }, { quality: "diminished", majorSeventh: true, interpreted: { chordDegrees: ["1", "b3", "b5", "7"] } }), "Cmmaj7(b5)");
assert.equal(label({ type: 7, inversion: 1 }, { quality: "minor", bassNoteName: "Eb" }), "Eb6");
assert.equal(label({ type: 7, inversion: 3 }, { quality: "minor", bassNoteName: "Bb" }), "Cm/Bb");
assert.equal(label({ type: 11 }, { degree: 5 }), "Bb/C");
// Played voicing roles must not invent written alterations. Preserve the
// highest unaltered written extension, and take implicit b9 from the scale.
assert.equal(label({ type: 11, alterations: ["#9"] }, { majorSeventh: true, interpreted: { chordDegrees: ["1", "3", "5", "7", "#9", "#11"] } }), "Cmaj11(#9)");
assert.equal(label({ type: 11, alterations: ["#9", "#11"] }, { majorSeventh: true }), "Cmaj7(#9#11)");
assert.equal(label({ type: 9 }, { quality: "minor", effKey: { tonic: "C", scale: "phrygian" }, interpreted: { chordDegrees: ["1", "b3", "5", "b7", "b9"] } }), "Cm7(b9)");
assert.equal(label({ type: 7, suspensions: [2] }, { effKey: { tonic: "C", scale: "phrygian" }, interpreted: { chordDegrees: ["1", "b2", "5", "b7"] } }), "C7susb2");
assert.equal(label({ type: 7 }, { rootNoteName: "C#", quality: "minor", degree: 3, effKey: { tonic: "A", scale: "major" } }), "C#m7");
assert.equal(label({ type: 7, suspensions: [2] }, { rootNoteName: "G", degree: 5, effKey: { tonic: "C", scale: "major" } }), "G7sus2");
assert.equal(label({ type: 5 }, { quality: "augmented", degree: 3, effKey: { tonic: "A", scale: "harmonicMinor" } }), "C+");
console.log("Source-backed chord letter formatting checks passed");
