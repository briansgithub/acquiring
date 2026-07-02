/**
 * Pipeline flag helpers for unified library rows.
 */

const { isHarvested, loadHarvest, isLightHarvest } = require('./harvestArtifact');

/** Any harvest artifact on disk (light or full browser scrape). */
function hasHarvestArtifact(slug) {
  return slug ? isHarvested(slug) : false;
}

/** Full Puppeteer Fetch completed — not light-catalog API harvest. */
function isFullFetch(row, slug) {
  if (!slug || !hasHarvestArtifact(slug)) return false;
  if (row.harvest_mode === 'light') return false;
  if (row.harvest_mode === 'full') return true;
  const harvest = loadHarvest(slug);
  if (harvest && isLightHarvest(harvest.scrape)) return false;
  return true;
}

function computeFlags(row, slug) {
  const scrapeReady = hasHarvestArtifact(slug);
  return {
    catalogued: true,
    /** UI "Fetch" — true only after full browser scrape. */
    harvested: isFullFetch(row, slug),
    /** Harvest artifact exists (enables Test even when only light-catalogged). */
    scrapeReady,
    harvestMode: row.harvest_mode || null,
    metadata: row.status === 'enriched',
    processed: !!(row.cache_dir && row.processed_at),
    tested: !!row.oracle_tested_at,
  };
}

function canLoad(flags) {
  return flags.catalogued && flags.metadata && flags.processed;
}

function loadGateMissing(flags) {
  const missing = [];
  if (!flags.metadata) missing.push('metadata');
  if (!flags.processed) missing.push('processed');
  return missing;
}

module.exports = {
  computeFlags,
  canLoad,
  loadGateMissing,
  hasHarvestArtifact,
  isFullFetch,
};
