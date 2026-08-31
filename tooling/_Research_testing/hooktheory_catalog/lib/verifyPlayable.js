/**
 * Local-only verification of playable chord/melody data for every catalogued song.
 *
 * Nothing here touches hooktheory.com — status is derived entirely from the
 * catalog DB plus on-disk harvest/cache artifacts, so this sweep is free to
 * run as often as needed without any load on Hooktheory.
 *
 *   node cli/verify-playable.js
 */

const fs = require('fs');
const path = require('path');
const { openDb } = require('./db');
const { loadHarvest } = require('./harvestArtifact');
const { getPlaybackCacheDir } = require('../../../lib/dataRoot');

const BUCKETS = [
  'playable',
  'harvested_not_processed',
  'harvest_stale_or_empty',
  'never_harvested',
  'dead_or_error',
];

/** Inspect a processed cache dir for at least one section with real chords. */
function checkCacheDir(cacheDir) {
  const dirPath = path.join(getPlaybackCacheDir(), cacheDir);
  if (!fs.existsSync(dirPath)) return { exists: false, hasChords: false, hasMelody: false };

  let hasChords = false;
  let hasMelody = false;
  let files;
  try {
    files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json') && f !== '_metadata.json');
  } catch (_) {
    return { exists: true, hasChords: false, hasMelody: false, corrupt: true };
  }

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
      if (Array.isArray(data.chords) && data.chords.length > 0) hasChords = true;
      if (Array.isArray(data.notes) && data.notes.length > 0) hasMelody = true;
    } catch (_) {
      // skip unreadable section file
    }
    if (hasChords && hasMelody) break;
  }

  return { exists: true, hasChords, hasMelody, sectionFileCount: files.length };
}

/** Inspect a raw harvest artifact (scrape.json) for chord/melody presence. */
function checkHarvestArtifact(slug) {
  const harvest = loadHarvest(slug);
  if (!harvest) return { exists: false, hasChords: false, hasMelody: false };

  let hasChords = false;
  let hasMelody = false;
  for (const section of harvest.scrape.sections || []) {
    const json = section.json || {};
    if (Array.isArray(json.chords) && json.chords.length > 0) hasChords = true;
    if (Array.isArray(json.notes) && json.notes.length > 0) hasMelody = true;
    if ((section.rendered || []).length > 0) hasChords = true;
    if (hasChords && hasMelody) break;
  }
  return { exists: true, hasChords, hasMelody };
}

function classifyRow(row) {
  const notes = [];
  let bucket;
  let hasMelody = false;

  const cacheInfo = row.cache_dir ? checkCacheDir(row.cache_dir) : { exists: false, hasChords: false, hasMelody: false };

  if (row.cache_dir && row.processed_at && !cacheInfo.exists) {
    notes.push('DB says processed but cache dir missing on disk');
  }

  if (cacheInfo.exists && cacheInfo.hasChords) {
    bucket = 'playable';
    hasMelody = cacheInfo.hasMelody;
  } else {
    const harvestInfo = checkHarvestArtifact(row.slug);
    if (row.cache_dir && cacheInfo.exists && !cacheInfo.hasChords) {
      notes.push('cache dir exists but no section has chord data');
    }

    if (harvestInfo.exists && harvestInfo.hasChords) {
      bucket = 'harvested_not_processed';
      hasMelody = harvestInfo.hasMelody;
    } else if (row.status === 'dead' || row.status === 'error') {
      bucket = 'dead_or_error';
    } else if (row.harvest_mode == null && !harvestInfo.exists) {
      bucket = 'never_harvested';
    } else {
      bucket = 'harvest_stale_or_empty';
      if (harvestInfo.exists && !harvestInfo.hasChords) notes.push('harvest artifact exists but has no chord data');
    }
  }

  // Cross-reference against DB-computed stats for drift detection (fast, no extra I/O).
  if (bucket === 'playable' && row.total_chords === 0) {
    notes.push('song_stats.total_chords=0 but cache has chords — DB stats may be stale');
  }
  if (bucket !== 'playable' && row.total_chords > 0) {
    notes.push('song_stats.total_chords>0 but no playable chords found on disk — possible drift');
  }

  return { bucket, hasMelody, notes };
}

function verifyAll(db) {
  const rows = db.prepare(`
    SELECT s.slug, s.artist, s.title, s.url, s.status, s.error_message, s.harvest_mode,
           s.cache_dir, s.processed_at,
           COALESCE(st.total_chords, 0) AS total_chords,
           COALESCE(sd.has_melody, 0) AS db_has_melody,
           COALESCE(sd.total_notes, 0) AS db_total_notes
    FROM songs s
    LEFT JOIN song_stats st ON st.slug = s.slug
    LEFT JOIN song_details sd ON sd.slug = s.slug
  `).all();

  const results = [];
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  let mismatchCount = 0;

  for (const row of rows) {
    const { bucket, hasMelody, notes } = classifyRow(row);
    counts[bucket] += 1;
    if (notes.length > 0) mismatchCount += 1;

    results.push({
      slug: row.slug,
      artist: row.artist,
      title: row.title,
      url: row.url,
      status: row.status,
      error_message: row.error_message,
      harvest_mode: row.harvest_mode,
      bucket,
      hasMelody,
      notes,
    });
  }

  return { results, counts, total: rows.length, mismatchCount };
}

module.exports = {
  BUCKETS,
  checkCacheDir,
  checkHarvestArtifact,
  classifyRow,
  verifyAll,
};
