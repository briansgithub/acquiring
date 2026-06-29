/**
 * Catalog status CLI.
 *   node _Research_testing/hooktheory_catalog/status.js
 */

const fs = require('fs');
const { openDb, getCatalogStatus, listSongs } = require('./db');
const { STATE_FILE } = require('./update');

function main() {
  const db = openDb();
  const status = getCatalogStatus(db);
  const top = listSongs(db, { limit: 10, orderBy: 'complexity_rating' });
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : null;

  console.log('=== Hooktheory Catalog Status ===');
  console.log('Totals:', status.totals);
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
