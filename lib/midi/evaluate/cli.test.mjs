import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { main } from "../../../tools/midi-evaluate/index.mjs";

const section = {
  sectionName: "Full Song",
  chords: [{ root: 1, type: 5, inversion: 0, applied: 0, beat: 1, duration: 1 }],
  notes: [],
  metadata: {
    keys: [{ tonic: "C", scale: "major", beat: 1 }],
    tempos: [{ bpm: 120, beat: 1 }],
    meters: [{ numBeats: 4, beatUnit: 4, beat: 1 }],
    endBeat: 2,
  },
};

function analysisFor() {
  return {
    sections: [{
      hooktheory: section,
      analysis: {
        chordAlternatives: [{
          chordIndex: 0,
          confidence: 1,
          alternatives: [{ chord: section.chords[0], probability: 1 }],
        }],
      },
    }],
  };
}

test("CLI preserves pair mode and emits promotable corpus aggregates with lane/family metadata", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "midi-evaluate-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const truthPath = path.join(directory, "truth.json");
  const analysisPath = path.join(directory, "analysis.json");
  const pairOutput = path.join(directory, "pair-report.json");
  const corpusPath = path.join(directory, "corpus.json");
  const aggregateOutput = path.join(directory, "aggregate.json");
  await fs.writeFile(truthPath, JSON.stringify(section));
  await fs.writeFile(analysisPath, JSON.stringify(analysisFor()));

  await main([truthPath, analysisPath, "--output", pairOutput]);
  const pairReport = JSON.parse(await fs.readFile(pairOutput, "utf8"));
  assert.equal(pairReport.schemaVersion, "midi-evaluation/v1");

  await fs.writeFile(corpusPath, JSON.stringify({
    manifestId: "manifest:cli-test",
    split: "development",
    frozen: true,
    pairs: [{
      id: "song-a",
      truth: section,
      analysis: analysisFor(),
      metadata: {
        artifactKind: "synthetic",
        familyHoldoutKey: "humanize-v1",
      },
    }],
  }));
  await main(["corpus", corpusPath, "--output", aggregateOutput]);
  const aggregate = JSON.parse(await fs.readFile(aggregateOutput, "utf8"));
  assert.equal(aggregate.evaluationSet.frozen, true);
  assert.equal(aggregate.evaluationSet.partition, "development");
  assert.equal(aggregate.lanes.synthetic.songs, 1);
  assert.equal(aggregate.rendererFamilyHoldouts["humanize-v1"].songs, 1);
});
