/**
 * SQLite catalog schema and helpers.
 */

const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR, ensureDataDir, migrateLegacyFile } = require('./paths');
const { migrateSchema } = require('./dbMigrations');

const DB_PATH = path.join(DATA_DIR, 'hooktheory_catalog.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS songs (
  slug TEXT PRIMARY KEY,
  artist_slug TEXT,
  title_slug TEXT,
  artist TEXT,
  title TEXT,
  url TEXT NOT NULL UNIQUE,
  difficulty_label TEXT,
  first_seen_at TEXT NOT NULL,
  last_checked_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  discovery_source TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS song_metrics (
  slug TEXT PRIMARY KEY REFERENCES songs(slug) ON DELETE CASCADE,
  chord_complexity_ht REAL,
  melodic_complexity_ht REAL,
  chord_melody_tension_ht REAL,
  chord_progression_novelty_ht REAL,
  chord_bass_melody_ht REAL,
  complexity_rating REAL,
  metrics_source TEXT,
  metrics_fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS song_stats (
  slug TEXT PRIMARY KEY REFERENCES songs(slug) ON DELETE CASCADE,
  unique_chords INTEGER,
  unique_transitions INTEGER,
  total_chords INTEGER,
  section_count INTEGER,
  stats_computed_at TEXT
);

CREATE TABLE IF NOT EXISTS song_sections (
  slug TEXT NOT NULL REFERENCES songs(slug) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  song_id TEXT NOT NULL,
  PRIMARY KEY (slug, section_name)
);

CREATE TABLE IF NOT EXISTS discovery_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  new_count INTEGER DEFAULT 0,
  enriched_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status);
CREATE INDEX IF NOT EXISTS idx_songs_last_checked ON songs(last_checked_at);
`;

function resolveDbPath(dbPath) {
  ensureDataDir();
  migrateLegacyFile('hooktheory_catalog.db');
  return dbPath || DB_PATH;
}

function openDb(dbPath) {
  const resolved = resolveDbPath(dbPath);
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  migrateSchema(db);
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

const LIVE_OBSERVED_SOURCES = new Set(['artist-page', 'recent', 'add-by-url']);
const ARCHIVE_OBSERVED_SOURCES = new Set(['wayback']);
const SYNTHESIZED_SOURCES = new Set(['meilisearch', 'alt-lookup']);

function inferUrlSource(entry) {
  if (entry.url_source === 'observed' || entry.url_source === 'synthesized') {
    return entry.url_source;
  }
  const source = String(entry.discovery_source || '');
  if (LIVE_OBSERVED_SOURCES.has(source) || ARCHIVE_OBSERVED_SOURCES.has(source)
      || source.startsWith('search:')) return 'observed';
  if (SYNTHESIZED_SOURCES.has(source)) return 'synthesized';
  return null;
}

function urlEvidenceRank(urlSource, discoverySource) {
  if (urlSource !== 'observed') return 1;
  const source = String(discoverySource || '');
  if (LIVE_OBSERVED_SOURCES.has(source) || source.startsWith('search:')) return 3;
  return 2;
}

/**
 * Reconcile one discovery result with the catalog without allowing an URL
 * collision to abort the surrounding discovery run.
 *
 * A direct 404 remains authoritative when rediscovery merely repeats the same
 * URL. A different, credible URL for the same canonical slug means the old
 * verdict answered the wrong address, so unresolved rows are re-queued.
 */
function reconcileSong(db, entry, { apply = true } = {}) {
  if (!entry?.slug || !entry?.url) {
    return { action: 'conflict', slug: entry?.slug || null, reason: 'missing-slug-or-url' };
  }

  const existing = db.prepare('SELECT * FROM songs WHERE slug = ?').get(entry.slug);
  const candidateUrlSource = inferUrlSource(entry);
  const candidateSource = entry.discovery_source || null;
  const candidateRank = urlEvidenceRank(candidateUrlSource, candidateSource);

  if (!existing) {
    const owner = db.prepare('SELECT slug FROM songs WHERE url = ?').get(entry.url);
    if (owner && owner.slug !== entry.slug) {
      return {
        action: 'conflict', slug: entry.slug, url: entry.url,
        ownerSlug: owner.slug, reason: 'url-owned-by-another-slug',
      };
    }
    if (!apply) return { action: 'inserted', slug: entry.slug, url: entry.url };

    const ts = nowIso();
    db.prepare(`
      INSERT INTO songs (slug, artist_slug, title_slug, artist, title, url, difficulty_label,
        first_seen_at, last_checked_at, status, discovery_source, url_source)
      VALUES (@slug, @artist_slug, @title_slug, @artist, @title, @url, @difficulty_label,
        @first_seen_at, @last_checked_at, @status, @discovery_source, @url_source)
    `).run({
      slug: entry.slug,
      artist_slug: entry.artist_slug || null,
      title_slug: entry.title_slug || null,
      artist: entry.artist || null,
      title: entry.title || null,
      url: entry.url,
      difficulty_label: entry.difficulty_label || null,
      first_seen_at: entry.first_seen_at || ts,
      last_checked_at: entry.last_checked_at || null,
      status: entry.status || 'pending',
      discovery_source: candidateSource,
      url_source: candidateUrlSource,
    });
    return { action: 'inserted', slug: entry.slug, url: entry.url };
  }

  const urlChanged = existing.url !== entry.url;
  if (!urlChanged) {
    if (apply) {
      db.prepare(`
        UPDATE songs SET
          artist_slug = COALESCE(?, artist_slug),
          title_slug = COALESCE(?, title_slug),
          artist = COALESCE(?, artist),
          title = COALESCE(?, title),
          difficulty_label = COALESCE(?, difficulty_label),
          discovery_source = COALESCE(discovery_source, ?),
          url_source = COALESCE(url_source, ?)
        WHERE slug = ?
      `).run(
        entry.artist_slug || null, entry.title_slug || null,
        entry.artist || null, entry.title || null,
        entry.difficulty_label || null, candidateSource, candidateUrlSource, entry.slug,
      );
    }
    return { action: 'unchanged', slug: entry.slug, url: existing.url };
  }

  const existingRank = urlEvidenceRank(existing.url_source, existing.discovery_source);
  if (existing.status === 'enriched'
      || candidateRank < existingRank
      || (candidateRank === existingRank && candidateUrlSource === 'observed')) {
    return {
      action: candidateRank === existingRank && candidateUrlSource === 'observed'
        ? 'conflict' : 'unchanged',
      slug: entry.slug,
      url: existing.url,
      candidateUrl: entry.url,
      reason: existing.status === 'enriched'
        ? 'enriched-url-preserved'
        : candidateRank < existingRank
          ? 'weaker-url-evidence'
          : 'ambiguous-observed-urls',
    };
  }

  const owner = db.prepare('SELECT slug FROM songs WHERE url = ?').get(entry.url);
  if (owner && owner.slug !== entry.slug) {
    return {
      action: 'conflict', slug: entry.slug, url: entry.url,
      previousUrl: existing.url, ownerSlug: owner.slug,
      reason: 'url-owned-by-another-slug',
    };
  }

  const revived = existing.status === 'dead' || existing.status === 'error'
    || existing.harvest_mode === 'blocked';
  const action = revived ? 'revived' : 'updated';
  if (!apply) {
    return { action, slug: entry.slug, previousUrl: existing.url, url: entry.url };
  }

  db.prepare(`
    UPDATE songs SET
      artist_slug = COALESCE(?, artist_slug),
      title_slug = COALESCE(?, title_slug),
      artist = COALESCE(?, artist),
      title = COALESCE(?, title),
      url = ?, difficulty_label = COALESCE(?, difficulty_label),
      status = CASE WHEN ? THEN 'pending' ELSE status END,
      error_message = CASE WHEN ? THEN NULL ELSE error_message END,
      last_checked_at = CASE WHEN ? THEN NULL ELSE last_checked_at END,
      harvest_mode = CASE WHEN ? THEN NULL ELSE harvest_mode END,
      discovery_source = COALESCE(?, discovery_source),
      url_source = COALESCE(?, url_source)
    WHERE slug = ?
  `).run(
    entry.artist_slug || null, entry.title_slug || null,
    entry.artist || null, entry.title || null,
    entry.url, entry.difficulty_label || null,
    revived ? 1 : 0, urlChanged ? 1 : 0, urlChanged ? 1 : 0, revived ? 1 : 0,
    candidateSource, candidateUrlSource, entry.slug,
  );
  return { action, slug: entry.slug, previousUrl: existing.url, url: entry.url };
}

/** Backward-compatible insert predicate for older callers. */
function upsertSong(db, entry) {
  return reconcileSong(db, entry).action === 'inserted';
}

function upsertMeiliSectionStub(db, slug, sectionName, songId) {
  if (!slug || !sectionName || !songId) return;
  db.prepare(`
    INSERT INTO song_sections (slug, section_name, song_id, hooktheory_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(slug, section_name) DO UPDATE SET
      song_id = excluded.song_id,
      hooktheory_id = COALESCE(excluded.hooktheory_id, song_sections.hooktheory_id)
  `).run(slug, sectionName, songId, songId);
}

function setHarvestMode(db, slug, mode) {
  db.prepare('UPDATE songs SET harvest_mode = ? WHERE slug = ?').run(mode, slug);
}

function markLightHarvestBlocked(db, slug, reason) {
  db.prepare(`
    UPDATE songs
    SET harvest_mode = 'blocked', error_message = ?, last_checked_at = ?
    WHERE slug = ?
  `).run(reason, nowIso(), slug);
}

function clearLightHarvestBlocked(db, slug) {
  db.prepare(`
    UPDATE songs SET harvest_mode = NULL, error_message = NULL WHERE slug = ? AND harvest_mode = 'blocked'
  `).run(slug);
}

function listSectionsForSlug(db, slug) {
  return db.prepare(`
    SELECT section_name, song_id FROM song_sections WHERE slug = ? ORDER BY rowid
  `).all(slug);
}

function saveMetrics(db, slug, metrics, rating, source) {
  const ts = nowIso();
  db.prepare(`
    INSERT INTO song_metrics (slug, chord_complexity_ht, melodic_complexity_ht,
      chord_melody_tension_ht, chord_progression_novelty_ht, chord_bass_melody_ht,
      complexity_rating, metrics_source, metrics_fetched_at)
    VALUES (@slug, @chord_complexity_ht, @melodic_complexity_ht, @chord_melody_tension_ht,
      @chord_progression_novelty_ht, @chord_bass_melody_ht, @complexity_rating, @metrics_source, @ts)
    ON CONFLICT(slug) DO UPDATE SET
      chord_complexity_ht = excluded.chord_complexity_ht,
      melodic_complexity_ht = excluded.melodic_complexity_ht,
      chord_melody_tension_ht = excluded.chord_melody_tension_ht,
      chord_progression_novelty_ht = excluded.chord_progression_novelty_ht,
      chord_bass_melody_ht = excluded.chord_bass_melody_ht,
      complexity_rating = excluded.complexity_rating,
      metrics_source = excluded.metrics_source,
      metrics_fetched_at = excluded.metrics_fetched_at
  `).run({
    slug,
    chord_complexity_ht: metrics.chord_complexity_ht ?? null,
    melodic_complexity_ht: metrics.melodic_complexity_ht ?? null,
    chord_melody_tension_ht: metrics.chord_melody_tension_ht ?? null,
    chord_progression_novelty_ht: metrics.chord_progression_novelty_ht ?? null,
    chord_bass_melody_ht: metrics.chord_bass_melody_ht ?? null,
    complexity_rating: rating,
    metrics_source: source,
    ts,
  });
}

function saveStats(db, slug, stats) {
  const ts = nowIso();
  db.prepare(`
    INSERT INTO song_stats (
      slug, unique_chords, unique_transitions, total_chords, section_count,
      borrowed_chord_count, applied_chord_count, modified_chord_count,
      rest_chord_count, avg_chord_duration, stats_computed_at
    )
    VALUES (
      @slug, @unique_chords, @unique_transitions, @total_chords, @section_count,
      @borrowed_chord_count, @applied_chord_count, @modified_chord_count,
      @rest_chord_count, @avg_chord_duration, @ts
    )
    ON CONFLICT(slug) DO UPDATE SET
      unique_chords = excluded.unique_chords,
      unique_transitions = excluded.unique_transitions,
      total_chords = excluded.total_chords,
      section_count = excluded.section_count,
      borrowed_chord_count = excluded.borrowed_chord_count,
      applied_chord_count = excluded.applied_chord_count,
      modified_chord_count = excluded.modified_chord_count,
      rest_chord_count = excluded.rest_chord_count,
      avg_chord_duration = excluded.avg_chord_duration,
      stats_computed_at = excluded.stats_computed_at
  `).run({
    slug,
    unique_chords: stats.unique_chords ?? null,
    unique_transitions: stats.unique_transitions ?? null,
    total_chords: stats.total_chords ?? null,
    section_count: stats.section_count ?? null,
    borrowed_chord_count: stats.borrowed_chord_count ?? null,
    applied_chord_count: stats.applied_chord_count ?? null,
    modified_chord_count: stats.modified_chord_count ?? null,
    rest_chord_count: stats.rest_chord_count ?? null,
    avg_chord_duration: stats.avg_chord_duration ?? null,
    ts,
  });
}

function saveDetails(db, slug, details) {
  const ts = nowIso();
  db.prepare(`
    INSERT INTO song_details (
      slug, hooktheory_song_name, primary_section_id, data_version,
      primary_key_tonic, primary_key_scale, bpm, swing_factor, time_sig,
      has_melody, melody_line_count, total_notes, unique_scale_degrees, has_lyrics,
      youtube_id, youtube_sync_start, youtube_sync_end, content_fp, pickup,
      key_change_count, total_beats, extra_json, details_fetched_at
    )
    VALUES (
      @slug, @hooktheory_song_name, @primary_section_id, @data_version,
      @primary_key_tonic, @primary_key_scale, @bpm, @swing_factor, @time_sig,
      @has_melody, @melody_line_count, @total_notes, @unique_scale_degrees, @has_lyrics,
      @youtube_id, @youtube_sync_start, @youtube_sync_end, @content_fp, @pickup,
      @key_change_count, @total_beats, @extra_json, @ts
    )
    ON CONFLICT(slug) DO UPDATE SET
      hooktheory_song_name = excluded.hooktheory_song_name,
      primary_section_id = excluded.primary_section_id,
      data_version = excluded.data_version,
      primary_key_tonic = excluded.primary_key_tonic,
      primary_key_scale = excluded.primary_key_scale,
      bpm = excluded.bpm,
      swing_factor = excluded.swing_factor,
      time_sig = excluded.time_sig,
      has_melody = excluded.has_melody,
      melody_line_count = excluded.melody_line_count,
      total_notes = excluded.total_notes,
      unique_scale_degrees = excluded.unique_scale_degrees,
      has_lyrics = excluded.has_lyrics,
      youtube_id = excluded.youtube_id,
      youtube_sync_start = excluded.youtube_sync_start,
      youtube_sync_end = excluded.youtube_sync_end,
      content_fp = excluded.content_fp,
      pickup = excluded.pickup,
      key_change_count = excluded.key_change_count,
      total_beats = excluded.total_beats,
      extra_json = excluded.extra_json,
      details_fetched_at = excluded.details_fetched_at
  `).run({ slug, ...details, ts });
}

function saveSections(db, slug, sections) {
  const del = db.prepare('DELETE FROM song_sections WHERE slug = ?');
  const ins = db.prepare(`
    INSERT INTO song_sections (
      slug, section_name, song_id, hooktheory_id, end_beat, chord_count, note_count,
      key_tonic, key_scale, bpm, time_sig, swing_factor, melody_line_count, has_melody,
      pickup, content_fp, borrowed_chord_count, applied_chord_count, modified_chord_count,
      section_data_json
    ) VALUES (
      @slug, @section_name, @song_id, @hooktheory_id, @end_beat, @chord_count, @note_count,
      @key_tonic, @key_scale, @bpm, @time_sig, @swing_factor, @melody_line_count, @has_melody,
      @pickup, @content_fp, @borrowed_chord_count, @applied_chord_count, @modified_chord_count,
      @section_data_json
    )
  `);
  const tx = db.transaction((rows) => {
    del.run(slug);
    for (const row of rows) {
      ins.run({ slug, ...row });
    }
  });
  tx(sections);
}

function setSongStatus(db, slug, status, errorMessage = null) {
  db.prepare(`
    UPDATE songs SET status = ?, error_message = ?, last_checked_at = ? WHERE slug = ?
  `).run(status, errorMessage, nowIso(), slug);
}

function startDiscoveryRun(db, mode) {
  const info = db.prepare(`
    INSERT INTO discovery_runs (mode, started_at) VALUES (?, ?)
  `).run(mode, nowIso());
  return info.lastInsertRowid;
}

function finishDiscoveryRun(db, runId, patch) {
  db.prepare(`
    UPDATE discovery_runs
    SET finished_at = ?, new_count = ?, enriched_count = ?, error_count = ?, notes = ?
    WHERE id = ?
  `).run(
    nowIso(),
    patch.new_count ?? 0,
    patch.enriched_count ?? 0,
    patch.error_count ?? 0,
    patch.notes != null ? JSON.stringify(patch.notes) : null,
    runId,
  );
}

function getCatalogStatus(db) {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'enriched' THEN 1 ELSE 0 END) AS enriched,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
      SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead
    FROM songs
  `).get();
  const lastRun = db.prepare(`
    SELECT * FROM discovery_runs ORDER BY id DESC LIMIT 1
  `).get();
  return { totals, lastRun };
}

