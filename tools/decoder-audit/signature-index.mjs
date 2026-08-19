import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

import {
  normalizeKey,
  validateHooktheoryChord,
} from "../../web-player/lib/harmonicContract.js";
import { normalizeLegacyArrays, sectionsFromPayload } from "./catalog.mjs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const { hashFile } = require("../../lib/midi-corpus/hash.js");
const { readNdjson } = require("../../lib/midi-corpus/catalog-manifest.js");
const { stableStringify } = require("../../lib/midi-corpus/stable-json.js");

export const SIGNATURE_INDEX_SCHEMA_VERSION = "hooktheory-chord-signature-index/v1";
export const CATALOG_PRIORS_SCHEMA_VERSION = "hooktheory-catalog-priors/v1";
export const SIGNATURE_INDEX_ALGORITHM_VERSION = "raw-harmonic-fields-train-priors/v1";
export const MAX_SUCCESSORS_PER_OBJECT = 64;
export const TRANSITION_SMOOTHING_ALPHA = 0.25;

const MAX_DECODED_SONG_BYTES = 64 * 1024 * 1024;
const SPLITS = ["train", "validation", "test"];
const ARRAY_FIELDS = ["adds", "omits", "alterations", "suspensions", "substitutions"];
const RAW_HARMONIC_FIELDS = [
  "root",
  "type",
  "inversion",
  "applied",
  "borrowed",
  ...ARRAY_FIELDS,
];

function emptyCounts() {
  return { train: 0, validation: 0, test: 0 };
}

function totalCounts(counts) {
  return SPLITS.reduce((sum, split) => sum + (counts[split] || 0), 0);
}

function countsDocument(counts) {
  return {
    train: counts.train || 0,
    validation: counts.validation || 0,
    test: counts.test || 0,
    all: totalCounts(counts),
  };
}

function incrementMap(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function incrementSplit(counts, split, amount = 1) {
  counts[split] = (counts[split] || 0) + amount;
}

function rounded(value) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(12));
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function signatureId(signature) {
  return `sha256:${crypto.createHash("sha256").update(signature, "utf8").digest("hex")}`;
}

/**
 * Retain only fields emitted by Hooktheory's public chord JSON. Timing, display
 * helpers, eng* fields, and oracle/private fields are deliberately excluded.
 * Array order and null-versus-empty borrowed values are retained because they
 * are structurally observable in the source objects.
 */
export function canonicalRawHarmonicObject(rawChord) {
  const normalized = normalizeLegacyArrays(rawChord);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return null;
  const chord = {};
  for (const field of RAW_HARMONIC_FIELDS) {
    if (ARRAY_FIELDS.includes(field)) chord[field] = [...normalized[field]];
    else if (field === "borrowed" && Array.isArray(normalized.borrowed)) {
      chord.borrowed = [...normalized.borrowed];
    } else {
      chord[field] = normalized[field] === undefined && field === "borrowed"
        ? null
        : normalized[field];
    }
  }
  return chord;
}

export function rawHarmonicSignature(rawChord) {
  const chord = canonicalRawHarmonicObject(rawChord);
  return chord ? stableStringify(chord) : null;
}

function keysFromSection(section) {
  const keys = section?.metadata?.keys || section?.keys;
  return Array.isArray(keys) ? keys : [];
}

function activeRawKey(keys, beat) {
  if (!keys.length) return normalizeKey({ tonic: "C", scale: "major" });
  let chosen = keys[0];
  for (const key of keys) {
    if (Number(key?.beat ?? 1) <= beat) chosen = key;
    else break;
  }
  return normalizeKey(chosen);
}

function createEntry(chord, signature) {
  return {
    id: signatureId(signature),
    signature,
    chord,
    occurrences: emptyCounts(),
    songs: emptyCounts(),
    groups: emptyCounts(),
    byScale: new Map(),
  };
}

