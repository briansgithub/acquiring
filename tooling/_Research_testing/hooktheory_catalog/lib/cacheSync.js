/**
 * Playback cache paths and processed-step DB commit (pipeline only).
 *
 * Does NOT create catalog rows from cache folders. Songs must already exist
 * via discover, add-by-URL, or light-catalog discover before processed runs.
 */

const fs = require('fs');
const path = require('path');
const { getPlaybackCacheDir } = require('../../../lib/dataRoot');
const { nowIso } = require('./db');

const CACHE_ROOT = getPlaybackCacheDir();

function commitProcessedCache(db, slug, cacheDirName, processedAt) {
  const row = db.prepare('SELECT slug FROM songs WHERE slug = ?').get(slug);
  if (!row) {
    throw Object.assign(new Error(`catalog row missing for ${slug} — discover or add-by-URL first`), { status: 409 });
  }
  const ts = processedAt || nowIso();
  db.prepare(`
    UPDATE songs
    SET cache_dir = ?, processed_at = ?
    WHERE slug = ?
  `).run(cacheDirName, ts, slug);
}

module.exports = { CACHE_ROOT, commitProcessedCache };
