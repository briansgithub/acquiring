/**
 * Enrich catalog songs: resolve songIds, fetch API chord data, parse SongMetrics.
 */

const { fetchSongData } = require('./api/hooktheoryApi');
const { extractChordAndMelodyObjects } = require('./dataExtractor');
const {
  openDb,
  saveMetrics,
  saveStats,
  saveDetails,
  saveSections,
  setSongStatus,
  listPendingSongs,
} = require('./db');
const { parseMetricsFromHtml } = require('./metricsParse');
const { parseSectionPayload, aggregateSongFromSections } = require('./songDataAggregate');
const { resolveComplexityRating, getCorpusBounds } = require('./complexity');
const { launchBrowser, loadTheoryTabPage } = require('./theoryTabSections');

async function fetchSectionData(songId, prefetched) {
  const body = prefetched?.get(songId) || await fetchSongData(songId);
  return extractChordAndMelodyObjects(body);
}

async function enrichSong(db, song, opts = {}) {
  const { slug, url } = song;
  const { browser = null, corpusBounds = null } = opts;
  const bounds = corpusBounds ?? getCorpusBounds(db);

  try {
    const { html, sections: sectionIds, prefetched } = await loadTheoryTabPage(url, browser);
    if (!sectionIds.length) throw new Error('No section songIds resolved');

    const { metrics, difficulty_label, complete } = parseMetricsFromHtml(html);

    const parsedSections = [];
    for (const sec of sectionIds) {
      const data = await fetchSectionData(sec.song_id, prefetched);
      parsedSections.push(parseSectionPayload(sec.section_name, sec.song_id, data));
    }

    const { stats, details, sectionsForDb } = aggregateSongFromSections(parsedSections);
    const { complexity_rating, metrics_source } = resolveComplexityRating(metrics, stats, bounds);

    saveSections(db, slug, sectionsForDb);
    saveStats(db, slug, stats);
    saveDetails(db, slug, details);
    saveMetrics(db, slug, metrics, complexity_rating, metrics_source);

    if (difficulty_label) {
      db.prepare('UPDATE songs SET difficulty_label = ? WHERE slug = ?').run(difficulty_label, slug);
    }

    setSongStatus(db, slug, 'enriched');
    return {
      slug,
      ok: true,
      metricsComplete: complete,
      stats,
      details,
      complexity_rating,
      metrics_source,
    };
  } catch (e) {
    const status = e.status === 404 ? 'dead' : 'error';
    setSongStatus(db, slug, status, e.message);
    return { slug, ok: false, error: e.message, status };
  }
}

async function enrichNextPending(db, opts = {}) {
  const { browser = null, corpusBounds = null } = opts;
  const pending = listPendingSongs(db, 1);
  if (!pending.length) return { done: true, result: null };
  const song = pending[0];
  const result = await enrichSong(db, song, { browser, corpusBounds });
  return { done: false, result, song };
}

async function enrichSongs(db, songs, opts = {}) {
  const { browser = null, corpusBounds = null, onProgress = null } = opts;
  const bounds = corpusBounds ?? getCorpusBounds(db);
  const results = [];
  for (const song of songs) {
    const result = await enrichSong(db, song, { browser, corpusBounds: bounds });
    results.push(result);
    if (onProgress) onProgress(result);
  }
  return results;
}

async function enrichPending({ limit = 20, db = null, browser = null } = {}) {
  const database = db || openDb();
  const sharedBrowser = browser || await launchBrowser();
  const ownBrowser = !browser;
  const corpusBounds = getCorpusBounds(database);
  const results = [];

  try {
    for (let i = 0; i < limit; i++) {
      const { done, result } = await enrichNextPending(database, { browser: sharedBrowser, corpusBounds });
      if (done) break;
      results.push(result);
      console.log(`[enrich] ${result.slug} ${result.ok ? 'ok' : result.status}`);
    }
  } finally {
    if (ownBrowser) await sharedBrowser.close();
  }
  return results;
}

async function main() {
  const limit = Number(process.argv.find((a, i) => process.argv[i - 1] === '--limit') || 10);
  const results = await enrichPending({ limit });
  const ok = results.filter((r) => r.ok).length;
  console.log(`[enrich] done ${ok}/${results.length} ok`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  enrichSong,
  enrichPending,
  enrichNextPending,
  enrichSongs,
  loadTheoryTabPage,
  launchBrowser,
};
