#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { once } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  AUGMENTATION_FAMILY_IDS,
  renderSectionToMidi,
  sha256,
  stableStringify as renderStableStringify,
} from "../../lib/midi/render/index.mjs";
import { sanitizePublicHooktheoryChord } from "../../web-player/lib/harmonicContract.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const {
  calculateManifestId,
  sourceSnapshot,
} = require("../../lib/midi-corpus/catalog-manifest.js");
const { decodeGzipBlob, hashFile, sha256String } = require("../../lib/midi-corpus/hash.js");
const { assignSplit } = require("../../lib/midi-corpus/split.js");
const { stableStringify } = require("../../lib/midi-corpus/stable-json.js");
const {
  assertStoragePreflight,
  DEFAULT_MAX_BATCH_BYTES,
  DEFAULT_RESERVE_BYTES,
} = require("../../lib/midi-corpus/storage.js");

export const PAIRED_BATCH_SCHEMA = "hooktheory-json-midi-batch/v1";
export const PAIRED_ARTIFACT_SCHEMA = "hooktheory-json-midi-pair/v1";
export const MAX_PAIR_LIMIT = 10_000;

const INDEX_BASE_ESTIMATE = 1024n * 1024n;
const INDEX_BYTES_PER_PAIR = 16n * 1024n;
const PAIR_BASE_ESTIMATE = 128n * 1024n;
const EVENT_BYTES_ESTIMATE = 128n;

const HELP = `Usage:
  node tools/theory-to-midi/batch.mjs --manifest <dir> --catalog <catalog.db> \\
    --output <dir> --limit <pairs> [options]

Options:
      --split <train|validation|dev|test|all>  Frozen split selector (default: train)
      --lane <normal|challenge|all>            Anomaly lane selector (default: normal)
      --start-after <slug|record-id>           Resume after an exact manifest record
      --augmentation-family <id>               Training-only texture family
      --seed <value>                           Deterministic augmentation seed
      --transpose <semitones>                  Deterministic training-only transpose
  -h, --help                                   Show this help

--limit is a hard maximum number of section JSON/MIDI pairs, not songs. Output
is an immutable directory; existing targets are never replaced.
`;

export class PairedBatchExistsError extends Error {
  constructor(outputDir) {
    super(`Refusing to replace paired-data batch directory: ${outputDir}`);
    this.name = "PairedBatchExistsError";
    this.code = "PAIRED_BATCH_EXISTS";
    this.outputDir = outputDir;
  }
}

function parsePositiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric > maximum) {
    throw new RangeError(`${label} must be an integer in 1..${maximum}`);
  }
  return numeric;
}

function parseFiniteInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) throw new RangeError(`${label} must be an integer`);
  return numeric;
}

function valueAfter(argv, index, flag) {
  if (index + 1 >= argv.length) throw new Error(`${flag} requires a value`);
  return argv[index + 1];
}

export function parseBatchArguments(argv) {
  const options = { split: "train", lane: "normal", augmentation: null };
  const augmentation = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "--manifest") {
      options.manifestDir = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--catalog") {
      options.catalogPath = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--output" || argument === "-o") {
      options.outputDir = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--limit") {
      options.limit = parsePositiveInteger(valueAfter(argv, index, argument), argument, MAX_PAIR_LIMIT);
      index += 1;
    } else if (argument === "--split") {
      const split = valueAfter(argv, index, argument);
      options.split = split === "dev" ? "validation" : split;
      index += 1;
    } else if (argument === "--lane") {
      options.lane = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--start-after") {
      options.startAfter = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--augmentation-family") {
      const family = valueAfter(argv, index, argument);
      if (!AUGMENTATION_FAMILY_IDS.includes(family)) {
        throw new Error(`${argument} must be one of ${AUGMENTATION_FAMILY_IDS.join(", ")}`);
      }
      augmentation.recipe = family;
      index += 1;
    } else if (argument === "--seed") {
      augmentation.seed = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--transpose") {
      augmentation.transposeSemitones = parseFiniteInteger(valueAfter(argv, index, argument), argument);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (Object.keys(augmentation).length > 0) options.augmentation = augmentation;
  return options;
}

