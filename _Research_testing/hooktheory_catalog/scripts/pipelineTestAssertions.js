/**
 * Assertions for pipeline closed-loop tests.
 */

const fs = require('fs');
const path = require('path');
const { getPlaybackCacheDir, resolveDataPath } = require('../../../lib/dataRoot');
const { harvestDirForSlug, harvestFileForSlug } = require('../lib/harvestArtifact');

function fail(msg, ctx = {}) {
  const err = new Error(msg);
  err.context = ctx;
  throw err;
}

function assertFlags(flags, expected, label) {
  for (const [k, v] of Object.entries(expected)) {
    if (flags[k] !== v) {
      fail(`${label}: flags.${k} expected ${v}, got ${flags[k]}`, { flags, expected });
    }
  }
}

function getRow(db, slug) {
  return db.prepare(`
    SELECT slug, url, status, cache_dir, processed_at, oracle_tested_at,
      oracle_out_dir, oracle_summary_json
    FROM songs WHERE slug = ?
  `).get(slug);
}

function assertRow(db, slug, expected, label) {
  const row = getRow(db, slug);
  if (!expected && row) fail(`${label}: expected no row`, { slug });
  if (expected === null) {
    if (row) fail(`${label}: expected row missing`, { slug });
    return null;
  }
  if (!row) fail(`${label}: row not found`, { slug });
  for (const [k, v] of Object.entries(expected)) {
    if (k === 'has_metrics') {
      const m = db.prepare('SELECT 1 FROM song_metrics WHERE slug = ?').get(slug);
      const has = !!m;
      if (has !== v) fail(`${label}: has_metrics expected ${v}`, { slug });
      continue;
    }
    const actual = row[k];
    if (v === undefined) continue;
    if (actual !== v && !(v === null && (actual === undefined || actual === null))) {
      fail(`${label}: row.${k} expected ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`, { row });
    }
  }
  return row;
}

function assertFsExists(relPath, label) {
  const abs = path.isAbsolute(relPath) ? relPath : resolveDataPath(relPath);
  if (!abs || !fs.existsSync(abs)) fail(`${label}: path missing ${relPath}`);
}

function assertFsMissing(relPath, label) {
  const abs = path.isAbsolute(relPath) ? relPath : resolveDataPath(relPath);
  if (abs && fs.existsSync(abs)) fail(`${label}: path should be gone ${relPath}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Build scrape.json from .hooktheory_cache for local pipeline tests (no browser). */
function seedHarvestFromCache(db, slug) {
  const row = getRow(db, slug);
  if (!row?.cache_dir || !row.url) fail('seedHarvestFromCache: no cache_dir', { slug });
  const cacheDir = path.join(getPlaybackCacheDir(), row.cache_dir);
  if (!fs.existsSync(cacheDir)) fail('seedHarvestFromCache: cache missing', { cacheDir });

  const metaPath = path.join(cacheDir, '_metadata.json');
  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    : { sectionMapping: {} };

  const sections = [];
  for (const file of fs.readdirSync(cacheDir)) {
    if (!file.endsWith('.json') || file === '_metadata.json') continue;
    const data = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'));
    const songId = data.songId || data.stringSongId;
    if (!songId) continue;
    sections.push({
      name: data.sectionName || meta.sectionMapping?.[songId] || 'Section',
      songId,
      json: {
        songId: data.numericId,
        songInfo: data.songInfo,
        chords: data.chords || [],
        notes: data.notes ?? null,
        metadata: data.metadata || {},
      },
      rendered: [{ order: 0, raw: 'I', stableX: 0, texts: [] }],
    });
  }
  if (!sections.length) fail('seedHarvestFromCache: no sections', { slug });

  const scrape = {
    url: row.url,
    title: meta.songTitle || row.title,
    sections,
    errors: [],
    harvestedAt: new Date().toISOString(),
    metrics: {},
  };
  const outDir = harvestDirForSlug(slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(harvestFileForSlug(slug), JSON.stringify(scrape, null, 2));
  return scrape;
}

module.exports = {
  fail,
  assertFlags,
  assertRow,
  getRow,
  assertFsExists,
  assertFsMissing,
  sleep,
  seedHarvestFromCache,
};
