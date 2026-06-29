/**
 * API-only light harvest: public API jsonData per section, optional HTML metrics.
 */

const fs = require('fs');
const { fetchSongData, fetchHtml } = require('./api/hooktheoryApi');
const { extractChordAndMelodyObjects } = require('./dataExtractor');
const { parseMetricsFromHtml } = require('./metricsParse');
const { listSectionsForSlug, setHarvestMode } = require('./db');
const {
  harvestDirForSlug,
  harvestFileForSlug,
  harvestOk,
} = require('./harvestArtifact');
const { runLocalsParallel } = require('./runLocalsParallel');

async function fetchSectionJson(songId) {
  const body = await fetchSongData(songId);
  return extractChordAndMelodyObjects(body);
}

async function harvestLightSong(db, slug, url, { fetchMetrics = true } = {}) {
  const sections = listSectionsForSlug(db, slug);
  if (!sections.length) {
    throw new Error(`no section song_ids for ${slug} — run Meili discovery first`);
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
    throw new Error(scrape.errors.join('; ') || 'no sections fetched');
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
    throw new Error('light harvest artifact invalid');
  }

  setHarvestMode(db, slug, 'light');
  await runLocalsParallel(db, slug, { includeTested: false });

  return { slug, path: scrapeFile, sectionCount: scrape.sections.length };
}

function countSongsNeedingLightHarvest(db, { force = false } = {}) {
  if (force) {
    return db.prepare(`
      SELECT COUNT(DISTINCT s.slug) AS n
      FROM songs s
      INNER JOIN song_sections ss ON ss.slug = s.slug
      WHERE s.url IS NOT NULL
    `).get().n;
  }
  return db.prepare(`
    SELECT COUNT(DISTINCT s.slug) AS n
    FROM songs s
    INNER JOIN song_sections ss ON ss.slug = s.slug
    WHERE s.url IS NOT NULL
      AND (s.harvest_mode IS NULL OR s.harvest_mode != 'light')
  `).get().n;
}

function listSongsNeedingLightHarvest(db, limit = 50, { force = false, slugs = null } = {}) {
  if (slugs?.length) {
    const placeholders = slugs.map(() => '?').join(',');
    return db.prepare(`
      SELECT DISTINCT s.slug, s.url, s.artist, s.title
      FROM songs s
      INNER JOIN song_sections ss ON ss.slug = s.slug
      WHERE s.slug IN (${placeholders}) AND s.url IS NOT NULL
      ORDER BY s.first_seen_at
      LIMIT ?
    `).all(...slugs, limit);
  }

  const filter = force
    ? ''
    : "AND (s.harvest_mode IS NULL OR s.harvest_mode != 'light')";

  return db.prepare(`
    SELECT DISTINCT s.slug, s.url, s.artist, s.title
    FROM songs s
    INNER JOIN song_sections ss ON ss.slug = s.slug
    WHERE s.url IS NOT NULL ${filter}
    ORDER BY s.first_seen_at
    LIMIT ?
  `).all(limit);
}

module.exports = {
  harvestLightSong,
  countSongsNeedingLightHarvest,
  listSongsNeedingLightHarvest,
};