function parseChecksums(text) {
  const checksums = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([a-f0-9]{64})  ([^\\]+)$/.exec(line);
    if (!match) throw new Error(`Invalid checksum line: ${line}`);
    checksums.set(match[2], match[1]);
  }
  return checksums;
}

async function assertTargetAbsent(outputDir) {
  try {
    await fsp.lstat(outputDir);
    throw new PairedBatchExistsError(outputDir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function assertSelectionOptions(options) {
  if (!options.manifestDir) throw new Error("manifestDir is required");
  if (!options.catalogPath) throw new Error("catalogPath is required");
  if (!options.outputDir) throw new Error("outputDir is required");
  parsePositiveInteger(options.limit, "limit", MAX_PAIR_LIMIT);
  if (!["train", "validation", "test", "all"].includes(options.split ?? "train")) {
    throw new Error("split must be train, validation, test, or all");
  }
  if (!["normal", "challenge", "all"].includes(options.lane ?? "normal")) {
    throw new Error("lane must be normal, challenge, or all");
  }
  if (options.augmentation !== null && options.augmentation !== undefined
    && (typeof options.augmentation !== "object" || Array.isArray(options.augmentation))) {
    throw new TypeError("augmentation must be an object or null");
  }
}

async function loadFrozenManifest(manifestDir) {
  const absoluteDir = path.resolve(manifestDir);
  const manifestPath = path.join(absoluteDir, "manifest.json");
  const recordsPath = path.join(absoluteDir, "records.ndjson");
  const checksumsPath = path.join(absoluteDir, "checksums.sha256");
  const [manifestText, checksumText] = await Promise.all([
    fsp.readFile(manifestPath, "utf8"),
    fsp.readFile(checksumsPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  if (manifest.immutable !== true || typeof manifest.manifest_id !== "string") {
    throw new Error("Expected an immutable corpus manifest with a manifest ID");
  }
  if (calculateManifestId(manifest) !== manifest.manifest_id) {
    throw new Error("Frozen corpus manifest ID does not match its identity fields");
  }
  const checksums = parseChecksums(checksumText);
  const manifestSha256 = sha256(Buffer.from(manifestText, "utf8"));
  if (checksums.get("manifest.json") !== manifestSha256) {
    throw new Error("Frozen corpus manifest.json checksum mismatch");
  }
  return {
    absoluteDir,
    manifest,
    manifestPath,
    manifestSha256,
    recordsPath,
    recordsExpectedSha256: checksums.get("records.ndjson"),
  };
}

function recordMatchesLane(record, lane) {
  if (lane === "all") return true;
  const anomalous = Array.isArray(record.anomalies) && record.anomalies.length > 0;
  return lane === "challenge" ? anomalous : !anomalous;
}

function declaredSectionCount(record) {
  const summary = record.payload_summary || {};
  const value = Number(summary.valid_section_count ?? summary.section_count ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function validateSelectedRecord(record, manifest) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Manifest record must be an object");
  }
  if (typeof record.slug !== "string" || !record.slug) throw new Error("Manifest record is missing slug");
  const groupId = record.composition?.group_id;
  if (typeof groupId !== "string" || !groupId) {
    throw new Error(`Manifest record is missing a composition group: ${record.record_id || record.slug}`);
  }
  const assigned = assignSplit(groupId, manifest.split_policy);
  if (record.split !== assigned.split || record.split_bucket !== assigned.bucket) {
    throw new Error(`Frozen split/group mismatch for ${record.record_id || record.slug}`);
  }
  if (!record.blob?.compressed_sha256 || !record.blob?.decoded_sha256) {
    throw new Error(`Manifest record has no renderable frozen payload: ${record.record_id || record.slug}`);
  }
}

async function selectFrozenRecords(frozen, options) {
  if (!frozen.recordsExpectedSha256) {
    throw new Error("Frozen corpus checksums omit records.ndjson");
  }
  const input = fs.createReadStream(frozen.recordsPath);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const recordsHash = crypto.createHash("sha256");
  let recordBytes = 0;
  input.on("data", (chunk) => {
    recordsHash.update(chunk);
    recordBytes += chunk.length;
  });

  const selected = [];
  let selectedPairs = 0;
  let lineNumber = 0;
  let startReached = options.startAfter == null;
  let startFound = startReached;
  let selectionComplete = false;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim() || selectionComplete) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`${frozen.recordsPath}:${lineNumber}: ${error.message}`, { cause: error });
    }
    if (!startReached) {
      if (record.slug === options.startAfter || record.record_id === options.startAfter) {
        startReached = true;
        startFound = true;
      }
      continue;
    }
    if (options.split !== "all" && record.split !== options.split) continue;
    if (!recordMatchesLane(record, options.lane)) continue;
    const availableSections = declaredSectionCount(record);
    if (!availableSections) continue;
    validateSelectedRecord(record, frozen.manifest);
    const takeSections = Math.min(availableSections, options.limit - selectedPairs);
    selected.push({ record, takeSections });
    selectedPairs += takeSections;
    if (selectedPairs === options.limit) selectionComplete = true;
  }

  const actualRecordsSha256 = recordsHash.digest("hex");
  if (actualRecordsSha256 !== frozen.recordsExpectedSha256
    || actualRecordsSha256 !== frozen.manifest.records?.sha256
    || recordBytes !== frozen.manifest.records?.bytes) {
    throw new Error("Frozen corpus records.ndjson checksum or byte count mismatch");
  }
  if (!startFound) throw new Error(`--start-after record was not found: ${options.startAfter}`);
  if (!selected.length) throw new Error("No renderable manifest records matched the bounded selection");
  if (options.augmentation && selected.some(({ record }) => record.split !== "train")) {
    throw new Error("Texture augmentation is training-only; every selected record must have split=train");
  }
  return { selected, selectedPairs, recordBytes, recordsSha256: actualRecordsSha256 };
}

function estimatedStorage(selection) {
  let extractedBytes = 0n;
  for (const { record, takeSections } of selection.selected) {
    const decodedBytes = BigInt(record.blob?.decoded_bytes || 0);
    const summary = record.payload_summary || {};
    const eventCount = BigInt(
      Number(summary.chord_count || 0)
      + Number(summary.note_count || 0)
      + Number(summary.key_event_count || 0)
      + Number(summary.tempo_event_count || 0)
      + Number(summary.meter_event_count || 0),
    );
    extractedBytes += (decodedBytes * 4n)
      + (eventCount * EVENT_BYTES_ESTIMATE)
      + (BigInt(takeSections) * PAIR_BASE_ESTIMATE);
  }
  const indexBytes = INDEX_BASE_ESTIMATE
    + (BigInt(selection.selectedPairs) * INDEX_BYTES_PER_PAIR);
  return { extractedBytes, indexBytes };
}

function looksLikeSection(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (
    Array.isArray(value.chords)
    || value.notes !== undefined
    || value.stringSongId !== undefined
    || value.songId !== undefined
    || value.sectionId !== undefined
  ));
}

function sectionEntries(payload) {
  const wrap = (key, candidate) => ({
    key: String(key),
    section: looksLikeSection(candidate?.hooktheory)
      ? candidate.hooktheory
      : looksLikeSection(candidate?.json)
        ? candidate.json
        : candidate,
  });
  let entries;
  if (looksLikeSection(payload)) {
    entries = [wrap("root", payload)];
  } else if (Array.isArray(payload)) {
    entries = payload.map((section, index) => wrap(index, section));
  } else if (Array.isArray(payload?.sections)) {
    entries = payload.sections.map((section, index) => wrap(index, section));
  } else if (payload?.sections && typeof payload.sections === "object") {
    entries = Object.keys(payload.sections).sort().map((key) => wrap(key, payload.sections[key]));
  } else if (payload && typeof payload === "object") {
    entries = Object.keys(payload).sort().map((key) => wrap(key, payload[key]));
  } else {
    entries = [];
  }
  return entries.filter(({ section }) => looksLikeSection(section));
}

function frozenSection(rawSection, record, manifest, sectionKey, sectionIndex) {
  const section = JSON.parse(JSON.stringify(rawSection));
  if (Array.isArray(section.chords)) {
    section.chords = section.chords.map(sanitizePublicHooktheoryChord);
  }
  const groupId = record.composition.group_id;
  const frozenDataset = {
    manifestId: manifest.manifest_id,
    manifestVersion: manifest.manifest_version,
    recordId: record.record_id,
    recordSlug: record.slug,
    sourceRowSha256: record.source?.row_sha256 ?? null,
    sourcePayloadSha256: record.blob.decoded_sha256,
    sectionKey,
    sectionIndex,
    split: record.split,
    splitBucket: record.split_bucket,
    group: groupId,
    groupId,
  };
  section.split = record.split;
  section.datasetSplit = record.split;
  section.splitGroup = groupId;
  section.groupId = groupId;
  section.dataset = {
    ...(section.dataset && typeof section.dataset === "object" ? section.dataset : {}),
    ...frozenDataset,
  };
  section.metadata = {
    ...(section.metadata && typeof section.metadata === "object" ? section.metadata : {}),
    split: record.split,
    datasetSplit: record.split,
    splitGroup: groupId,
  };
  section.provenance = {
    ...(section.provenance && typeof section.provenance === "object" ? section.provenance : {}),
    split: record.split,
    splitGroup: groupId,
    dataset: frozenDataset,
    pairedData: {
      schema: PAIRED_ARTIFACT_SCHEMA,
      artifactKind: "synthetic",
      sourceLane: "raw_hooktheory_json",
      corpusManifestId: manifest.manifest_id,
      recordId: record.record_id,
      sourcePayloadSha256: record.blob.decoded_sha256,
      sectionKey,
      sectionIndex,
    },
  };
  return section;
}

function artifactIdFor({ manifestId, recordId, sectionKey, sectionIndex, augmentation }) {
  return sha256String(stableStringify({
    manifestId,
    recordId,
    sectionKey,
    sectionIndex,
    augmentation: augmentation ?? null,
  }));
}

async function writeExclusive(filePath, value) {
  await fsp.writeFile(filePath, value, { flag: "wx" });
}

async function writeLine(stream, line) {
  if (!stream.write(`${line}\n`, "utf8")) await once(stream, "drain");
}

async function finishStream(stream) {
  stream.end();
  await once(stream, "finish");
}

function relativePairPath(artifactId, extension) {
  return path.posix.join("pairs", artifactId.slice(0, 2), `${artifactId}.${extension}`);
}

function diskPath(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function batchIdentity(document) {
  return {
    schema: document.schema,
    schema_version: document.schema_version,
    source: document.source,
    selection: document.selection,
    renderer: document.renderer,
    storage_estimate: document.storage_estimate,
    artifacts: document.artifacts,
  };
}

async function assertInputsUnchanged(frozen, catalogPath, expectedSourceSnapshot) {
  const [manifestHash, recordsHash, currentSourceSnapshot] = await Promise.all([
    hashFile(frozen.manifestPath),
    hashFile(frozen.recordsPath),
    sourceSnapshot(catalogPath),
  ]);
  if (manifestHash.sha256 !== frozen.manifestSha256
    || recordsHash.sha256 !== frozen.recordsExpectedSha256
    || stableStringify(currentSourceSnapshot) !== stableStringify(expectedSourceSnapshot)) {
    const error = new Error("Frozen corpus inputs changed while the paired-data batch was rendered");
    error.code = "PAIRED_BATCH_SOURCE_CHANGED";
    throw error;
  }
}

export async function generatePairedDataset(options) {
  const normalized = {
    ...options,
    split: options.split === "dev" ? "validation" : (options.split ?? "train"),
    lane: options.lane ?? "normal",
    augmentation: options.augmentation ?? null,
  };
  assertSelectionOptions(normalized);
  normalized.limit = parsePositiveInteger(normalized.limit, "limit", MAX_PAIR_LIMIT);
  normalized.manifestDir = path.resolve(normalized.manifestDir);
  normalized.catalogPath = path.resolve(normalized.catalogPath);
  normalized.outputDir = path.resolve(normalized.outputDir);

  await assertTargetAbsent(normalized.outputDir);
  const frozen = await loadFrozenManifest(normalized.manifestDir);
  const expectedSourceSnapshot = frozen.manifest.source?.files;
  if (!Array.isArray(expectedSourceSnapshot) || expectedSourceSnapshot.length === 0) {
    throw new Error("Frozen corpus manifest has no catalog source snapshot");
  }
  const actualSourceSnapshot = await sourceSnapshot(normalized.catalogPath);
  if (stableStringify(actualSourceSnapshot) !== stableStringify(expectedSourceSnapshot)
    || sha256String(stableStringify(actualSourceSnapshot)) !== frozen.manifest.source?.fingerprint_sha256) {
    throw new Error("Catalog database does not match the source frozen by the manifest");
  }

  const selection = await selectFrozenRecords(frozen, normalized);
  const estimate = estimatedStorage(selection);
  const preflight = await assertStoragePreflight({
    storeRoot: normalized.outputDir,
    downloadBytes: 0n,
    extractedBytes: estimate.extractedBytes,
    indexBytes: estimate.indexBytes,
    temporaryBytes: 0n,
    maximumBatchBytes: normalized.maximumBatchBytes ?? DEFAULT_MAX_BATCH_BYTES,
    reserveBytes: normalized.reserveBytes ?? DEFAULT_RESERVE_BYTES,
    availableBytes: normalized.availableBytes,
    filesystemProbePath: normalized.filesystemProbePath,
  });

  const parentDir = path.dirname(normalized.outputDir);
  await fsp.mkdir(parentDir, { recursive: true });
  const temporaryDir = `${normalized.outputDir}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  await fsp.mkdir(temporaryDir, { recursive: false });
  const pairsDir = path.join(temporaryDir, "pairs");
  await fsp.mkdir(pairsDir, { recursive: false });

  const artifactsPath = path.join(temporaryDir, "artifacts.ndjson");
  const artifactStream = fs.createWriteStream(artifactsPath, { flags: "wx", encoding: "utf8" });
  const checksums = [];
  let artifactCount = 0;
  let pairBytes = 0n;
  let indexLineBytes = 0n;
  let database;

  try {
    database = new DatabaseSync(normalized.catalogPath, { readOnly: true });
    const columns = new Set(database.prepare("PRAGMA table_info(songs)").all().map((column) => column.name));
    for (const required of ["slug", "dataBlob"]) {
      if (!columns.has(required)) throw new Error(`Catalog songs table is missing ${required}`);
    }
    const lookup = database.prepare("SELECT slug, dataBlob FROM songs WHERE slug = ?");

    for (const { record, takeSections } of selection.selected) {
      const row = lookup.get(record.slug);
      if (!row) throw new Error(`Selected catalog row is missing: ${record.slug}`);
      const compressed = Buffer.from(row.dataBlob);
      if (sha256(compressed) !== record.blob.compressed_sha256) {
        throw new Error(`Selected catalog BLOB differs from frozen manifest: ${record.slug}`);
      }
      const decoded = await decodeGzipBlob(compressed);
      if (decoded.decodedSha256 !== record.blob.decoded_sha256
        || decoded.decodedBytes !== record.blob.decoded_bytes) {
        throw new Error(`Selected catalog payload differs from frozen manifest: ${record.slug}`);
      }
      const payload = JSON.parse(decoded.decoded.toString("utf8"));
      const entries = sectionEntries(payload);
      if (entries.length < takeSections) {
        throw new Error(`Frozen section count exceeds compatible payload sections: ${record.slug}`);
      }

      for (let sectionIndex = 0; sectionIndex < takeSections; sectionIndex += 1) {
        const entry = entries[sectionIndex];
        const section = frozenSection(
          entry.section,
          record,
          frozen.manifest,
          entry.key,
          sectionIndex,
        );
        const artifactId = artifactIdFor({
          manifestId: frozen.manifest.manifest_id,
          recordId: record.record_id,
          sectionKey: entry.key,
          sectionIndex,
          augmentation: normalized.augmentation,
        });
        const jsonText = renderStableStringify(section);
        const rendered = renderSectionToMidi(section, { augmentation: normalized.augmentation });
        const jsonSha256 = sha256(Buffer.from(jsonText, "utf8"));
        if (jsonSha256 !== rendered.sidecar.sourceSha256) {
          throw new Error(`Renderer/source canonicalization mismatch for ${record.slug}:${entry.key}`);
        }

        const jsonRelativePath = relativePairPath(artifactId, "json");
        const midiRelativePath = relativePairPath(artifactId, "mid");
        const jsonBytes = Buffer.byteLength(jsonText, "utf8");
        const midiBytes = rendered.bytes.length;
        pairBytes += BigInt(jsonBytes + midiBytes);
        if (pairBytes > estimate.extractedBytes) {
          const error = new Error("Rendered pair bytes exceeded the preflight estimate");
          error.code = "PAIRED_BATCH_ESTIMATE_EXCEEDED";
          throw error;
        }

        await fsp.mkdir(path.dirname(diskPath(temporaryDir, jsonRelativePath)), { recursive: true });
        await writeExclusive(diskPath(temporaryDir, jsonRelativePath), jsonText);
        await writeExclusive(diskPath(temporaryDir, midiRelativePath), rendered.bytes);
        checksums.push([jsonRelativePath, jsonSha256], [midiRelativePath, rendered.sidecar.midiSha256]);

        const artifact = {
          schema: PAIRED_ARTIFACT_SCHEMA,
          schema_version: 1,
          artifact_id: artifactId,
          ordinal: artifactCount,
          artifact_kind: "synthetic",
          source_lane: "raw_hooktheory_json",
          source: {
            corpus_manifest_id: frozen.manifest.manifest_id,
            corpus_manifest_version: frozen.manifest.manifest_version,
            corpus_records_sha256: frozen.manifest.records.sha256,
            record_id: record.record_id,
            slug: record.slug,
            row_sha256: record.source?.row_sha256 ?? null,
            payload_sha256: record.blob.decoded_sha256,
            section_key: entry.key,
            section_index: sectionIndex,
          },
          split: {
            name: record.split,
            bucket: record.split_bucket,
            composition_group_id: record.composition.group_id,
          },
          renderer: {
            name: rendered.sidecar.generator.name,
            version: rendered.sidecar.generator.version,
            decoder: rendered.sidecar.decoder,
            decoder_version: rendered.sidecar.decoderVersion,
            family_id: rendered.sidecar.rendererFamilyId,
            family_holdout_key: rendered.sidecar.familyHoldoutKey,
          },
          augmentation: rendered.sidecar.augmentation,
          files: {
            json: {
              path: jsonRelativePath,
              media_type: "application/json",
              bytes: jsonBytes,
              sha256: jsonSha256,
            },
            midi: {
              path: midiRelativePath,
              media_type: "audio/midi",
              bytes: midiBytes,
              sha256: rendered.sidecar.midiSha256,
            },
          },
        };
        const artifactLine = stableStringify(artifact);
        indexLineBytes += BigInt(Buffer.byteLength(`${artifactLine}\n`, "utf8"));
        if (indexLineBytes > estimate.indexBytes) {
          const error = new Error("Artifact index bytes exceeded the preflight estimate");
          error.code = "PAIRED_BATCH_ESTIMATE_EXCEEDED";
          throw error;
        }
        await writeLine(artifactStream, artifactLine);
        artifactCount += 1;
      }
    }
    await finishStream(artifactStream);
    artifactStream.on("error", () => {});
    database.close();
    database = null;

    if (artifactCount !== selection.selectedPairs) {
      throw new Error(`Rendered ${artifactCount} pairs but selected ${selection.selectedPairs}`);
    }
    const artifactsHash = await hashFile(artifactsPath);
    checksums.push(["artifacts.ndjson", artifactsHash.sha256]);

    const batchManifest = {
      schema: PAIRED_BATCH_SCHEMA,
      schema_version: 1,
      manifest_id: null,
      immutable: true,
      determinism: {
        generated_timestamp_included: false,
        selection_order: "records.ndjson order, then deterministic section-key order",
        overwrite_existing_output: "refused",
        source_loading: "one verified catalog payload at a time",
      },
      source: {
        corpus_manifest_id: frozen.manifest.manifest_id,
        corpus_manifest_version: frozen.manifest.manifest_version,
        corpus_manifest_sha256: frozen.manifestSha256,
        corpus_records_sha256: frozen.manifest.records.sha256,
        catalog_fingerprint_sha256: frozen.manifest.source.fingerprint_sha256,
      },
      selection: {
        split: normalized.split,
        lane: normalized.lane,
        start_after: normalized.startAfter ?? null,
        pair_limit: normalized.limit,
        selected_records: selection.selected.length,
        rendered_pairs: artifactCount,
      },
      renderer: {
        artifact_kind: "synthetic",
        augmentation: normalized.augmentation,
        augmentation_policy: "training-only",
      },
      storage_estimate: {
        extracted_bytes: estimate.extractedBytes.toString(),
        index_bytes: estimate.indexBytes.toString(),
        reserve_bytes: String(normalized.reserveBytes ?? DEFAULT_RESERVE_BYTES),
        maximum_download_batch_bytes: String(normalized.maximumBatchBytes ?? DEFAULT_MAX_BATCH_BYTES),
        overhead_factor: "5/4",
      },
      artifacts: {
        file: "artifacts.ndjson",
        count: artifactCount,
        bytes: artifactsHash.bytes,
        sha256: artifactsHash.sha256,
        pair_bytes: pairBytes.toString(),
      },
    };
    batchManifest.manifest_id = `sha256:${sha256String(stableStringify(batchIdentity(batchManifest)))}`;
    const manifestText = `${stableStringify(batchManifest, 2)}\n`;
    const projectedIndexBytes = indexLineBytes
      + BigInt(Buffer.byteLength(manifestText, "utf8"))
      + (BigInt(checksums.length + 1) * 100n);
    if (projectedIndexBytes > estimate.indexBytes) {
      const error = new Error("Batch metadata bytes exceeded the preflight estimate");
      error.code = "PAIRED_BATCH_ESTIMATE_EXCEEDED";
      throw error;
    }
    await writeExclusive(path.join(temporaryDir, "manifest.json"), manifestText);
    const manifestSha256 = sha256(Buffer.from(manifestText, "utf8"));
    checksums.push(["manifest.json", manifestSha256]);
    checksums.sort(([left], [right]) => left.localeCompare(right));
    const checksumText = `${checksums.map(([file, digest]) => `${digest}  ${file}`).join("\n")}\n`;
    await writeExclusive(path.join(temporaryDir, "checksums.sha256"), checksumText);

    await assertInputsUnchanged(frozen, normalized.catalogPath, expectedSourceSnapshot);
    await assertTargetAbsent(normalized.outputDir);
    await fsp.rename(temporaryDir, normalized.outputDir);
    return {
      manifest: batchManifest,
      outputDir: normalized.outputDir,
      preflight,
    };
  } catch (error) {
    if (database) {
      try { database.close(); } catch {}
    }
    if (!artifactStream.closed) artifactStream.destroy();
    await fsp.rm(temporaryDir, { recursive: true, force: true });
    throw error;
  }
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseBatchArguments(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return null;
  }
  const result = await generatePairedDataset(options);
  const summary = {
    output: result.outputDir,
    manifestId: result.manifest.manifest_id,
    sourceManifestId: result.manifest.source.corpus_manifest_id,
    selectedRecords: result.manifest.selection.selected_records,
    renderedPairs: result.manifest.selection.rendered_pairs,
    split: result.manifest.selection.split,
    rendererFamily: result.manifest.renderer.augmentation?.recipe ?? "canonical-v1",
    storagePreflight: result.preflight,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  run().catch((error) => {
    process.stderr.write(`theory-to-midi batch: ${error.message}\n`);
    process.exitCode = 1;
  });
}
