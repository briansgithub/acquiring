#!/usr/bin/env node
/**
 * testModification.js — query / re-run one modification bucket at a time.
 *
 *   node _Decode_oracle/testModification.js --list
 *   node _Decode_oracle/testModification.js --failing
 *   node _Decode_oracle/testModification.js suspensions=4
 *   node _Decode_oracle/testModification.js adds=9 --rerun
 */

const { compareChord } = require('./compare');
const { runChord } = require('./engineRun');
const { parseLetter } = require('./svgTruth');
const { loadIndex, loadBucket, pct } = require('./chord_db/writeOutput');

function parseArgs(argv) {
  const out = { bucket: null, list: false, failing: false, rerun: false, threshold: 99 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--failing') out.failing = true;
    else if (a === '--rerun') out.rerun = true;
    else if (a === '--threshold') out.threshold = Number(argv[++i]) || 99;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-')) out.bucket = a;
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node testModification.js --list
  node testModification.js --failing [--threshold 99]
  node testModification.js <bucket> [--rerun]

Examples:
  node testModification.js suspensions=4
  node testModification.js adds=9 --rerun`);
}

function printBucketTable(buckets, { failingOnly = false, threshold = 99 } = {}) {
  const rows = Object.entries(buckets)
    .map(([mod, s]) => ({ mod, ...s }))
    .sort((a, b) => a.notesOkPct - b.notesOkPct || b.total - a.total);
  const filtered = failingOnly ? rows.filter((r) => r.notesOkPct < threshold) : rows;
  console.log(`\n${'Modification'.padEnd(28)} ${'count'.padStart(6)} ${'notesOk'.padStart(8)} ${'roman'.padStart(8)} ${'fail'.padStart(5)}`);
  console.log('-'.repeat(60));
  for (const r of filtered) {
    console.log(
      `${r.mod.padEnd(28)} ${String(r.total).padStart(6)} ${pct(r.notesOk, r.total).padStart(8)} ${pct(r.romanExact, r.total).padStart(8)} ${String(r.failing).padStart(5)}`,
    );
  }
  console.log(`\n${filtered.length} buckets${failingOnly ? ` below ${threshold}%` : ''}`);
}

async function rerunBucket(entries) {
  let pass = 0;
  const failures = [];
  for (const e of entries) {
    const mods = require('./truthLetterParse').mergeMods(e.truthLetter, e.truthRoman, e.chord);
    const halfDim = /ø/.test(e.truthRoman || '');
    const enrichedChord = {
      ...e.chord,
      adds: mods.adds,
      omits: mods.omits,
      alterations: mods.alterations,
      suspensions: mods.suspensions,
      type: mods.type,
      halfDim,
    };
    const eng = await runChord(enrichedChord, e.key);
    const truth = { roman: e.truthRoman, letter: parseLetter(e.truthLetter), key: e.key };
    const rendered = e.pianoNotes ? { pianoNotes: e.pianoNotes } : {};
    const row = compareChord(truth, { ...eng, chord: e.chord, beat: e.beat }, rendered);
    if (row.notesOk) pass++;
    else {
      failures.push({
        id: e.id,
        truthRoman: e.truthRoman,
        engRoman: row.engRoman,
        truthPcs: row.truthPcs,
        engPcs: row.engPcs,
        flags: row.flags,
      });
    }
  }
  return { pass, total: entries.length, failures };
}

function printEntries(entries, { verbose = false } = {}) {
  const pass = entries.filter((e) => e.notesOk).length;
  console.log(`\n${entries.length} chords | notesOk ${pct(pass, entries.length)} (${pass}/${entries.length})`);
  const fails = entries.filter((e) => !e.notesOk);
  if (!fails.length) {
    console.log('All pass notesOk.');
    return;
  }
  console.log(`\nFailing (${fails.length}):`);
  for (const e of fails.slice(0, verbose ? fails.length : 20)) {
    console.log(`  ${e.id}`);
    console.log(`    truth: ${e.truthRoman} (${e.truthLetter}) pcs=[${(e.truthPcs || []).join(',')}]`);
    console.log(`    eng:   ${e.engRoman} (${e.engLetter}) pcs=[${(e.engPcs || []).join(',')}] class=${e.failureClass}`);
    if (verbose) console.log(`    chord: ${JSON.stringify(e.chord)}`);
  }
  if (!verbose && fails.length > 20) console.log(`  … and ${fails.length - 20} more`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); return; }

  const index = loadIndex();
  if (!index) {
    console.error('No chord_db.json — run: node _Decode_oracle/buildChordDb.js');
    process.exit(1);
  }

  if (opts.list || opts.failing) {
    printBucketTable(index.bucketIndex, { failingOnly: opts.failing, threshold: opts.threshold });
    return;
  }

  if (!opts.bucket) {
    printHelp();
    process.exit(1);
  }

  const entries = loadBucket(opts.bucket);
  if (!entries) {
    console.error(`Unknown bucket: ${opts.bucket}`);
    console.error('Use --list to see buckets.');
    process.exit(1);
  }

  if (opts.rerun) {
    console.log(`Re-running engine on ${entries.length} chords (${opts.bucket})…`);
    const res = await rerunBucket(entries);
    console.log(`\nRerun: notesOk ${pct(res.pass, res.total)} (${res.pass}/${res.total})`);
    if (res.failures.length) {
      console.log('\nStill failing:');
      for (const f of res.failures.slice(0, 15)) {
        console.log(`  ${f.id}: ${f.truthRoman} vs ${f.engRoman} truth=[${(f.truthPcs || []).join(',')}] eng=[${(f.engPcs || []).join(',')}]`);
      }
    }
    return;
  }

  printEntries(entries, { verbose: process.argv.includes('--verbose') });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
