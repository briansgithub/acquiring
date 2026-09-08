/**
 * Build catalog metadata from a harvested scrape.json (no browser/network).
 */

const { parseSectionPayload, aggregateSongFromSections } = require('./songDataAggregate');
const { resolveComplexityRating, getCorpusBounds } = require('./complexity');
const { preferDisplayName } = require('./catalogDisplayNames');
const {
  saveSections,
  saveStats,
  saveDetails,
  saveMetrics,
  setSongStatus,
} = require('./db');

async function prepareMetadataFromHarvest(harvest, db) {
  const { scrape } = harvest;
  const metrics = scrape.metrics || {};
  const difficulty_label = scrape.difficulty_label || null;

  const parsedSections = await Promise.all(
    (scrape.sections || []).map(async (sec) => {
      if (!sec.json || !sec.songId) return null;
      return parseSectionPayload(sec.name, sec.songId, sec.json);
    }),
  );

  const valid = parsedSections.filter(Boolean);
  if (!valid.length) throw new Error('harvest has no section json for metadata');

  const { stats, details, sectionsForDb } = aggregateSongFromSections(valid);
  const bounds = getCorpusBounds(db);
  const { complexity_rating, metrics_source } = resolveComplexityRating(metrics, stats, bounds);

  return {
    metrics,
    difficulty_label,
    stats,
    details,
    sectionsForDb,
    complexity_rating,
    metrics_source,
  };
}

function commitMetadata(db, slug, prep) {
  saveSections(db, slug, prep.sectionsForDb);
  saveStats(db, slug, prep.stats);
  saveDetails(db, slug, prep.details);
  saveMetrics(db, slug, prep.metrics, prep.complexity_rating, prep.metrics_source);
  const song = db.prepare('SELECT title, title_slug FROM songs WHERE slug = ?').get(slug);
  if (song && prep.details.hooktheory_song_name) {
    const title = preferDisplayName(song.title, prep.details.hooktheory_song_name, song.title_slug);
    db.prepare('UPDATE songs SET title = ? WHERE slug = ?').run(title || null, slug);
  }
  if (prep.difficulty_label) {
    db.prepare('UPDATE songs SET difficulty_label = ? WHERE slug = ?')
      .run(prep.difficulty_label, slug);
  }
  setSongStatus(db, slug, 'enriched');
}

module.exports = { prepareMetadataFromHarvest, commitMetadata };
