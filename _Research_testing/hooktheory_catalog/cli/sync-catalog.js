/**
 * Find and add any songs on hooktheory.com that we don't already have.
 *
 * Safe to run on demand, as often as you like. Every request-costing step is
 * gated on work we haven't already done:
 *
 *   - Songs we already hold playable are skipped before any request
 *     (lightHarvest's queue filters `harvest_mode NOT IN light/blocked/full`).
 *   - A dead row is only re-queued when discovery supplies a different,
 *     stronger URL for the same canonical slug. Repeating the URL that already
 *     returned 404 remains a no-op.
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

function hasAuthorization(argv = process.argv.slice(2), env = process.env) {
  // Dry runs make no remote requests and remain available for inspection.
  if (argv.includes('--dry-run')) return true;
  return env.HOOKTHEORY_CATALOG_AUTHORIZED === '1';
}

if (require.main === module) {
  // --sync selects the live-discovery phases and keeps publishing opt-in;
  // everything else the user typed is passed straight through.
  if (!process.argv.includes('--sync')) process.argv.push('--sync');

  // Hooktheory's current Terms prohibit scraping/bulk download unless they
  // have expressly authorized it. Keep the implementation available for an
  // authorized project, but fail closed so a checkout or scheduled task can
  // never begin harvesting merely because the command was invoked.
  if (!hasAuthorization()) {
    console.error([
      'sync-catalog: remote discovery/harvest is disabled.',
      'Hooktheory authorization is required before this tool may access their catalog.',
      'After obtaining written data-license or API authorization, set',
      'HOOKTHEORY_CATALOG_AUTHORIZED=1 (or use Sync-Catalog.ps1 -ConfirmHooktheoryAuthorization).',
      'Use --dry-run to inspect the local plan without remote requests.',
    ].join('\n'));
    process.exit(2);
  }

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

  const run = process.argv.includes('--audit-unresolved')
    ? require('./reconcile-catalog').main(process.argv.slice(2))
    : process.argv.includes('--reconcile-unresolved')
      ? require('./reconcile-catalog').main(process.argv.slice(2))
      : main();

  run
    .then(() => { releaseLock(LOCK_FILE); })
    .catch((err) => {
      releaseLock(LOCK_FILE);
      console.error(err.stack || err.message);
      process.exit(1);
    });
}

module.exports = { hasAuthorization };
