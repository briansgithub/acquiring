#!/usr/bin/env node
/**
 * Keep only six songs in DB + .hooktheory_cache (stops cache sync re-importing extras).
 */
const fs = require('fs');
const path = require('path');
const { openDb } = require('./hooktheory_catalog/lib/db');
const { parseTheoryTabUrl } = require('./hooktheory_catalog/lib/catalogUtils');
const { resetCacheSync } = require('./hooktheory_catalog/lib/library');

const KEEP_SLUGS = new Set([
  'scott-joplin__maple-leaf-rag',
  'scott-joplin__gladiolus-rag',
  'lady-gaga__bad-romance',
  'guns-n-roses__sweet-child-o-mine',
  'nintendo__earthbound-zero---pollyanna',
  'queen__bohemian-rhapsody',
]);

const { getPlaybackCacheDir } = require('../lib/dataRoot');

const CACHE_ROOT = getPlaybackCacheDir();

function rmDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function pruneCache() {
  if (!fs.existsSync(CACHE_ROOT)) return { removed: 0 };
  let removed = 0;
  for (const ent of fs.readdirSync(CACHE_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const metaPath = path.join(CACHE_ROOT, ent.name, '_metadata.json');
    if (!fs.existsSync(metaPath)) {
      rmDir(path.join(CACHE_ROOT, ent.name));
      removed++;
      continue;
    }
    const url = JSON.parse(fs.readFileSync(metaPath, 'utf8')).url;
    const parsed = parseTheoryTabUrl(url);
    if (!parsed || !KEEP_SLUGS.has(parsed.slug)) {
      rmDir(path.join(CACHE_ROOT, ent.name));
      removed++;
    }
  }
  return { removed };
}

function pruneDb(db) {
  const placeholders = [...KEEP_SLUGS].map(() => '?').join(',');
  const before = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
  db.prepare(`DELETE FROM songs WHERE slug NOT IN (${placeholders})`).run(...KEEP_SLUGS);
  const after = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
  resetCacheSync();
  return { before, after };
}

const cache = pruneCache();
const db = openDb();
const dbResult = pruneDb(db);
const rows = db.prepare(`
  SELECT s.title, m.complexity_rating, s.processed_at IS NOT NULL AS playable
  FROM songs s LEFT JOIN song_metrics m ON m.slug = s.slug ORDER BY s.title
`).all();

console.log(JSON.stringify({ cacheDirsRemoved: cache.removed, db: dbResult, songs: rows }, null, 2));
