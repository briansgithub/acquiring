import assert from "node:assert/strict";
import test from "node:test";

import {
  HarmonicValidationError,
  normalizeHooktheoryChord,
  resolveHarmonicAnalysis,
} from "./harmonicContract.js";
import { chordInterpreter } from "./music.js";
import { getChordLetterName, getChordSymbol } from "./jsonToSymbol.js";

const C_MAJOR = { tonic: "C", scale: "major" };

test("rests are normalized and suppressed at every public decoder boundary", () => {
  const rest = { root: 1, beat: 1, duration: 1, isRest: true };
  assert.deepEqual(chordInterpreter(rest, C_MAJOR), {
    notes: [], chordDegrees: [], isRest: true,
  });
  assert.equal(getChordSymbol(rest, C_MAJOR), "");
  assert.equal(getChordLetterName(rest, C_MAJOR), "");
});

test("strict normalization rejects invalid ordinary chord fields", () => {
  assert.throws(
    () => normalizeHooktheoryChord({ root: -1, type: 6, inversion: 8 }, { strict: true }),
    (error) => error instanceof HarmonicValidationError
      && error.issues.some((issue) => issue.path === "root")
      && error.issues.some((issue) => issue.path === "type"),
  );
  for (const decode of [chordInterpreter, getChordSymbol, getChordLetterName]) {
    assert.throws(
      () => decode({ root: -1, type: 6, inversion: 8 }, C_MAJOR),
      (error) => error instanceof HarmonicValidationError,
    );
  }
});

test("undocumented borrowed-mode tokens are quarantined", () => {
  assert.throws(
    () => resolveHarmonicAnalysis({
      root: 1,
      type: 5,
      inversion: 0,
      applied: 0,
      borrowed: "super:2",
    }, C_MAJOR, { strict: true }),
    (error) => error instanceof HarmonicValidationError
      && error.issues.some((issue) => issue.code === "unsupported_borrowed"),
  );
});

test("canonical analysis explicitly separates applied+borrowed sound and label intent", () => {
  const chord = {
    root: 4,
    applied: 5,
    borrowed: "minor",
    type: 7,
    inversion: 0,
  };
  const analysis = resolveHarmonicAnalysis(chord, C_MAJOR, { strict: true });
  assert.equal(analysis.soundIntent.borrowed, "minor");
  assert.equal(analysis.labelIntent.borrowed, null);
  assert.equal(analysis.labelChord.borrowed, null);
});

test("normalization clones modifier arrays instead of mutating source JSON", () => {
  const source = { root: 1, type: 5, inversion: 0, applied: 0, adds: [9] };
  const { chord } = normalizeHooktheoryChord(source);
  chord.adds.push(6);
  assert.deepEqual(source.adds, [9]);
});
