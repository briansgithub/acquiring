/**
 * SQLite schema for chord progression n-gram index.
 */

const path = require('path');
const Database = require('better-sqlite3');
const { getProgressionIndexPath } = require('../../../../lib/dataRoot');
const { ensureDataDir } = require('../paths');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS system_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_shared_length INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ngrams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  progression TEXT NOT NULL,
  length INTEGER NOT NULL,
  search_mode TEXT NOT NULL CHECK (search_mode IN ('pitch_class', 'functional')),
  slug TEXT NOT NULL,
  section_type TEXT NOT NULL,
  start_position INTEGER NOT NULL,
  beat_duration REAL NOT NULL,
  attribute_flags INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ngrams_lookup
  ON ngrams (search_mode, length, progression);
CREATE INDEX IF NOT EXISTS idx_ngrams_slug ON ngrams (slug);
CREATE INDEX IF NOT EXISTS idx_ngrams_section ON ngrams (section_type);
CREATE INDEX IF NOT EXISTS idx_ngrams_flags ON ngrams (attribute_flags);
CREATE INDEX IF NOT EXISTS idx_ngrams_mode_len_prog
  ON ngrams (search_mode, length, progression, slug);
`;

const INSERT_NGRAM = `
  INSERT INTO ngrams (
    progression, length, search_mode, slug, section_type,
    start_position, beat_duration, attribute_flags, metadata
  ) VALUES (
    @progression, @length, @search_mode, @slug, @section_type,
    @start_position, @beat_duration, @attribute_flags, @metadata
  )
`;

function resolveDbPath(dbPath) {
  ensureDataDir();
  return dbPath || getProgressionIndexPath();
}

function openProgressionDb(dbPath, { readonly = false } = {}) {
  const resolved = resolveDbPath(dbPath);
  const db = new Database(resolved, readonly ? { readonly: true } : {});
  if (!readonly) {
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
    db.prepare(
      'INSERT OR IGNORE INTO system_metadata (id, max_shared_length) VALUES (1, 0)',
    ).run();
  }
  return db;
}

function getMaxSharedLength(db) {
  const row = db.prepare('SELECT max_shared_length FROM system_metadata WHERE id = 1').get();
  return row?.max_shared_length ?? 0;
}

function setMaxSharedLength(db, value) {
  db.prepare('UPDATE system_metadata SET max_shared_length = ? WHERE id = 1').run(value);
}

function resetProgressionDb(db) {
  db.exec('DELETE FROM ngrams; UPDATE system_metadata SET max_shared_length = 0 WHERE id = 1');
}

function recreateProgressionTables(db) {
  db.exec('DROP TABLE IF EXISTS ngrams; DROP TABLE IF EXISTS system_metadata;');
  db.exec(SCHEMA);
  db.prepare(
    'INSERT OR IGNORE INTO system_metadata (id, max_shared_length) VALUES (1, 0)',
  ).run();
}

function prepareInsertNgram(db) {
  return db.prepare(INSERT_NGRAM);
}

function bulkInsertNgrams(db, rows) {
  if (!rows.length) return 0;
  const insert = prepareInsertNgram(db);
  const runMany = db.transaction((batch) => {
    for (const row of batch) insert.run(row);
  });
  runMany(rows);
  return rows.length;
}

module.exports = {
  SCHEMA,
  openProgressionDb,
  getMaxSharedLength,
  setMaxSharedLength,
  resetProgressionDb,
  recreateProgressionTables,
  prepareInsertNgram,
  bulkInsertNgrams,
  getProgressionIndexPath: () => path.resolve(getProgressionIndexPath()),
};
