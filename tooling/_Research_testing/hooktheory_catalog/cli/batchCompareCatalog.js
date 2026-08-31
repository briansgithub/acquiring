#!/usr/bin/env node
/**
 * Batch compare full-harvest songs into engine_errors + rollup.
 *
 *   node cli/batchCompareCatalog.js
 *   node cli/batchCompareCatalog.js --resync
 *   node cli/batchCompareCatalog.js --wave wave-2026-01-01T12-00-00-1 --resync
 */

const { openDb } = require('../lib/db');
const { discoverAllScrapeDirs } = require('../lib/harvestPaths');
const { rebuildErrorSignatures, getErrorCatalogStats } = require('../lib/engineErrorDb');
const { compareSlugToDb } = require('../lib/compareCatalogSong');

function parseArgs(argv) {
  const out = { resync: false, slugs: null, limit: 0, wave: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--resync') out.resync = true;
    else if (argv[i] === '--limit') out.limit = Number(argv[++i]) || 0;
    else if (argv[i] === '--wave') out.wave = argv[++i];
    else if (argv[i] === '--slugs') {
      out.slugs = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = openDb();

  let slugs = opts.slugs;
  if (opts.wave) {
    const { readManifest } = require('../lib/fetchWaveManifest');
    const wave = readManifest().waves.find((w) => w.id === opts.wave);
    if (!wave?.slugs?.length) {
      console.error(`[batchCompareCatalog] wave not found or empty: ${opts.wave}`);
      process.exit(1);
    }
    slugs = wave.slugs;
  }
  if (!slugs) {
    slugs = discoverAllScrapeDirs({ fullTruthOnly: true }).map((d) => d.slug);
  }
  if (opts.limit) slugs = slugs.slice(0, opts.limit);

  console.log(`[batchCompareCatalog] comparing ${slugs.length} slugs`);
  let totalRows = 0;
  let fails = 0;

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    try {
      const res = await compareSlugToDb(slug, db, { clearFirst: opts.resync || true });
      totalRows += res.written;
      if ((i + 1) % 50 === 0 || i + 1 === slugs.length) {
        console.log(`  …${i + 1}/${slugs.length} (${totalRows} chord rows)`);
      }
    } catch (e) {
      fails += 1;
      console.warn(`  skip ${slug}: ${e.message}`);
    }
  }

  const sigCount = rebuildErrorSignatures(db);
  const stats = getErrorCatalogStats(db);
  console.log('[batchCompareCatalog] done', {
    slugs: slugs.length,
    failSlugs: fails,
    chordRows: totalRows,
    errorSignatures: sigCount,
    engineFails: stats.engine_fails,
  });
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
