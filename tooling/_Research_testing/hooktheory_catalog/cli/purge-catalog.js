#!/usr/bin/env node
/**
 * Wipe all catalog song rows (and related tables). Does not delete playback cache or harvest files.
 *
 * Usage: node cli/purge-catalog.js [--yes]
 */

const { openDb } = require('../lib/db');

const TABLES = [
  'song_sections',
  'song_metrics',
  'song_stats',
  'song_details',
  'discovery_runs',
  'songs',
];

function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to purge without --yes');
    process.exit(1);
  }
  const db = openDb();
  const before = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
  for (const t of TABLES) {
    if (t === 'discovery_runs') {
      db.prepare('DELETE FROM discovery_runs').run();
    } else if (t === 'songs') {
      db.prepare('DELETE FROM songs').run();
    } else {
      db.prepare(`DELETE FROM ${t}`).run();
    }
  }
  const after = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
  console.log(JSON.stringify({ purged: before, remaining: after }, null, 2));
}

main();
