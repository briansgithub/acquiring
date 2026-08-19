import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runChord, runSection } = require("./engineRun.js");

test("raw lane never adds symbol-derived private fields to decoder input", async () => {
  const chord = {
    root: 5,
    type: 7,
    inversion: 0,
    applied: 0,
    beat: 1,
    duration: 1,
  };
  const before = structuredClone(chord);
  const result = await runChord(chord, { tonic: "C", scale: "major" }, { lane: "raw" });
  assert.equal(result.lane, "raw");
  assert.equal(result.error, null);
  assert.deepEqual(chord, before);
  assert.ok(result.notes.length >= 4);
});

test("raw lane strips pre-existing truth and policy poison before every decoder consumer", async () => {
  const clean = {
    root: 5,
    type: 7,
    inversion: 0,
    applied: 0,
    borrowed: null,
    adds: [],
    omits: [],
    alterations: [],
    suspensions: [],
    substitutions: [],
    beat: 1,
    duration: 1,
  };
  const poisoned = {
    ...clean,
    _truthLetter: "Definitely Not The Decoder Result",
    _truthRoman: "poisoned",
    _letterRootName: "F#",
    _letterBassName: "C#",
    _letterQuality: "diminished",
    _triSubDominant: true,
    halfDim: true,
    dimTriad: true,
    flattenHalfDimB5: true,
    appliedDenomMaj: true,
    _truthEnriched: true,
  };
  const key = { tonic: "C", scale: "major" };
  const expected = await runChord(clean, key, { lane: "raw" });
  const actual = await runChord(poisoned, key, { lane: "raw" });

  assert.deepEqual(
    {
      roman: actual.roman,
      letter: actual.letter,
      notes: actual.notes,
      pcs: actual.pcs,
      bassPc: actual.bassPc,
      chordDegrees: actual.chordDegrees,
      error: actual.error,
    },
    {
      roman: expected.roman,
      letter: expected.letter,
      notes: expected.notes,
      pcs: expected.pcs,
      bassPc: expected.bassPc,
      chordDegrees: expected.chordDegrees,
      error: expected.error,
    },
  );
  assert.notEqual(actual.letter, poisoned._truthLetter);
  assert.notEqual(actual.roman, poisoned._truthRoman);
});

test("raw section lane filters rests before decoding", async () => {
  const section = {
    json: {
      metadata: { keys: [{ tonic: "C", scale: "major", beat: 1 }] },
      chords: [
        { root: 1, type: 5, inversion: 0, applied: 0, beat: 1, duration: 1 },
        { root: 1, type: 5, inversion: 0, applied: 0, beat: 2, duration: 1, isRest: true },
      ],
    },
  };
  const results = await runSection(section, { lane: "raw" });
  assert.equal(results.length, 1);
  assert.equal(results[0].lane, "raw");
});
