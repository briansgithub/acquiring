/**
 * SQLite helpers for catalog engine-error cataloging.
 */

const { sigOf } = require('./modSignature');
const { chordSignature } = require('./chordSignature');
const { entryId } = require('../../../_Decode_oracle/chord_db/chordEntry');

const ENGINE_ERROR_DDL = `
CREATE TABLE IF NOT EXISTS chord_catalog_signatures (
  signature TEXT PRIMARY KEY,
  mod_signature TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  song_count INTEGER NOT NULL DEFAULT 0,
  has_mods INTEGER NOT NULL DEFAULT 0,
  sample_chord_json TEXT,
  sample_slugs_json TEXT,
  indexed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fetch_queue (
  slug TEXT PRIMARY KEY,
  url TEXT,
  priority_score REAL NOT NULL DEFAULT 0,
  signatures_covered INTEGER NOT NULL DEFAULT 0,
  harvest_status TEXT NOT NULL DEFAULT 'pending',
  queued_at TEXT NOT NULL,
  fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS engine_errors (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  section_name TEXT NOT NULL,
  beat REAL NOT NULL,
  signature TEXT,
  mod_signature TEXT,
  chord_json TEXT NOT NULL,
  key_json TEXT,
  truth_roman TEXT,
  truth_letter TEXT,
  truth_pcs_json TEXT,
  eng_roman TEXT,
  eng_letter TEXT,
  eng_pcs_json TEXT,
  eng_notes_json TEXT,
  notes_ok INTEGER NOT NULL DEFAULT 0,
  failure_class TEXT,
  failure_flags_json TEXT,
  engine_error TEXT,
  compared_at TEXT NOT NULL,
  UNIQUE(slug, section_name, beat)
);

CREATE TABLE IF NOT EXISTS engine_error_signatures (
  mod_signature TEXT PRIMARY KEY,
  engine_fail_count INTEGER NOT NULL DEFAULT 0,
  total_compared INTEGER NOT NULL DEFAULT 0,
  example_id TEXT,
  truth_pcs_json TEXT,
  eng_pcs_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_engine_errors_mod ON engine_errors(mod_signature);
CREATE INDEX IF NOT EXISTS idx_engine_errors_class ON engine_errors(failure_class, notes_ok);
CREATE INDEX IF NOT EXISTS idx_engine_errors_sig ON engine_errors(signature);
CREATE INDEX IF NOT EXISTS idx_engine_errors_slug ON engine_errors(slug);
CREATE INDEX IF NOT EXISTS idx_fetch_queue_status ON fetch_queue(harvest_status, priority_score);
`;

function ensureEngineErrorTables(db) {
  db.exec(ENGINE_ERROR_DDL);
}

function nowIso() {
  return new Date().toISOString();
}

function entryFromCompare(row, ctx) {
  const chord = row.chord || {};
  const sig = chordSignature(chord);
  const modSig = sigOf(chord);
  const id = entryId(ctx.song, ctx.section, row.beat);
  return {
    id,
    slug: ctx.song,
    section_name: ctx.section,
    beat: row.beat ?? 0,
    signature: sig,
    mod_signature: modSig,
    chord_json: JSON.stringify(chord),
    key_json: JSON.stringify(ctx.key || null),
    truth_roman: row.truthRoman ?? null,
    truth_letter: row.truthLetter ?? null,
    truth_pcs_json: JSON.stringify(row.truthPcs ?? null),
    eng_roman: row.engRoman ?? null,
    eng_letter: row.engLetter ?? null,
    eng_pcs_json: JSON.stringify(row.engPcs ?? null),
    eng_notes_json: JSON.stringify(row.engNotes ?? null),
    notes_ok: row.notesOk ? 1 : 0,
    failure_class: row.failureClass ?? null,
    failure_flags_json: JSON.stringify(row.flags || {}),
    engine_error: row.engineError ?? null,
    compared_at: nowIso(),
  };
}

