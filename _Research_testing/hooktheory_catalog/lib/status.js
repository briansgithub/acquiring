/**
 * Catalog status CLI.
 *   node _Research_testing/hooktheory_catalog/status.js
 */

const fs = require('fs');
const { openDb, getCatalogStatus, listSongs } = require('./db');
const { STATE_FILE } = require('./update');

/**
 * Most recent run of each discovery channel.
 *
 * Answers "when did we last actually look, and what did we find" — without it a
 * channel that has silently stopped discovering anything looks identical to one
 * that is simply up to date.
 */
function listChannelRuns(db) {
  return db.prepare(`
    SELECT r.mode, r.started_at, r.finished_at, r.new_count, r.error_count
    FROM discovery_runs r
    JOIN (SELECT mode, MAX(id) AS id FROM discovery_runs GROUP BY mode) latest
      ON latest.id = r.id
    ORDER BY r.started_at DESC
  `).all();
}

function ageLabel(iso) {
  if (!iso) return 'never';
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (!Number.isFinite(days)) return 'unknown';
  if (days < 1) return `${Math.round(days * 24)}h ago`;
  return `${days.toFixed(1)}d ago`;
}

function main() {
  const db = openDb();
  const status = getCatalogStatus(db);
  const top = listSongs(db, { limit: 10, orderBy: 'complexity_rating' });
  const channels = listChannelRuns(db);
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : null;

  console.log('=== Hooktheory Catalog Status ===');
  console.log('Totals:', status.totals);

  console.log('\nDiscovery channels (last run):');
  if (!channels.length) {
    console.log('  (none recorded yet — run `node cli/sync-catalog.js`)');
  } else {
    for (const c of channels) {
      const state = c.finished_at ? '' : ' [did not finish]';
      console.log(`  ${String(c.mode).padEnd(18)} ${ageLabel(c.started_at).padEnd(10)} new=${c.new_count ?? 0} errors=${c.error_count ?? 0}${state}`);
    }
  }
  if (status.lastRun) {
    console.log('Last run:', {
      id: status.lastRun.id,
      mode: status.lastRun.mode,
      started: status.lastRun.started_at,
      finished: status.lastRun.finished_at,
      new: status.lastRun.new_count,
      enriched: status.lastRun.enriched_count,
      errors: status.lastRun.error_count,
    });
  }
  if (state) console.log('Update state:', { running: state.running, updatedAt: state.updatedAt });
  console.log('\nTop by complexity_rating:');
  for (const row of top) {
    console.log(`  ${row.complexity_rating ?? '-'} | ${row.artist} - ${row.title} | chords=${row.unique_chords} trans=${row.unique_transitions}`);
  }
}


module.exports = { main };
