/**
 * Benchmark Hooktheory API rate limits.
 *   node rateProbe.js --endpoint public --requests 30
 *   node rateProbe.js --endpoint trends --requests 30
 */

const fs = require('fs');
const path = require('path');
const { resetPools } = require('./api/rateLimitPool');
const { fetchWithRetry } = require('./api/hooktheoryApi');
const { trendsNodes, getActivkey } = require('./trendsApi');

const { dataPath } = require('./paths');
const OUT = dataPath('rate_probe_results.json');
const SAMPLE_SONG_ID = 'KexEyqaKx_B';

function parseArgs(argv) {
  const out = { endpoint: 'public', requests: 30 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--endpoint') out.endpoint = argv[++i] || 'public';
    else if (argv[i] === '--requests') out.requests = Number(argv[++i]) || 30;
  }
  return out;
}

async function probePublic(n) {
  const url = `https://api.hooktheory.com/v1/songs/public/${SAMPLE_SONG_ID}?fields=ID`;
  const results = [];
  const start = Date.now();
  let errors429 = 0;
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    try {
      const res = await fetchWithRetry(url);
      results.push({
        i: i + 1,
        ms: Date.now() - t0,
        status: res.status,
        limit: res.headers['x-rate-limit-limit'],
        remaining: res.headers['x-rate-limit-remaining'],
        reset: res.headers['x-rate-limit-reset'],
      });
    } catch (e) {
      if (e.status === 429) errors429++;
      results.push({ i: i + 1, error: e.message, status: e.status });
    }
  }
  const elapsed = (Date.now() - start) / 1000;
  return { endpoint: 'public', requests: n, elapsedSec: elapsed, rps: n / elapsed, errors429, samples: results };
}

async function probeTrends(n) {
  await getActivkey();
  const results = [];
  const start = Date.now();
  let errors429 = 0;
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    try {
      await trendsNodes('');
      results.push({ i: i + 1, ms: Date.now() - t0 });
    } catch (e) {
      if (e.status === 429) errors429++;
      results.push({ i: i + 1, error: e.message, status: e.status });
    }
  }
  const elapsed = (Date.now() - start) / 1000;
  return { endpoint: 'trends', requests: n, elapsedSec: elapsed, rps: n / elapsed, errors429, samples: results };
}

function projectHours(report) {
  const songs = 50_000;
  const sectionsPerSong = 2.5;
  const apiCalls = songs * sectionsPerSong;
  const rps = report.rps || 1;
  return {
    songs,
    apiCalls,
    hoursAtObservedRps: apiCalls / rps / 3600,
    note: 'API-only; Puppeteer enrichment adds 12-25s per song',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  resetPools();

  let report;
  if (args.endpoint === 'trends') {
    report = await probeTrends(args.requests);
  } else {
    report = await probePublic(args.requests);
  }

  report.probedAt = new Date().toISOString();
  report.projection = projectHours(report);
  report.recommendedIntervalMs = report.errors429 > 0
    ? Math.ceil(10000 / 8)
    : Math.ceil(1000 / Math.max(report.rps * 0.8, 1));

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    endpoint: report.endpoint,
    rps: report.rps.toFixed(2),
    errors429: report.errors429,
    projection: report.projection,
    recommendedIntervalMs: report.recommendedIntervalMs,
    out: OUT,
  }, null, 2));
}


module.exports = { probePublic, probeTrends };
