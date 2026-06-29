/**
 * Header-driven rate limit pools per hostname (X-Rate-Limit-*).
 */

const catalogConfig = require('../catalogConfig');

const pools = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getPool(hostname) {
  if (!pools.has(hostname)) {
    pools.set(hostname, {
      limit: null,
      remaining: null,
      resetAt: 0,
      lastRequestAt: 0,
      minIntervalMs: catalogConfig.minIntervalMs,
    });
  }
  return pools.get(hostname);
}

function parseRateHeaders(headers) {
  const limit = Number(headers['x-rate-limit-limit']);
  const remaining = Number(headers['x-rate-limit-remaining']);
  const resetSec = Number(headers['x-rate-limit-reset']);
  if (Number.isNaN(limit) && Number.isNaN(remaining)) return null;
  return {
    limit: Number.isNaN(limit) ? null : limit,
    remaining: Number.isNaN(remaining) ? null : remaining,
    resetSec: Number.isNaN(resetSec) ? 10 : resetSec,
  };
}

function updatePoolFromHeaders(hostname, headers) {
  const parsed = parseRateHeaders(headers);
  if (!parsed) return;
  const pool = getPool(hostname);
  pool.limit = parsed.limit;
  pool.remaining = parsed.remaining;
  if (parsed.remaining === 0) {
    pool.resetAt = Date.now() + parsed.resetSec * 1000;
  }
}

async function acquire(hostname) {
  const pool = getPool(hostname);
  const now = Date.now();

  if (pool.resetAt > now) {
    await sleep(pool.resetAt - now + 100);
  }

  const util = catalogConfig.apiUtilization || 0.8;
  const softCap = pool.limit ? Math.max(1, Math.floor(pool.limit * util)) : null;

  if (pool.remaining != null && pool.limit != null) {
    const used = pool.limit - pool.remaining;
    if (pool.remaining <= 0) {
      const wait = Math.max(pool.resetAt - now, catalogConfig.minIntervalMs);
      await sleep(wait);
    } else if (softCap != null && used >= softCap) {
      await sleep(Math.max(pool.resetAt - now, 1000));
    } else if (pool.remaining <= 2) {
      await sleep(1000);
    }
  } else {
    const wait = pool.lastRequestAt + pool.minIntervalMs - now;
    if (wait > 0) await sleep(wait);
  }

  pool.lastRequestAt = Date.now();
  if (pool.remaining != null && pool.remaining > 0) pool.remaining -= 1;
}

function resetPools() {
  pools.clear();
}

module.exports = {
  acquire,
  updatePoolFromHeaders,
  parseRateHeaders,
  getPool,
  resetPools,
};
