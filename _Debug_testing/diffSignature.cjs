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
 *
 * Tokens: type=N inv=N applied bor=NAME|custom sus=.. alt=.. add=.. omit=..
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { tokens: [], all: false, db: 'chord_db_corpus4', limit: 12 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--db') out.db = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]) || 12;
    else out.tokens.push(a);
  }
  return out;
}

function sigOf(c) {
  const parts = [];
  parts.push('type=' + (c.type ?? 5));
  if (c.inversion) parts.push('inv=' + c.inversion);
  if (c.applied) parts.push('applied');
  if (Array.isArray(c.borrowed)) parts.push('bor=custom');
  else if (c.borrowed) parts.push('bor=' + c.borrowed);
  if (c.suspensions && c.suspensions.length) parts.push('sus=' + c.suspensions.join('&'));
  if (c.alterations && c.alterations.length) parts.push('alt=' + c.alterations.join('&'));
  if (c.adds && c.adds.length) parts.push('add=' + c.adds.join('&'));
  if (c.omits && c.omits.length) parts.push('omit=' + c.omits.join('&'));
  return parts.join(' ');
}

function tokenMatch(c, token) {
  const t = token.toLowerCase();
  if (t === 'applied') return !!c.applied;
  if (t.startsWith('type=')) return String(c.type ?? 5) === t.slice(5);
  if (t.startsWith('inv=')) return String(c.inversion ?? 0) === t.slice(4);
  if (t.startsWith('bor=')) {
    const v = t.slice(4);
    if (v === 'custom') return Array.isArray(c.borrowed);
    return String(c.borrowed || '').toLowerCase() === v;
  }
  if (t.startsWith('sus=')) return (c.suspensions || []).join('&') === t.slice(4);
  if (t.startsWith('alt=')) return (c.alterations || []).map(String).join('&').toLowerCase().includes(t.slice(4));
  if (t.startsWith('add=')) return (c.adds || []).join('&') === t.slice(4);
  if (t.startsWith('omit=')) return (c.omits || []).join('&') === t.slice(5);
  return false;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbDir = path.isAbsolute(args.db)
    ? args.db
    : path.join(__dirname, '..', '_Decode_oracle', args.db);
  const all = loadEntries(dbDir);
  let fails = all.filter((e) => !e.notesOk);
  if (!args.all) fails = fails.filter((e) => e.failureClass === 'engine');

  if (!args.tokens.length) {
    const bySig = new Map();
    for (const e of fails) {
      const s = sigOf(e.chord);
      bySig.set(s, (bySig.get(s) || 0) + 1);
    }
    const rows = [...bySig.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`${args.db}: ${all.length} chords, ${fails.length} ${args.all ? 'total' : 'engine'} failures`);
    console.log('\ncount  signature');
    for (const [s, n] of rows) console.log(String(n).padStart(5), s);
    return;
  }

  const rows = fails.filter((e) => args.tokens.every((t) => tokenMatch(e.chord, t)));
  console.log(`${rows.length} matches for [${args.tokens.join(' ')}] in ${args.db}\n`);
  for (const e of rows.slice(0, args.limit)) {
    console.log(e.id + '  (' + e.failureClass + ')');
    console.log('  truth ' + e.truthRoman + '  pcs=' + JSON.stringify(e.truthPcs) + '  bass=' + (e.truthBassPc ?? '?'));
    console.log('  eng   ' + e.engRoman + '  pcs=' + JSON.stringify(e.engPcs) + '  bass=' + (e.engBassPc ?? '?'));
    console.log('  key=' + JSON.stringify(e.key) + '  chord=' + JSON.stringify(e.chord));
    console.log('');
  }
}

main();
