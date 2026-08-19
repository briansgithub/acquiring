import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateEvaluationReports,
  evaluateAnalysis,
  evaluateFrozenDevelopmentPromotion,
  evaluatePromotion,
  harmonicObjectEqual,
  harmonicObjectSignature,
} from "./index.mjs";

const section = {
  sectionName: "Full Song",
  chords: [
    { root: 1, type: 5, inversion: 0, applied: 0, beat: 1, duration: 1 },
    { root: 5, type: 7, inversion: 0, applied: 0, beat: 2, duration: 1 },
  ],
  notes: [{ sd: "1", octave: 0, beat: 1, duration: 1 }],
  metadata: {
    keys: [{ tonic: "C", scale: "major", beat: 1 }],
    tempos: [{ bpm: 120, beat: 1 }],
    meters: [{ numBeats: 4, beatUnit: 4, beat: 1 }],
    endBeat: 3,
  },
};

function analysisFor(value = section) {
  return {
    sections: [{
      hooktheory: value,
      analysis: {
        chordAlternatives: value.chords.map((chord, chordIndex) => ({
          chordIndex,
          confidence: 1,
          alternatives: [{ chord, probability: 1 }],
        })),
      },
    }],
  };
}

test("harmonic equality applies Hooktheory defaults and order-insensitive modifiers", () => {
  assert.equal(harmonicObjectEqual(
    { root: 1, adds: [9, 6] },
    { root: 1, type: 5, inversion: 0, applied: 0, adds: [6, 9] },
  ), true);
});

test("perfect analysis produces perfect structural and forward metrics", () => {
  const rareSignatures = section.chords.map(harmonicObjectSignature);
  const report = evaluateAnalysis(section, analysisFor(), { rareSignatures });
  assert.equal(report.globalScore, 1);
  assert.equal(report.key.exact, 1);
  assert.equal(report.key.mirex, 1);
  assert.equal(report.chords.boundaries.f1, 1);
  assert.equal(report.chords.top5, 1);
  assert.equal(report.chords.forwardEquivalentTop5, 1);
  assert.equal(report.chords.durationWeighted.root, 1);
  assert.equal(report.chords.durationWeighted.majMinDurationBeats, 2);
  assert.equal(report.chords.durationWeighted.tetrad, 1);
  assert.equal(report.chords.rareSignatureMacro, 1);
  assert.equal(report.chords.rareSignatures.length, 2);
  assert.equal(report.melody.offsets.f1, 1);
  assert.equal(report.melody.pitchClasses.f1, 1);
  assert.equal(report.melody.scaleDegrees.f1, 1);
  assert.equal(report.melody.exact, 1);
  assert.equal(report.calibration.bins.length, 1);
  assert.equal(report.accuracyVsCoverage.points.at(-1).accuracy, 1);
  assert.equal(aggregateEvaluationReports([report, report]).songMacro.globalScore, 1);
});

test("promotion requires two points of gain and protects key/boundary metrics", () => {
  const baseline = { globalScore: 0.7, key: { exact: 0.9 }, chords: { boundaries: { f1: 0.8 }, top5: 0.9, forwardEquivalentTop5: 0.9, rareSignatureMacro: 0.8 }, calibration: { ece: 0.1 } };
  const candidate = { globalScore: 0.73, key: { exact: 0.9 }, chords: { boundaries: { f1: 0.8 }, top5: 0.9, forwardEquivalentTop5: 0.9, rareSignatureMacro: 0.8 }, calibration: { ece: 0.1 } };
  assert.equal(evaluatePromotion(baseline, candidate).promoted, true);
  candidate.key.exact = 0.89;
  assert.equal(evaluatePromotion(baseline, candidate).promoted, false);
  candidate.key.exact = 0.9;
  candidate.calibration.ece = 0.106;
  assert.equal(evaluatePromotion(baseline, candidate).promoted, false);
});

