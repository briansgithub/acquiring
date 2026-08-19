'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { fingerprintMidiFile } = require('./event-fingerprint');
const { hashFile } = require('./hash');
const { assertArtifactRights, classifyUsabilityClass } = require('./source-policies');
const { stableStringify } = require('./stable-json');

const GIB = 1024n * 1024n * 1024n;
const DEFAULT_MAX_BATCH_BYTES = 5n * GIB;
const DEFAULT_RESERVE_BYTES = 20n * GIB;
const DEFAULT_OVERHEAD_NUMERATOR = 5n;
const DEFAULT_OVERHEAD_DENOMINATOR = 4n;

class StoragePreflightError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'StoragePreflightError';
    this.code = code;
    this.details = details;
  }
}

function asBytes(value, name) {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new RangeError(`${name} must be non-negative`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer`);
    return BigInt(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  throw new TypeError(`${name} must be a byte count`);
}

async function nearestExistingPath(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    try {
      await fsp.access(current, fs.constants.F_OK);
      return current;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function filesystemAvailableBytes(storeRoot) {
  const probePath = await nearestExistingPath(storeRoot);
  const stats = await fsp.statfs(probePath, { bigint: true });
  return {
    probePath,
    availableBytes: stats.bavail * stats.bsize,
  };
}

function ceilDivide(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator;
}

function byteFields({
  downloadBytes,
  extractedBytes,
  indexBytes,
  temporaryBytes,
  maximumBatchBytes,
  reserveBytes,
  availableBytes,
  probePath,
  overheadNumerator,
  overheadDenominator,
}) {
  const componentTotalBytes = downloadBytes + extractedBytes + indexBytes + temporaryBytes;
  const estimatedPeakBytes = ceilDivide(componentTotalBytes * overheadNumerator, overheadDenominator);
  const requiredBytes = estimatedPeakBytes + reserveBytes;
  const shortfallBytes = availableBytes >= requiredBytes ? 0n : requiredBytes - availableBytes;
  return {
    batch_bytes: downloadBytes.toString(),
    download_bytes: downloadBytes.toString(),
    extracted_bytes: extractedBytes.toString(),
    index_bytes: indexBytes.toString(),
    temporary_bytes: temporaryBytes.toString(),
    component_total_bytes: componentTotalBytes.toString(),
    maximum_batch_bytes: maximumBatchBytes.toString(),
    overhead_factor: `${overheadNumerator}/${overheadDenominator}`,
    estimated_peak_bytes: estimatedPeakBytes.toString(),
    reserve_bytes: reserveBytes.toString(),
    available_bytes: availableBytes.toString(),
    required_bytes: requiredBytes.toString(),
    available_after_peak_bytes: (availableBytes >= estimatedPeakBytes ? availableBytes - estimatedPeakBytes : 0n).toString(),
    shortfall_bytes: shortfallBytes.toString(),
    filesystem_probe_path: probePath,
  };
}

async function assertStoragePreflight(options) {
  const storeRoot = path.resolve(options.storeRoot);
  const sizeFields = ['batchBytes', 'downloadBytes', 'extractedBytes', 'indexBytes', 'temporaryBytes'];
  if (!sizeFields.some((field) => options[field] !== undefined)) {
    throw new TypeError('Storage preflight requires at least one explicit byte component');
  }
  const downloadValue = options.downloadBytes ?? options.batchBytes ?? 0n;
  const downloadBytes = asBytes(downloadValue, options.downloadBytes === undefined ? 'batchBytes' : 'downloadBytes');
  const extractedBytes = asBytes(options.extractedBytes ?? 0n, 'extractedBytes');
  const indexBytes = asBytes(options.indexBytes ?? 0n, 'indexBytes');
  const temporaryBytes = asBytes(options.temporaryBytes ?? 0n, 'temporaryBytes');
  const maximumBatchBytes = asBytes(
    options.maximumBatchBytes ?? DEFAULT_MAX_BATCH_BYTES,
    'maximumBatchBytes',
  );
  const reserveBytes = asBytes(options.reserveBytes ?? DEFAULT_RESERVE_BYTES, 'reserveBytes');
  const overheadNumerator = asBytes(
    options.overheadNumerator ?? DEFAULT_OVERHEAD_NUMERATOR,
    'overheadNumerator',
  );
  const overheadDenominator = asBytes(
    options.overheadDenominator ?? DEFAULT_OVERHEAD_DENOMINATOR,
    'overheadDenominator',
  );
  if (overheadDenominator === 0n) throw new RangeError('overheadDenominator must be greater than zero');
  if (downloadBytes > maximumBatchBytes) {
    const details = {
      batch_bytes: downloadBytes.toString(),
      download_bytes: downloadBytes.toString(),
      extracted_bytes: extractedBytes.toString(),
      index_bytes: indexBytes.toString(),
      temporary_bytes: temporaryBytes.toString(),
      maximum_batch_bytes: maximumBatchBytes.toString(),
      batch_excess_bytes: (downloadBytes - maximumBatchBytes).toString(),
      reserve_bytes: reserveBytes.toString(),
      store_root: storeRoot,
    };
    throw new StoragePreflightError(
      'BATCH_LIMIT_EXCEEDED',
      `Batch exceeds the ${maximumBatchBytes}-byte limit by exactly ${details.batch_excess_bytes} bytes`,
      details,
    );
  }

  let availableBytes;
  let probePath;
  if (options.availableBytes !== undefined) {
    availableBytes = asBytes(options.availableBytes, 'availableBytes');
    probePath = options.filesystemProbePath || '(injected)';
  } else {
    const filesystem = await filesystemAvailableBytes(storeRoot);
    availableBytes = filesystem.availableBytes;
    probePath = filesystem.probePath;
  }
  const details = byteFields({
    downloadBytes,
    extractedBytes,
    indexBytes,
    temporaryBytes,
    maximumBatchBytes,
    reserveBytes,
    availableBytes,
    probePath,
    overheadNumerator,
    overheadDenominator,
  });
  details.store_root = storeRoot;
  if (details.shortfall_bytes !== '0') {
    throw new StoragePreflightError(
      'INSUFFICIENT_STORAGE_RESERVE',
      `Storage preflight is short by exactly ${details.shortfall_bytes} bytes`,
      details,
    );
  }
  return { ok: true, ...details };
}

function objectRelativePath(sha256) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError('Invalid SHA-256 digest');
  return path.posix.join('objects', 'sha256', sha256.slice(0, 2), sha256.slice(2, 4), sha256);
}

async function validateExistingObject(targetPath, expected) {
  const actual = await hashFile(targetPath);
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
    const error = new Error(`Content-addressed object failed integrity validation: ${targetPath}`);
    error.code = 'CONTENT_STORE_INTEGRITY_ERROR';
    error.expected = expected;
    error.actual = actual;
    throw error;
  }
}

async function storeLocalArtifact(options) {
  const sourcePath = path.resolve(options.filePath);
  const storeRoot = path.resolve(options.storeRoot);
  const rightsDecision = assertArtifactRights({
    sourceId: options.sourceId,
    rightsStatus: options.rightsStatus,
    purpose: options.purpose || 'research',
  });
  const sourceStat = await fsp.stat(sourcePath);
  if (!sourceStat.isFile()) throw new TypeError(`Artifact is not a regular file: ${sourcePath}`);
  const inspected = await hashFile(sourcePath);
  const mediaType = options.mediaType || 'audio/midi';
  const eventFingerprint = options.eventFingerprint || await fingerprintMidiFile(sourcePath, {
    maxBytes: options.maximumFingerprintBytes,
  });
  const preflight = await assertStoragePreflight({
    storeRoot,
    temporaryBytes: inspected.bytes,
    maximumBatchBytes: options.maximumBatchBytes,
    reserveBytes: options.reserveBytes,
    availableBytes: options.availableBytes,
    filesystemProbePath: options.filesystemProbePath,
  });
  const relativePath = objectRelativePath(inspected.sha256);
  const targetPath = path.join(storeRoot, ...relativePath.split('/'));
  let deduplicated = false;

  try {
    await validateExistingObject(targetPath, inspected);
    deduplicated = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    const tempPath = path.join(
      path.dirname(targetPath),
      `.${inspected.sha256}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
    );
    try {
      await pipeline(
        fs.createReadStream(sourcePath),
        fs.createWriteStream(tempPath, { flags: 'wx', mode: 0o600 }),
      );
      const staged = await hashFile(tempPath);
      if (staged.sha256 !== inspected.sha256 || staged.bytes !== inspected.bytes) {
        const integrityError = new Error('Artifact changed while it was copied into content storage');
        integrityError.code = 'SOURCE_CHANGED_DURING_INGEST';
        throw integrityError;
      }
      try {
        await fsp.rename(tempPath, targetPath);
      } catch (renameError) {
        if (!['EEXIST', 'EPERM'].includes(renameError.code)) throw renameError;
        await validateExistingObject(targetPath, inspected);
        deduplicated = true;
        await fsp.unlink(tempPath);
      }
      try { await fsp.chmod(targetPath, 0o444); } catch {}
    } catch (error) {
      try { await fsp.unlink(tempPath); } catch {}
      throw error;
    }
  }

  const result = {
    sha256: inspected.sha256,
    byte_count: inspected.bytes,
    media_type: mediaType,
    storage_relpath: relativePath,
    storage_path: targetPath,
    deduplicated,
    event_fingerprint: eventFingerprint,
    preflight,
    rights_decision: rightsDecision,
  };
  if (options.db && options.sourceItemId) {
    registerStoredArtifact(options.db, {
      ...result,
      sourceId: options.sourceId,
      sourceItemId: options.sourceItemId,
      rightsStatus: rightsDecision.rights_status,
    });
  }
  return result;
}

