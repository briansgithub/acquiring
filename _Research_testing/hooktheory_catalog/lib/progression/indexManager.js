/**
 * Dynamic n-gram index management: add/delete songs, max_shared_length.
 */

const { openDb } = require('../db');
const {
  openProgressionDb,
  getMaxSharedLength,
  setMaxSharedLength,
  bulkInsertNgrams,
} = require('./progressionDb');
const {
  normalizeSection,
  ngramRowFromWindow,
  PROBE_CAP,
} = require('./normalize');
const {
  hasSharedProgressionAtLength,
  recomputeMaxSharedLength,
} = require('./sharedLength');
const { loadSectionsFromCache } = require('./sectionLoader');

let catalogDbMemo = null;
let progressionDbMemo = null;

function getCatalogDb() {
  if (!catalogDbMemo) catalogDbMemo = openDb();
  return catalogDbMemo;
}

function getProgressionDb() {
  if (!progressionDbMemo) progressionDbMemo = openProgressionDb();
  return progressionDbMemo;
}

function closeProgressionDb() {
  if (progressionDbMemo) {
    progressionDbMemo.close();
    progressionDbMemo = null;
  }
}

async function normalizeSongSections(sections, maxLen) {
  const allWindows = [];
  for (const { sectionType, data } of sections) {
    const windows = await normalizeSection(data, { maxLen });
    for (const w of windows) allWindows.push({ sectionType, window: w });
  }
  return allWindows;
}

function toNgramRows(slug, flatWindows, maxLen = PROBE_CAP) {
  const rows = [];
  for (const { sectionType, window } of flatWindows) {
    if (maxLen > 0 && window.length > maxLen) continue;
    rows.push(ngramRowFromWindow(slug, sectionType, window));
  }
  return rows;
}

function pruneAboveMax(progDb, maxLen) {
  if (maxLen < 1) return 0;
  return progDb.prepare('DELETE FROM ngrams WHERE length > ?').run(maxLen).changes;
}

function reindexMaxFromData(progDb) {
  const max = recomputeMaxSharedLength(progDb);
  setMaxSharedLength(progDb, max);
  pruneAboveMax(progDb, max);
  return max;
}

async function addSong(slug, sections = null, { catalogDb, progDb } = {}) {
  const catDb = catalogDb || getCatalogDb();
  const pDb = progDb || getProgressionDb();
  const row = catDb.prepare('SELECT slug, cache_dir FROM songs WHERE slug = ?').get(slug);
  if (!row?.cache_dir) {
    return { ok: false, error: 'song not processed or missing cache_dir' };
  }

  const sectionPayloads = sections || loadSectionsFromCache(row.cache_dir);
  if (!sectionPayloads.length) {
    return { ok: false, error: 'no sections in cache' };
  }

  pDb.prepare('DELETE FROM ngrams WHERE slug = ?').run(slug);

  const flatAll = await normalizeSongSections(sectionPayloads, PROBE_CAP);
  const rows = toNgramRows(slug, flatAll, PROBE_CAP);
  bulkInsertNgrams(pDb, rows);

  const newMax = reindexMaxFromData(pDb);

  return { ok: true, slug, maxSharedLength: newMax, ngramCount: rows.length };
}

async function deleteSong(slug, { progDb } = {}) {
  const pDb = progDb || getProgressionDb();
  pDb.prepare('DELETE FROM ngrams WHERE slug = ?').run(slug);

  let max = getMaxSharedLength(pDb);
  let pruned = 0;
  while (max > 0 && !hasSharedProgressionAtLength(pDb, max)) {
    pruned += pDb.prepare('DELETE FROM ngrams WHERE length = ?').run(max).changes;
    max -= 1;
    setMaxSharedLength(pDb, max);
  }
  pruned += pruneAboveMax(pDb, max);

  return { ok: true, slug, maxSharedLength: max, prunedRows: pruned };
}

module.exports = {
  getCatalogDb,
  getProgressionDb,
  closeProgressionDb,
  addSong,
  deleteSong,
  reindexMaxFromData,
  normalizeSongSections,
  toNgramRows,
  pruneAboveMax,
};
