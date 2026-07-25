/**
 * Probe and recompute global max_shared_length from n-gram index.
 */

function recomputeMaxSharedLength(db) {
  const row = db.prepare(`
    SELECT MAX(length) AS max_len
    FROM (
      SELECT length, progression, search_mode, COUNT(DISTINCT slug) AS song_count
      FROM ngrams
      GROUP BY length, progression, search_mode
      HAVING song_count >= 2
    )
  `).get();
  return row?.max_len ?? 0;
}

function hasSharedProgressionAtLength(db, length) {
  const row = db.prepare(`
    SELECT 1 AS ok
    FROM ngrams
    WHERE length = ?
    GROUP BY progression, search_mode
    HAVING COUNT(DISTINCT slug) >= 2
    LIMIT 1
  `).get(length);
  return Boolean(row);
}

function findCrossSongMatch(db, { searchMode, length, progression, excludeSlug }) {
  const row = db.prepare(`
    SELECT 1 AS ok FROM ngrams
    WHERE search_mode = ? AND length = ? AND progression = ?
      AND slug != ?
    LIMIT 1
  `).get(searchMode, length, progression, excludeSlug);
  return Boolean(row);
}

function collectProbeProgressions(windows, length) {
  const set = new Set();
  for (const w of windows) {
    if (w.length === length) set.add(`${w.search_mode}\x00${w.progression}`);
  }
  return set;
}

function probeWindowsForNewSharedLength(db, windows, excludeSlug, currentMax) {
  const probeLen = currentMax + 1;
  const candidates = collectProbeProgressions(windows, probeLen);
  for (const key of candidates) {
    const sep = key.indexOf('\x00');
    const searchMode = key.slice(0, sep);
    const progression = key.slice(sep + 1);
    if (findCrossSongMatch(db, {
      searchMode,
      length: probeLen,
      progression,
      excludeSlug,
    })) {
      return probeLen;
    }
  }
  return null;
}

module.exports = {
  recomputeMaxSharedLength,
  hasSharedProgressionAtLength,
  findCrossSongMatch,
  probeWindowsForNewSharedLength,
  collectProbeProgressions,
};
