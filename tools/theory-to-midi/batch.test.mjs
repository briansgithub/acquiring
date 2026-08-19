import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { createRequire } from "node:module";

import {
  generatePairedDataset,
  PairedBatchExistsError,
  parseBatchArguments,
} from "./batch.mjs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const {
  calculateManifestId,
  sourceSnapshot,
} = require("../../lib/midi-corpus/catalog-manifest.js");
const { hashFile, sha256Buffer, sha256String } = require("../../lib/midi-corpus/hash.js");
const { SPLIT_POLICY, assignSplit } = require("../../lib/midi-corpus/split.js");
const { stableStringify } = require("../../lib/midi-corpus/stable-json.js");
const { StoragePreflightError } = require("../../lib/midi-corpus/storage.js");

function groupForSplit(split) {
  for (let index = 0; index < 100_000; index += 1) {
    const groupId = `paired-batch-${split}-${index}`;
    if (assignSplit(groupId, SPLIT_POLICY).split === split) return groupId;
  }
  throw new Error(`Unable to find fixture group for ${split}`);
}

function section(id, root = 1) {
  return {
    songId: id,
    songInfo: `Fixture ${id}`,
    sectionName: "Verse",
    chords: [{
      root,
      beat: 1,
      duration: 4,
      type: 5,
      inversion: 0,
      applied: 0,
      borrowed: null,
      adds: [],
      omits: [],
      alterations: [],
      suspensions: [],
      substitutions: [],
      isRest: false,
    }],
    notes: [{ sd: String(root), octave: 0, beat: 1, duration: 1, isRest: false }],
    metadata: {
      keys: [{ tonic: "C", scale: "major", beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [{ numBeats: 4, beatUnit: 1, beat: 1 }],
      endBeat: 5,
    },
  };
}

async function createFrozenFixture(root) {
  const catalogPath = path.join(root, "catalog.db");
  const database = new DatabaseSync(catalogPath);
  database.exec(`
    CREATE TABLE songs (
      slug TEXT NOT NULL PRIMARY KEY,
      artist TEXT,
      title TEXT,
      url TEXT,
      status TEXT,
      dataBlob BLOB
    )
  `);
  const insert = database.prepare(`
    INSERT INTO songs (slug, artist, title, url, status, dataBlob)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const inputs = [
    { slug: "01-train", split: "train", payload: { z: section("train-z", 5), a: section("train-a", 1) } },
    { slug: "02-validation", split: "validation", payload: { verse: section("validation", 2) } },
    { slug: "03-test", split: "test", payload: { verse: section("test", 3) } },
  ];
  const records = [];
  for (const input of inputs) {
    const decoded = Buffer.from(JSON.stringify(input.payload), "utf8");
    const compressed = zlib.gzipSync(decoded, { level: 9, mtime: 0 });
    insert.run(
      input.slug,
      "Fixture Artist",
      input.slug,
      `https://example.invalid/${input.slug}`,
      "enriched",
      compressed,
    );
    const groupId = groupForSplit(input.split);
    const assigned = assignSplit(groupId, SPLIT_POLICY);
    const values = Object.values(input.payload);
    records.push({
      schema_version: 1,
      record_id: `hooktheory:${input.slug}`,
      slug: input.slug,
      source: {
        kind: "fixture",
        row_key: input.slug,
        row_sha256: sha256String(`row:${input.slug}`),
      },
      composition: { group_id: groupId },
      split: assigned.split,
      split_bucket: assigned.bucket,
      blob: {
        encoding: "gzip",
        compressed_bytes: compressed.length,
        compressed_sha256: sha256Buffer(compressed),
        decoded_bytes: decoded.length,
        decoded_sha256: sha256Buffer(decoded),
      },
      payload_summary: {
        section_count: values.length,
        valid_section_count: values.length,
        chord_count: values.length,
        note_count: values.length,
        key_event_count: values.length,
        tempo_event_count: values.length,
        meter_event_count: values.length,
      },
      anomalies: [],
    });
  }
  database.close();

  const manifestDir = path.join(root, "frozen-manifest");
  await fs.mkdir(manifestDir);
  const recordsText = `${records.map((record) => stableStringify(record)).join("\n")}\n`;
  const recordsPath = path.join(manifestDir, "records.ndjson");
  await fs.writeFile(recordsPath, recordsText, "utf8");
  const recordsHash = await hashFile(recordsPath);
  const sourceFiles = await sourceSnapshot(catalogPath);
  const manifest = {
    manifest_version: 1,
    manifest_id: null,
    immutable: true,
    source: {
      kind: "fixture_catalog",
      fingerprint_sha256: sha256String(stableStringify(sourceFiles)),
      files: sourceFiles,
      sqlite: { schema_sha256: sha256String("fixture-schema") },
    },
    records: {
      file: "records.ndjson",
      count: records.length,
      bytes: recordsHash.bytes,
      sha256: recordsHash.sha256,
    },
    split_policy: SPLIT_POLICY,
  };
  manifest.manifest_id = calculateManifestId(manifest);
  const manifestText = `${stableStringify(manifest, 2)}\n`;
  const manifestPath = path.join(manifestDir, "manifest.json");
  await fs.writeFile(manifestPath, manifestText, "utf8");
  const manifestHash = await hashFile(manifestPath);
  await fs.writeFile(
    path.join(manifestDir, "checksums.sha256"),
    `${manifestHash.sha256}  manifest.json\n${recordsHash.sha256}  records.ndjson\n`,
    "utf8",
  );
  return { catalogPath, manifestDir };
}

async function withFixture(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "paired-batch-test-"));
  try {
    const fixture = await createFrozenFixture(root);
    return await callback({ root, ...fixture });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function artifactRows(outputDir) {
  const text = await fs.readFile(path.join(outputDir, "artifacts.ndjson"), "utf8");
  return text.trim().split("\n").filter(Boolean).map(JSON.parse);
}

test("batch argument parsing normalizes dev and enforces a bounded pair limit", () => {
  const options = parseBatchArguments([
    "--manifest", "manifest", "--catalog", "catalog.db", "--output", "out",
    "--limit", "7", "--split", "dev",
  ]);
  assert.equal(options.limit, 7);
  assert.equal(options.split, "validation");
  assert.throws(
    () => parseBatchArguments(["--limit", "10001"]),
    /must be an integer in 1\.\.10000/,
  );
});

test("canonical batches work on held-out splits and are deterministic", async () => {
  await withFixture(async ({ root, catalogPath, manifestDir }) => {
    const outputA = path.join(root, "canonical-test-a");
    const outputB = path.join(root, "canonical-test-b");
    const common = {
      manifestDir,
      catalogPath,
      limit: 1,
      split: "test",
      reserveBytes: 0,
      availableBytes: 100_000_000,
    };
    await generatePairedDataset({ ...common, outputDir: outputA });
    await generatePairedDataset({ ...common, outputDir: outputB });

    assert.equal(
      await fs.readFile(path.join(outputA, "manifest.json"), "utf8"),
      await fs.readFile(path.join(outputB, "manifest.json"), "utf8"),
    );
    assert.equal(
      await fs.readFile(path.join(outputA, "checksums.sha256"), "utf8"),
      await fs.readFile(path.join(outputB, "checksums.sha256"), "utf8"),
    );
    const [artifact] = await artifactRows(outputA);
    assert.equal(artifact.split.name, "test");
    assert.equal(artifact.renderer.family_id, "canonical-v1");
    assert.equal(artifact.augmentation, null);
    assert.match(artifact.files.json.sha256, /^[a-f0-9]{64}$/);
    assert.match(artifact.files.midi.sha256, /^[a-f0-9]{64}$/);
  });
});

test("limit bounds section pairs and training augmentation preserves frozen provenance", async () => {
  await withFixture(async ({ root, catalogPath, manifestDir }) => {
    const outputDir = path.join(root, "augmented-train");
    const result = await generatePairedDataset({
      manifestDir,
      catalogPath,
      outputDir,
      limit: 1,
      split: "train",
      augmentation: { recipe: "humanize-v1", seed: "fixture-seed" },
      reserveBytes: 0,
      availableBytes: 100_000_000,
    });
    assert.equal(result.manifest.selection.rendered_pairs, 1);
    const [artifact] = await artifactRows(outputDir);
    assert.equal(artifact.renderer.family_id, "humanize-v1");
    assert.equal(artifact.split.name, "train");
    assert.equal(artifact.augmentation.splitMetadata.group, artifact.split.composition_group_id);
    const json = JSON.parse(await fs.readFile(
      path.join(outputDir, ...artifact.files.json.path.split("/")),
      "utf8",
    ));
    assert.equal(json.split, "train");
    assert.equal(json.splitGroup, artifact.split.composition_group_id);
    assert.equal(json.provenance.pairedData.corpusManifestId, result.manifest.source.corpus_manifest_id);
  });
});

test("augmentation of a non-training split is refused before output writes", async () => {
  await withFixture(async ({ root, catalogPath, manifestDir }) => {
    const outputDir = path.join(root, "invalid-augmentation");
    await assert.rejects(
      generatePairedDataset({
        manifestDir,
        catalogPath,
        outputDir,
        limit: 1,
        split: "validation",
        augmentation: { recipe: "humanize-v1", seed: "forbidden" },
        reserveBytes: 0,
        availableBytes: 100_000_000,
      }),
      /augmentation is training-only/,
    );
    await assert.rejects(fs.access(outputDir), (error) => error.code === "ENOENT");
  });
});

test("storage failure happens before writes and existing targets are immutable", async () => {
  await withFixture(async ({ root, catalogPath, manifestDir }) => {
    const preflightOutput = path.join(root, "no-space");
    await assert.rejects(
      generatePairedDataset({
        manifestDir,
        catalogPath,
        outputDir: preflightOutput,
        limit: 1,
        split: "train",
        reserveBytes: 0,
        availableBytes: 0,
      }),
      (error) => error instanceof StoragePreflightError
        && error.code === "INSUFFICIENT_STORAGE_RESERVE",
    );
    await assert.rejects(fs.access(preflightOutput), (error) => error.code === "ENOENT");

    const existingOutput = path.join(root, "existing");
    await fs.mkdir(existingOutput);
    await fs.writeFile(path.join(existingOutput, "owner.txt"), "keep", "utf8");
    await assert.rejects(
      generatePairedDataset({
        manifestDir,
        catalogPath,
        outputDir: existingOutput,
        limit: 1,
        split: "train",
      }),
      (error) => error instanceof PairedBatchExistsError && error.code === "PAIRED_BATCH_EXISTS",
    );
    assert.equal(await fs.readFile(path.join(existingOutput, "owner.txt"), "utf8"), "keep");
  });
});

test("checksums cover the artifact manifest and every emitted pair", async () => {
  await withFixture(async ({ root, catalogPath, manifestDir }) => {
    const outputDir = path.join(root, "checksummed");
    await generatePairedDataset({
      manifestDir,
      catalogPath,
      outputDir,
      limit: 2,
      split: "train",
      reserveBytes: 0,
      availableBytes: 100_000_000,
    });
    const checksumLines = (await fs.readFile(path.join(outputDir, "checksums.sha256"), "utf8"))
      .trim().split("\n");
    const rows = await artifactRows(outputDir);
    assert.equal(rows.length, 2);
    assert.ok(checksumLines.some((line) => line.endsWith("  artifacts.ndjson")));
    assert.ok(checksumLines.some((line) => line.endsWith("  manifest.json")));
    for (const artifact of rows) {
      for (const file of [artifact.files.json, artifact.files.midi]) {
        const actual = await hashFile(path.join(outputDir, ...file.path.split("/")));
        assert.equal(actual.sha256, file.sha256);
        assert.ok(checksumLines.includes(`${file.sha256}  ${file.path}`));
      }
    }
  });
});
