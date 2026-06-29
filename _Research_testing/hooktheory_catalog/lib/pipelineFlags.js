/**
 * Pipeline flag helpers for unified library rows.
 */

const { isHarvested } = require('./harvestArtifact');

function computeFlags(row, slug) {
  const harvested = slug ? isHarvested(slug) : false;
  return {
    catalogued: true,
    harvested,
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

module.exports = { computeFlags, canLoad, loadGateMissing };
