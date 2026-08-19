import assert from "node:assert/strict";
import test from "node:test";

import { renderSectionToMidi } from "../../lib/midi/render/index.mjs";
import { runBenchmark } from "./benchmark.mjs";

test("benchmark verifies deterministic repeated analysis and reports limits", async () => {
  const rendered = renderSectionToMidi({
    sectionName: "Benchmark",
    chords: [{ root: 1, type: 5, beat: 1, duration: 1 }],
    notes: [{ sd: "1", octave: 0, beat: 1, duration: 1 }],
    metadata: {
      keys: [{ tonic: "C", scale: "major", beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [{ numBeats: 4, beatUnit: 1, beat: 1 }],
      endBeat: 2,
    },
  });
  const report = await runBenchmark(rendered.bytes, {
    iterations: 2,
    warmups: 0,
    maxMs: 30_000,
    topK: 3,
  });
  assert.equal(report.passed, true);
  assert.equal(report.elapsedMs.samples.length, 2);
  assert.match(report.deterministicDigest, /^[a-f0-9]{64}$/);
  assert.equal(report.configuration.topK, 3);
});
