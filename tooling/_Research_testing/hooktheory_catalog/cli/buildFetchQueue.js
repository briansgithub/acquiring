#!/usr/bin/env node
/**
 * Build prioritized fetch_queue via greedy signature covering set.
 *
 *   node cli/buildFetchQueue.js
 *   node cli/buildFetchQueue.js --cap 3000 --min-coverage 3
 */

const { openDb } = require('../lib/db');
const { discoverAllScrapeDirs } = require('../lib/harvestPaths');
const {
  clearFetchQueue,
  upsertFetchQueueRow,
  rebuildErrorSignatures,
} = require('../lib/engineErrorDb');
const { compareSlugToDb } = require('../lib/compareCatalogSong');

function parseArgs(argv) {
  const out = { cap: 3000, minCoverage: 3, seedCompare: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cap') out.cap = Number(argv[++i]) || 3000;
    else if (argv[i] === '--min-coverage') out.minCoverage = Number(argv[++i]) || 3;
    else if (argv[i] === '--no-seed') out.seedCompare = false;
  }
  return out;
}

function comparedCounts(db) {
  const rows = db.prepare(`
    SELECT mod_signature, COUNT(*) AS n
    FROM engine_errors
    WHERE mod_signature IS NOT NULL AND mod_signature != ''
    GROUP BY mod_signature
  `).all();
  const map = new Map();
  for (const r of rows) map.set(r.mod_signature, r.n);
  return map;
}

function signatureNeedsCoverage(sig, compared, minCoverage) {
  return (compared.get(sig.mod_signature) || 0) < minCoverage;
}

function uncoveredWeight(sig, compared, minCoverage) {
  if (!signatureNeedsCoverage(sig, compared, minCoverage)) return 0;
  const have = compared.get(sig.mod_signature) || 0;
  const need = minCoverage - have;
  return Math.min(need, sig.occurrence_count) * sig.occurrence_count;
}

async function seedExistingFullHarvest(db) {
  const dirs = discoverAllScrapeDirs({ fullTruthOnly: true });
  console.log(`[buildFetchQueue] seed compare: ${dirs.length} full-harvest slugs`);
  let total = 0;
  for (const ent of dirs) {
    const res = await compareSlugToDb(ent.slug, db);
    total += res.written;
  }
  rebuildErrorSignatures(db);
  console.log(`[buildFetchQueue] seed wrote ${total} compared chord rows`);
  return dirs.map((d) => d.slug);
}

function buildGreedyQueue(db, opts, existingFull) {
  const signatures = db.prepare(`
    SELECT signature, mod_signature, occurrence_count, sample_slugs_json, has_mods
    FROM chord_catalog_signatures
    WHERE has_mods = 1
    ORDER BY occurrence_count DESC
  `).all();

  if (!signatures.length) {
    console.warn('[buildFetchQueue] chord_catalog_signatures empty — run buildSignatureIndex first');
    return [];
  }

  const compared = comparedCounts(db);
  const existingSet = new Set(existingFull);
  const queued = new Map();
  const ts = new Date().toISOString();

  for (const slug of existingFull) {
    const url = db.prepare('SELECT url FROM songs WHERE slug = ?').get(slug)?.url;
    queued.set(slug, {
      slug,
      url: url || null,
      priority_score: 1e9,
      signatures_covered: 0,
      harvest_status: 'full',
      queued_at: ts,
      fetched_at: ts,
    });
  }

  const slugRefs = new Map();
  for (const sig of signatures) {
    let refs = [];
    try { refs = JSON.parse(sig.sample_slugs_json || '[]'); } catch (_) {}
    for (const ref of refs) {
      if (!ref.slug) continue;
      if (!slugRefs.has(ref.slug)) slugRefs.set(ref.slug, []);
      slugRefs.get(ref.slug).push(sig);
    }
  }

  while (queued.size < opts.cap) {
    const pendingSigs = signatures.filter((s) => signatureNeedsCoverage(s, compared, opts.minCoverage));
    if (!pendingSigs.length) break;

    let bestSlug = null;
    let bestScore = 0;
    let bestCovered = 0;
    for (const [slug, sigs] of slugRefs) {
      if (queued.has(slug) || existingSet.has(slug)) continue;
      let score = 0;
      let covered = 0;
      for (const sig of sigs) {
        const w = uncoveredWeight(sig, compared, opts.minCoverage);
        if (w > 0) {
          score += w;
          covered += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestSlug = slug;
        bestCovered = covered;
      }
    }
    if (!bestSlug || bestScore <= 0) break;

    const url = db.prepare('SELECT url FROM songs WHERE slug = ?').get(bestSlug)?.url;
    queued.set(bestSlug, {
      slug: bestSlug,
      url: url || null,
      priority_score: bestScore,
      signatures_covered: bestCovered,
      harvest_status: 'pending',
      queued_at: ts,
      fetched_at: null,
    });

    for (const sig of slugRefs.get(bestSlug) || []) {
      if (signatureNeedsCoverage(sig, compared, opts.minCoverage)) {
        compared.set(sig.mod_signature, opts.minCoverage);
      }
    }
  }

  return [...queued.values()];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = openDb();

  let existingFull = [];
  if (opts.seedCompare) {
    existingFull = await seedExistingFullHarvest(db);
  } else {
    existingFull = discoverAllScrapeDirs({ fullTruthOnly: true }).map((d) => d.slug);
  }

  const queue = buildGreedyQueue(db, opts, existingFull);
  clearFetchQueue(db);
  for (const row of queue) upsertFetchQueueRow(db, row);

  const pending = queue.filter((r) => r.harvest_status === 'pending').length;
  const full = queue.filter((r) => r.harvest_status === 'full').length;
  console.log(`[buildFetchQueue] queue: ${queue.length} total (${full} already full, ${pending} pending)`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