test("missed truth chords remain in duration denominators and unavailable promotion metrics fail closed", () => {
  const prediction = structuredClone(section);
  prediction.chords = prediction.chords.slice(0, 1);
  const report = evaluateAnalysis(section, analysisFor(prediction));
  assert.equal(report.chords.durationWeighted.durationBeats, 2);
  assert.equal(report.chords.durationWeighted.root, 0.5);
  assert.equal(report.chords.rareSignatureMacro, null);
  const promotion = evaluatePromotion(
    { globalScore: 0.7, key: { exact: 1 }, chords: { boundaries: { f1: 1 }, top5: 1, forwardEquivalentTop5: 1 }, calibration: { ece: 0 } },
    { globalScore: 0.8, key: { exact: 1 }, chords: { boundaries: { f1: 1 }, top5: 1, forwardEquivalentTop5: 1 }, calibration: { ece: 0 } },
  );
  assert.deepEqual(promotion.unavailableMetrics, ["chords.rareSignatureMacro"]);
  assert.equal(promotion.promoted, false);
});

test("corpus aggregation reports duration, rare-signature, lane, family, and confidence summaries", () => {
  const rareSignatures = section.chords.map(harmonicObjectSignature);
  const perfect = evaluateAnalysis(section, analysisFor(), { rareSignatures });
  const partialPrediction = structuredClone(section);
  partialPrediction.chords = partialPrediction.chords.slice(0, 1);
  const partial = evaluateAnalysis(section, analysisFor(partialPrediction), { rareSignatures });
  const aggregate = aggregateEvaluationReports([
    {
      report: perfect,
      metadata: { id: "song-a", lane: "synthetic", familyHoldoutKey: "canonical-v1" },
    },
    {
      report: partial,
      metadata: { id: "song-b", lane: "synthetic", familyHoldoutKey: "humanize-v1" },
    },
  ], {
    frozenDevelopment: true,
    split: "development",
    manifestId: "manifest:test",
  });
  assert.equal(aggregate.schemaVersion, "midi-evaluation-aggregate/v2");
  assert.equal(aggregate.durationWeighted.chordDurationBeats, 4);
  assert.equal(aggregate.durationWeighted.root, 0.75);
  assert.equal(aggregate.rareSignatures.count, 2);
  assert.equal(aggregate.rareSignatures.macro, 0.75);
  assert.equal(aggregate.micro.chordBoundaries.recall, 0.75);
  assert.equal(aggregate.calibration.count, 3);
  assert.equal(aggregate.accuracyVsCoverage.songMacro.at(-1).accuracy, 1);
  assert.equal(aggregate.lanes.synthetic.songs, 2);
  assert.equal(aggregate.rendererFamilyHoldouts["canonical-v1"].songs, 1);
  assert.equal(aggregate.rendererFamilyHoldouts["humanize-v1"].songs, 1);
  assert.match(aggregate.evaluationSet.pairSetId, /^sha256:/);
});

test("aggregate promotion accepts only matching frozen-development report sets", () => {
  const rareSignatures = section.chords.map(harmonicObjectSignature);
  const report = evaluateAnalysis(section, analysisFor(), { rareSignatures });
  const baseline = aggregateEvaluationReports([
    { report, metadata: { id: "song-a" } },
  ], { frozenDevelopment: true, split: "dev", manifestId: "manifest:test" });
  baseline.songMacro.globalScore = 0.7;
  baseline.songMacro.harmonicScore = 0.7;
  const candidate = structuredClone(baseline);
  candidate.songMacro.globalScore = 0.73;
  candidate.songMacro.harmonicScore = 0.73;
  assert.equal(evaluateFrozenDevelopmentPromotion(baseline, candidate).promoted, true);
  assert.equal(evaluatePromotion(baseline, candidate).promoted, true);

  const unfrozen = structuredClone(candidate);
  unfrozen.evaluationSet.frozen = false;
  const decision = evaluateFrozenDevelopmentPromotion(baseline, unfrozen);
  assert.equal(decision.promoted, false);
  assert.deepEqual(decision.inputErrors, ["candidate.evaluationSet.frozen must be true"]);
});
