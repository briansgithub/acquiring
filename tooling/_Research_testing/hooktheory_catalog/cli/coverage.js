/**
 * "Have we collected everything we can?"
 *
 * Reports a verdict rather than raw numbers, and is deliberate about the limit
 * of what it can claim. Absolute completeness is NOT knowable: Hooktheory
 * publishes no song total, and their search index has a measured hard ceiling
 * (~40.3k) that the Internet Archive channel beat by 1,415 songs. So this
 * answers "complete with respect to the channels we have", never "we have every
 * song on the site".
 *
 * What IS knowable, and checked here:
 *   1. every discovered song is resolved  (untried backlog == 0)
 *   2. the last full index walk found nothing new  (new_count == 0)
 *   3. the archive index is not stale
 *   4. the sync is actually still running on schedule
 *
 *   node cli/coverage.js
 */

const fs = require('fs');
const path = require('path');
const { openDb } = require('../lib/db');
const { countSongsNeedingLightHarvest } = require('../lib/lightHarvest');
const { dataPath } = require('../lib/paths');

const WAYBACK_CACHE = path.join(dataPath('.'), 'wayback', 'cdx_urls.txt');
const CDX_MAX_AGE_DAYS = Number(process.env.CDX_MAX_AGE_DAYS || 30);
const SYNC_STALE_DAYS = Number(process.env.SYNC_STALE_DAYS || 3);

function ageDays(iso) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? ms / 86400000 : Infinity;
}

function fmtAge(days) {
  if (!Number.isFinite(days)) return 'never';
  if (days < 1) return `${Math.round(days * 24)}h ago`;
  return `${days.toFixed(1)}d ago`;
}

function latestRuns(db) {
  return db.prepare(`
    SELECT r.mode, r.started_at, r.finished_at, r.new_count, r.error_count, r.notes
    FROM discovery_runs r
    JOIN (SELECT mode, MAX(id) AS id FROM discovery_runs GROUP BY mode) latest
      ON latest.id = r.id
  `).all();
}

function main() {
  const db = openDb();
  const problems = [];

  const t = db.prepare(`
    SELECT COUNT(*) total,
           SUM(CASE WHEN harvest_mode IS NOT NULL THEN 1 ELSE 0 END) harvested,
           SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) dead
    FROM songs
  `).get();
  const backlog = countSongsNeedingLightHarvest(db, { force: false });
  const runs = latestRuns(db);
  const byMode = Object.fromEntries(runs.map((r) => [r.mode, r]));
  db.close();

  console.log('=== Catalog coverage ===\n');
  console.log(`  total rows      ${t.total}`);
  console.log(`  harvested       ${t.harvested}`);
  console.log(`  confirmed dead  ${t.dead}`);
  console.log(`  untried backlog ${backlog}`);

  // The accounting must close. Drift means rows exist in a state the pipeline
  // does not know how to act on, which would silently never be harvested.
  const unaccounted = t.total - t.harvested - t.dead;
  if (unaccounted !== backlog) {
    problems.push(`row accounting does not close: ${t.total} total - ${t.harvested} harvested - ${t.dead} dead = ${unaccounted}, but the harvest queue reports ${backlog}`);
  }
  if (backlog > 0) {
    problems.push(`${backlog} discovered songs have never been attempted — run: node cli/sync-catalog.js`);
  }

  console.log('\n=== Channels ===\n');
  if (!runs.length) {
    problems.push('no discovery run has ever been recorded — run: node cli/sync-catalog.js');
    console.log('  (none recorded yet)');
  } else {
    for (const r of runs) {
      const unfinished = r.finished_at ? '' : '  [did not finish]';
      console.log(`  ${String(r.mode).padEnd(18)} ${fmtAge(ageDays(r.started_at)).padEnd(10)} new=${r.new_count ?? 0} errors=${r.error_count ?? 0}${unfinished}`);
    }
  }

  // Index exhaustion: a completed full walk that added nothing means the live
  // index holds no song we lack.
  const meili = byMode['meili-refresh'];
  let walkNote = '';
  if (meili) {
    let indexTotal = null;
    try { indexTotal = JSON.parse(meili.notes)?.indexTotal ?? null; } catch (_) {}
    console.log(`\n  live index size (last walk): ${indexTotal ?? 'unknown'}`);

    // Finding new songs is not a problem — they get harvested in the same run,
    // which the zero backlog above already confirms. The only thing that
    // undermines the verdict is a walk that never finished, because then the
    // index may still hold songs we have never seen.
    if (!meili.finished_at) {
      problems.push('the last index walk did not finish — it may not have seen the whole index; re-run: node cli/sync-catalog.js');
    } else {
      walkNote = (meili.new_count ?? 0) === 0
        ? 'and the last full index walk added nothing new.'
        : `and the last full index walk completed (it found ${meili.new_count}, since harvested).`;
    }
  } else {
    problems.push('the search index has never been walked — run: node cli/sync-catalog.js');
  }

  // Freshness of the archive channel, which is what covers the index's ceiling.
  const cdxAge = fs.existsSync(WAYBACK_CACHE) ? ageDays(fs.statSync(WAYBACK_CACHE).mtimeMs) : Infinity;
  console.log(`  archive index age          : ${fmtAge(cdxAge)}${cdxAge > CDX_MAX_AGE_DAYS ? '  [stale]' : ''}`);
  if (cdxAge > CDX_MAX_AGE_DAYS) {
    problems.push(`the archive index is older than ${CDX_MAX_AGE_DAYS}d — the next sync will re-pull it automatically`);
  }

  // The main risk of automating this: a scheduled task that quietly stopped
  // working looks exactly like a catalog that is simply up to date.
  const lastSync = runs.reduce((min, r) => Math.min(min, ageDays(r.started_at)), Infinity);
  if (lastSync > SYNC_STALE_DAYS) {
    const since = Number.isFinite(lastSync) ? `${lastSync.toFixed(1)}d` : 'ever';
    problems.push(`no sync has run in ${since} (threshold ${SYNC_STALE_DAYS}d) — is the scheduled task still registered? Check: Get-ScheduledTask SacredRingCatalogSync`);
  }

  console.log('\n=== Verdict ===\n');
  if (!problems.length) {
    console.log('  CAUGHT UP — every discovered song is resolved (harvested or confirmed dead),');
    console.log(`  ${walkNote}`);
  } else {
    console.log('  ACTION NEEDED:');
    for (const p of problems) console.log(`    - ${p}`);
  }

  console.log('\n  Note: this means complete relative to the channels we have, not');
  console.log('  "every song on hooktheory.com". Their search index has a measured');
  console.log('  ceiling (~40.3k) that the Internet Archive channel beat by 1,415');
  console.log('  songs, and no public total exists to check against.\n');

  process.exitCode = problems.length ? 1 : 0;
}

if (require.main === module) main();

module.exports = { main };