function scaleEntry(entry, scale) {
  const scaleKey = scale || "major";
  if (!entry.byScale.has(scaleKey)) {
    entry.byScale.set(scaleKey, {
      scale: scaleKey,
      occurrences: emptyCounts(),
      songs: emptyCounts(),
      groups: emptyCounts(),
    });
  }
  return entry.byScale.get(scaleKey);
}

function splitTransitionMap(state, split, fromId) {
  if (!state.transitions[split].has(fromId)) state.transitions[split].set(fromId, new Map());
  return state.transitions[split].get(fromId);
}

function addTransition(state, split, fromId, toId) {
  incrementMap(splitTransitionMap(state, split, fromId), toId);
}

function addGroupMembership(state, row, seenSignatures, seenScaleSignatures) {
  const componentSize = Number(row.componentSize || 1);
  if (componentSize <= 1) {
    for (const signature of seenSignatures) incrementSplit(state.entries.get(signature).groups, row.split);
    for (const pair of seenScaleSignatures) {
      const separator = pair.indexOf("\0");
      const signature = pair.slice(0, separator);
      const scale = pair.slice(separator + 1);
      incrementSplit(scaleEntry(state.entries.get(signature), scale).groups, row.split);
    }
    return;
  }

  const groupKey = `${row.split}\0${row.groupId}`;
  let group = state.multiRecordGroups.get(groupKey);
  if (!group) {
    group = { split: row.split, signatures: new Set(), scaleSignatures: new Set() };
    state.multiRecordGroups.set(groupKey, group);
  }
  for (const signature of seenSignatures) group.signatures.add(signature);
  for (const pair of seenScaleSignatures) group.scaleSignatures.add(pair);
}

function addSong(state, row) {
  if (!SPLITS.includes(row.split)) throw new Error(`Unsupported manifest split for ${row.slug}: ${row.split}`);
  const seenSignatures = new Set();
  const seenScaleSignatures = new Set();
  state.summary.songs[row.split] += 1;

  for (const section of sectionsFromPayload(row.payload)) {
    state.summary.sections[row.split] += 1;
    const keys = keysFromSection(section);
    let priorId = null;
    for (const rawChord of Array.isArray(section?.chords) ? section.chords : []) {
      state.summary.chords[row.split] += 1;
      if (rawChord?.isRest === true) {
        state.summary.rests[row.split] += 1;
        priorId = null;
        continue;
      }

      const normalized = normalizeLegacyArrays(rawChord);
      const key = activeRawKey(keys, Number(normalized?.beat ?? 1));
      const issues = validateHooktheoryChord(normalized, key)
        .filter((issue) => issue.severity === "error");
      if (issues.length) {
        state.summary.anomalies[row.split] += 1;
        for (const issue of issues) incrementMap(state.anomalyCodes, issue.code);
        priorId = null;
        continue;
      }

      const chord = canonicalRawHarmonicObject(normalized);
      const signature = stableStringify(chord);
      let entry = state.entries.get(signature);
      if (!entry) {
        entry = createEntry(chord, signature);
        state.entries.set(signature, entry);
      }
      incrementSplit(entry.occurrences, row.split);
      incrementSplit(scaleEntry(entry, key.scale).occurrences, row.split);
      state.summary.validSoundingChords[row.split] += 1;
      seenSignatures.add(signature);
      seenScaleSignatures.add(`${signature}\0${key.scale}`);

      if (priorId === null) incrementMap(state.starts[row.split], entry.id);
      else addTransition(state, row.split, priorId, entry.id);
      priorId = entry.id;
    }
  }

  for (const signature of seenSignatures) incrementSplit(state.entries.get(signature).songs, row.split);
  for (const pair of seenScaleSignatures) {
    const separator = pair.indexOf("\0");
    const signature = pair.slice(0, separator);
    const scale = pair.slice(separator + 1);
    incrementSplit(scaleEntry(state.entries.get(signature), scale).songs, row.split);
  }
  addGroupMembership(state, row, seenSignatures, seenScaleSignatures);
}