function registerStoredArtifact(db, artifact) {
  const rightsStatus = artifact.rightsStatus || artifact.rights_decision?.rights_status;
  const usabilityClass = classifyUsabilityClass({
    sourceId: artifact.sourceId,
    rightsStatus,
    entity: 'artifact',
  });
  const rightsDecision = {
    ...artifact.rights_decision,
    usability_class: usabilityClass,
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT OR IGNORE INTO artifacts (sha256, byte_count, media_type, storage_relpath)
      VALUES (?, ?, ?, ?)
    `).run(artifact.sha256, artifact.byte_count, artifact.media_type, artifact.storage_relpath);
    if (artifact.event_fingerprint) {
      const fingerprint = artifact.event_fingerprint;
      const existing = db.prepare(`
        SELECT event_fingerprint_sha256, normalized_event_count, track_count, canonical_byte_count
        FROM artifact_event_fingerprints
        WHERE artifact_sha256 = ? AND algorithm_version = ?
      `).get(artifact.sha256, fingerprint.algorithm_version);
      if (existing && (
        existing.event_fingerprint_sha256 !== fingerprint.event_fingerprint_sha256
        || Number(existing.normalized_event_count) !== fingerprint.normalized_event_count
        || Number(existing.track_count) !== fingerprint.track_count
        || Number(existing.canonical_byte_count) !== fingerprint.canonical_byte_count
      )) {
        const error = new Error('Stored artifact has a conflicting normalized MIDI event fingerprint');
        error.code = 'EVENT_FINGERPRINT_INTEGRITY_ERROR';
        throw error;
      }
      db.prepare(`
        INSERT OR IGNORE INTO artifact_event_fingerprints (
          artifact_sha256, algorithm_version, event_fingerprint_sha256,
          normalized_event_count, track_count, canonical_byte_count
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        artifact.sha256,
        fingerprint.algorithm_version,
        fingerprint.event_fingerprint_sha256,
        fingerprint.normalized_event_count,
        fingerprint.track_count,
        fingerprint.canonical_byte_count,
      );
    }
    db.prepare(`
      INSERT OR REPLACE INTO item_artifacts (
        source_id, source_item_id, artifact_sha256, rights_status, usability_class,
        rights_decision_json, source_file_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      artifact.sourceId,
      artifact.sourceItemId,
      artifact.sha256,
      rightsStatus,
      usabilityClass,
      stableStringify(rightsDecision),
      artifact.sha256,
    );
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

module.exports = {
  DEFAULT_MAX_BATCH_BYTES,
  DEFAULT_OVERHEAD_DENOMINATOR,
  DEFAULT_OVERHEAD_NUMERATOR,
  DEFAULT_RESERVE_BYTES,
  GIB,
  StoragePreflightError,
  assertStoragePreflight,
  filesystemAvailableBytes,
  objectRelativePath,
  registerStoredArtifact,
  storeLocalArtifact,
};