function upsertEngineError(db, entry) {
  db.prepare(`
    INSERT INTO engine_errors (
      id, slug, section_name, beat, signature, mod_signature,
      chord_json, key_json, truth_roman, truth_letter, truth_pcs_json,
      eng_roman, eng_letter, eng_pcs_json, eng_notes_json,
      notes_ok, failure_class, failure_flags_json, engine_error, compared_at
    ) VALUES (
      @id, @slug, @section_name, @beat, @signature, @mod_signature,
      @chord_json, @key_json, @truth_roman, @truth_letter, @truth_pcs_json,
      @eng_roman, @eng_letter, @eng_pcs_json, @eng_notes_json,
      @notes_ok, @failure_class, @failure_flags_json, @engine_error, @compared_at
    )
    ON CONFLICT(id) DO UPDATE SET
      signature = excluded.signature,
      mod_signature = excluded.mod_signature,
      chord_json = excluded.chord_json,
      key_json = excluded.key_json,
      truth_roman = excluded.truth_roman,
      truth_letter = excluded.truth_letter,
      truth_pcs_json = excluded.truth_pcs_json,
      eng_roman = excluded.eng_roman,
      eng_letter = excluded.eng_letter,
      eng_pcs_json = excluded.eng_pcs_json,
      eng_notes_json = excluded.eng_notes_json,
      notes_ok = excluded.notes_ok,
      failure_class = excluded.failure_class,
      failure_flags_json = excluded.failure_flags_json,
      engine_error = excluded.engine_error,
      compared_at = excluded.compared_at
  `).run(entry);
}

function deleteEngineErrorsForSlug(db, slug) {
  db.prepare('DELETE FROM engine_errors WHERE slug = ?').run(slug);
}

function rebuildErrorSignatures(db) {
  const ts = nowIso();
  db.prepare('DELETE FROM engine_error_signatures').run();
  const rows = db.prepare(`
    SELECT mod_signature,
      SUM(CASE WHEN failure_class = 'engine' AND notes_ok = 0 THEN 1 ELSE 0 END) AS engine_fail_count,
      COUNT(*) AS total_compared
    FROM engine_errors
    WHERE mod_signature IS NOT NULL AND mod_signature != ''
    GROUP BY mod_signature
  `).all();

  const pickExample = db.prepare(`
    SELECT id, truth_pcs_json, eng_pcs_json
    FROM engine_errors
    WHERE mod_signature = ? AND failure_class = 'engine' AND notes_ok = 0
    ORDER BY id LIMIT 1
  `);

  const insert = db.prepare(`
    INSERT INTO engine_error_signatures (
      mod_signature, engine_fail_count, total_compared,
      example_id, truth_pcs_json, eng_pcs_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    const ex = pickExample.get(row.mod_signature);
    insert.run(
      row.mod_signature,
      row.engine_fail_count,
      row.total_compared,
      ex?.id ?? null,
      ex?.truth_pcs_json ?? null,
      ex?.eng_pcs_json ?? null,
      ts,
    );
  }
  return rows.length;
}

function upsertSignatureRow(db, row) {
  db.prepare(`
    INSERT INTO chord_catalog_signatures (
      signature, mod_signature, occurrence_count, song_count, has_mods,
      sample_chord_json, sample_slugs_json, indexed_at
    ) VALUES (
      @signature, @mod_signature, @occurrence_count, @song_count, @has_mods,
      @sample_chord_json, @sample_slugs_json, @indexed_at
    )
    ON CONFLICT(signature) DO UPDATE SET
      mod_signature = excluded.mod_signature,
      occurrence_count = excluded.occurrence_count,
      song_count = excluded.song_count,
      has_mods = excluded.has_mods,
      sample_chord_json = excluded.sample_chord_json,
      sample_slugs_json = excluded.sample_slugs_json,
      indexed_at = excluded.indexed_at
  `).run(row);
}

function clearSignatureIndex(db) {
  db.prepare('DELETE FROM chord_catalog_signatures').run();
}

function clearFetchQueue(db) {
  db.prepare('DELETE FROM fetch_queue').run();
}

function upsertFetchQueueRow(db, row) {
  db.prepare(`
    INSERT INTO fetch_queue (slug, url, priority_score, signatures_covered, harvest_status, queued_at, fetched_at)
    VALUES (@slug, @url, @priority_score, @signatures_covered, @harvest_status, @queued_at, @fetched_at)
    ON CONFLICT(slug) DO UPDATE SET
      url = excluded.url,
      priority_score = excluded.priority_score,
      signatures_covered = excluded.signatures_covered,
      harvest_status = excluded.harvest_status,
      queued_at = excluded.queued_at,
      fetched_at = excluded.fetched_at
  `).run(row);
}

function listFetchQueuePending(db, limit = 50) {
  return db.prepare(`
    SELECT slug, url, priority_score, signatures_covered
    FROM fetch_queue
    WHERE harvest_status = 'pending'
    ORDER BY priority_score DESC
    LIMIT ?
  `).all(limit);
}

function setFetchQueueStatus(db, slug, status, fetchedAt = null) {
  db.prepare(`
    UPDATE fetch_queue SET harvest_status = ?, fetched_at = COALESCE(?, fetched_at) WHERE slug = ?
  `).run(status, fetchedAt, slug);
}

function getErrorCatalogStats(db) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM chord_catalog_signatures) AS signatures,
      (SELECT COUNT(*) FROM fetch_queue) AS fetch_queued,
      (SELECT COUNT(*) FROM fetch_queue WHERE harvest_status = 'full') AS fetch_done,
      (SELECT COUNT(*) FROM engine_errors) AS errors_total,
      (SELECT COUNT(*) FROM engine_errors WHERE failure_class = 'engine' AND notes_ok = 0) AS engine_fails,
      (SELECT COUNT(*) FROM engine_error_signatures) AS error_signatures
  `).get();
}

