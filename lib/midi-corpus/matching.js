'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { readNdjson, verifyCatalogManifest } = require('./catalog-manifest');
const { stableStringify } = require('./stable-json');
const { getSourcePolicy } = require('./source-policies');

const MATCH_ALGORITHM_VERSION = 'artist-title-metadata-v1';

function tokenSet(value) {
  return new Set(String(value || '').split(/\s+/).filter(Boolean));
}

function jaccard(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function ngrams(value, size = 3) {
  const padded = ` ${String(value || '')} `;
  const result = new Set();
  for (let index = 0; index <= padded.length - size; index += 1) {
    result.add(padded.slice(index, index + size));
  }
  return result;
}

function dice(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = ngrams(left);
  const b = ngrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

function metadataSimilarity(catalogRecord, sourceItem) {
  const artistExact = catalogRecord.canonical_artist
    && catalogRecord.canonical_artist === sourceItem.canonical_artist;
  const titleExact = catalogRecord.canonical_title
    && catalogRecord.canonical_title === sourceItem.canonical_title;
  const artistScore = artistExact
    ? 1
    : Math.max(
      jaccard(catalogRecord.canonical_artist, sourceItem.canonical_artist),
      dice(catalogRecord.canonical_artist, sourceItem.canonical_artist),
    );
  const titleScore = titleExact
    ? 1
    : Math.max(
      jaccard(catalogRecord.canonical_title, sourceItem.canonical_title),
      dice(catalogRecord.canonical_title, sourceItem.canonical_title),
    );
  const score = artistExact && titleExact ? 1 : (0.4 * artistScore) + (0.6 * titleScore);
  return {
    score: Math.min(1, Math.max(0, score)),
    artist_score: artistScore,
    title_score: titleScore,
    artist_exact: Boolean(artistExact),
    title_exact: Boolean(titleExact),
  };
}

async function registerCatalogManifest(db, manifestDir) {
  const absoluteDir = path.resolve(manifestDir);
  await verifyCatalogManifest(absoluteDir, { throwOnError: true });
  const manifest = JSON.parse(await fsp.readFile(path.join(absoluteDir, 'manifest.json'), 'utf8'));
  const existing = db.prepare('SELECT record_count FROM catalog_manifests WHERE manifest_id = ?')
    .get(manifest.manifest_id);
  if (existing) {
    return {
      manifest_id: manifest.manifest_id,
      records: Number(existing.record_count),
      already_registered: true,
    };
  }

  const insertManifest = db.prepare(`
    INSERT INTO catalog_manifests (
      manifest_id, manifest_path, source_fingerprint_sha256, records_sha256, record_count
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const insertRecord = db.prepare(`
    INSERT INTO catalog_records (
      manifest_id, record_id, slug, artist, title, canonical_artist, canonical_title,
      composition_group_id, split, source_row_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let records = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    insertManifest.run(
      manifest.manifest_id,
      absoluteDir,
      manifest.source.fingerprint_sha256,
      manifest.records.sha256,
      manifest.records.count,
    );
    for await (const record of readNdjson(path.join(absoluteDir, manifest.records.file))) {
      insertRecord.run(
        manifest.manifest_id,
        record.record_id,
        record.slug,
        record.artist,
        record.title,
        record.composition.canonical_artist,
        record.composition.canonical_title,
        record.composition.group_id,
        record.split,
        record.source.row_sha256,
      );
      records += 1;
    }
    if (records !== manifest.records.count) throw new Error('Manifest record count changed during registration');
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return { manifest_id: manifest.manifest_id, records, already_registered: false };
}

async function matchManifestMetadata(db, options) {
  const sourceId = options.sourceId;
  getSourcePolicy(sourceId);
  const registration = await registerCatalogManifest(db, options.manifestDir);
  const manifestId = registration.manifest_id;
  const minimumScore = options.minimumScore ?? 0.78;
  const maximumCandidatesPerLookup = options.maximumCandidatesPerLookup ?? 100;
  const byTitle = db.prepare(`
    SELECT source_id, source_item_id, canonical_artist, canonical_title, recording_mbid, work_mbid, isrc
    FROM source_items
    WHERE source_id = ? AND canonical_title = ?
    ORDER BY source_item_id COLLATE BINARY
    LIMIT ?
  `);
  const byArtist = db.prepare(`
    SELECT source_id, source_item_id, canonical_artist, canonical_title, recording_mbid, work_mbid, isrc
    FROM source_items
    WHERE source_id = ? AND canonical_artist = ?
    ORDER BY source_item_id COLLATE BINARY
    LIMIT ?
  `);
  const insertMatch = db.prepare(`
    INSERT INTO metadata_matches (
      manifest_id, record_id, source_id, source_item_id,
      algorithm_version, score, tier, evidence_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let catalogRecords = 0;
  let matchedRecords = 0;
  let candidatesStored = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      DELETE FROM metadata_matches
      WHERE manifest_id = ? AND source_id = ? AND algorithm_version = ?
    `).run(manifestId, sourceId, MATCH_ALGORITHM_VERSION);

    const catalogIterator = db.prepare(`
      SELECT record_id, canonical_artist, canonical_title
      FROM catalog_records
      WHERE manifest_id = ?
      ORDER BY record_id COLLATE BINARY
    `).iterate(manifestId);
    for (const catalogRecord of catalogIterator) {
      catalogRecords += 1;
      if (!catalogRecord.canonical_artist || !catalogRecord.canonical_title) continue;
      const candidates = new Map();
      for (const item of byTitle.all(sourceId, catalogRecord.canonical_title, maximumCandidatesPerLookup)) {
        candidates.set(item.source_item_id, item);
      }
      for (const item of byArtist.all(sourceId, catalogRecord.canonical_artist, maximumCandidatesPerLookup)) {
        candidates.set(item.source_item_id, item);
      }

      let matchedThisRecord = false;
      for (const item of [...candidates.values()].sort((left, right) => (
        left.source_item_id.localeCompare(right.source_item_id, 'en')
      ))) {
        const similarity = metadataSimilarity(catalogRecord, item);
        if (similarity.score < minimumScore) continue;
        const tier = similarity.score === 1 ? 'exact' : (similarity.score >= 0.9 ? 'strong' : 'candidate');
        const evidence = {
          kind: 'metadata_candidate_only',
          requires_content_verification: true,
          artist_score: similarity.artist_score,
          title_score: similarity.title_score,
          artist_exact: similarity.artist_exact,
          title_exact: similarity.title_exact,
          recording_mbid: item.recording_mbid,
          work_mbid: item.work_mbid,
          isrc: item.isrc,
        };
        insertMatch.run(
          manifestId,
          catalogRecord.record_id,
          sourceId,
          item.source_item_id,
          MATCH_ALGORITHM_VERSION,
          similarity.score,
          tier,
          stableStringify(evidence),
        );
        candidatesStored += 1;
        matchedThisRecord = true;
      }
      if (matchedThisRecord) matchedRecords += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }

  return {
    manifest_id: manifestId,
    source_id: sourceId,
    algorithm_version: MATCH_ALGORITHM_VERSION,
    minimum_score: minimumScore,
    catalog_records: catalogRecords,
    matched_records: matchedRecords,
    candidates_stored: candidatesStored,
    offline_only: true,
    content_verification_required: true,
  };
}

module.exports = {
  MATCH_ALGORITHM_VERSION,
  dice,
  jaccard,
  matchManifestMetadata,
  metadataSimilarity,
  registerCatalogManifest,
};