function newAccumulator() {
  return {
    entries: new Map(),
    multiRecordGroups: new Map(),
    anomalyCodes: new Map(),
    starts: Object.fromEntries(SPLITS.map((split) => [split, new Map()])),
    transitions: Object.fromEntries(SPLITS.map((split) => [split, new Map()])),
    summary: {
      songs: emptyCounts(),
      sections: emptyCounts(),
      chords: emptyCounts(),
      rests: emptyCounts(),
      anomalies: emptyCounts(),
      validSoundingChords: emptyCounts(),
    },
  };
}

function finishGroupCounts(state) {
  for (const group of state.multiRecordGroups.values()) {
    for (const signature of group.signatures) incrementSplit(state.entries.get(signature).groups, group.split);
    for (const pair of group.scaleSignatures) {
      const separator = pair.indexOf("\0");
      const signature = pair.slice(0, separator);
      const scale = pair.slice(separator + 1);
      incrementSplit(scaleEntry(state.entries.get(signature), scale).groups, group.split);
    }
  }
}

function serializeStarts(map, totalObjects) {
  const total = [...map.values()].reduce((sum, count) => sum + count, 0);
  return [...map]
    .map(([id, count]) => ({
      id,
      count,
      smoothedLogProbability: rounded(Math.log(
        (count + TRANSITION_SMOOTHING_ALPHA)
        / (total + TRANSITION_SMOOTHING_ALPHA * Math.max(1, totalObjects)),
      )),
    }))
    .sort((left, right) => right.count - left.count || compareText(left.id, right.id));
}

function serializeTransitions(map, totalObjects, maxSuccessors = null) {
  return [...map]
    .sort(([left], [right]) => compareText(left, right))
    .map(([fromId, successors]) => {
      const sorted = [...successors]
        .map(([toId, count]) => ({ toId, count }))
        .sort((left, right) => right.count - left.count || compareText(left.toId, right.toId));
      const retained = maxSuccessors === null ? sorted : sorted.slice(0, maxSuccessors);
      const totalCount = sorted.reduce((sum, item) => sum + item.count, 0);
      const retainedCount = retained.reduce((sum, item) => sum + item.count, 0);
      return {
        fromId,
        totalCount,
        otherCount: totalCount - retainedCount,
        successors: retained.map((item) => ({
          ...item,
          smoothedLogProbability: rounded(Math.log(
            (item.count + TRANSITION_SMOOTHING_ALPHA)
            / (totalCount + TRANSITION_SMOOTHING_ALPHA * Math.max(1, totalObjects)),
          )),
        })),
      };
    });
}

function serializeFullEntry(entry) {
  return {
    id: entry.id,
    signature: entry.signature,
    chord: entry.chord,
    counts: {
      occurrences: countsDocument(entry.occurrences),
      songs: countsDocument(entry.songs),
      groups: countsDocument(entry.groups),
    },
    byScale: [...entry.byScale.values()]
      .sort((left, right) => compareText(left.scale, right.scale))
      .map((scale) => ({
        scale: scale.scale,
        counts: {
          occurrences: countsDocument(scale.occurrences),
          songs: countsDocument(scale.songs),
          groups: countsDocument(scale.groups),
        },
      })),
  };
}

function trainObject(entry, trainTotal, trainObjectCount) {
  const denominator = trainTotal + TRANSITION_SMOOTHING_ALPHA * Math.max(1, trainObjectCount);
  return {
    id: entry.id,
    signature: entry.signature,
    chord: entry.chord,
    trainOccurrences: entry.occurrences.train,
    trainSongs: entry.songs.train,
    trainGroups: entry.groups.train,
    occurrenceProbability: rounded(entry.occurrences.train / Math.max(1, trainTotal)),
    smoothedLogProbability: rounded(Math.log(
      (entry.occurrences.train + TRANSITION_SMOOTHING_ALPHA) / denominator,
    )),
    byScale: [...entry.byScale.values()]
      .filter((scale) => scale.occurrences.train > 0)
      .sort((left, right) => compareText(left.scale, right.scale))
      .map((scale) => ({
        scale: scale.scale,
        trainOccurrences: scale.occurrences.train,
        trainSongs: scale.songs.train,
        trainGroups: scale.groups.train,
      })),
  };
}

