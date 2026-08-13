/**
 * Find and add any songs on hooktheory.com that we don't already have.
 *
 * Safe to run on demand, as often as you like. Every request-costing step is
 * gated on work we haven't already done:
 *
 *   - Songs we already hold playable are skipped before any request
 *     (lightHarvest's queue filters `harvest_mode NOT IN light/blocked/full`).
 *   - Links already confirmed dead are skipped permanently
 *     (same filter excludes `status='dead'`; candidate diffing compares against
 *     every known slug, dead ones included).
 *   - The Internet Archive index is only re-pulled once it goes stale, and
 *     costs hooktheory.com nothing when it is.
 *
 * So a second run immediately after a first does almost no network work.
 *
 *   node cli/sync-catalog.js                  # update the database only
 *   node cli/sync-catalog.js --publish        # ...and ship the Android asset
 *   node cli/sync-catalog.js --dry-run        # report only, zero requests
 *   node cli/sync-catalog.js --with-artist-sweep   # add the slow, low-yield channel
 *   node cli/sync-catalog.js --cdx-max-age-days 7  # re-pull the archive sooner
 *   node cli/sync-catalog.js --resume         # continue an interrupted sync
 */

const { main } = require('./overnight-run');
const { acquireLock, releaseLock } = require('../lib/runGuard');
const { dataPath } = require('../lib/paths');

const LOCK_FILE = dataPath('.sync_lock');

if (require.main === module) {
  // --sync selects the live-discovery phases and keeps publishing opt-in;
  // everything else the user typed is passed straight through.
  if (!process.argv.includes('--sync')) process.argv.push('--sync');

  // Once this is on a daily timer, overlapping a manual run is a matter of
  // when, not if — and two orchestrators sharing a catalog and phase ledger
  // corrupt silently rather than failing loudly.
  const lock = acquireLock(LOCK_FILE, { label: 'sync-catalog' });
  if (!lock.acquired) {
    const h = lock.holder || {};
    console.log(`sync-catalog: already running (pid ${h.pid}, started ${h.startedAt}) — nothing to do.`);
    // Exit 0 deliberately: a skipped overlapping run is correct behaviour, and
    // a non-zero code would make Task Scheduler report a failed run.
    process.exit(0);
  }

  main()
    .then(() => { releaseLock(LOCK_FILE); })
    .catch((err) => {
      releaseLock(LOCK_FILE);
      console.error(err.stack || err.message);
      process.exit(1);
    });
}
