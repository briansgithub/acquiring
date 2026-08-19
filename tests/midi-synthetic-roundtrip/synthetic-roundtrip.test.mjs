import assert from "node:assert/strict";
import test from "node:test";

import { runSyntheticRoundtripGate } from "../../tools/midi-analyze/synthetic-roundtrip.mjs";

const corpus = [
  {
    id: "C Major I",
    json: JSON.stringify({ root: 1, type: 5 }),
    key: { tonic: "C", scale: "major" },
  },
  {
    id: "Explicit rest with root",
    json: JSON.stringify({ root: 1, type: 5, isRest: true, beat: 1, duration: 1 }),
    key: { tonic: "C", scale: "major" },
  },
];

test("synthetic round-trip gate scores sounding chords and validates rests separately", async () => {
  const options = {
    gateTarget: 1,
    minimumCases: 2,
  };
  const report = await runSyntheticRoundtripGate(corpus, options);
  const repeated = await runSyntheticRoundtripGate(corpus, options);

  assert.equal(report.evidence.realWorldAccuracyClaim, false);
  assert.match(report.evidence.disclaimer, /does not measure accuracy/i);
  assert.equal(report.corpus.totalCases, 2);
  assert.equal(report.corpus.soundingCases, 1);
  assert.equal(report.corpus.restCases, 1);
  assert.deepEqual(report.metrics.forwardEquivalentChordRecall.top1, {
    hits: 1,
    total: 1,
    recall: 1,
  });
  assert.equal(report.metrics.forwardEquivalentChordRecall.top3.recall, 1);
  assert.equal(report.metrics.forwardEquivalentChordRecall.top5.recall, 1);
  assert.equal(report.metrics.restChecks.allPassed, true);
  assert.equal(report.gate.passed, true);
  assert.match(report.deterministicOutcomeSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(repeated, report);

  const rest = report.cases.find((entry) => entry.status === "rest-excluded-from-sounding-recall");
  assert.equal(rest.contributesToRecall, false);
  assert.equal(rest.restCheck.predictedSoundingChordCount, 0);
});

test("synthetic round-trip gate fails closed for an unexpectedly truncated corpus", async () => {
  const report = await runSyntheticRoundtripGate(corpus, {
    gateTarget: 0,
    minimumCases: 3,
  });

  assert.equal(report.corpus.complete, false);
  assert.equal(report.gate.conditions.corpusMinimumMet, false);
  assert.equal(report.gate.passed, false);
});