export function validateSignatureDocuments({ fullIndex, compactPriors }) {
  const errors = [];
  const objectIds = new Set();
  let objectOccurrences = 0;
  for (const object of compactPriors.objects || []) {
    const expectedSignature = stableStringify(object.chord);
    const expectedId = signatureId(expectedSignature);
    if (object.signature !== expectedSignature) errors.push(`signature mismatch for ${object.id}`);
    if (object.id !== expectedId) errors.push(`ID mismatch for ${object.id}`);
    if (objectIds.has(object.id)) errors.push(`duplicate object ID ${object.id}`);
    objectIds.add(object.id);
    if (!(object.trainOccurrences > 0)) errors.push(`non-training object ${object.id}`);
    objectOccurrences += object.trainOccurrences || 0;
    const fields = Object.keys(object.chord).sort(compareText);
    if (stableStringify(fields) !== stableStringify([...RAW_HARMONIC_FIELDS].sort(compareText))) {
      errors.push(`non-canonical chord fields for ${object.id}`);
    }
  }
  if (objectOccurrences !== compactPriors.summary?.trainOccurrences) {
    errors.push("object occurrence sum differs from train summary");
  }

  let starts = 0;
  for (const start of compactPriors.transitions?.starts || []) {
    if (!objectIds.has(start.id)) errors.push(`unknown start object ${start.id}`);
    starts += start.count || 0;
  }
  if (starts !== compactPriors.summary?.trainStarts) errors.push("start sum differs from train summary");

  let transitions = 0;
  for (const source of compactPriors.transitions?.bySource || []) {
    if (!objectIds.has(source.fromId)) errors.push(`unknown transition source ${source.fromId}`);
    if (source.successors.length > MAX_SUCCESSORS_PER_OBJECT) {
      errors.push(`transition bound exceeded for ${source.fromId}`);
    }
    const retained = source.successors.reduce((sum, successor) => {
      if (!objectIds.has(successor.toId)) errors.push(`unknown transition target ${successor.toId}`);
      return sum + (successor.count || 0);
    }, 0);
    if (retained + source.otherCount !== source.totalCount) {
      errors.push(`transition subtotal mismatch for ${source.fromId}`);
    }
    transitions += source.totalCount || 0;
  }
  if (transitions !== compactPriors.summary?.trainTransitions) {
    errors.push("transition sum differs from train summary");
  }
  if (starts + transitions !== compactPriors.summary?.trainOccurrences) {
    errors.push("starts plus transitions differs from train occurrences");
  }
  if (fullIndex.summary?.validSoundingChords?.train !== compactPriors.summary?.trainOccurrences) {
    errors.push("full and compact train occurrence totals differ");
  }
  if (errors.length) {
    const error = new Error(`Invalid signature documents: ${errors.slice(0, 10).join("; ")}`);
    error.code = "INVALID_SIGNATURE_DOCUMENTS";
    error.errors = errors;
    throw error;
  }
  return { ok: true, objects: objectIds.size, starts, transitions };
}

/**
 * Pure fixture-friendly builder. Every row must already carry the split/group
 * assigned by the frozen manifest. Compact priors intentionally serialize no
 * statistics derived from validation or test rows.
 */
