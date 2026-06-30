/**
 * Parallel local transforms after harvest: metadata + processed (+ optional tested).
 */

const path = require('path');
const { Worker } = require('worker_threads');
const { loadHarvest } = require('./harvestArtifact');
const { prepareMetadataFromHarvest, commitMetadata } = require('./metadataFromHarvest');
const { writeProcessedCacheFromHarvest, commitProcessed } = require('./processedFromHarvest');
const { nowIso } = require('./db');
const { resetCacheSync } = require('./library');

function runCompareInWorker(scrapePath) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'oracleCompareWorker.js');
    const worker = new Worker(workerPath, {
      workerData: { scrapePath },
    });
    worker.on('message', (msg) => {
      if (!msg.ok) reject(new Error(msg.error || 'oracle compare failed'));
      else resolve(msg);
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`oracle worker exited ${code}`));
    });
  });
}

function commitTested(db, slug, testRep) {
  const ts = nowIso();
  db.prepare(`
    UPDATE songs
    SET oracle_tested_at = ?, oracle_out_dir = ?, oracle_summary_json = ?
    WHERE slug = ?
  `).run(ts, testRep.outDir, JSON.stringify(testRep.summary), slug);
}

async function runLocalsParallel(db, slug, opts = {}) {
  const {
    includeTested = false,
    skipMetadata = false,
    skipProcessed = false,
  } = opts;

  const harvest = loadHarvest(slug);
  if (!harvest) {
    throw Object.assign(new Error('Fetch required — no harvest artifact'), { status: 409 });
  }

  const tasks = [];

  if (!skipMetadata) {
    tasks.push(
      prepareMetadataFromHarvest(harvest, db).then((prep) => ({ kind: 'metadata', prep })),
    );
  }
  if (!skipProcessed) {
    tasks.push(
      writeProcessedCacheFromHarvest(harvest).then((proc) => ({ kind: 'processed', proc })),
    );
  }
  if (includeTested) {
    tasks.push(
      runCompareInWorker(harvest.path).then((testRep) => ({ kind: 'tested', testRep })),
    );
  }

  const results = await Promise.all(tasks);
  const extras = {};

  for (const r of results) {
    if (r.kind === 'metadata') commitMetadata(db, slug, r.prep);
    if (r.kind === 'processed') {
      commitProcessed(db, slug, r.proc);
      resetCacheSync();
    }
    if (r.kind === 'tested') {
      commitTested(db, slug, r.testRep);
      extras.oracleSummary = r.testRep.summary;
      extras.oracleOutDir = r.testRep.outDir;
    }
  }

  return extras;
}

module.exports = { runLocalsParallel, runCompareInWorker, commitTested };
