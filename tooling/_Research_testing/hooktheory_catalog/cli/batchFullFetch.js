#!/usr/bin/env node
/**
 * Rate-limited full Puppeteer fetch for fetch_queue pending slugs.
 * Compares each slug immediately so fixes can start before the wave ends.
 *
 *   node cli/batchFullFetch.js --limit 20
 *   node cli/batchFullFetch.js --limit 20 --wave-id wave-001
 */

const { openDb } = require('../lib/db');
const { runFetchWave } = require('../lib/runFetchWave');

function parseArgs(argv) {
  const out = { limit: 50, compare: true, waveId: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') out.limit = Number(argv[++i]) || 50;
    else if (argv[i] === '--no-compare') out.compare = false;
    else if (argv[i] === '--wave-id') out.waveId = argv[++i];
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = openDb();
  await runFetchWave(db, opts);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