function documentsFromState(state, provenance) {
  finishGroupCounts(state);

  const entries = [...state.entries.values()].sort((left, right) => compareText(left.signature, right.signature));
  const fullEntries = entries.map(serializeFullEntry);
  const trainEntries = entries.filter((entry) => entry.occurrences.train > 0);
  const trainTotal = state.summary.validSoundingChords.train;
  const trainObjects = trainEntries.map((entry) => trainObject(entry, trainTotal, trainEntries.length));
  const source = {
    manifestVersion: provenance.manifestVersion ?? null,
    manifestRecordsSha256: provenance.manifestRecordsSha256 ?? null,
    catalogDatabaseSha256: provenance.catalogDatabaseSha256 ?? null,
    catalogFingerprintSha256: provenance.catalogFingerprintSha256 ?? null,
  };
  const policy = {
    harmonicFields: RAW_HARMONIC_FIELDS,
    arrays: "preserve source order; missing legacy arrays normalize to []",
    borrowed: "preserve source null, empty string, named mode, or seven-offset array",
    rests: "excluded; reset adjacency",
    anomalies: "excluded; reset adjacency",
    privateFields: "excluded",
    trainingSplit: "train",
    transitionSmoothingAlpha: TRANSITION_SMOOTHING_ALPHA,
    maxSuccessorsPerObject: MAX_SUCCESSORS_PER_OBJECT,
    transitionRetention: "highest count, then structural ID",
  };

  const fullIndex = {
    schemaVersion: SIGNATURE_INDEX_SCHEMA_VERSION,
    algorithmVersion: SIGNATURE_INDEX_ALGORITHM_VERSION,
    manifestId: provenance.manifestId ?? null,
    source,
    policy,
    summary: Object.fromEntries(Object.entries(state.summary).map(([name, counts]) => [name, countsDocument(counts)])),
    anomalyCodes: Object.fromEntries([...state.anomalyCodes].sort(([left], [right]) => compareText(left, right))),
    signatures: fullEntries,
    transitionsBySplit: Object.fromEntries(SPLITS.map((split) => [split, {
      starts: serializeStarts(state.starts[split], entries.length),
      bySource: serializeTransitions(state.transitions[split], entries.length),
    }])),
  };

  const compactPriors = {
    schemaVersion: CATALOG_PRIORS_SCHEMA_VERSION,
    algorithmVersion: SIGNATURE_INDEX_ALGORITHM_VERSION,
    manifestId: provenance.manifestId ?? null,
    source,
    trainingSplit: "train",
    policy,
    summary: {
      trainSongs: state.summary.songs.train,
      trainSections: state.summary.sections.train,
      trainOccurrences: trainTotal,
      trainObjects: trainObjects.length,
      trainStarts: [...state.starts.train.values()].reduce((sum, count) => sum + count, 0),
      trainTransitions: [...state.transitions.train.values()]
        .reduce((sum, transitions) => sum + [...transitions.values()].reduce((a, b) => a + b, 0), 0),
    },
    objects: trainObjects,
    transitions: {
      starts: serializeStarts(state.starts.train, trainObjects.length),
      bySource: serializeTransitions(
        state.transitions.train,
        trainObjects.length,
        MAX_SUCCESSORS_PER_OBJECT,
      ),
    },
  };

  const documents = { fullIndex, compactPriors };
  validateSignatureDocuments(documents);
  return documents;
}

export function buildSignatureDocumentsFromRows(rows, provenance = {}) {
  const state = newAccumulator();
  for (const row of rows) addSong(state, row);
  return documentsFromState(state, provenance);
}

