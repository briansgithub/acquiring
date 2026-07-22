#!/usr/bin/env node
/**
 * Continuous fetch daemon — runs waves back-to-back; each wave signals ready_for_fix.
 * Fetch pauses while sacred_ring_data/catalog/.fetch_pause_for_fix exists (for engine edits).
 *
 *   node cli/runFetchDaemon.js --wave-size 20
 *   node cli/runFetchDaemon.js --wave-size 50 --max-waves 10
 */

const { openDb } = require('../lib/db');
const { runFetchWave } = require('../lib/runFetchWave');
const { shouldStop } = require('../lib/fullFetchState');
const { listFetchQueuePending } = require('../lib/engineErrorDb');

function parseArgs(argv) {
  const out = { waveSize: 20, maxWaves: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--wave-size') out.waveSize = Number(argv[++i]) || 20;
    else if (argv[i] === '--max-waves') out.maxWaves = Number(argv[++i]) || 0;
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = openDb();
  let waveNum = 0;

  console.log(`[runFetchDaemon] wave-size=${opts.waveSize} max-waves=${opts.maxWaves || '∞'}`);

  while (!shouldStop()) {
    const pending = listFetchQueuePending(db, 1);
    if (!pending.length) {
      console.log('[runFetchDaemon] queue empty');
      break;
    }
    if (opts.maxWaves && waveNum >= opts.maxWaves) {
      console.log('[runFetchDaemon] max-waves reached');
      break;
    }

    waveNum += 1;
    const waveId = `wave-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${waveNum}`;
    await runFetchWave(db, { limit: opts.waveSize, waveId });
  }

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
