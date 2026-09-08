import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getChordLetterName, getChordSymbol } from "../../web/lib/jsonToSymbol.js";
import { chordInterpreter } from "../../web/lib/music.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = path.join(repoRoot, "contracts", "fixtures", "corpus_parity.json");
const cases = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

assert.ok(Array.isArray(cases) && cases.length > 0, "Shared parity corpus must not be empty");

// Port of MusicTheory.relativeMajorDegreeLabel (iOS) / getRelativeDegreeLabel
// (Android). Kept here as well as in the generator so this check fails if the
// generator's copy drifts.
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const wrap = (value) => (value > 6 ? value - 12 : value < -6 ? value + 12 : value);

function relativeMajorDegreeLabel(midi, rootMidi) {
  const relative = (((midi - rootMidi) % 12) + 12) % 12;
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < MAJOR_INTERVALS.length; index++) {
    const distance = Math.abs(wrap(relative - MAJOR_INTERVALS[index]));
    if (distance < bestDistance || (distance === bestDistance && index > best)) {
      best = index;
      bestDistance = distance;
    }
  }
  const difference = wrap(relative - MAJOR_INTERVALS[best]);
  const prefix = { "-2": "♭♭", "-1": "♭", 1: "♯", 2: "♯♯" }[difference] || "";
  return `${prefix}${best + 1}̂`;
}

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteNameToMidi(name) {
  const match = String(name).match(/^([A-Ga-g])([#bx]*)(-?\d+)$/);
  if (!match) return null;
  let pc = LETTER_PC[match[1].toUpperCase()];
  for (const accidental of match[2]) {
    if (accidental === "#") pc += 1;
    else if (accidental === "x") pc += 2;
    else if (accidental === "b") pc -= 1;
  }
  return (parseInt(match[3], 10) + 1) * 12 + pc;
}

// Web labels chord tones structurally, from note spelling; the mobile clients
// label them by chord-relative pitch class. Two separate things show up here:
// a deliberate style difference (sus4 reads "#3" on web, "4" on mobile) and a
// real web defect on extended chords, where calculateScaleDegrees runs past
// extensionBaseDegree and labels against the wrong root. Neither is something
// this contract gates on -- the mobile labels are the contract -- so report a
// summary and move on.
const labelStyleDivergences = new Map();
let divergentChords = 0;

for (const testCase of cases) {
  const chord = JSON.parse(testCase.json);
  const interpreted = chordInterpreter(chord, testCase.key);
  const midi = interpreted.notes.map(noteNameToMidi);
  const pitchClasses = [...new Set(midi.map((value) => ((value % 12) + 12) % 12))].sort((a, b) => a - b);
  const rootMidi = noteNameToMidi(chordInterpreter({ ...chord, inversion: 0 }, testCase.key).notes[0]);
  const toneLabels = midi.map((value) => relativeMajorDegreeLabel(value, rootMidi));

  assert.equal(getChordSymbol(chord, testCase.key), testCase.expectedRoman, `${testCase.id}: Roman symbol`);
  assert.equal(getChordLetterName(chord, testCase.key), testCase.expectedLetter, `${testCase.id}: letter name`);
  assert.deepEqual(pitchClasses, [...testCase.expectedPcs].sort((a, b) => a - b), `${testCase.id}: pitch classes`);
  assert.deepEqual(midi, testCase.expectedMidi, `${testCase.id}: ordered MIDI`);
  assert.equal(rootMidi, testCase.expectedRootMidi, `${testCase.id}: root-position root MIDI`);
  assert.deepEqual(toneLabels, testCase.expectedToneLabels, `${testCase.id}: chord tone labels`);

  const webDegrees = (interpreted.chordDegrees || []).map((degree) => `${degree}`);
  const mobileDegrees = toneLabels.map((label) =>
    label.replace(/̂/g, "").replace(/♭/g, "b").replace(/♯/g, "#")
  );
  if (webDegrees.length === mobileDegrees.length) {
    let chordDiverged = false;
    for (let index = 0; index < webDegrees.length; index++) {
      if (webDegrees[index] !== mobileDegrees[index]) {
        chordDiverged = true;
        const pair = `${webDegrees[index]} (web) vs ${mobileDegrees[index]} (mobile)`;
        labelStyleDivergences.set(pair, (labelStyleDivergences.get(pair) || 0) + 1);
      }
    }
    if (chordDiverged) divergentChords++;
  }
}

console.log(`shared parity corpus passed (${cases.length} cases)`);

if (labelStyleDivergences.size) {
  const total = [...labelStyleDivergences.values()].reduce((sum, count) => sum + count, 0);
  const top = [...labelStyleDivergences.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pair, count]) => `${pair} ×${count}`)
    .join(", ");
  console.log(
    `note: web/mobile chord-tone labels differ on ${total} tone(s) across ` +
      `${divergentChords} chord(s); most common: ${top}. Not asserted — the mobile ` +
      `pitch-class labels are the contract.`
  );
}
