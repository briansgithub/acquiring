'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { fingerprintMidiFile } = require('./event-fingerprint');
const { hashFile } = require('./hash');
const { getSourcePolicy, assertArtifactRights } = require('./source-policies');
const {
  assertStoragePreflight,
  objectRelativePath,
  registerStoredArtifact,
} = require('./storage');
const { stableStringify } = require('./stable-json');

const AUTOMATABLE_POLICIES = new Set([
  'official_bulk_only',
  'rate_limited_official_files',
  'rate_limited_api',
]);
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function fetchError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function sourceAllowedHosts(policy, extraHosts = []) {
  const hosts = new Set(extraHosts.map((host) => String(host).toLowerCase()));
  for (const rawUrl of policy.official_urls || []) {
    try { hosts.add(new URL(rawUrl).hostname.toLowerCase()); } catch {}
  }
  return hosts;
}

function isPrivateHostname(hostname) {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (value === 'localhost' || value.endsWith('.local')) return true;
  if (/^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value)) return true;
  const match = /^172\.(\d+)\./.exec(value);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
}

function validateRemoteUrl(rawUrl, allowedHosts) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch {
    throw fetchError('INVALID_ARTIFACT_URL', `Invalid artifact URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'https:') {
    throw fetchError('INSECURE_ARTIFACT_URL', 'Automated artifact fetches require HTTPS');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateHostname(hostname)) {
    throw fetchError('PRIVATE_ARTIFACT_HOST', `Private/local artifact host is not allowed: ${hostname}`);
  }
  const allowed = [...allowedHosts].some((host) => hostname === host || hostname.endsWith(`.${host}`));
  if (!allowed) {
    throw fetchError(
      'UNAPPROVED_ARTIFACT_HOST',
      `Artifact host ${hostname} is not an official source host; pass an explicit approved --allow-host`,
      { hostname, allowed_hosts: [...allowedHosts].sort() },
    );
  }
  parsed.username = '';
  parsed.password = '';
  return parsed;
}

async function requestWithRedirects(fetchImpl, rawUrl, init, allowedHosts, maximumRedirects = 3) {
  let current = validateRemoteUrl(rawUrl, allowedHosts);
  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    const response = await fetchImpl(current, { ...init, redirect: 'manual' });
    if (!REDIRECT_CODES.has(response.status)) return { response, finalUrl: current.toString(), redirects };
    const location = response.headers.get('location');
    if (!location) throw fetchError('INVALID_REDIRECT', 'Redirect response did not provide a Location header');
    if (redirects === maximumRedirects) throw fetchError('TOO_MANY_REDIRECTS', 'Artifact URL exceeded the redirect limit');
    current = validateRemoteUrl(new URL(location, current).toString(), allowedHosts);
  }
  throw fetchError('TOO_MANY_REDIRECTS', 'Artifact URL exceeded the redirect limit');
}

function sourceItem(db, sourceId, sourceItemId) {
  const item = db.prepare(`
    SELECT source_id, source_item_id, artifact_locator, rights_status, rights_evidence
    FROM source_items WHERE source_id = ? AND source_item_id = ?
  `).get(sourceId, sourceItemId);
  if (!item) throw fetchError('SOURCE_ITEM_NOT_FOUND', `Unknown source item ${sourceId}/${sourceItemId}`);
  if (!item.artifact_locator) throw fetchError('MISSING_ARTIFACT_LOCATOR', 'Source metadata does not provide an artifact locator');
  return item;
}

function contentLength(response) {
  const value = response.headers.get('content-length');
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function ensureMidiHeader(header) {
  if (header.length < 4 || header.subarray(0, 4).toString('ascii') !== 'MThd') {
    throw fetchError('DOWNLOADED_FILE_NOT_MIDI', 'Downloaded artifact does not start with an SMF MThd header');
  }
}

function byteLimitTransform(maximumBytes) {
  let received = 0n;
  return new Transform({
    transform(chunk, encoding, callback) {
      received += BigInt(chunk.length);
      if (received > maximumBytes) {
        callback(fetchError(
          'DOWNLOAD_EXCEEDS_PREFLIGHT',
          'Download exceeded the preflight byte ceiling while streaming',
          { maximum_bytes: maximumBytes.toString(), received_bytes: received.toString() },
        ));
        return;
      }
      callback(null, chunk);
    },
  });
}

async function createDownloadPlan(db, options) {
  const sourceId = String(options.sourceId);
  const sourceItemId = String(options.sourceItemId);
  const policy = getSourcePolicy(sourceId);
  if (!AUTOMATABLE_POLICIES.has(policy.automation_policy)) {
    throw fetchError(
      'SOURCE_AUTOMATION_NOT_ALLOWED',
      `Source policy ${policy.automation_policy} does not allow unattended fetching`,
    );
  }
  const item = sourceItem(db, sourceId, sourceItemId);
  const purpose = options.purpose || 'research';
  const rightsDecision = assertArtifactRights({
    sourceId,
    rightsStatus: options.rightsStatus || item.rights_status,
    purpose,
  });
  const allowedHosts = sourceAllowedHosts(policy, options.allowHosts || []);
  const url = validateRemoteUrl(item.artifact_locator, allowedHosts);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw fetchError('FETCH_UNAVAILABLE', 'This Node runtime does not provide fetch');

  let head = null;
  try {
    const requested = await requestWithRedirects(fetchImpl, url, {
      method: 'HEAD',
      headers: { 'User-Agent': options.userAgent || 'diatonic-ring-midi-corpus/1.0' },
    }, allowedHosts);
    if (requested.response.ok) head = requested;
  } catch (error) {
    if (options.expectedBytes === undefined) throw error;
  }
  const expectedBytes = options.expectedBytes !== undefined
    ? BigInt(options.expectedBytes)
    : head && contentLength(head.response);
  if (expectedBytes == null) {
    throw fetchError('UNKNOWN_DOWNLOAD_SIZE', 'A Content-Length or explicit --expected-bytes is required before download');
  }
  const preflight = await assertStoragePreflight({
    storeRoot: options.storeRoot,
    downloadBytes: expectedBytes,
    extractedBytes: options.extractedBytes ?? 0n,
    indexBytes: options.indexBytes ?? 0n,
    temporaryBytes: options.temporaryBytes ?? expectedBytes,
    maximumBatchBytes: options.maximumBatchBytes,
    reserveBytes: options.reserveBytes,
    availableBytes: options.availableBytes,
    filesystemProbePath: options.filesystemProbePath,
  });
  return {
    source_id: sourceId,
    source_item_id: sourceItemId,
    purpose,
    rights_decision: rightsDecision,
    artifact_url: url.toString(),
    expected_bytes: expectedBytes.toString(),
    allowed_hosts: [...allowedHosts].sort(),
    head_final_url: head?.finalUrl || null,
    preflight,
  };
}

async function fetchArtifact(db, options) {
  const plan = await createDownloadPlan(db, options);
  if (!options.execute) return { dry_run: true, ...plan };

  const storeRoot = path.resolve(options.storeRoot);
  const stagingDir = path.join(storeRoot, 'staging');
  await fsp.mkdir(stagingDir, { recursive: true });
  const stagingPath = path.join(stagingDir, `${crypto.randomUUID()}.download`);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const allowedHosts = new Set(plan.allowed_hosts);
  const expectedBytes = BigInt(plan.expected_bytes);
  const jobId = `fetch:${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO acquisition_jobs (
      job_id, source_id, source_item_id, purpose, rights_status, state,
      expected_bytes, storage_preflight_json, rights_decision_json
    ) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?)
  `).run(
    jobId,
    plan.source_id,
    plan.source_item_id,
    plan.purpose,
    plan.rights_decision.rights_status,
    Number(expectedBytes),
    stableStringify(plan.preflight),
    stableStringify(plan.rights_decision),
  );

  try {
    const requested = await requestWithRedirects(fetchImpl, plan.artifact_url, {
      method: 'GET',
      headers: { 'User-Agent': options.userAgent || 'diatonic-ring-midi-corpus/1.0' },
    }, allowedHosts);
    if (!requested.response.ok || !requested.response.body) {
      throw fetchError('ARTIFACT_DOWNLOAD_FAILED', `Artifact server returned HTTP ${requested.response.status}`);
    }
    const declared = contentLength(requested.response);
    if (declared != null && declared > expectedBytes) {
      throw fetchError('DOWNLOAD_EXCEEDS_PREFLIGHT', 'GET Content-Length exceeds the preflight estimate');
    }
    await pipeline(
      Readable.fromWeb(requested.response.body),
      byteLimitTransform(expectedBytes),
      fs.createWriteStream(stagingPath, { flags: 'wx', mode: 0o600 }),
    );
    const inspected = await hashFile(stagingPath);
    if (BigInt(inspected.bytes) > expectedBytes) {
      throw fetchError('DOWNLOAD_EXCEEDS_PREFLIGHT', 'Downloaded bytes exceed the preflight estimate');
    }
    const file = await fsp.open(stagingPath, 'r');
    try {
      const header = Buffer.alloc(4);
      await file.read(header, 0, 4, 0);
      ensureMidiHeader(header);
    } finally {
      await file.close();
    }
    const eventFingerprint = await fingerprintMidiFile(stagingPath, {
      maxBytes: options.maximumFingerprintBytes,
    });

    const storageRelpath = objectRelativePath(inspected.sha256);
    const targetPath = path.join(storeRoot, ...storageRelpath.split('/'));
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    let deduplicated = false;
    try {
      await fsp.rename(stagingPath, targetPath);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      const existing = await hashFile(targetPath);
      if (existing.sha256 !== inspected.sha256 || existing.bytes !== inspected.bytes) throw error;
      deduplicated = true;
      await fsp.unlink(stagingPath);
    }
    try { await fsp.chmod(targetPath, 0o444); } catch {}
    registerStoredArtifact(db, {
      sha256: inspected.sha256,
      byte_count: inspected.bytes,
      media_type: requested.response.headers.get('content-type') || 'audio/midi',
      storage_relpath: storageRelpath,
      sourceId: plan.source_id,
      sourceItemId: plan.source_item_id,
      rightsStatus: plan.rights_decision.rights_status,
      rights_decision: plan.rights_decision,
      event_fingerprint: eventFingerprint,
    });
    db.prepare(`
      UPDATE acquisition_jobs SET state = 'stored', updated_at = CURRENT_TIMESTAMP WHERE job_id = ?
    `).run(jobId);
    return {
      dry_run: false,
      job_id: jobId,
      sha256: inspected.sha256,
      byte_count: inspected.bytes,
      storage_relpath: storageRelpath,
      storage_path: targetPath,
      deduplicated,
      event_fingerprint: eventFingerprint,
      final_url: requested.finalUrl,
      ...plan,
    };
  } catch (error) {
    try { await fsp.unlink(stagingPath); } catch {}
    db.prepare(`
      UPDATE acquisition_jobs SET state = 'failed', error_code = ?, error_message = ?,
        updated_at = CURRENT_TIMESTAMP WHERE job_id = ?
    `).run(error.code || 'ARTIFACT_DOWNLOAD_FAILED', error.message, jobId);
    throw error;
  }
}

module.exports = {
  AUTOMATABLE_POLICIES,
  byteLimitTransform,
  createDownloadPlan,
  fetchArtifact,
  isPrivateHostname,
  sourceAllowedHosts,
  validateRemoteUrl,
};
