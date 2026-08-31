/**
 * Overnight sync: full Meili re-discovery -> revive falsely-dead songs ->
 * drain the light-harvest queue -> re-verify -> regenerate the Android asset
 * -> publish it to the GitHub Release. Runs unattended; every phase logs to
 * both stdout and a persistent log file so progress can be checked mid-run.
 *
 *   node cli/overnight-sync.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { openDb } = require('../lib/db');
const { discoverFromMeili } = require('../lib/discover');
const { verifyAll } = require('../lib/verifyPlayable');
const { runLightCatalog } = require('../lib/lightCatalog');

const OUT_DIR = process.env.SYNC_OUT_DIR
  || 'C:/Users/user1/AppData/Local/Temp/claude/H--Desktop-3-sacred-ring/8a46d0f0-6c48-45a0-95a5-f2bed8200104/scratchpad/overnight-sync';
const LOG_FILE = path.join(OUT_DIR, 'sync.log');
const REPO_ROOT = path.join(__dirname, '../../../..');
const CATALOG_ROOT = path.join(__dirname, '..');

const GH_REPO = 'briansgithub/acquiring';
const GH_TAG = 'v1.0.0-data';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function phaseDiscovery(db) {
  log('=== Phase 1: full Meilisearch re-discovery ===');
  const beforeSlugs = new Set(db.prepare('SELECT slug FROM songs').all().map((r) => r.slug));
  const beforeDeadSlugs = new Set(
    db.prepare("SELECT slug FROM songs WHERE status = 'dead'").all().map((r) => r.slug),
  );

  const result = await discoverFromMeili(0, 0, ({ page, offset, uniqueCount }) => {
    if (page % 10 === 0) log(`  discovery page=${page} offset=${offset} unique=${uniqueCount}`);
  }, db);

  const discoveredSlugs = new Set(result.entries.map((e) => e.slug));
  const newSlugs = [...discoveredSlugs].filter((s) => !beforeSlugs.has(s));

  log(`Discovery complete: ${result.uniqueSongs} unique songs in index, ${newSlugs.length} new to our catalog`);

  // Revival via "present in Meili's empty-query pagination" was tried and
  // measured: on 2026-08-10/11, 5,098 previously-dead slugs matched this way
  // and ALL 5,098 came back 404 on real refetch (0% hit rate) — burning
  // ~1.7 hours of harvest budget for zero recoveries. Verdict: Meili's index
  // is stale-inclusive (it doesn't purge deleted TheoryTabs), so "present in
  // the index" is not evidence of liveness for a slug we already confirmed
  // dead. Not attempting revival via this channel again — see the
  // hooktheory-enumeration-channels investigation for what actually works.
  const stillDeadInIndex = [...beforeDeadSlugs].filter((s) => discoveredSlugs.has(s)).length;
  log(`${stillDeadInIndex} of ${beforeDeadSlugs.size} dead slugs still appear in the Meili index (known stale signal — not revived, not re-attempted)`);

  fs.writeFileSync(path.join(OUT_DIR, 'discovery-diff.json'), JSON.stringify({
    indexTotal: result.uniqueSongs,
    newSlugs,
    generatedAt: new Date().toISOString(),
  }, null, 2));

  return { newCount: newSlugs.length };
}

async function phaseHarvest() {
  log('=== Phase 2: drain light-harvest queue (new + revived songs) ===');
  await runLightCatalog({ harvestOnly: true, limit: 0, force: false });
  log('Harvest queue drained (or stopped/errored — check light_catalog.log for detail)');
}

function phaseVerify() {
  log('=== Phase 3: re-verify playable status ===');
  const db = openDb();
  const { counts, total, mismatchCount } = verifyAll(db);
  db.close();
  log(`Verify complete: total=${total} counts=${JSON.stringify(counts)} mismatches=${mismatchCount}`);
  fs.writeFileSync(path.join(OUT_DIR, 'post-sync-verify.json'), JSON.stringify({ total, counts, mismatchCount }, null, 2));
  return counts;
}

function phaseExport() {
  log('=== Phase 4: regenerate android/catalog.db.gz ===');
  const outBuf = execFileSync('node', ['scripts/exportFullHarvestedRoomDatabase.js'], {
    cwd: CATALOG_ROOT,
    encoding: 'utf8',
  });
  log(outBuf.trim().split('\n').slice(-3).join(' | '));
}

function phasePublish() {
  log('=== Phase 5: publish to GitHub Release ===');
  const assetPath = path.join(REPO_ROOT, 'android', 'catalog.db.gz');
  if (!fs.existsSync(assetPath)) throw new Error(`Missing asset at ${assetPath}`);

  const sizeMb = (fs.statSync(assetPath).size / (1024 * 1024)).toFixed(1);
  log(`Uploading ${assetPath} (${sizeMb} MB) to ${GH_REPO}@${GH_TAG} (clobber existing)`);

  const out = execFileSync('gh', [
    'release', 'upload', GH_TAG, assetPath,
    '--repo', GH_REPO, '--clobber',
  ], { encoding: 'utf8' });
  log(`gh release upload output: ${out.trim()}`);
  log('Publish complete.');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  log('=== Overnight sync started ===');

  if (process.argv.includes('--publish-only')) {
    phasePublish();
    log('=== Overnight sync finished (publish-only) ===');
    return;
  }

  const db = openDb();
  let discoveryStats;
  try {
    discoveryStats = await phaseDiscovery(db);
  } finally {
    db.close();
  }

  if (discoveryStats.newCount === 0) {
    log('Nothing new to harvest — skipping harvest/export/publish phases.');
  } else {
    await phaseHarvest();
    phaseVerify();
    phaseExport();
    phasePublish();
  }

  log('=== Overnight sync finished ===');
}

if (require.main === module) {
  main().catch((err) => {
    log(`FATAL: ${err.stack || err.message}`);
    process.exit(1);
  });
}

module.exports = { main };
