#!/usr/bin/env node
/**
 * Index chord signatures from playback cache into chord_catalog_signatures.
 *
 *   node cli/buildSignatureIndex.js
 *   node cli/buildSignatureIndex.js --workers 8 --limit 500
 */

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { openDb } = require('../lib/db');
const { getPlaybackCacheDir } = require('../../../lib/dataRoot');
const {
  clearSignatureIndex,
  upsertSignatureRow,
} = require('../lib/engineErrorDb');
const { chordSignature } = require('../lib/chordSignature');
const { sigOf, hasMods, chordShape } = require('../lib/modSignature');

function parseArgs(argv) {
  const out = { workers: 8, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--workers') out.workers = Number(argv[++i]) || 8;
    else if (argv[i] === '--limit') out.limit = Number(argv[++i]) || 0;
  }
  return out;
}

function sectionNameFromFile(file) {
  const base = file.replace(/\.json$/i, '');
  const idx = base.indexOf(' - ');
  return idx >= 0 ? base.slice(0, idx) : base;
}

function listSectionJobs(db, cacheRoot, limit) {
  const rows = db.prepare(`
    SELECT slug, cache_dir FROM songs
    WHERE processed_at IS NOT NULL AND cache_dir IS NOT NULL AND cache_dir != ''
    ORDER BY slug
  `).all();
  const slice = limit ? rows.slice(0, limit) : rows;
  const jobs = [];
  for (const row of slice) {
    const dir = path.join(cacheRoot, row.cache_dir);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json') || file === '_metadata.json') continue;
      jobs.push({
        slug: row.slug,
        filePath: path.join(dir, file),
        section: sectionNameFromFile(file),
      });
    }
  }
  return jobs;
}

function runWorkerBatch(jobs) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, '../lib/signatureIndexWorker.js');
    const worker = new Worker(workerPath, { workerData: { jobs } });
    worker.on('message', (msg) => {
      if (!msg.ok) reject(new Error(msg.error || 'worker failed'));
      else resolve(msg.entries);
    });
    worker.on('error', reject);
  });
}

function mergeEntries(target, batch) {
  for (const ent of batch) {
    const existing = target.get(ent.signature);
    if (!existing) {
      target.set(ent.signature, {
        signature: ent.signature,
        mod_signature: ent.mod_signature,
        occurrence_count: ent.occurrence_count,
        song_count: 1,
        has_mods: ent.has_mods,
        sample_chord_json: ent.sample_chord_json,
        sample_slugs_json: JSON.stringify(ent.sample_refs),
        songs: new Set([ent.slug]),
      });
      continue;
    }
    existing.occurrence_count += ent.occurrence_count;
    existing.songs.add(ent.slug);
    if (!existing.sample_chord_json && ent.sample_chord_json) {
      existing.sample_chord_json = ent.sample_chord_json;
    }
    const refs = JSON.parse(existing.sample_slugs_json || '[]');
    for (const r of ent.sample_refs) {
      if (refs.length >= 5) break;
      if (!refs.some((x) => x.slug === r.slug && x.beat === r.beat)) refs.push(r);
    }
    existing.sample_slugs_json = JSON.stringify(refs);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cacheRoot = getPlaybackCacheDir();
  const db = openDb();
  const jobs = listSectionJobs(db, cacheRoot, opts.limit);
  console.log(`[buildSignatureIndex] ${jobs.length} section files, ${opts.workers} workers`);

  const merged = new Map();
  const chunk = Math.ceil(jobs.length / opts.workers) || 1;
  const batches = [];
  for (let i = 0; i < jobs.length; i += chunk) {
    batches.push(jobs.slice(i, i + chunk));
  }

  let done = 0;
  for (const batch of batches) {
    const entries = await runWorkerBatch(batch);
    mergeEntries(merged, entries);
    done += batch.length;
    if (done % 5000 === 0 || done === jobs.length) {
      console.log(`  …processed ${done}/${jobs.length} sections, ${merged.size} signatures`);
    }
  }

  const ts = new Date().toISOString();
  clearSignatureIndex(db);
  const insertTx = db.transaction((rows) => {
    for (const row of rows) {
      upsertSignatureRow(db, {
        signature: row.signature,
        mod_signature: row.mod_signature,
        occurrence_count: row.occurrence_count,
        song_count: row.songs.size,
        has_mods: row.has_mods,
        sample_chord_json: row.sample_chord_json,
        sample_slugs_json: row.sample_slugs_json,
        indexed_at: ts,
      });
    }
  });
  insertTx([...merged.values()]);

  let totalInstances = 0;
  for (const v of merged.values()) totalInstances += v.occurrence_count;
  console.log(`[buildSignatureIndex] done: ${merged.size} signatures, ${totalInstances} chord instances`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
