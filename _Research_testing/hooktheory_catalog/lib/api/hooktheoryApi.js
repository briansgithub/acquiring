/**
 * Rate-limited HTTP helpers for Hooktheory APIs and pages.
 */

const https = require('https');
const catalogConfig = require('../catalogConfig');
const { acquire, updatePoolFromHeaders } = require('./rateLimitPool');

const MIN_INTERVAL_MS = catalogConfig.minIntervalMs;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(hostname = 'api.hooktheory.com') {
  await acquire(hostname);
}

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': catalogConfig.userAgent,
        Accept: 'application/json',
        ...options.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data,
        hostname: u.hostname,
      }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function fetchWithRetry(url, options = {}, retries = 4) {
  const hostname = new URL(url).hostname;
  let delay = MIN_INTERVAL_MS;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await acquire(hostname);
    const res = await httpsRequest(url, options);
    updatePoolFromHeaders(hostname, res.headers);

    if (res.status === 429 || res.status >= 500) {
      const resetSec = Number(res.headers['x-rate-limit-reset']) || 0;
      const retryAfter = Number(res.headers['retry-after']) || 0;
      const waitMs = Math.max(resetSec * 1000, retryAfter * 1000, delay);
      if (attempt === retries) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
      }
      await sleep(Math.min(waitMs, catalogConfig.maxBackoffMs));
      delay = Math.min(delay * 2, catalogConfig.maxBackoffMs);
      continue;
    }
    return res;
  }
  throw new Error(`fetchWithRetry exhausted for ${url}`);
}

async function fetchJson(url, options = {}) {
  const res = await fetchWithRetry(url, options);
  try {
    return { status: res.status, json: JSON.parse(res.body), headers: res.headers };
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${url}: ${e.message}`);
  }
}

async function fetchSongData(songId) {
  const apiUrl = `https://api.hooktheory.com/v1/songs/public/${songId}?fields=ID,xmlData,song,jsonData`;
  const { status, json } = await fetchJson(apiUrl);
  if (status >= 400) throw new Error(`API ${status} for songId ${songId}`);
  return json;
}

async function fetchHtml(url) {
  const res = await fetchWithRetry(url);
  if (res.status >= 400) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.body;
}

module.exports = {
  MIN_INTERVAL_MS,
  throttle,
  fetchWithRetry,
  fetchJson,
  fetchSongData,
  fetchHtml,
  acquire,
  updatePoolFromHeaders,
};
