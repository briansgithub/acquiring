#!/usr/bin/env node
/**
 * Watch fetch waves and emit fix briefs when a wave is ready_for_fix.
 * Run in a separate terminal while runFetchDaemon / batchFullFetch runs.
 *
 *   node _Debug_testing/watchFetchWaves.mjs
 *   node _Debug_testing/watchFetchWaves.mjs --once
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { spawn } from 'child_process';

const require = createRequire(import.meta.url);
const { WAVE_MANIFEST, listWavesNotAcknowledged, ackWaveFix } = require('../_Research_testing/hooktheory_catalog/lib/fetchWaveManifest.js');

function parseArgs(argv) {
  const out = { once: false, pollMs: 15000, limit: 15 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--once') out.once = true;
    else if (argv[i] === '--poll-ms') out.pollMs = Number(argv[++i]) || 15000;
    else if (argv[i] === '--limit') out.limit = Number(argv[++i]) || 15;
  }
  return out;
}

function emitFixBrief(wave, limit) {
  const outFile = path.join('_Debug_testing', `top_errors_${wave.id}.md`);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['_Debug_testing/queryTopErrors.mjs', '--limit', String(limit), '--out', outFile],
      { cwd: process.cwd(), stdio: 'inherit', shell: false },
    );
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`\n>>> Wave ${wave.id} READY FOR FIX`);
        console.log(`    slugs=${wave.slugs?.length ?? 0} ok=${wave.ok} engineFails=${wave.engineFails}`);
        console.log(`    brief: ${outFile}`);
        console.log('    Pause fetch:  touch sacred_ring_data/catalog/.fetch_pause_for_fix');
        console.log('    Resume fetch: del sacred_ring_data/catalog/.fetch_pause_for_fix');
        console.log('    After fix:    node cli/batchCompareCatalog.js --wave <wave-id> --resync\n');
        resolve(outFile);
      } else reject(new Error(`queryTopErrors exited ${code}`));
    });
  });
}

async function poll(opts) {
  const seen = new Set(
    JSON.parse(fs.existsSync(WAVE_MANIFEST) ? fs.readFileSync(WAVE_MANIFEST, 'utf8') : '{"waves":[]}')
      .waves.filter((w) => w.fixAckAt).map((w) => w.id),
  );

  const tick = async () => {
    const ready = listWavesNotAcknowledged();
    for (const wave of ready) {
      if (seen.has(wave.id)) continue;
      seen.add(wave.id);
      await emitFixBrief(wave, opts.limit);
      ackWaveFix(wave.id);
    }
  };

  await tick();
  if (opts.once) return;

  setInterval(() => { tick().catch(console.error); }, opts.pollMs);
  console.log(`[watchFetchWaves] polling every ${opts.pollMs}ms`);
}

poll(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error(err);
  process.exit(1);
});
