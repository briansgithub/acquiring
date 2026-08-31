/**
 * Find alternative Hooktheory entries for broken/unplayable songs.
 *
 * Runs the local verify-playable sweep to find songs in the
 * harvest_stale_or_empty / dead_or_error buckets, then does ONE Meilisearch
 * lookup per song (via lib/altLookup.js -> lib/meiliClient.js) to see if the
 * song exists under a different artist/title spelling or URL. Sequential,
 * paced, and idempotent (skips songs already checked recently).
 *
 *   node cli/find-alternatives.js [--limit N] [--force] [--slugs a,b,c] [--out <dir>]
 */

const fs = require('fs');
const path = require('path');
const { openDb } = require('../lib/db');
const { verifyAll } = require('../lib/verifyPlayable');
const { searchAlternative } = require('../lib/altLookup');

const INTERVAL_MS = Number(process.env.ALT_LOOKUP_INTERVAL_MS || 1500);
const JITTER_MS = Number(process.env.ALT_LOOKUP_JITTER_MS || 500);
const RECHECK_DAYS = 30;

function parseArgs(argv) {
  const args = { limit: 0, force: false, slugs: null, out: process.env.ALT_LOOKUP_OUT || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i]) || 0;
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--slugs') args.slugs = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickTargets(db, args) {
  if (args.slugs) {
    const placeholders = args.slugs.map(() => '?').join(',');
    return db.prepare(`SELECT slug, artist, title, alt_checked_at FROM songs WHERE slug IN (${placeholders})`).all(...args.slugs);
  }

  const { results } = verifyAll(db);
  const cutoff = Date.now() - RECHECK_DAYS * 24 * 60 * 60 * 1000;
  let targets = results.filter((r) =>
    (r.bucket === 'harvest_stale_or_empty' || r.bucket === 'dead_or_error')
    && !r.slug.startsWith('test-'));

  if (!args.force) {
    const checkedAt = new Map(
      db.prepare('SELECT slug, alt_checked_at FROM songs').all().map((r) => [r.slug, r.alt_checked_at]),
    );
    targets = targets.filter((r) => {
      const checked = checkedAt.get(r.slug);
      if (!checked) return true;
      return new Date(checked).getTime() < cutoff;
    });
  }

  if (args.limit > 0) targets = targets.slice(0, args.limit);
  return targets;
}

/**
 * Slugs we already hold a processed, playable copy of. A candidate hitting
 * this set needs no harvest at all — the dead entry is just a duplicate of a
 * song already in the library.
 */
function loadPlayableSlugs(db) {
  return new Set(
    db.prepare('SELECT slug FROM songs WHERE cache_dir IS NOT NULL AND processed_at IS NOT NULL')
      .all().map((r) => r.slug),
  );
}

function saveCandidates(db, slug, candidates) {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM alt_candidates WHERE slug = ?').run(slug);
    candidates.forEach((c, i) => {
      db.prepare(`
        INSERT INTO alt_candidates (slug, candidate_rank, candidate_artist, candidate_title, candidate_url, candidate_slug, score, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(slug, i + 1, c.artist, c.title, c.url, c.slug, c.score, now);
    });
    db.prepare('UPDATE songs SET alt_checked_at = ? WHERE slug = ?').run(now, slug);
  });
  tx();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = openDb();
  const targets = pickTargets(db, args);

  console.log(`=== Alternative-entry lookup ===`);
  console.log(`Targets: ${targets.length}${args.limit ? ` (limited to ${args.limit})` : ''}`);

  const playableSlugs = loadPlayableSlugs(db);
  let checked = 0;
  let withCandidate = 0;
  let duplicateOfExisting = 0;
  let errors = 0;
  const alternatives = [];

  for (const row of targets) {
    try {
      const candidates = await searchAlternative({ slug: row.slug, artist: row.artist, title: row.title });
      for (const c of candidates) c.alreadyPlayable = playableSlugs.has(c.slug);
      saveCandidates(db, row.slug, candidates);
      checked += 1;
      if (candidates.length > 0) {
        withCandidate += 1;
        const resolution = candidates[0].alreadyPlayable ? 'duplicate' : 'harvestable';
        if (resolution === 'duplicate') duplicateOfExisting += 1;
        alternatives.push({ slug: row.slug, artist: row.artist, title: row.title, resolution, candidates });
      }
    } catch (err) {
      errors += 1;
      console.error(`  error for ${row.slug}: ${err.message}`);
    }

    if (checked % 50 === 0) {
      console.log(`  progress: ${checked}/${targets.length} checked, ${withCandidate} with candidate, ${errors} errors`);
    }

    await sleep(INTERVAL_MS + Math.random() * JITTER_MS);
  }

  db.close();

  console.log(`\nDone. Checked ${checked}, found candidates for ${withCandidate}`
    + ` (${duplicateOfExisting} duplicates of songs we already have,`
    + ` ${withCandidate - duplicateOfExisting} harvestable), errors ${errors}.`);

  if (args.out) {
    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
      path.join(args.out, 'alt-lookup-summary.json'),
      JSON.stringify({
        total: targets.length, checked, withCandidate, duplicateOfExisting,
        harvestable: withCandidate - duplicateOfExisting,
        errors, generatedAt: new Date().toISOString(),
      }, null, 2),
    );
    fs.writeFileSync(path.join(args.out, 'alt-candidates.json'), JSON.stringify(alternatives, null, 2));
    console.log(`Output written to: ${args.out}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main, pickTargets, saveCandidates };
