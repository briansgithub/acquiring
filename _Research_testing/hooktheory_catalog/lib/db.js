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
  discovery_source TEXT
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

function upsertSong(db, entry) {
  const ts = nowIso();
  const existing = db.prepare('SELECT slug, first_seen_at FROM songs WHERE slug = ?').get(entry.slug);
  db.prepare(`
    INSERT INTO songs (slug, artist_slug, title_slug, artist, title, url, difficulty_label,
      first_seen_at, last_checked_at, status, discovery_source)
    VALUES (@slug, @artist_slug, @title_slug, @artist, @title, @url, @difficulty_label,
      @first_seen_at, @last_checked_at, @status, @discovery_source)
    ON CONFLICT(slug) DO UPDATE SET
      artist = excluded.artist,
      title = excluded.title,
      url = excluded.url,
      last_checked_at = excluded.last_checked_at,
      discovery_source = COALESCE(excluded.discovery_source, songs.discovery_source)
  `).run({
    slug: entry.slug,
    artist_slug: entry.artist_slug || null,
    title_slug: entry.title_slug || null,
    artist: entry.artist || null,
    title: entry.title || null,
    url: entry.url,
    difficulty_label: entry.difficulty_label || null,
    first_seen_at: existing?.first_seen_at || ts,
    last_checked_at: ts,
    status: entry.status || existing?.status || 'pending',
    discovery_source: entry.discovery_source || null,
  });
  return !existing;
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

module.exports = {
  DB_PATH,
  openDb,
  upsertSong,
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
};
