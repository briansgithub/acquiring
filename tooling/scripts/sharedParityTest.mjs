import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { noteNameToPc } from "../../web/lib/chordNoteUtils.js";
import { getChordLetterName, getChordSymbol } from "../../web/lib/jsonToSymbol.js";
import { chordInterpreter } from "../../web/lib/music.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = path.join(repoRoot, "contracts", "fixtures", "corpus_parity.json");
const cases = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

assert.ok(Array.isArray(cases) && cases.length > 0, "Shared parity corpus must not be empty");

for (const testCase of cases) {
  const chord = JSON.parse(testCase.json);
  const interpreted = chordInterpreter(chord, testCase.key);
  const pitchClasses = [...new Set(interpreted.notes.map(noteNameToPc))].sort((a, b) => a - b);

  assert.equal(getChordSymbol(chord, testCase.key), testCase.expectedRoman, `${testCase.id}: Roman symbol`);
  assert.equal(getChordLetterName(chord, testCase.key), testCase.expectedLetter, `${testCase.id}: letter name`);
  assert.deepEqual(pitchClasses, [...testCase.expectedPcs].sort((a, b) => a - b), `${testCase.id}: pitch classes`);
}

console.log(`shared parity corpus passed (${cases.length} cases)`);