function listPendingSongs(db, limit = 50) {
  return db.prepare(`
    SELECT slug, url, artist, title FROM songs WHERE status = 'pending' ORDER BY first_seen_at LIMIT ?
  `).all(limit);
}

function listEnrichedSongs(db, limit = 50) {
  return db.prepare(`
    SELECT slug, url, artist, title FROM songs WHERE status = 'enriched' ORDER BY first_seen_at LIMIT ?
  `).all(limit);
}

function listSongsByFirstSeen(db, limit = 50) {
  return db.prepare(`
    SELECT slug, url, artist, title, status FROM songs ORDER BY first_seen_at LIMIT ?
  `).all(limit);
}

function getSongBySlug(db, slug) {
  return db.prepare('SELECT slug, url, artist, title, status FROM songs WHERE slug = ?').get(slug);
}

function listSongs(db, { limit = 100, offset = 0, orderBy = 'complexity_rating' } = {}) {
  const allowed = new Set(['complexity_rating', 'unique_chords', 'unique_transitions', 'artist', 'title']);
  const col = allowed.has(orderBy) ? orderBy : 'complexity_rating';
  return db.prepare(`
    SELECT s.slug, s.artist, s.title, s.url, s.status, s.difficulty_label,
      m.complexity_rating, m.chord_complexity_ht, m.metrics_source,
      st.unique_chords, st.unique_transitions, st.total_chords
    FROM songs s
    LEFT JOIN song_metrics m ON m.slug = s.slug
    LEFT JOIN song_stats st ON st.slug = s.slug
    ORDER BY ${col} IS NULL, ${col} DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function toggleFavorite(db, slug, isFavorite) {
  db.prepare('UPDATE songs SET is_favorite = ? WHERE slug = ?').run(isFavorite ? 1 : 0, slug);
}

module.exports = {
  DB_PATH,
  openDb,
  reconcileSong,
  upsertSong,
  upsertMeiliSectionStub,
  setHarvestMode,
  markLightHarvestBlocked,
  clearLightHarvestBlocked,
  listSectionsForSlug,
  saveMetrics,
  saveStats,
  saveDetails,
  saveSections,
  setSongStatus,
  startDiscoveryRun,
  finishDiscoveryRun,
  getCatalogStatus,
  listPendingSongs,
  listEnrichedSongs,
  listSongsByFirstSeen,
  getSongBySlug,
  listSongs,
  nowIso,
  toggleFavorite,
};
