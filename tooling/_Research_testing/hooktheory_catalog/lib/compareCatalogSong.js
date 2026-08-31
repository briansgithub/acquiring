/**
 * Compare one harvest slug and upsert engine_errors rows.
 */

const { openDb } = require('./db');
const { loadSongCompare, enrichRowsWithKeys } = require('../../../_Decode_oracle/chord_db/collectSongs');
const { rowToEntry } = require('../../../_Decode_oracle/chord_db/chordEntry');
const {
  upsertEngineError,
  deleteEngineErrorsForSlug,
  mapChordDbEntryToEngineError,
} = require('./engineErrorDb');

async function compareSlugToDb(slug, db = null, { clearFirst = true } = {}) {
  const ownDb = !db;
  const conn = db || openDb();
  try {
    const { scrape, compareResult } = await loadSongCompare({ slug });
    if (clearFirst) deleteEngineErrorsForSlug(conn, slug);
    const pairs = enrichRowsWithKeys(slug, scrape, compareResult);
    let written = 0;
    for (const { row, ctx } of pairs) {
      const entry = rowToEntry(row, ctx);
      upsertEngineError(conn, mapChordDbEntryToEngineError(entry));
      written += 1;
    }
    return { slug, written, sections: compareResult.sections?.length || 0 };
  } finally {
    if (ownDb) conn.close();
  }
}

module.exports = { compareSlugToDb };
