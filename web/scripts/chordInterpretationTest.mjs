import assert from "node:assert/strict";
import fs from "node:fs";
import { interpretChordContract } from "../lib/chordContract.js";
import { verifyInterpretedChord } from "../lib/scaleDegreeVerifier.js";
import { getChordSymbolForDisplayContext } from "../lib/chordDisplayContext.js";
import { buildSongEntries } from "../components/quiz/quizPool.js";
import { chordInterpreter } from "../lib/music.js";

// Hand-reviewed product convention, independent of generated parity snapshots.
const roles = JSON.parse(fs.readFileSync(new URL("../../contracts/fixtures/chord_role_contract.json", import.meta.url)));
for (const test of roles) {
  const result = interpretChordContract(test.chord, test.key);
  assert.equal(result.rootMidi, test.expectedRootMidi, `${test.id}: resolved root`);
  assert.deepEqual(result.toneLabels, test.expectedToneLabels, `${test.id}: musical roles`);
  if (test.expectedRelativeIonianRoman != null) {
    assert.equal(getChordSymbolForDisplayContext(test.chord, test.key, test.displayContext), test.expectedRelativeIonianRoman, `${test.id}: display context`);
  }
  assert.equal(verifyInterpretedChord(test.chord, test.key).verification.ok, true, `${test.id}: labels describe pitches`);
}

let transpositions = 0;
for (const root of [1, 2, 4, 5]) {
  for (const type of [5, 7, 9]) {
    for (const inversion of [0, 1, 2]) {
      const chord = { root, type, inversion };
      const before = interpretChordContract(chord, { tonic: "C", scale: "major" });
      const after = interpretChordContract(chord, { tonic: "D", scale: "major" });
      assert.equal(before.roman, after.roman, "transposition preserves Roman function");
      assert.deepEqual(before.toneLabels, after.toneLabels, "transposition preserves musical roles");
      assert.deepEqual(before.midi.map((m) => (m + 2) % 12), after.midi.map((m) => m % 12), "transposition moves every tone");
      const forced = interpretChordContract(chord, { tonic: "C", scale: "major" }, { forceRootPosition: true });
      const original = interpretChordContract({ ...chord, inversion: 0 }, { tonic: "C", scale: "major" });
      assert.deepEqual(forced.midi, original.midi, "root-position option controls playback");
      assert.equal(forced.roman, before.roman, "root-position option preserves written inversion");
      transpositions++;
    }
  }
}
const [entry] = buildSongEntries([{ root: 1, type: 7, inversion: 1, beat: 1 }], [], { tonic: "C", scale: "major" }, chordInterpreter);
assert.deepEqual(entry.degrees, ["3", "5", "7", "1"], "quiz labels must follow its voiced notes");
assert.equal(entry.rootNote, "C3", "sing-root grading uses the harmonic root");
const alteredInversion = interpretChordContract({ root: 7, type: 7, inversion: 3, alterations: ["b5", "#9"] }, { tonic: "C", scale: "major" });
assert.equal(alteredInversion.roman, "viiø4(b5)(#9)2", "third inversion must retain every alteration");
assert.equal(interpretChordContract({ root: 4, applied: 5, type: 5, inversion: 2, suspensions: [4] }, { tonic: "D#", scale: "minor" }).roman,
  "V64sus4(maj)/iv", "applied suspension keeps visually ordered inversion digits");
assert.equal(interpretChordContract({ root: 4, applied: 5, type: 5, inversion: 2, alterations: ["#5"] }, { tonic: "C", scale: "major" }).roman,
  "V+6(#5)4/IV", "applied augmented inversion has one quality marker");
console.log(`Chord interpretation passed: ${roles.length} musical-role cases, ${transpositions} transposition/inversion cases and quiz note/label pairing.`);
