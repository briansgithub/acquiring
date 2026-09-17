import fs from 'node:fs';
import path from 'node:path';
import { hash, hashFile, moduleFingerprint, NORMALIZER_VERSION, openDatabase, stableJson } from './common.mjs';
import { catalogSongs } from './source.mjs';

const SUPPORTED_BUILD_VERSION = 'aural-build-1';
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

/**
 * Explicitly reuse a frozen snapshot's normalized input manifest without inspecting raw files.
 * Reads only the prior manifest/report, catalog, and cache ID/revision/version metadata.
 * Raw-source additions/edits are deliberately NOT included. Normal build mode remains the updater.
 * This verifies the cache's declared revisions, not undocumented in-place payload edits.
 */
export function reuseSnapshotInputs({ snapshotDirectory, catalog, normalizedFile, cacheRoot, limit = 0 }) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Reuse limit must be a nonnegative integer');
  const directory = path.resolve(snapshotDirectory);
  const manifest = readJson(path.join(directory, 'manifest.json'));
  if (manifest.schemaVersion !== 1 || manifest.buildVersion !== SUPPORTED_BUILD_VERSION || !digest(manifest.snapshotId) || !digest(manifest.files?.['report.json'])) throw new Error('Unsupported or invalid reuse snapshot manifest');
  const reportFile = path.join(directory, 'report.json');
  if (hashFile(reportFile) !== manifest.files['report.json']) throw new Error('Reuse snapshot report checksum mismatch');
  const report = readJson(reportFile);
  if (report.snapshotId !== manifest.snapshotId || report.buildVersion !== SUPPORTED_BUILD_VERSION || report.normalizerVersion !== NORMALIZER_VERSION) throw new Error('Reuse snapshot identity or version mismatch');
  const normalizationFingerprint = `${NORMALIZER_VERSION}:${moduleFingerprint(new URL('./normalize.mjs', import.meta.url))}`;
  if (report.normalizationFingerprint !== normalizationFingerprint) throw new Error('Normalizer dependencies changed; rescan and normalize source inputs');
  if (!digest(report.sourceHash) || report.sourceHash !== manifest.sourceHash || !digest(report.catalogHash)) throw new Error('Reuse snapshot lacks a consistent source/catalog manifest');
  const scope = limit ? { limitFolders: limit } : { full: true };
  if (stableJson(report.scope) !== stableJson(scope)) throw new Error('Reuse snapshot scope differs from requested full/partial scope');
  const availability = report.availability;
  if (!availability || !Number.isSafeInteger(availability.scannedSongs) || availability.scannedSongs < 0 ||
      !Number.isSafeInteger(availability.sections) || availability.sections < 0 || !Array.isArray(availability.rejectedSources)) throw new Error('Reuse snapshot availability metadata is invalid');
  const diagnostics = availability.rejectedSources;
  if (report.rejectedSourceHash !== hash(diagnostics)) throw new Error('Reuse snapshot rejected-source manifest is inconsistent');
  const songs = catalogSongs(catalog);
  if (hash(songs) !== report.catalogHash || availability.catalogSongs !== songs.length) throw new Error('Catalog changed; reuse requires the frozen snapshot catalog');
  const db = openDatabase(normalizedFile, true);
  let rowCount = 0;
  try {
    const requestedScope = stableJson({ cacheRoot: path.resolve(cacheRoot), catalog: path.resolve(catalog), limit });
    const cacheScope = db.prepare("SELECT value FROM cache_metadata WHERE key='scope'").get()?.value;
    if (cacheScope !== requestedScope) throw new Error('Normalized cache scope differs from the requested sources');
    const entries = [];
    for (const row of db.prepare('SELECT id,revision,version FROM sections ORDER BY id').iterate()) {
      if (row.version !== normalizationFingerprint) throw new Error('Normalized cache contains a different normalizer fingerprint');
      if (typeof row.id !== 'string' || !row.id || typeof row.revision !== 'string' || !row.revision) throw new Error('Normalized cache contains an invalid section identity/revision');
      entries.push([row.id, row.revision]);
    }
    entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    rowCount = entries.length;
    if (rowCount !== availability.sections || hash(entries) !== report.sourceHash) throw new Error('Normalized cache section manifest changed since the snapshot');
  } finally { db.close(); }
  return {
    songs,
    stats: { scannedSongs: availability.scannedSongs, files: 0, normalized: 0, reused: rowCount, deleted: 0, aliases: 0, conflicts: 0 },
    diagnostics, sourceHash: report.sourceHash, normalizationFingerprint, normalizedFile, scope,
  };
}
