/**
 * Unified library: catalog rows + cache/playable pipeline flags.
 * DB rows are only created/updated by explicit catalog, fetch, or test pipeline ops —
 * not by scanning .hooktheory_cache/ on library load.
 */

const { computeFlags, computeFlagsFromDb, canLoad, loadGateMissing } = require('./pipelineFlags');
const { resolveOracleSummary } = require('./oracleSummary');
const { getSongDetail, listSongSections } = require('./queries');

function mapLibraryRow(row) {
  const flags = computeFlagsFromDb(row);
  return {
    slug: row.slug,
    artist: row.artist,
    title: row.title,
    status: row.status,
    url: row.url,
    playable: flags.processed,
    cacheKey: row.cache_dir || null,
    complexity_rating: row.complexity_rating ?? null,
    is_favorite: !!row.is_favorite,
    flags,
  };
}

function listLibrary(db) {
  const rows = db.prepare(`
    SELECT s.slug, s.artist, s.title, s.status, s.url, s.cache_dir, s.processed_at,
      s.oracle_tested_at, s.harvest_mode, s.discovery_source, m.complexity_rating,
      s.is_favorite
    FROM songs s
    LEFT JOIN song_metrics m ON m.slug = s.slug
    ORDER BY artist, title
  `).all();
  return rows.map(mapLibraryRow);
}

function getLibrarySong(db, slug) {
  const song = getSongDetail(db, slug);
  if (!song) return null;
  const flags = computeFlags(song, song.slug);
  const sections = listSongSections(db, slug);
  const oracleSummary = resolveOracleSummary(song);
  return {
    song: {
      ...song,
      playable: flags.processed,
      cacheKey: song.cache_dir || null,
      flags,
      canLoad: canLoad(flags),
      loadGateMissing: loadGateMissing(flags),
      oracleSummary,
      oracleOutDir: song.oracle_out_dir || null,
      is_favorite: !!song.is_favorite,
    },
    sections,
  };
}

function resolveLoad(db, slug) {
  const row = db.prepare(`
    SELECT slug, url, status, cache_dir, processed_at, oracle_tested_at
    FROM songs WHERE slug = ?
  `).get(slug);
  if (!row) return { ok: false, status: 404, error: 'song not found' };

  const flags = computeFlags(row, row.slug);
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

/** @deprecated No-op — cache folders no longer auto-import into the catalog DB. */
function resetCacheSync() {}

module.exports = {
  listLibrary,
  getLibrarySong,
  resolveLoad,
  resetCacheSync,
};
