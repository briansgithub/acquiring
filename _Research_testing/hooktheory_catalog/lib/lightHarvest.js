/**
 * API-only light harvest: public API jsonData per section, optional HTML metrics.
 */

const fs = require('fs');
const { fetchSongData, fetchHtml } = require('./api/hooktheoryApi');
const { extractChordAndMelodyObjects } = require('./dataExtractor');
const { parseMetricsFromHtml } = require('./metricsParse');
const { listSectionsForSlug, setHarvestMode, markLightHarvestBlocked } = require('./db');
const { isJunkUrl } = require('./catalogUtils');
const {
  harvestDirForSlug,
  harvestFileForSlug,
  harvestOk,
} = require('./harvestArtifact');
const { runLocalsParallel } = require('./runLocalsParallel');
const { ensureSectionsResolved, isPublicSongId } = require('./sectionResolve');

async function fetchSectionJson(songId) {
  const body = await fetchSongData(songId);
  return extractChordAndMelodyObjects(body);
}

async function harvestLightSong(db, slug, url, { fetchMetrics = true, browser = null } = {}) {
  const modeRow = db.prepare('SELECT harvest_mode FROM songs WHERE slug = ?').get(slug);
  if (modeRow?.harvest_mode === 'full') {
    return { slug, skipped: true, reason: 'full_fetch_complete' };
  }

  if (!url || isJunkUrl(url)) {
    markLightHarvestBlocked(db, slug, 'invalid or junk URL');
    throw Object.assign(new Error('invalid or junk URL'), { permanent: true });
  }

  const sections = await ensureSectionsResolved(db, slug, url, { browser });
  if (!sections.length) {
    markLightHarvestBlocked(db, slug, 'no resolvable sections');
    throw Object.assign(new Error('no resolvable sections'), { permanent: true });
  }

  const dir = harvestDirForSlug(slug);
  fs.mkdirSync(dir, { recursive: true });

  const scrape = {
    url,
    title: null,
    harvestMode: 'light',
    sections: [],
    errors: [],
  };

  for (const sec of sections) {
    if (!isPublicSongId(sec.song_id)) {
      scrape.errors.push(`${sec.section_name}: invalid stub id ${sec.song_id}`);
      continue;
    }
    try {
      const json = await fetchSectionJson(sec.song_id);
      scrape.sections.push({
        name: sec.section_name,
        songId: sec.song_id,
        json,
        rendered: [],
        strips: [],
      });
    } catch (e) {
      scrape.errors.push(`${sec.section_name}/${sec.song_id}: ${e.message}`);
    }
  }

  if (!scrape.sections.length) {
    const err = scrape.errors.join('; ') || 'no sections fetched';
    markLightHarvestBlocked(db, slug, err);
    throw new Error(err);
  }

  if (fetchMetrics && url) {
    try {
      const html = await fetchHtml(url);
      const { metrics, difficulty_label } = parseMetricsFromHtml(html);
      scrape.metrics = metrics;
      scrape.difficulty_label = difficulty_label || null;
    } catch (e) {
      scrape.errors.push(`metrics html: ${e.message}`);
    }
  }

  scrape.harvestedAt = new Date().toISOString();
  const scrapeFile = harvestFileForSlug(slug);
  fs.writeFileSync(scrapeFile, JSON.stringify(scrape, null, 2));

  if (!harvestOk(scrape)) {
    markLightHarvestBlocked(db, slug, 'light harvest artifact invalid');
    throw new Error('light harvest artifact invalid');
  }

  setHarvestMode(db, slug, 'light');
  await runLocalsParallel(db, slug, { includeTested: false });

  return { slug, path: scrapeFile, sectionCount: scrape.sections.length, errors: scrape.errors };
}

const HARVEST_QUEUE_FILTER = `
  AND s.url IS NOT NULL
  AND (s.status IS NULL OR s.status != 'dead')
  AND (s.harvest_mode IS NULL OR s.harvest_mode NOT IN ('light', 'blocked', 'full'))
`;

function countSongsNeedingLightHarvest(db, { force = false } = {}) {
  if (force) {
    return db.prepare(`
      SELECT COUNT(*) AS n FROM songs s
      WHERE s.url IS NOT NULL
        AND (s.status IS NULL OR s.status != 'dead')
        AND (s.harvest_mode IS NULL OR s.harvest_mode NOT IN ('light', 'full'))
    `).get().n;
  }
  return db.prepare(`
    SELECT COUNT(*) AS n FROM songs s
    WHERE 1=1 ${HARVEST_QUEUE_FILTER}
  `).get().n;
}

function listSongsNeedingLightHarvest(db, limit = 50, { force = false, slugs = null, skipSlugs = null } = {}) {
  const harvestFilter = force
    ? "AND (s.harvest_mode IS NULL OR s.harvest_mode NOT IN ('light', 'full'))"
    : "AND (s.harvest_mode IS NULL OR s.harvest_mode NOT IN ('light', 'blocked', 'full'))";

  const skip = skipSlugs?.length ? skipSlugs : [];
  const skipClause = skip.length
    ? `AND s.slug NOT IN (${skip.map(() => '?').join(',')})`
    : '';

  if (slugs?.length) {
    const placeholders = slugs.map(() => '?').join(',');
    return db.prepare(`
      SELECT s.slug, s.url, s.artist, s.title
      FROM songs s
      WHERE s.slug IN (${placeholders}) AND s.url IS NOT NULL
        AND (s.status IS NULL OR s.status != 'dead')
        ${harvestFilter}
        ${skipClause}
      ORDER BY s.first_seen_at
      LIMIT ?
    `).all(...slugs, ...skip, limit);
  }

  return db.prepare(`
    SELECT s.slug, s.url, s.artist, s.title
    FROM songs s
    WHERE s.url IS NOT NULL
      AND (s.status IS NULL OR s.status != 'dead')
      ${harvestFilter}
      ${skipClause}
    ORDER BY s.first_seen_at
    LIMIT ?
  `).all(...skip, limit);
}

module.exports = {
  harvestLightSong,
  countSongsNeedingLightHarvest,
  listSongsNeedingLightHarvest,
};
