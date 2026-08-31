#!/usr/bin/env node
/**
 * buildChordDb.js — full rebuild of modification-indexed chord ground-truth database.
 *
 * For incremental adds/removes, prefer updateChordDb.js instead.
 *
 *   node _Decode_oracle/buildChordDb.js
 *   node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus2.json --db-dir _Decode_oracle/chord_db_corpus2
 *   node _Decode_oracle/buildChordDb.js --use-reports   # skip re-compare if report complete
 */

const path = require('path');
const { buildChordDatabase } = require('./chord_db/buildDb');
const { writeDatabase, configureDbDir } = require('./chord_db/writeOutput');

async function main() {
  const args = process.argv.slice(2);
  let corpusFile = null;
  let useReports = false;
  let dbDir = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--corpus') corpusFile = path.resolve(args[++i]);
    else if (args[i] === '--use-reports') useReports = true;
    else if (args[i] === '--db-dir') dbDir = path.resolve(args[++i]);
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node buildChordDb.js [--corpus corpus.json] [--db-dir path] [--use-reports]');
      process.exit(0);
    }
  }
  if (dbDir) configureDbDir(dbDir);

  console.log('[buildChordDb] scanning sources…');
  const db = await buildChordDatabase({ corpusFile, useReports });
  console.log(`[buildChordDb] ${Array.isArray(db.meta.sources) ? db.meta.sources.length : db.meta.sources} songs, ${db.meta.totalChords} chords, ${db.byModification.size} buckets`);

  const { index, summary } = writeDatabase(db);
  const below = summary.below99.length;
  console.log(`[buildChordDb] wrote chord_db.json + ${db.byModification.size} shards`);
  console.log(`[buildChordDb] SUMMARY.md — ${below} buckets below 99% notesOk`);
  console.log(`[buildChordDb] worst: ${summary.rows.slice(0, 5).map((r) => `${r.mod}=${pct(r.notesOk, r.total)}`).join(', ')}`);
}

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(0)}%` : '-';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
