import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateAndroidMidiAssets } from "./index.mjs";
import { generateGoldenFixtures } from "./goldens.mjs";
import {
  MAX_PACKAGED_PRIOR_BYTES,
  canonicalizePriors,
  decodeCatalogPriors,
  encodeCatalogPriors,
  stableJson,
} from "./priors.mjs";

function fixture() {
  const chord = (root, borrowed = "") => ({
    root, type: root === 1 ? 9 : 7, inversion: 0, applied: 0, borrowed,
    adds: root === 1 ? [9] : [], omits: [], alterations: [], suspensions: [], substitutions: [],
  });
  const object = (hex, root, borrowed) => ({
    id: `sha256:${hex.repeat(64)}`,
    chord: chord(root, borrowed),
    signature: stableJson(chord(root, borrowed)),
    trainOccurrences: root * 3,
    trainSongs: root,
    trainGroups: root,
    occurrenceProbability: root / 10,
    smoothedLogProbability: -root,
    byScale: [{ scale: "major", trainOccurrences: root * 3, trainSongs: root, trainGroups: root }],
  });
  const first = object("1", 1, null);
  const second = object("2", 2, [0, 2, 3, 5, 7, 8, 10]);
  return {
    algorithmVersion: "fixture-v1",
    manifestId: `sha256:${"a".repeat(64)}`,
    objects: [second, first],
    policy: { transitionSmoothingAlpha: 0.25 },
    schemaVersion: "hooktheory-catalog-priors/v1",
    source: { catalog: "fixture" },
    summary: { trainObjects: 2 },
    trainingSplit: "train",
    transitions: {
      starts: [{ id: first.id, count: 4, smoothedLogProbability: -0.1 }],
      bySource: [{
        fromId: first.id, totalCount: 3, otherCount: 0,
        successors: [{ toId: second.id, count: 3, smoothedLogProbability: -0.2 }],
      }],
    },
  };
}

test("compact prior encoding is deterministic and lossless", () => {
  const priors = fixture();
  const first = encodeCatalogPriors(priors);
  const second = encodeCatalogPriors(structuredClone(priors));
  assert.deepEqual(first, second);
  assert.deepEqual(decodeCatalogPriors(first), canonicalizePriors(priors));
});

test("full catalog priors fit the Android asset gate and round-trip", async () => {
  const source = JSON.parse(await fs.readFile("lib/midi/analyze/catalog-priors.json", "utf8"));
  const bytes = encodeCatalogPriors(source);
  assert(bytes.length < MAX_PACKAGED_PRIOR_BYTES);
  assert.equal(stableJson(decodeCatalogPriors(bytes)), stableJson(canonicalizePriors(source)));
});

test("CLI generator writes verified binary and manifest atomically", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "android-midi-assets-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, "priors.json");
  await fs.writeFile(input, JSON.stringify(fixture()));
  const result = await generateAndroidMidiAssets({ input, outputDir: directory, verify: true });
  const stored = await fs.readFile(path.join(directory, result.manifest.file));
  assert.deepEqual(stored, result.binary);
  assert.equal(result.manifest.size, result.binary.length);
  assert.equal(result.manifest.counts.objects, 2);
  assert.match(result.manifest.sha256, /^[0-9a-f]{64}$/);
});

test("golden MIDI and analyzer fixtures regenerate byte-identically", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "android-midi-goldens-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  const firstManifest = await generateGoldenFixtures(first);
  const secondManifest = await generateGoldenFixtures(second);
  assert.deepEqual(firstManifest, secondManifest);
  for (const entry of firstManifest.cases) {
    assert.deepEqual(
      await fs.readFile(path.join(first, entry.source.file)),
      await fs.readFile(path.join(second, entry.source.file)),
    );
    assert.deepEqual(
      await fs.readFile(path.join(first, entry.result.file)),
      await fs.readFile(path.join(second, entry.result.file)),
    );
  }
  const typeTwo = JSON.parse(await fs.readFile(path.join(first, "type2.mid.analysis.json"), "utf8"));
  const smpte = JSON.parse(await fs.readFile(path.join(first, "smpte.mid.analysis.json"), "utf8"));
  assert.equal(typeTwo.error.code, "UNSUPPORTED_MIDI_FORMAT");
  assert.equal(smpte.error.code, "UNSUPPORTED_MIDI_TIMING");
});
