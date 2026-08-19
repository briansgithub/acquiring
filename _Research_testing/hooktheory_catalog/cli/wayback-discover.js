/**
 * Find TheoryTab songs our catalog is missing, using the Internet Archive as
 * the discovery source instead of Hooktheory's own search index.
 *
 * Re-runnable by design. The songs table is the ledger: any slug already in it
 * — playable, blocked, or dead — is skipped, so a second run only spends
 * hooktheory.com requests on URLs that are genuinely new since last time.
 * Candidate enumeration itself costs hooktheory.com nothing (archive.org only).
 *
 *   node cli/wayback-discover.js --pull            # refresh archive.org cache (0 HT requests)
 *   node cli/wayback-discover.js --diff            # report what's new (0 HT requests, no writes)
 *   node cli/wayback-discover.js --ingest          # queue new candidates into songs
 *   node cli/wayback-discover.js --harvest         # politely harvest the queue
 *   node cli/wayback-discover.js --all             # pull -> diff -> ingest -> harvest
 */

const fs = require('fs');
const path = require('path');
const { openDb, reconcileSong } = require('../lib/db');
const { pullAllCdx, buildCandidates } = require('../lib/waybackDiscover');
const { parseTheoryTabUrl } = require('../lib/catalogUtils');
const { runLightCatalog } = require('../lib/lightCatalog');

const OUT_DIR = process.env.WAYBACK_OUT_DIR
  || path.join(require('../lib/paths').dataPath('.'), 'wayback');
const CACHE_FILE = path.join(OUT_DIR, 'cdx_urls.txt');

function parseArgs(argv) {
  const a = {
    pull: false, diff: false, ingest: false, harvest: false, force: false, limit: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--pull') a.pull = true;
    else if (f === '--diff') a.diff = true;
    else if (f === '--ingest') a.ingest = true;
    else if (f === '--harvest') a.harvest = true;
    else if (f === '--force') a.force = true;
    else if (f === '--limit') a.limit = Number(argv[++i]) || 0;
    else if (f === '--all') { a.pull = true; a.diff = true; a.ingest = true; a.harvest = true; }
  }
  if (!a.pull && !a.diff && !a.ingest && !a.harvest) a.diff = true;
  return a;
}

function loadKnownSongs(db) {
  return new Map(db.prepare('SELECT * FROM songs').all().map((r) => [r.slug, r]));
}

function loadCachedUrls() {
  if (!fs.existsSync(CACHE_FILE)) return [];
  return fs.readFileSync(CACHE_FILE, 'utf8').split('\n').filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (args.pull) {
    console.log('=== Pulling archive.org CDX index (0 hooktheory.com requests) ===');
    await pullAllCdx(CACHE_FILE, {
      force: args.force,
      onProgress: (p) => {
        if (p.stage === 'pagecount') {
          console.log(`  ${p.pageCount} CDX pages; cache has ${p.cachedUrls} urls from ${p.cachedPages} pages already`);
        } else if (p.page % 5 === 0) {
          console.log(`  page ${p.page}/${p.pageCount} — ${p.totalUrls} unique urls`);
        }
      },
    });
    console.log(`  cache written: ${CACHE_FILE}`);
  }

  const rawUrls = loadCachedUrls();
  if (!rawUrls.length) {
    console.error('No cached CDX urls. Run with --pull first.');
    process.exit(1);
  }

  const db = openDb();
  const knownSongs = loadKnownSongs(db);
  const { candidates, stats } = buildCandidates(rawUrls, knownSongs);

  console.log('\n=== Candidate analysis (local only, 0 requests) ===');
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(16)} ${v}`);

  fs.writeFileSync(path.join(OUT_DIR, 'candidates.json'), JSON.stringify(candidates, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'candidate-stats.json'), JSON.stringify(stats, null, 2));
  console.log(`  wrote ${candidates.length} candidates to ${path.join(OUT_DIR, 'candidates.json')}`);

  if (args.ingest && candidates.length) {
    const slice = args.limit > 0 ? candidates.slice(0, args.limit) : candidates;
    console.log(`\n=== Ingesting ${slice.length} candidates into songs (status=pending) ===`);
    const actions = { inserted: 0, updated: 0, revived: 0, unchanged: 0, conflict: 0 };
    const tx = db.transaction((rows) => {
      for (const c of rows) {
        const parsed = parseTheoryTabUrl(c.url);
        if (!parsed) continue;
        const result = reconcileSong(db, {
          ...parsed, discovery_source: 'wayback', url_source: 'observed',
        });
        actions[result.action] = (actions[result.action] || 0) + 1;
      }
    });
    tx(slice);
    console.log(`  reconciled: ${JSON.stringify(actions)}`);
  }

  db.close();

  if (args.harvest) {
    console.log('\n=== Harvesting queue (honest UA, adaptive pacing, skips known/dead) ===');
    // The light-harvest queue already excludes status='dead' and anything with
    // harvest_mode set, so verified-working songs are never re-fetched.
    await runLightCatalog({ harvestOnly: true, limit: args.limit || 0, force: false });
  }

  console.log('\nDone.');
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { main, parseArgs };
