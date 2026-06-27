#!/usr/bin/env node
/**
 * updateChordDb.js — incrementally update the chord modification database.
 *
 * Preferred over buildChordDb.js when adding/removing songs without a full rebuild.
 *
 *   node _Decode_oracle/updateChordDb.js --corpus _Decode_oracle/corpus.json
 *   node _Decode_oracle/updateChordDb.js --corpus corpus.json --run-oracle
 *   node _Decode_oracle/updateChordDb.js --songs slug1 slug2
 *   node _Decode_oracle/updateChordDb.js --remove slug1 slug2
 *   node _Decode_oracle/updateChordDb.js --rebuild-summary
 */

const fs = require('fs');
const path = require('path');
const { loadDatabase } = require('./chord_db/loadDb');
const { removeSongs, replaceSongEntries } = require('./chord_db/mergeEntries');
const { extractFromSong } = require('./chord_db/extractFromSong');
const { rebuildDbMaps } = require('./chord_db/rebuildMaps');
const { updateMeta } = require('./chord_db/updateMeta');
const { writeDatabase } = require('./chord_db/writeOutput');
const { OUT } = require('./chord_db/collectSongs');
const { resolveEntry, runResolvedSong, slugForUrl } = require('./run');

function parseArgs(argv) {
  const out = {
    corpusFile: null,
    runOracle: false,
    useReports: false,
    rebuildSummary: false,
    songs: [],
    remove: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--corpus') out.corpusFile = path.resolve(argv[++i]);
    else if (a === '--run-oracle') out.runOracle = true;
    else if (a === '--use-reports') out.useReports = true;
    else if (a === '--rebuild-summary') out.rebuildSummary = true;
    else if (a === '--songs') {
      while (argv[i + 1] && !argv[i + 1].startsWith('-')) out.songs.push(argv[++i]);
    } else if (a === '--remove') {
      while (argv[i + 1] && !argv[i + 1].startsWith('-')) out.remove.push(argv[++i]);
    } else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function slugsFromCorpus(corpusFile) {
  const entries = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
  const slugs = [];
  for (const e of entries) {
    const slug = slugForUrl(e.url);
    if (fs.existsSync(path.join(OUT, slug, 'scrape.json'))) slugs.push(slug);
  }
  return [...new Set(slugs)];
}

async function runOracleForMissing(corpusFile, opts = {}) {
  const entries = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
  const runOpts = { ...opts, browser: false };
  for (const entry of entries) {
    const slug = slugForUrl(entry.url);
    const scrapeFile = path.join(OUT, slug, 'scrape.json');
    if (fs.existsSync(scrapeFile)) continue;
    console.log(`[updateChordDb] oracle scrape: ${entry.url}`);
    const resolved = await resolveEntry(entry, runOpts);
    if (!resolved) {
      console.log(`  [updateChordDb] unresolved: ${entry.url}`);
      continue;
    }
    await runResolvedSong(resolved, runOpts);
  }
}

async function updateChordDatabase(opts = {}) {
  if (opts.rebuildSummary) {
    const db = loadDatabase();
    rebuildDbMaps(db);
    db.meta = updateMeta(db);
    const { summary } = writeDatabase(db);
    return { db, summary, changed: 0 };
  }

  if (opts.runOracle && opts.corpusFile) {
    await runOracleForMissing(opts.corpusFile, opts);
  }

  let targetSlugs = opts.songs;
  if (!targetSlugs.length && opts.corpusFile) targetSlugs = slugsFromCorpus(opts.corpusFile);

  const db = loadDatabase();
  const before = db.allEntries.length;
  let affectedModBuckets = new Set();
  let affectedCompositeKeys = new Set();

  if (opts.remove.length) {
    const r = removeSongs(db, opts.remove);
    for (const k of r.affectedModBuckets) affectedModBuckets.add(k);
    for (const k of r.affectedCompositeKeys) affectedCompositeKeys.add(k);
    console.log(`[updateChordDb] removed ${r.removedCount} chords from ${opts.remove.length} song(s)`);
  }

  for (const slug of targetSlugs) {
    const entries = await extractFromSong(slug, { useReports: opts.useReports });
    const r = replaceSongEntries(db, entries);
    for (const k of r.affectedModBuckets) affectedModBuckets.add(k);
    for (const k of r.affectedCompositeKeys) affectedCompositeKeys.add(k);
    console.log(`[updateChordDb] ${slug}: ${r.addedCount} chords (replaced ${r.removedCount})`);
  }

  rebuildDbMaps(db);
  db.meta = updateMeta(db, { corpusFile: opts.corpusFile });

  const writeOpts = affectedModBuckets.size
    ? { affectedModBuckets, affectedCompositeKeys }
    : {};
  const { summary } = writeDatabase(db, writeOpts);

  return {
    db,
    summary,
    changed: Math.abs(db.allEntries.length - before),
    before,
    after: db.allEntries.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node updateChordDb.js --corpus corpus.json [--run-oracle] [--use-reports]
  node updateChordDb.js --songs slug1 slug2
  node updateChordDb.js --remove slug1 slug2
  node updateChordDb.js --rebuild-summary`);
    process.exit(0);
  }

  if (!args.rebuildSummary && !args.corpusFile && !args.songs.length && !args.remove.length) {
    console.error('Specify --corpus, --songs, --remove, or --rebuild-summary');
    process.exit(1);
  }

  const result = await updateChordDatabase(args);
  const { db, summary } = result;
  const sourceCount = Array.isArray(db.meta.sources) ? db.meta.sources.length : 0;
  console.log(`[updateChordDb] ${sourceCount} songs, ${db.meta.totalChords} chords, ${db.byModification.size} buckets`);
  if (summary) {
    console.log(`[updateChordDb] SUMMARY.md — ${summary.below99.length} buckets below 99% notesOk`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { updateChordDatabase, slugsFromCorpus, runOracleForMissing };