async function loadFrozenManifest(manifestDir) {
  const absoluteDir = path.resolve(manifestDir);
  const manifestPath = path.join(absoluteDir, "manifest.json");
  const recordsPath = path.join(absoluteDir, "records.ndjson");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (manifest.immutable !== true || !manifest.manifest_id) {
    throw new Error(`Expected an immutable manifest with an ID: ${manifestPath}`);
  }
  const recordsHash = await hashFile(recordsPath);
  if (recordsHash.sha256 !== manifest.records?.sha256 || recordsHash.bytes !== manifest.records?.bytes) {
    throw new Error(`Frozen manifest records do not match manifest.json: ${recordsPath}`);
  }

  const records = new Map();
  for await (const record of readNdjson(recordsPath)) {
    if (!SPLITS.includes(record.split)) throw new Error(`Invalid split in manifest: ${record.split}`);
    if (records.has(record.slug)) throw new Error(`Duplicate slug in manifest: ${record.slug}`);
    records.set(record.slug, {
      split: record.split,
      groupId: record.composition?.group_id,
      componentSize: record.composition?.grouping?.component_size || 1,
      compressedSha256: record.blob?.compressed_sha256 || null,
    });
  }
  if (records.size !== manifest.records.count) {
    throw new Error(`Manifest record count mismatch: ${records.size} versus ${manifest.records.count}`);
  }
  return { manifest, records };
}

export async function buildCatalogSignatureIndex({ catalog, manifestDir, progress = null } = {}) {
  if (!catalog) throw new Error("catalog is required");
  if (!manifestDir) throw new Error("manifestDir is required");
  const catalogPath = path.resolve(catalog);
  const { manifest, records } = await loadFrozenManifest(manifestDir);
  const catalogHash = await hashFile(catalogPath);
  const expectedDatabase = (manifest.source?.files || []).find((file) => file.role === "database");
  if (!expectedDatabase || catalogHash.sha256 !== expectedDatabase.sha256 || catalogHash.bytes !== expectedDatabase.bytes) {
    throw new Error("Catalog database does not match the source frozen by the manifest");
  }

  const db = new DatabaseSync(catalogPath, { readOnly: true });
  const state = newAccumulator();
  let scanned = 0;
  try {
    const columns = new Set(db.prepare("PRAGMA table_info(songs)").all().map((row) => row.name));
    for (const required of ["slug", "dataBlob"]) {
      if (!columns.has(required)) throw new Error(`songs table is missing ${required}`);
    }
    for (const row of db.prepare("SELECT slug, dataBlob FROM songs ORDER BY slug COLLATE BINARY").iterate()) {
      const frozen = records.get(row.slug);
      if (!frozen) throw new Error(`Catalog row is absent from frozen manifest: ${row.slug}`);
      const blob = Buffer.from(row.dataBlob);
      const compressedSha256 = crypto.createHash("sha256").update(blob).digest("hex");
      if (frozen.compressedSha256 !== compressedSha256) {
        throw new Error(`Catalog BLOB differs from frozen manifest: ${row.slug}`);
      }
      const decoded = zlib.gunzipSync(blob, { maxOutputLength: MAX_DECODED_SONG_BYTES });
      addSong(state, {
        slug: row.slug,
        split: frozen.split,
        groupId: frozen.groupId,
        componentSize: frozen.componentSize,
        payload: JSON.parse(decoded.toString("utf8")),
      });
      records.delete(row.slug);
      scanned += 1;
      if (progress && scanned % 5000 === 0) progress({ songs: scanned });
    }
  } finally {
    db.close();
  }
  if (records.size) throw new Error(`${records.size} frozen manifest rows were absent from the catalog`);

  return documentsFromState(state, {
    manifestId: manifest.manifest_id,
    manifestVersion: manifest.manifest_version,
    manifestRecordsSha256: manifest.records.sha256,
    catalogDatabaseSha256: catalogHash.sha256,
    catalogFingerprintSha256: manifest.source?.fingerprint_sha256 || null,
  });
}

export async function writeSignatureDocuments({ fullIndex, compactPriors }, { output, priorsOutput }) {
  if (!output) throw new Error("output is required");
  if (!priorsOutput) throw new Error("priorsOutput is required");
  const targets = [
    [path.resolve(output), fullIndex],
    [path.resolve(priorsOutput), compactPriors],
  ];
  for (const [target, document] of targets) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${stableStringify(document, 2)}\n`, "utf8");
  }
}
