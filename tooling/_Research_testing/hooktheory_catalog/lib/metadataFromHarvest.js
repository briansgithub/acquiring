/**
 * Build catalog metadata from a harvested scrape.json (no browser/network).
 */

const { parseSectionPayload, aggregateSongFromSections } = require('./songDataAggregate');
const { resolveComplexityRating, getCorpusBounds } = require('./complexity');
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
  if (prep.difficulty_label) {
    db.prepare('UPDATE songs SET difficulty_label = ? WHERE slug = ?')
      .run(prep.difficulty_label, slug);
  }
  setSongStatus(db, slug, 'enriched');
}

module.exports = { prepareMetadataFromHarvest, commitMetadata };
