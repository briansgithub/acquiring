/**
 * Re-harvest songs whose harvest_mode is already 'light' but whose artifact
 * has no real chord data (harvest_stale_or_empty bucket from verify-playable).
 * The normal light-catalog queue skips these on purpose (harvest_mode='light'
 * reads as "already done"), so this calls harvestLightSong directly.
 *
 *   node cli/reharvest-stale.js
 */

const { openDb } = require('../lib/db');
const { verifyAll } = require('../lib/verifyPlayable');
const { harvestLightSong } = require('../lib/lightHarvest');
const { launchBrowser } = require('../lib/theoryTabSections');
const { AdaptivePacer } = require('../lib/adaptivePacer');

const INTERVAL_MS = Number(process.env.LIGHT_CATALOG_INTERVAL_MS || 1200);
const JITTER_MS = Number(process.env.LIGHT_CATALOG_JITTER_MS || 400);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const args = { limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i]) || 0;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = openDb();
  const { results } = verifyAll(db);
  let targets = results.filter((r) => r.bucket === 'harvest_stale_or_empty' && !r.slug.startsWith('test-'));
  if (args.limit > 0) targets = targets.slice(0, args.limit);

  console.log(`=== Re-harvest stale ===\nTargets: ${targets.length}`);

  const pacer = new AdaptivePacer({
    baseMs: INTERVAL_MS,
    onChange: ({ direction, multiplier, intervalMs }) => {
      console.log(`  pacing ${direction === 'slower' ? 'SLOWED DOWN' : 'sped back up'}: ${multiplier}x (~${intervalMs}ms)`);
    },
  });

  const browser = await launchBrowser();
  let ok = 0;
  let failed = 0;

  try {
    for (const t of targets) {
      const row = db.prepare('SELECT url FROM songs WHERE slug = ?').get(t.slug);
      try {
        await harvestLightSong(db, t.slug, row.url, { browser });
        pacer.recordResult(null);
        ok += 1;
        console.log(`  ok ${t.slug} (${ok}/${targets.length})`);
      } catch (e) {
        pacer.recordResult(e);
        failed += 1;
        console.log(`  fail ${t.slug}: ${e.message}`);
      }
      await sleep(pacer.jittered(JITTER_MS));
    }
  } finally {
    await browser.close();
  }

  db.close();
  console.log(`\nDone. ok=${ok} failed=${failed}`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { main };
