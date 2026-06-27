/**
 * buildDb.js — aggregate chord entries indexed by modification bucket.
 */

const path = require('path');
const { rowToEntry } = require('./chordEntry');
const { discoverScrapeDirs, loadSongCompare, enrichRowsWithKeys } = require('./collectSongs');
const { indexEntries } = require('./rebuildMaps');
const { sourceSlugs } = require('./updateMeta');

async function buildChordDatabase(opts = {}) {
  const sources = discoverScrapeDirs(opts);
  const allEntries = [];

  for (const src of sources) {
    const { slug, scrape, compareResult } = await loadSongCompare(src, opts);
    const pairs = enrichRowsWithKeys(slug, scrape, compareResult);
    for (const { row, ctx } of pairs) {
      allEntries.push(rowToEntry(row, ctx));
    }
  }

  const { byModification, byCompositeKey } = indexEntries(allEntries);
  const slugs = sourceSlugs(allEntries);

  return {
    meta: {
      built: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      sources: slugs,
      totalChords: allEntries.length,
      uniqueChords: allEntries.length,
      corpus: opts.corpusFile ? path.basename(opts.corpusFile) : null,
      corpora: opts.corpusFile
        ? [{ file: path.basename(opts.corpusFile), added: new Date().toISOString().slice(0, 10) }]
        : [],
      useReports: !!opts.useReports,
    },
    byModification,
    byCompositeKey,
    allEntries,
  };
}

function bucketStats(entries) {
  const total = entries.length;
  const notesOk = entries.filter((e) => e.notesOk).length;
  const romanExact = entries.filter((e) => e.romanExact).length;
  const failing = entries.filter((e) => !e.notesOk);
  const byClass = { engine: 0, harness: 0, piano_noise: 0, unknown: 0 };
  for (const e of failing) {
    const k = e.failureClass || 'unknown';
    byClass[k] = (byClass[k] || 0) + 1;
  }
  return {
    total,
    notesOk,
    notesOkPct: total ? (100 * notesOk) / total : 100,
    romanExact,
    romanExactPct: total ? (100 * romanExact) / total : 100,
    failing: failing.length,
    byClass,
    failingExamples: failing.slice(0, 3).map((e) => ({
      id: e.id,
      truthRoman: e.truthRoman,
      engRoman: e.engRoman,
      truthPcs: e.truthPcs,
      engPcs: e.engPcs,
      chord: e.chord,
      failureClass: e.failureClass,
    })),
  };
}

function summarizeBuckets(byModification) {
  const stats = new Map();
  for (const [key, entries] of byModification) stats.set(key, bucketStats(entries));
  return stats;
}

module.exports = { buildChordDatabase, bucketStats, summarizeBuckets };
