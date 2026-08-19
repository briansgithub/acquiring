'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const {
  DEFAULT_MAX_DECODED_BYTES,
  decodeGzipBlob,
  hashFile,
  sha256Buffer,
  sha256String,
} = require('./hash');
const { stableStringify } = require('./stable-json');
const {
  GROUPING_POLICY,
  GroupingIndex,
  extractGroupingEvidence,
} = require('./grouping');
const { compositionIdentity } = require('./normalize');
const { SPLIT_POLICY, assignSplit } = require('./split');
const {
  anomaly,
  classifyCatalogRow,
  compareAnomalies,
  summarizePayload,
} = require('./anomalies');

const MANIFEST_VERSION = 3;
const ANOMALY_CHALLENGE_FILE = 'anomaly-challenge.ndjson';
const ANOMALY_CHALLENGE_SCHEMA = Object.freeze({
  id: 'hooktheory_anomaly_challenge',
  version: 1,
  relation: 'overlay',
  selection: 'records with one or more classified anomalies after composition grouping',
  ordering: 'same record order as records.ndjson',
  ordinary_split_preserved: true,
  fields: Object.freeze([
    'schema',
    'schema_version',
    'record_id',
    'composition_group_id',
    'split',
    'split_bucket',
    'source.kind',
    'source.row_key',
    'source.row_sha256',
    'anomalies',
  ]),
});
const SOURCE_KIND = 'hooktheory_android_catalog_sqlite';
const SOURCE_QUERY = 'SELECT slug, artist, title, url, status, dataBlob FROM songs ORDER BY slug COLLATE BINARY';
const REQUIRED_COLUMNS = ['slug', 'artist', 'title', 'url', 'status', 'dataBlob'];

class ManifestExistsError extends Error {
  constructor(outputDir) {
    super(`Refusing to replace immutable manifest directory: ${outputDir}`);
    this.name = 'ManifestExistsError';
    this.code = 'MANIFEST_EXISTS';
    this.outputDir = outputDir;
  }
}

class SourceChangedError extends Error {
  constructor(sourcePath) {
    super(`Catalog files changed while the manifest was being built: ${sourcePath}`);
    this.name = 'SourceChangedError';
    this.code = 'SOURCE_CHANGED';
    this.sourcePath = sourcePath;
  }
}

async function writeLine(stream, value) {
  if (!stream.write(`${value}\n`, 'utf8')) await once(stream, 'drain');
}

async function finishStream(stream) {
  stream.end();
  await once(stream, 'finish');
}

async function* readNdjson(filePath) {
  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch (error) {
      error.message = `${filePath}:${lineNumber}: ${error.message}`;
      throw error;
    }
  }
}

