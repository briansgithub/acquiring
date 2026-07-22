#!/usr/bin/env node
/**
 * diffSignature.js — fast truth-vs-engine PC diff for corpus4 engine failures.
 *
 * Reads the built chord_db_corpus4 shards (no scraping), filters to engine
 * failures matching a property predicate, and prints truth vs engine pitch-class
 * sets so engine fixes can be iterated quickly.
 *
 *   node _Debug_testing/diffSignature.js                 # summary of engine fails by signature
 *   node _Debug_testing/diffSignature.js type=7 inv=3    # rows where chord matches all tokens
 *   node _Debug_testing/diffSignature.js alt=b5 --all    # include non-engine failures too
 *   node _Debug_testing/diffSignature.js --db chord_db_corpus2 type=9
 *   node _Debug_testing/diffSignature.js --sql           # read from catalog engine_errors table
 *   node _Debug_testing/diffSignature.js --sql type=7 inv=3
 *
 * Tokens: type=N inv=N applied bor=NAME|custom sus=.. alt=.. add=.. omit=..
 */

const fs = require('fs');
const path = require('path');
const { sigOf, tokenMatch } = require('../_Research_testing/hooktheory_catalog/lib/modSignature');

function parseArgs(argv) {
  const out = { tokens: [], all: false, db: 'chord_db_corpus4', limit: 12, sql: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--sql') out.sql = true;
    else if (a === '--db') out.db = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]) || 12;
    else out.tokens.push(a);
  }
  return out;
}

function loadEntries(dbDir) {
  const shardDir = path.join(dbDir, 'byModification');
  const seen = new Map();
  for (const f of fs.readdirSync(shardDir)) {
    if (!f.endsWith('.json')) continue;
    for (const e of JSON.parse(fs.readFileSync(path.join(shardDir, f), 'utf8'))) {
      seen.set(e.id, e);
    }
  }
  return [...seen.values()];
}

function loadSqlEntries() {
  const { openDb } = require('../_Research_testing/hooktheory_catalog/lib/db');
  const db = openDb();
  const rows = db.prepare(`
    SELECT id, slug, section_name, beat, chord_json, key_json,
      truth_roman AS truthRoman, eng_roman AS engRoman,
      truth_pcs_json, eng_pcs_json, notes_ok, failure_class AS failureClass
    FROM engine_errors
  `).all();
  db.close();
  return rows.map((r) => ({
    id: r.id,
    song: r.slug,
    section: r.section_name,
    beat: r.beat,
    chord: JSON.parse(r.chord_json),
    key: r.key_json ? JSON.parse(r.key_json) : null,
    truthRoman: r.truthRoman,
    engRoman: r.engRoman,
    truthPcs: r.truth_pcs_json ? JSON.parse(r.truth_pcs_json) : null,
    engPcs: r.eng_pcs_json ? JSON.parse(r.eng_pcs_json) : null,
    notesOk: !!r.notes_ok,
    failureClass: r.failureClass,
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let all;
  let label;
  if (args.sql) {
    all = loadSqlEntries();
    label = 'engine_errors (SQL)';
  } else {
    const dbDir = path.isAbsolute(args.db)
      ? args.db
      : path.join(__dirname, '..', '_Decode_oracle', args.db);
    all = loadEntries(dbDir);
    label = args.db;
  }

  let fails = all.filter((e) => !e.notesOk);
  if (!args.all) fails = fails.filter((e) => e.failureClass === 'engine');

  if (!args.tokens.length) {
    const bySig = new Map();
    for (const e of fails) {
      const s = sigOf(e.chord);
      bySig.set(s, (bySig.get(s) || 0) + 1);
    }
    const rows = [...bySig.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`${label}: ${all.length} chords, ${fails.length} ${args.all ? 'total' : 'engine'} failures`);
    console.log('\ncount  signature');
    for (const [s, n] of rows) console.log(String(n).padStart(5), s);
    return;
  }

  const rows = fails.filter((e) => args.tokens.every((t) => tokenMatch(e.chord, t)));
  console.log(`${rows.length} matches for [${args.tokens.join(' ')}] in ${label}\n`);
  for (const e of rows.slice(0, args.limit)) {
    console.log(e.id + '  (' + e.failureClass + ')');
    console.log('  truth ' + e.truthRoman + '  pcs=' + JSON.stringify(e.truthPcs) + '  bass=' + (e.truthBassPc ?? '?'));
    console.log('  eng   ' + e.engRoman + '  pcs=' + JSON.stringify(e.engPcs) + '  bass=' + (e.engBassPc ?? '?'));
    console.log('  key=' + JSON.stringify(e.key) + '  chord=' + JSON.stringify(e.chord));
    console.log('');
  }
}

main();
