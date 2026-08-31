const fs = require('fs');
const { resetPools } = require('../lib/api/rateLimitPool');
const { probePublic, probeTrends } = require('../lib/rateProbe');
const { dataPath } = require('../lib/paths');

function parseArgs(argv) {
  const out = { endpoint: 'public', requests: 30 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--endpoint') out.endpoint = argv[++i] || 'public';
    else if (argv[i] === '--requests') out.requests = Number(argv[++i]) || 30;
  }
  return out;
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
  const OUT = dataPath('rate_probe_results.json');
  let report = args.endpoint === 'trends'
    ? await probeTrends(args.requests)
    : await probePublic(args.requests);
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

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { main, parseArgs, projectHours };