async function sourceSnapshot(catalogPath) {
  const candidates = [
    { role: 'database', absolutePath: catalogPath },
    { role: 'write_ahead_log', absolutePath: `${catalogPath}-wal` },
    { role: 'shared_memory', absolutePath: `${catalogPath}-shm` },
  ];
  const files = [];
  for (const candidate of candidates) {
    try {
      const stat = await fsp.stat(candidate.absolutePath);
      if (!stat.isFile()) continue;
      const hashed = await hashFile(candidate.absolutePath);
      files.push({
        role: candidate.role,
        file_name: path.basename(candidate.absolutePath),
        bytes: hashed.bytes,
        sha256: hashed.sha256,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!files.some((entry) => entry.role === 'database')) {
    const error = new Error(`Catalog database does not exist: ${catalogPath}`);
    error.code = 'CATALOG_NOT_FOUND';
    throw error;
  }
  return files;
}

function assertCatalogSchema(db) {
  const columns = db.prepare('PRAGMA table_info(songs)').all();
  const names = new Set(columns.map((column) => column.name));
  const missing = REQUIRED_COLUMNS.filter((name) => !names.has(name));
  if (missing.length > 0) {
    const error = new Error(`Catalog songs table is missing columns: ${missing.join(', ')}`);
    error.code = 'INVALID_CATALOG_SCHEMA';
    error.missingColumns = missing;
    throw error;
  }
}

function catalogSchemaProvenance(db) {
  const objects = db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_master
    WHERE sql IS NOT NULL
    ORDER BY type COLLATE BINARY, name COLLATE BINARY
  `).all().map((row) => ({
    type: row.type,
    name: row.name,
    table_name: row.tbl_name,
    sql: row.sql,
  }));
  const schemaJson = stableStringify(objects);
  return {
    application_id: Number(db.prepare('PRAGMA application_id').get().application_id ?? 0),
    user_version: Number(db.prepare('PRAGMA user_version').get().user_version ?? 0),
    schema_sha256: sha256String(schemaJson),
  };
}

function gzipMagic(blob) {
  return blob != null && blob.length >= 2 && blob[0] === 0x1f && blob[1] === 0x8b;
}

async function rowToRecord(row, options = {}) {
  const anomalies = classifyCatalogRow(row);
  const identity = compositionIdentity(row);
  const groupingPolicy = options.groupingPolicy ?? GROUPING_POLICY;
  if (identity.usedFallback) {
    anomalies.push(anomaly('composition_identity_fallback', 'split_provenance', 'warning'));
  }
  const assigned = assignSplit(identity.groupId, options.splitPolicy ?? SPLIT_POLICY);

  let blob = null;
  let payloadSummary = null;
  let parsedPayload = null;
  if (row.dataBlob != null) {
    const buffer = Buffer.isBuffer(row.dataBlob) ? row.dataBlob : Buffer.from(row.dataBlob);
    blob = {
      encoding: gzipMagic(buffer) ? 'gzip' : 'unknown',
      compressed_bytes: buffer.length,
      compressed_sha256: sha256Buffer(buffer),
      decoded_bytes: null,
      decoded_sha256: null,
    };
    if (!gzipMagic(buffer)) {
      anomalies.push(anomaly('blob_not_gzip', 'payload_encoding', 'fatal'));
    } else {
      try {
        const decoded = await decodeGzipBlob(buffer, {
          maxDecodedBytes: options.maxDecodedBytes ?? DEFAULT_MAX_DECODED_BYTES,
        });
        blob.decoded_bytes = decoded.decodedBytes;
        blob.decoded_sha256 = decoded.decodedSha256;
        try {
          parsedPayload = JSON.parse(decoded.decoded.toString('utf8'));
          const inspected = summarizePayload(parsedPayload);
          payloadSummary = inspected.summary;
          anomalies.push(...inspected.anomalies);
        } catch {
          anomalies.push(anomaly('json_parse_error', 'payload_encoding', 'fatal'));
        }
      } catch (error) {
        const code = error.code === 'DECODE_LIMIT_EXCEEDED'
          ? 'decoded_payload_too_large'
          : 'gzip_decode_error';
        anomalies.push(anomaly(code, 'payload_encoding', 'fatal', {
          decoder_code: error.code || 'UNKNOWN',
        }));
      }
    }
  }

  const rowHashInput = {
    slug: row.slug ?? null,
    artist: row.artist ?? null,
    title: row.title ?? null,
    url: row.url ?? null,
    status: row.status ?? null,
    compressed_sha256: blob?.compressed_sha256 ?? null,
  };
  const slug = String(row.slug ?? '');
  const grouping = extractGroupingEvidence({
    identity,
    payload: parsedPayload,
    decodedSha256: blob?.decoded_sha256 ?? null,
  }, groupingPolicy);
  return {
    schema_version: MANIFEST_VERSION,
    record_id: `hooktheory:${slug}`,
    slug,
    artist: row.artist ?? null,
    title: row.title ?? null,
    source: {
      kind: SOURCE_KIND,
      table: 'songs',
      row_key: slug,
      url: row.url ?? null,
      status: row.status ?? null,
      row_sha256: sha256String(stableStringify(rowHashInput)),
    },
    composition: {
      canonical_artist: identity.canonicalArtist,
      canonical_title: identity.canonicalTitle,
      group_id: identity.groupId,
      seed_group_id: identity.groupId,
      identity_version: groupingPolicy.identity_version,
      grouping: {
        policy_id: groupingPolicy.id,
        policy_version: groupingPolicy.version,
        record_evidence: grouping.evidence,
        fingerprint_summary: grouping.fingerprint_summary,
      },
    },
    split: assigned.split,
    split_bucket: assigned.bucket,
    blob,
    payload_summary: payloadSummary,
    anomalies: anomalies.sort(compareAnomalies),
  };
}

function increment(object, key, amount = 1) {
  object[key] = (object[key] || 0) + amount;
}

function anomalyChallengeRecord(record) {
  return {
    schema: ANOMALY_CHALLENGE_SCHEMA.id,
    schema_version: ANOMALY_CHALLENGE_SCHEMA.version,
    record_id: record.record_id,
    composition_group_id: record.composition.group_id,
    split: record.split,
    split_bucket: record.split_bucket,
    source: {
      kind: record.source.kind,
      row_key: record.source.row_key,
      row_sha256: record.source.row_sha256,
    },
    anomalies: record.anomalies,
  };
}

function manifestIdInput(manifest) {
  const input = {
    manifest_version: manifest.manifest_version,
    source_fingerprint_sha256: manifest.source.fingerprint_sha256,
    schema_sha256: manifest.source.sqlite.schema_sha256,
    records_sha256: manifest.records.sha256,
    split_policy: manifest.split_policy,
  };
  if (Number(manifest.manifest_version) >= 2) input.grouping_policy = manifest.grouping_policy;
  if (Number(manifest.manifest_version) >= 3) {
    input.anomaly_challenge = {
      schema: manifest.anomaly_challenge.schema,
      sha256: manifest.anomaly_challenge.sha256,
    };
  }
  return input;
}

function calculateManifestId(manifest) {
  return `sha256:${sha256String(stableStringify(manifestIdInput(manifest)))}`;
}

async function buildCatalogManifest(options) {
  const catalogPath = path.resolve(options.catalogPath);
  const outputDir = path.resolve(options.outputDir);
  const maxDecodedBytes = options.maxDecodedBytes ?? DEFAULT_MAX_DECODED_BYTES;

  try {
    await fsp.lstat(outputDir);
    throw new ManifestExistsError(outputDir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const parentDir = path.dirname(outputDir);
  await fsp.mkdir(parentDir, { recursive: true });
  const tempDir = `${outputDir}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  await fsp.mkdir(tempDir, { recursive: false });
  const rawPath = path.join(tempDir, '.records.raw.ndjson');
  const recordsPath = path.join(tempDir, 'records.ndjson');
  const challengePath = path.join(tempDir, ANOMALY_CHALLENGE_FILE);
  let db;

  try {
    const beforeSnapshot = await sourceSnapshot(catalogPath);
    const sourceFingerprint = sha256String(stableStringify(beforeSnapshot));
    db = new DatabaseSync(catalogPath, { readOnly: true });
    db.exec('BEGIN');
    assertCatalogSchema(db);
    const sqlite = catalogSchemaProvenance(db);
    const rawStream = fs.createWriteStream(rawPath, { encoding: 'utf8', flags: 'wx' });
    const payloadCounts = new Map();
    const groupingIndex = new GroupingIndex(GROUPING_POLICY);
    let rawCount = 0;

    for (const row of db.prepare(SOURCE_QUERY).iterate()) {
      const record = await rowToRecord(row, {
        maxDecodedBytes,
        splitPolicy: SPLIT_POLICY,
        groupingPolicy: GROUPING_POLICY,
      });
      groupingIndex.addRecord(
        record.record_id,
        record.composition.seed_group_id,
        record.composition.grouping.record_evidence,
      );
      if (record.blob?.decoded_sha256) {
        const payloadHash = record.blob.decoded_sha256;
        payloadCounts.set(payloadHash, (payloadCounts.get(payloadHash) || 0) + 1);
      }
      await writeLine(rawStream, stableStringify(record));
      rawCount += 1;
    }
    await finishStream(rawStream);
    db.exec('COMMIT');
    db.close();
    db = null;

    const afterSnapshot = await sourceSnapshot(catalogPath);
    if (stableStringify(beforeSnapshot) !== stableStringify(afterSnapshot)) {
      throw new SourceChangedError(catalogPath);
    }
    const grouping = groupingIndex.finalize();

    const finalStream = fs.createWriteStream(recordsPath, { encoding: 'utf8', flags: 'wx' });
    const challengeStream = fs.createWriteStream(challengePath, { encoding: 'utf8', flags: 'wx' });
    const counts = {
      records: 0,
      records_with_blob: 0,
      decoded_payloads: 0,
      parsed_payloads: 0,
      compressed_bytes: 0,
      decoded_bytes: 0,
      records_by_split: {},
      groups_by_split: {},
      statuses: {},
      anomalies_by_code: {},
      anomalies_by_severity: {},
      records_with_anomalies: 0,
      challenge_records_by_split: {},
    };
    const groupSplits = new Map();

    for await (const record of readNdjson(rawPath)) {
      const component = grouping.byRecordId.get(record.record_id);
      if (!component) throw new Error(`Missing composition grouping for ${record.record_id}`);
      record.composition.group_id = component.groupId;
      record.composition.grouping.component_anchor = component.componentAnchor;
      record.composition.grouping.component_size = component.componentSize;
      record.composition.grouping.evidence_types = component.evidenceTypes;
      record.composition.grouping.linked_by = component.linkedBy;
      const assigned = assignSplit(component.groupId, SPLIT_POLICY);
      record.split = assigned.split;
      record.split_bucket = assigned.bucket;

      const decodedHash = record.blob?.decoded_sha256;
      const duplicateCount = decodedHash ? payloadCounts.get(decodedHash) : 0;
      if (duplicateCount > 1) {
        record.anomalies.push(anomaly('duplicate_decoded_payload', 'corpus_leakage', 'warning', {
          group_size: duplicateCount,
          decoded_sha256: decodedHash,
        }));
        record.anomalies.sort(compareAnomalies);
      }

      counts.records += 1;
      if (record.blob) counts.records_with_blob += 1;
      if (decodedHash) counts.decoded_payloads += 1;
      if (record.payload_summary) counts.parsed_payloads += 1;
      counts.compressed_bytes += record.blob?.compressed_bytes || 0;
      counts.decoded_bytes += record.blob?.decoded_bytes || 0;
      increment(counts.records_by_split, record.split);
      increment(counts.statuses, record.source.status == null ? 'null' : String(record.source.status));
      if (!groupSplits.has(record.composition.group_id)) {
        groupSplits.set(record.composition.group_id, record.split);
        increment(counts.groups_by_split, record.split);
      } else if (groupSplits.get(record.composition.group_id) !== record.split) {
        throw new Error(`Composition group crossed splits: ${record.composition.group_id}`);
      }
      if (record.anomalies.length > 0) {
        counts.records_with_anomalies += 1;
        increment(counts.challenge_records_by_split, record.split);
      }
      for (const item of record.anomalies) {
        increment(counts.anomalies_by_code, item.code);
        increment(counts.anomalies_by_severity, item.severity);
      }
      await writeLine(finalStream, stableStringify(record));
      if (record.anomalies.length > 0) {
        await writeLine(challengeStream, stableStringify(anomalyChallengeRecord(record)));
      }
    }
    await finishStream(finalStream);
    await finishStream(challengeStream);
    await fsp.unlink(rawPath);

    if (counts.records !== rawCount) {
      throw new Error(`Raw/final record count mismatch: ${rawCount} versus ${counts.records}`);
    }
    const recordsHash = await hashFile(recordsPath);
    const challengeHash = await hashFile(challengePath);
    const manifest = {
      manifest_version: MANIFEST_VERSION,
      manifest_id: null,
      immutable: true,
      determinism: {
        generated_timestamp_included: false,
        ordering: 'songs.slug COLLATE BINARY',
        grouping: 'bounded two-pass evidence union ordered by record and evidence digest',
        overwrite_existing_output: 'refused',
      },
      source: {
        kind: SOURCE_KIND,
        path: catalogPath,
        query: SOURCE_QUERY,
        files: beforeSnapshot,
        fingerprint_sha256: sourceFingerprint,
        sqlite,
      },
      records: {
        file: 'records.ndjson',
        count: counts.records,
        bytes: recordsHash.bytes,
        sha256: recordsHash.sha256,
      },
      anomaly_challenge: {
        file: ANOMALY_CHALLENGE_FILE,
        schema: ANOMALY_CHALLENGE_SCHEMA,
        count: counts.records_with_anomalies,
        bytes: challengeHash.bytes,
        sha256: challengeHash.sha256,
        records_by_split: counts.challenge_records_by_split,
        anomalies_by_code: counts.anomalies_by_code,
        anomalies_by_severity: counts.anomalies_by_severity,
      },
      split_policy: SPLIT_POLICY,
      grouping_policy: GROUPING_POLICY,
      audit: {
        records_with_blob: counts.records_with_blob,
        decoded_payloads: counts.decoded_payloads,
        parsed_payloads: counts.parsed_payloads,
        composition_groups: groupSplits.size,
        grouping: grouping.summary,
        compressed_bytes: counts.compressed_bytes,
        decoded_bytes: counts.decoded_bytes,
        records_by_split: counts.records_by_split,
        groups_by_split: counts.groups_by_split,
        statuses: counts.statuses,
        records_with_anomalies: counts.records_with_anomalies,
        anomalies_by_code: counts.anomalies_by_code,
        anomalies_by_severity: counts.anomalies_by_severity,
      },
    };
    manifest.manifest_id = calculateManifestId(manifest);

    const manifestPath = path.join(tempDir, 'manifest.json');
    await fsp.writeFile(manifestPath, `${stableStringify(manifest, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    const manifestHash = await hashFile(manifestPath);
    const checksums = [
      `${manifestHash.sha256}  manifest.json`,
      `${recordsHash.sha256}  records.ndjson`,
      `${challengeHash.sha256}  ${ANOMALY_CHALLENGE_FILE}`,
    ].join('\n') + '\n';
    await fsp.writeFile(path.join(tempDir, 'checksums.sha256'), checksums, { encoding: 'utf8', flag: 'wx' });
    await fsp.rename(tempDir, outputDir);
    return manifest;
  } catch (error) {
    if (db) {
      try { db.exec('ROLLBACK'); } catch {}
      try { db.close(); } catch {}
    }
    await fsp.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function parseChecksumFile(text) {
  const result = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Invalid checksum line: ${line}`);
    result.set(match[2], match[1]);
  }
  return result;
}

async function verifyCatalogManifest(manifestDir, options = {}) {
  const absoluteDir = path.resolve(manifestDir);
  const manifestPath = path.join(absoluteDir, 'manifest.json');
  const recordsPath = path.join(absoluteDir, 'records.ndjson');
  const checksumsPath = path.join(absoluteDir, 'checksums.sha256');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  const checksums = parseChecksumFile(await fsp.readFile(checksumsPath, 'utf8'));
  const errors = [];
  const usesChallengeLane = Number(manifest.manifest_version) >= 3;
  const challengeFile = ANOMALY_CHALLENGE_FILE;
  const challengePath = path.join(absoluteDir, challengeFile);
  const manifestHash = await hashFile(manifestPath);
  const recordsHash = await hashFile(recordsPath);
  if (checksums.get('manifest.json') !== manifestHash.sha256) errors.push('manifest checksum mismatch');
  if (checksums.get('records.ndjson') !== recordsHash.sha256) errors.push('records checksum mismatch');
  if (manifest.records.sha256 !== recordsHash.sha256) errors.push('records hash differs from manifest');
  if (manifest.records.bytes !== recordsHash.bytes) errors.push('records byte count differs from manifest');
  try {
    if (manifest.manifest_id !== calculateManifestId(manifest)) errors.push('manifest id mismatch');
  } catch {
    errors.push('manifest identity fields are incomplete');
  }

  let challengeReadable = usesChallengeLane;
  if (usesChallengeLane) {
    if (manifest.anomaly_challenge?.file !== challengeFile) {
      errors.push('anomaly challenge file differs from manifest version');
    }
    if (stableStringify(manifest.anomaly_challenge?.schema) !== stableStringify(ANOMALY_CHALLENGE_SCHEMA)) {
      errors.push('anomaly challenge schema differs from manifest version');
    }
    try {
      const challengeHash = await hashFile(challengePath);
      if (checksums.get(challengeFile) !== challengeHash.sha256) {
        errors.push('anomaly challenge checksum mismatch');
      }
      if (manifest.anomaly_challenge?.sha256 !== challengeHash.sha256) {
        errors.push('anomaly challenge hash differs from manifest');
      }
      if (manifest.anomaly_challenge?.bytes !== challengeHash.bytes) {
        errors.push('anomaly challenge byte count differs from manifest');
      }
    } catch (error) {
      challengeReadable = false;
      errors.push(`anomaly challenge file is unreadable: ${error.code || error.message}`);
    }
  }

  const usesEvidenceGrouping = Number(manifest.manifest_version) >= 2;
  if (usesEvidenceGrouping) {
    if (stableStringify(manifest.grouping_policy) !== stableStringify(GROUPING_POLICY)) {
      errors.push('grouping policy differs from manifest version');
    }
    if (manifest.split_policy?.grouping_policy_id !== manifest.grouping_policy?.id) {
      errors.push('split/grouping policy mismatch');
    }
  }

  let count = 0;
  const groupSplits = new Map();
  const groupCounts = new Map();
  const declaredComponentSizes = new Map();
  const evidenceGroups = new Map();
  const maxRecords = GROUPING_POLICY.limits.max_records;
  const maxEvidenceKeys = GROUPING_POLICY.limits.max_evidence_keys;
  const maxEvidencePerRecord = GROUPING_POLICY.limits.max_evidence_per_record;
  const expectedChallengeRecords = new Map();
  const expectedChallengeOrder = [];
  const expectedChallengeCounts = {
    records_by_split: {},
    anomalies_by_code: {},
    anomalies_by_severity: {},
  };
  let evidenceLimitReported = false;
  for await (const record of readNdjson(recordsPath)) {
    count += 1;
    if (usesEvidenceGrouping && count > maxRecords) {
      if (count === maxRecords + 1) errors.push('record count exceeds grouping policy limit');
      continue;
    }
    const expected = assignSplit(record.composition.group_id, manifest.split_policy);
    if (record.split !== expected.split || record.split_bucket !== expected.bucket) {
      errors.push(`split mismatch for ${record.record_id}`);
    }
    const existing = groupSplits.get(record.composition.group_id);
    if (existing && existing !== record.split) {
      errors.push(`composition group crosses splits: ${record.composition.group_id}`);
    }
    groupSplits.set(record.composition.group_id, record.split);
    groupCounts.set(record.composition.group_id, (groupCounts.get(record.composition.group_id) || 0) + 1);

    if (usesChallengeLane && Array.isArray(record.anomalies) && record.anomalies.length > 0) {
      const challengeRecord = anomalyChallengeRecord(record);
      expectedChallengeRecords.set(record.record_id, challengeRecord);
      expectedChallengeOrder.push(record.record_id);
      increment(expectedChallengeCounts.records_by_split, record.split);
      for (const item of record.anomalies) {
        increment(expectedChallengeCounts.anomalies_by_code, item.code);
        increment(expectedChallengeCounts.anomalies_by_severity, item.severity);
      }
    }

    if (usesEvidenceGrouping) {
      const grouping = record.composition?.grouping;
      if (record.schema_version !== manifest.manifest_version) {
        errors.push(`record schema mismatch for ${record.record_id}`);
      }
      if (grouping?.policy_id !== manifest.grouping_policy?.id
        || grouping?.policy_version !== manifest.grouping_policy?.version) {
        errors.push(`grouping provenance mismatch for ${record.record_id}`);
      }
      const declaredSize = Number(grouping?.component_size);
      if (!Number.isInteger(declaredSize) || declaredSize < 1) {
        errors.push(`invalid component size for ${record.record_id}`);
      } else {
        const previousSize = declaredComponentSizes.get(record.composition.group_id);
        if (previousSize != null && previousSize !== declaredSize) {
          errors.push(`component size disagrees for ${record.composition.group_id}`);
        }
        declaredComponentSizes.set(record.composition.group_id, declaredSize);
      }
      if (!Array.isArray(grouping?.record_evidence)) {
        errors.push(`missing grouping evidence for ${record.record_id}`);
      } else {
        if (grouping.record_evidence.length > maxEvidencePerRecord) {
          errors.push(`grouping evidence exceeds policy limit for ${record.record_id}`);
        }
        for (const item of grouping.record_evidence.slice(0, maxEvidencePerRecord)) {
          if (!item || typeof item.type !== 'string' || !/^[a-f0-9]{64}$/.test(item.digest || '')) {
            errors.push(`invalid grouping evidence for ${record.record_id}`);
            continue;
          }
          const key = `${item.type}:${item.digest}`;
          const evidenceGroup = evidenceGroups.get(key);
          if (evidenceGroup && evidenceGroup !== record.composition.group_id) {
            errors.push(`grouping evidence crosses groups: ${key}`);
          } else {
            if (!evidenceGroups.has(key) && evidenceGroups.size >= maxEvidenceKeys) {
              if (!evidenceLimitReported) {
                errors.push('grouping evidence exceeds policy limit');
                evidenceLimitReported = true;
              }
              continue;
            }
            evidenceGroups.set(key, record.composition.group_id);
          }
        }
      }
    }
  }
  if (count !== manifest.records.count) errors.push('record count differs from manifest');
  if (groupSplits.size !== manifest.audit.composition_groups) errors.push('composition group count differs from manifest');
  if (usesEvidenceGrouping) {
    if (groupSplits.size !== manifest.audit.grouping?.components) {
      errors.push('grouping component count differs from manifest');
    }
    for (const [groupId, groupCount] of groupCounts) {
      if (declaredComponentSizes.get(groupId) !== groupCount) {
        errors.push(`component size differs for ${groupId}`);
      }
    }
  }

  let challengeCount = 0;
  if (usesChallengeLane && challengeReadable) {
    const seenChallengeIds = new Set();
    for await (const challengeRecord of readNdjson(challengePath)) {
      const expectedId = expectedChallengeOrder[challengeCount];
      challengeCount += 1;
      if (challengeRecord.record_id !== expectedId) {
        errors.push(`anomaly challenge ordering mismatch at record ${challengeCount}`);
      }
      if (seenChallengeIds.has(challengeRecord.record_id)) {
        errors.push(`duplicate anomaly challenge record: ${challengeRecord.record_id}`);
      }
      seenChallengeIds.add(challengeRecord.record_id);
      const expected = expectedChallengeRecords.get(challengeRecord.record_id);
      if (!expected) {
        errors.push(`unexpected anomaly challenge record: ${challengeRecord.record_id}`);
      } else if (stableStringify(challengeRecord) !== stableStringify(expected)) {
        errors.push(`anomaly challenge provenance mismatch for ${challengeRecord.record_id}`);
      }
    }
    if (challengeCount !== expectedChallengeRecords.size) {
      errors.push('anomaly challenge record count differs from records overlay');
    }
    if (challengeCount !== manifest.anomaly_challenge?.count) {
      errors.push('anomaly challenge record count differs from manifest');
    }
    for (const field of ['records_by_split', 'anomalies_by_code', 'anomalies_by_severity']) {
      if (stableStringify(manifest.anomaly_challenge?.[field]) !== stableStringify(expectedChallengeCounts[field])) {
        errors.push(`anomaly challenge ${field} differs from manifest`);
      }
    }
  }

  const result = {
    ok: errors.length === 0,
    manifest_id: manifest.manifest_id,
    records: count,
    composition_groups: groupSplits.size,
    anomaly_challenge_records: usesChallengeLane ? challengeCount : null,
    errors,
  };
  if (!result.ok && options.throwOnError) {
    const error = new Error(`Manifest verification failed: ${errors.join('; ')}`);
    error.code = 'MANIFEST_VERIFICATION_FAILED';
    error.result = result;
    throw error;
  }
  return result;
}

module.exports = {
  ANOMALY_CHALLENGE_FILE,
  ANOMALY_CHALLENGE_SCHEMA,
  MANIFEST_VERSION,
  GROUPING_POLICY,
  ManifestExistsError,
  SOURCE_KIND,
  SOURCE_QUERY,
  SourceChangedError,
  buildCatalogManifest,
  calculateManifestId,
  readNdjson,
  rowToRecord,
  sourceSnapshot,
  verifyCatalogManifest,
};
