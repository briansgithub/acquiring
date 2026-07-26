/**
 * Progression search API facade.
 */

const { openProgressionDb } = require('./progressionDb');
const { buildSearchQuery } = require('./queryBuilder');
const { listFilters } = require('./filterRegistry');
const { getMaxSharedLength } = require('./progressionDb');

function parseMetadata(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function searchProgressions(opts, db = null) {
  const pDb = db || openProgressionDb();
  const shouldClose = !db;
  try {
    const { sql, params, progression, length, mode } = buildSearchQuery(opts, pDb);
    const rows = pDb.prepare(sql).all(...params);
    const songCount = rows.length
      ? rows[0].song_count
      : 0;
    return {
      mode,
      progression,
      length,
      songCount,
      maxSharedLength: getMaxSharedLength(pDb),
      results: rows.map((r) => ({
        slug: r.slug,
        sectionType: r.section_type,
        startPosition: r.start_position,
        beatDuration: r.beat_duration,
        attributeFlags: r.attribute_flags,
        metadata: parseMetadata(r.metadata),
        songCount: r.song_count,
      })),
    };
  } finally {
    if (shouldClose) pDb.close();
  }
}

function getProgressionIndexStatus(db = null) {
  const pDb = db || openProgressionDb();
  const shouldClose = !db;
  try {
    const counts = pDb.prepare(`
      SELECT search_mode, COUNT(*) AS ngrams, COUNT(DISTINCT slug) AS songs
      FROM ngrams GROUP BY search_mode
    `).all();
    const total = pDb.prepare('SELECT COUNT(*) AS c FROM ngrams').get()?.c ?? 0;
    return {
      maxSharedLength: getMaxSharedLength(pDb),
      totalNgrams: total,
      byMode: counts,
      filters: listFilters(),
    };
  } finally {
    if (shouldClose) pDb.close();
  }
}

module.exports = {
  searchProgressions,
  getProgressionIndexStatus,
  listFilters,
};
