/**
 * Pipeline flag helpers for unified library rows.
 */

function computeFlags(row) {
  return {
    catalogued: true,
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
  if (!flags.catalogued) missing.push('catalogued');
  if (!flags.metadata) missing.push('metadata');
  if (!flags.processed) missing.push('processed');
  return missing;
}

module.exports = { computeFlags, canLoad, loadGateMissing };