function queryTopErrorSignatures(db, { limit = 20, failureClass = 'engine' } = {}) {
  return db.prepare(`
    SELECT ees.*, ee.chord_json, ee.key_json, ee.truth_roman, ee.eng_roman,
      ee.truth_letter, ee.eng_letter, ee.slug, ee.section_name, ee.beat
    FROM engine_error_signatures ees
    LEFT JOIN engine_errors ee ON ee.id = ees.example_id
    WHERE ees.engine_fail_count > 0
    ORDER BY ees.engine_fail_count DESC
    LIMIT ?
  `).all(limit);
}

function mapChordDbEntryToEngineError(entry) {
  const chord = entry.chord || {};
  const { chordSignature } = require('./chordSignature');
  return {
    id: entry.id,
    slug: entry.song,
    section_name: entry.section,
    beat: entry.beat ?? 0,
    signature: chordSignature(chord),
    mod_signature: sigOf(chord),
    chord_json: JSON.stringify(chord),
    key_json: JSON.stringify(entry.key || null),
    truth_roman: entry.truthRoman ?? null,
    truth_letter: entry.truthLetter ?? null,
    truth_pcs_json: JSON.stringify(entry.truthPcs ?? null),
    eng_roman: entry.engRoman ?? null,
    eng_letter: entry.engLetter ?? null,
    eng_pcs_json: JSON.stringify(entry.engPcs ?? null),
    eng_notes_json: JSON.stringify(entry.engNotes ?? null),
    notes_ok: entry.notesOk ? 1 : 0,
    failure_class: entry.failureClass ?? null,
    failure_flags_json: JSON.stringify(entry.flags || {}),
    engine_error: null,
    compared_at: nowIso(),
  };
}

module.exports = {
  ENGINE_ERROR_DDL,
  ensureEngineErrorTables,
  entryFromCompare,
  upsertEngineError,
  deleteEngineErrorsForSlug,
  rebuildErrorSignatures,
  upsertSignatureRow,
  clearSignatureIndex,
  clearFetchQueue,
  upsertFetchQueueRow,
  listFetchQueuePending,
  setFetchQueueStatus,
  getErrorCatalogStats,
  queryTopErrorSignatures,
  mapChordDbEntryToEngineError,
};
