/**
 * Incremental SQLite schema migrations for the catalog DB.
 */

const SONG_DETAILS_DDL = `
CREATE TABLE IF NOT EXISTS song_details (
  slug TEXT PRIMARY KEY REFERENCES songs(slug) ON DELETE CASCADE,
  hooktheory_song_name TEXT,
  primary_section_id TEXT,
  data_version INTEGER,
  primary_key_tonic TEXT,
  primary_key_scale TEXT,
  bpm REAL,
  swing_factor REAL,
  time_sig TEXT,
  has_melody INTEGER NOT NULL DEFAULT 0,
  melody_line_count INTEGER,
  total_notes INTEGER,
  unique_scale_degrees INTEGER,
  has_lyrics INTEGER NOT NULL DEFAULT 0,
  youtube_id TEXT,
  youtube_sync_start REAL,
  youtube_sync_end REAL,
  content_fp TEXT,
  pickup INTEGER NOT NULL DEFAULT 0,
  key_change_count INTEGER,
  total_beats REAL,
  extra_json TEXT,
  details_fetched_at TEXT
);
`;

const SONG_STATS_COLUMNS = [
  ['borrowed_chord_count', 'INTEGER'],
  ['applied_chord_count', 'INTEGER'],
  ['modified_chord_count', 'INTEGER'],
  ['rest_chord_count', 'INTEGER'],
  ['avg_chord_duration', 'REAL'],
];

const SONG_SECTIONS_COLUMNS = [
  ['hooktheory_id', 'TEXT'],
  ['end_beat', 'REAL'],
  ['chord_count', 'INTEGER'],
  ['note_count', 'INTEGER'],
  ['key_tonic', 'TEXT'],
  ['key_scale', 'TEXT'],
  ['bpm', 'REAL'],
  ['time_sig', 'TEXT'],
  ['swing_factor', 'REAL'],
  ['melody_line_count', 'INTEGER'],
  ['has_melody', 'INTEGER'],
  ['pickup', 'INTEGER'],
  ['content_fp', 'TEXT'],
  ['borrowed_chord_count', 'INTEGER'],
  ['applied_chord_count', 'INTEGER'],
  ['modified_chord_count', 'INTEGER'],
  ['section_data_json', 'TEXT'],
];

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name));
}

function addColumnIfMissing(db, table, name, type) {
  const cols = tableColumns(db, table);
  if (cols.has(name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}

const SONGS_PIPELINE_COLUMNS = [
  ['cache_dir', 'TEXT'],
  ['processed_at', 'TEXT'],
  ['oracle_tested_at', 'TEXT'],
  ['oracle_out_dir', 'TEXT'],
  ['oracle_summary_json', 'TEXT'],
];

function migrateSchema(db) {
  db.exec(SONG_DETAILS_DDL);
  for (const [name, type] of SONG_STATS_COLUMNS) {
    addColumnIfMissing(db, 'song_stats', name, type);
  }
  for (const [name, type] of SONG_SECTIONS_COLUMNS) {
    addColumnIfMissing(db, 'song_sections', name, type);
  }
  for (const [name, type] of SONGS_PIPELINE_COLUMNS) {
    addColumnIfMissing(db, 'songs', name, type);
  }
}

module.exports = { migrateSchema, SONG_DETAILS_DDL };
