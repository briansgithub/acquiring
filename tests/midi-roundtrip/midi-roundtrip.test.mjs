import assert from "node:assert/strict";
import test from "node:test";

import { analyzeMidi } from "../../lib/midi/analyze/index.js";
import { evaluateAnalysis } from "../../lib/midi/evaluate/index.mjs";
import { renderSectionToMidi } from "../../lib/midi/render/index.mjs";

const section = {
  sectionName: "Full Song",
  chords: [
    { root: 1, type: 5, beat: 1, duration: 1 },
    { root: 4, type: 5, beat: 2, duration: 1 },
    { root: 5, type: 7, beat: 3, duration: 1 },
    { root: 1, type: 5, beat: 4, duration: 1 },
  ],
  notes: [
    { sd: "1", octave: 0, beat: 1, duration: 1 },
    { sd: "4", octave: 0, beat: 2, duration: 1 },
    { sd: "5", octave: 0, beat: 3, duration: 1 },
    { sd: "1", octave: 1, beat: 4, duration: 1 },
  ],
  metadata: {
    keys: [{ tonic: "C", scale: "major", beat: 1 }],
    tempos: [{ bpm: 120, beat: 1 }],
    meters: [{ numBeats: 4, beatUnit: 1, beat: 1 }],
    endBeat: 5,
    split: "test",
    compositionGroupId: "roundtrip-fixture",
  },
};

test("canonical Hooktheory JSON survives render, analysis, and forward-equivalence evaluation", async () => {
  const rendered = renderSectionToMidi(section);
  const analysis = await analyzeMidi(rendered.bytes, {
    sourceName: "roundtrip.mid",
    includeBorrowed: false,
    includeApplied: false,
  });
  const report = evaluateAnalysis(section, analysis);

  assert.equal(analysis.sections[0].hooktheory.sectionName, "Full Song");
  assert.equal(report.key.exact, 1);
  assert.equal(report.chords.boundaries.f1, 1);
  assert.equal(report.chords.top5, 1);
  assert.equal(report.chords.forwardEquivalentTop5, 1);
  assert.equal(report.melody.exact, 1);
});

test("reserved renderer metadata restores modal key changes and section identity without creating marker sections", async () => {
  const modalSection = {
    sectionName: "Bridge",
    songId: "modal-song",
    songInfo: "Modal Probe",
    chords: [
      { root: 1, type: 5, beat: 1, duration: 2 },
      { root: 5, type: 7, beat: 3, duration: 2 },
    ],
    notes: [
      { sd: "1", octave: 0, beat: 1, duration: 1 },
      { sd: "2", octave: 0, beat: 2, duration: 1 },
      { sd: "5", octave: 0, beat: 3, duration: 1 },
    ],
    metadata: {
      keys: [
        { tonic: "D", scale: "dorian", beat: 1 },
        { tonic: "E", scale: "phrygian", beat: 3 },
      ],
      tempos: [
        { bpm: 100, beat: 1, swingFactor: 0.2, swingBeat: 0.5 },
        { bpm: 120, beat: 3, swingFactor: 0, swingBeat: 0.5 },
      ],
      meters: [
        { numBeats: 4, beatUnit: 1, beat: 1 },
        { numBeats: 3, beatUnit: 0.5, beat: 3 },
      ],
      endBeat: 5,
    },
  };

  const analysis = await analyzeMidi(renderSectionToMidi(modalSection).bytes);
  const output = analysis.sections[0].hooktheory;
  assert.equal(output.sectionName, "Bridge");
  assert.equal(output.songId, "modal-song");
  assert.equal(output.songInfo, "Modal Probe");
  assert.deepEqual(output.metadata.keys, modalSection.metadata.keys);
  assert.deepEqual(output.metadata.tempos, modalSection.metadata.tempos);
  assert.deepEqual(output.metadata.meters, modalSection.metadata.meters);
  assert.deepEqual(analysis.source.markers, []);
});
