/**
 * Scan .hooktheory_cache/ and upsert catalog rows (MANUAL ONLY).
 *
 * Not run on library load. Normal workflow: catalog → fetch → test.
 * Use only for one-off migration: node cli/backfill-cache.js
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./paths');
const { parseTheoryTabUrl } = require('./catalogUtils');
const { upsertSong, nowIso, saveStats } = require('./db');

const CACHE_ROOT = path.join(REPO_ROOT, '.hooktheory_cache');

function promoteCacheMetadata(db, slug, cacheDirName) {
  const row = db.prepare('SELECT status FROM songs WHERE slug = ?').get(slug);
  if (row?.status === 'enriched') return;

  const songDir = path.join(CACHE_ROOT, cacheDirName);
  if (!fs.existsSync(songDir)) return;

  const sectionFiles = fs.readdirSync(songDir).filter((f) => f.endsWith('.json') && f !== '_metadata.json');
  if (!sectionFiles.length) return;

  let totalChords = 0;

  for (const file of sectionFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(songDir, file), 'utf8'));
      totalChords += (data.chords || []).length;
    } catch (_) {
      // skip corrupt section
    }
  }

  saveStats(db, slug, {
    section_count: sectionFiles.length,
    total_chords: totalChords,
  });

  db.prepare(`UPDATE songs SET status = 'enriched' WHERE slug = ? AND status != 'enriched'`).run(slug);
}

function markSongFromCache(db, url, cacheDirName, processedAt) {
  const parsed = parseTheoryTabUrl(url);
  if (!parsed) return false;

  const existing = db.prepare('SELECT status FROM songs WHERE slug = ?').get(parsed.slug);
  upsertSong(db, {
    ...parsed,
    status: existing?.status || 'pending',
    discovery_source: 'hooktheory_cache',
  });

  db.prepare(`
    UPDATE songs
    SET cache_dir = ?, processed_at = ?
    WHERE slug = ?
  `).run(cacheDirName, processedAt || nowIso(), parsed.slug);

  promoteCacheMetadata(db, parsed.slug, cacheDirName);
  return true;
}

function syncCacheToCatalog(db) {
  if (!fs.existsSync(CACHE_ROOT)) {
    return { synced: 0, skipped: 0, errors: [] };
  }

  let synced = 0;
  let skipped = 0;
  const errors = [];

  for (const ent of fs.readdirSync(CACHE_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const metaPath = path.join(CACHE_ROOT, ent.name, '_metadata.json');
    if (!fs.existsSync(metaPath)) {
      skipped++;
      continue;
    }
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (!meta.url) {
        skipped++;
        continue;
      }
      if (markSongFromCache(db, meta.url, ent.name, meta.timestamp)) {
        synced++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push({ dir: ent.name, error: err.message });
    }
  }

  return { synced, skipped, errors };
}

module.exports = { CACHE_ROOT, markSongFromCache, syncCacheToCatalog };
