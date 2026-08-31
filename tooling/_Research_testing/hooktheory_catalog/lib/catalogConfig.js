/**
 * Catalog daemon configuration (env overrides).
 */

const config = {
  intervalMs: Number(process.env.CATALOG_INTERVAL_MS || 25000),
  jitterMs: Number(process.env.CATALOG_JITTER_MS || 3000),
  apiUtilization: Number(process.env.CATALOG_API_UTILIZATION || 0.8),
  maxBackoffMs: Number(process.env.CATALOG_MAX_BACKOFF_MS || 300_000),
  minIntervalMs: Number(process.env.CATALOG_MIN_INTERVAL_MS || 1000),
  userAgent: process.env.CATALOG_USER_AGENT
    || 'Mozilla/5.0 (compatible; SacredRingCatalog/1.0; +local-research)',
  batchLogEvery: Number(process.env.CATALOG_BATCH_LOG || 10),
  defaultMaxSongs: Number(process.env.CATALOG_MAX_SONGS || 0),
};

module.exports = config;
