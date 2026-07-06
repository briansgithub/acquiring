#!/usr/bin/env node
/**
 * Aggregate chord + transition frequencies from playback cache for quiz modes.
 * Usage: node buildCorpusStats.js [--limit N]
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { getPlaybackCacheDir, getCatalogDir, getRepoRoot } = require('../../../lib/dataRoot');

const CHORD_FLOOR = 10;
const TRANS_FLOOR = 5;

function parseArgs() {
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : 0;
  return { limit: Number.isFinite(limit) && limit > 0 ? limit : 0 };
}

function borrowedTag(borrowed) {
  if (Array.isArray(borrowed)) return 'custom';
  return borrowed || 'none';
}

function quizChordId(chord) {
  const root = chord.root;
  const type = chord.type || 5;
  const inv = chord.inversion || 0;
  const applied = chord.applied || 0;
  return `r${root}|t${type}|i${inv}|a${applied}|b${borrowedTag(chord.borrowed)}`;
}

function minimalChord(chord) {
  return {
    root: chord.root,
    type: chord.type || 5,
    inversion: chord.inversion || 0,
    applied: chord.applied || 0,
    borrowed: chord.borrowed ?? null,
    adds: [],
    omits: [],
    alterations: [],
    suspensions: [],
    isRest: false,
  };
}

async function loadSymbolFn() {
  const modPath = path.join(getRepoRoot(), 'web-player', 'lib', 'jsonToSymbol.js');
  const mod = await import(pathToFileURL(modPath).href);
  return mod.getChordSymbol;
}

async function main() {
  const { limit } = parseArgs();
  const cacheRoot = getPlaybackCacheDir();
  const outPath = path.join(getCatalogDir(), 'corpus_stats.json');

  if (!fs.existsSync(cacheRoot)) {
    console.error('Playback cache not found:', cacheRoot);
    process.exit(1);
  }

  const getChordSymbol = await loadSymbolFn();
  const scaleBuckets = new Map();
  let songCount = 0;
  let sectionCount = 0;
  let totalChords = 0;

  const artists = fs.readdirSync(cacheRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
  const slice = limit ? artists.slice(0, limit) : artists;

  for (let ai = 0; ai < slice.length; ai++) {
    const artistDir = slice[ai].name;
    if (ai > 0 && ai % 2000 === 0) console.log(`…${ai}/${slice.length} folders`);
    const artistPath = path.join(cacheRoot, artistDir);
    const files = fs.readdirSync(artistPath).filter((f) => f.endsWith('.json') && f !== '_metadata.json');
    if (!files.length) continue;
    songCount += 1;

    for (const file of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(artistPath, file), 'utf8'));
      } catch {
        continue;
      }
      const key = data.metadata?.keys?.[0];
      if (!key?.scale) continue;
      const scale = key.scale;
      const chords = (data.chords || []).filter((c) => !c.isRest);
      if (!chords.length) continue;

      sectionCount += 1;
      totalChords += chords.length;

      if (!scaleBuckets.has(scale)) {
        scaleBuckets.set(scale, { chords: new Map(), transitions: new Map(), total: 0 });
      }
      const bucket = scaleBuckets.get(scale);
      bucket.total += chords.length;

      const ids = [];
      for (const chord of chords) {
        const id = quizChordId(chord);
        ids.push(id);
        let entry = bucket.chords.get(id);
        if (!entry) {
          entry = { id, count: 0, songs: new Set(), chord: minimalChord(chord) };
          bucket.chords.set(id, entry);
        }
        entry.count += 1;
        entry.songs.add(artistDir);
      }

      for (let i = 1; i < ids.length; i++) {
        const pairKey = `${ids[i - 1]}=>${ids[i]}`;
        let tr = bucket.transitions.get(pairKey);
        if (!tr) {
          tr = { from: ids[i - 1], to: ids[i], count: 0, songs: new Set() };
          bucket.transitions.set(pairKey, tr);
        }
        tr.count += 1;
        tr.songs.add(artistDir);
      }
    }
  }

  const symbolKey = { tonic: 'C', scale: 'major' };
  const scales = {};
  for (const [scale, bucket] of scaleBuckets) {
    symbolKey.scale = scale;
    const chords = [...bucket.chords.values()]
      .filter((c) => c.count >= CHORD_FLOOR)
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        id: c.id,
        symbol: getChordSymbol(c.chord, symbolKey),
        chord: c.chord,
        count: c.count,
        songs: c.songs.size,
      }));

    const transitions = [...bucket.transitions.values()]
      .filter((t) => t.count >= TRANS_FLOOR)
      .sort((a, b) => b.count - a.count)
      .map((t) => ({
        from: t.from,
        to: t.to,
        count: t.count,
        songs: t.songs.size,
      }));

    scales[scale] = { total: bucket.total, chords, transitions };
  }

  const output = {
    builtAt: new Date().toISOString(),
    songCount,
    sectionCount,
    totalChords,
    scales,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`Wrote ${outPath} (${songCount} songs, ${sectionCount} sections, ${totalChords} chords)`);

  for (const scale of ['major', 'minor']) {
    const b = scales[scale];
    if (!b) continue;
    console.log(`\nTop 10 chords (${scale}):`);
    for (const c of b.chords.slice(0, 10)) console.log(`  ${c.symbol.padEnd(12)} ${c.count}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
