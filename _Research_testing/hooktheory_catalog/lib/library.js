/**
 * Unified library: catalog rows + cache/playable pipeline flags.
 */

const { computeFlags, canLoad, loadGateMissing } = require('./pipelineFlags');
const { syncCacheToCatalog } = require('./cacheSync');
const { getSongDetail, listSongSections } = require('./queries');

let cacheSynced = false;

function ensureCacheSynced(db) {
  if (cacheSynced) return;
  syncCacheToCatalog(db);
  cacheSynced = true;
}

function resetCacheSync() {
  cacheSynced = false;
}

function mapLibraryRow(row) {
  const flags = computeFlags(row);
  return {
    slug: row.slug,
    artist: row.artist,
    title: row.title,
    status: row.status,
    url: row.url,
    playable: flags.processed,
    cacheKey: row.cache_dir || null,
    flags,
  };
}

function listLibrary(db, { syncCache = true } = {}) {
  if (syncCache) ensureCacheSynced(db);
  const rows = db.prepare(`
    SELECT slug, artist, title, status, url, cache_dir, processed_at, oracle_tested_at
    FROM songs
    ORDER BY artist, title
  `).all();
  return rows.map(mapLibraryRow);
}

function getLibrarySong(db, slug, { syncCache = true } = {}) {
  if (syncCache) ensureCacheSynced(db);
  const song = getSongDetail(db, slug);
  if (!song) return null;
  const flags = computeFlags(song);
  const sections = listSongSections(db, slug);
  return {
    song: {
      ...song,
      playable: flags.processed,
      cacheKey: song.cache_dir || null,
      flags,
      canLoad: canLoad(flags),
      loadGateMissing: loadGateMissing(flags),
    },
    sections,
  };
}

function resolveLoad(db, slug) {
  ensureCacheSynced(db);
  const row = db.prepare(`
    SELECT slug, url, status, cache_dir, processed_at, oracle_tested_at
    FROM songs WHERE slug = ?
  `).get(slug);
  if (!row) return { ok: false, status: 404, error: 'song not found' };

  const flags = computeFlags(row);
  if (!canLoad(flags)) {
    return {
      ok: false,
      status: 409,
      error: 'not ready to load',
      flags,
      missing: loadGateMissing(flags),
    };
  }

  return {
    ok: true,
    slug: row.slug,
    cacheKey: row.cache_dir,
    url: row.url,
  };
}

module.exports = {
  listLibrary,
  getLibrarySong,
  resolveLoad,
  ensureCacheSynced,
  resetCacheSync,
  syncCacheToCatalog,
};
