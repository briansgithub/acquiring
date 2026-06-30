/**
 * Pipeline forward (run) and hold-to-clear operations per Song Selector button.
 */

const fs = require('fs');
const path = require('path');
const { resolveDataPath } = require('../../../lib/dataRoot');
const { nowIso } = require('./db');
const { CACHE_ROOT } = require('./cacheSync');
const { computeFlags, canLoad, loadGateMissing } = require('./pipelineFlags');
const { resetCacheSync } = require('./library');
const { harvestSong } = require('./harvest');
const { loadHarvest, clearHarvestArtifact, isHarvested } = require('./harvestArtifact');
const { prepareMetadataFromHarvest, commitMetadata } = require('./metadataFromHarvest');
const { writeProcessedCacheFromHarvest, commitProcessed } = require('./processedFromHarvest');
const { runLocalsParallel, runCompareInWorker, commitTested } = require('./runLocalsParallel');

const ACTIONS = new Set(['harvest', 'metadata', 'processed', 'tested']);

function isAction(action) {
  return ACTIONS.has(action);
}

function getSongRow(db, slug) {
  return db.prepare(`
    SELECT slug, url, status, cache_dir, processed_at, discovery_source, harvest_mode,
      oracle_tested_at, oracle_out_dir, oracle_summary_json
    FROM songs WHERE slug = ?
  `).get(slug);
}

function flagsPayload(db, slug) {
  const row = getSongRow(db, slug);
  if (!row) {
    return { ok: false, status: 404, error: 'song not found', deleted: true };
  }
  const flags = computeFlags(row, slug);
  let oracleSummary = null;
  if (row.oracle_summary_json) {
    try {
      oracleSummary = JSON.parse(row.oracle_summary_json);
    } catch (_) {
      oracleSummary = null;
    }
  }
  return {
    ok: true,
    slug,
    flags,
    canLoad: canLoad(flags),
    loadGateMissing: loadGateMissing(flags),
    oracleSummary,
    oracleOutDir: row.oracle_out_dir || null,
  };
}

function wrapOk(db, slug, extra = {}) {
  return { ...flagsPayload(db, slug), ...extra };
}

function wrapErr(db, slug, error, status = 500) {
  const base = slug ? flagsPayload(db, slug) : { ok: false, status: 404, error: 'song not found' };
  return { ...base, ok: false, error: String(error), status };
}

function requireSong(db, slug) {
  const row = getSongRow(db, slug);
  if (!row) throw Object.assign(new Error('song not found'), { status: 404 });
  if (!row.url) throw Object.assign(new Error('song has no URL'), { status: 409 });
  return row;
}

function requireHarvest(slug) {
  const harvest = loadHarvest(slug);
  if (!harvest) {
    return null;
  }
  return harvest;
}

async function runHarvest(db, slug, { rescrape = false } = {}) {
  const row = requireSong(db, slug);
  await harvestSong(row.url, { rescrape });
  const extras = await runLocalsParallel(db, slug, { includeTested: false });
  return wrapOk(db, slug, extras);
}

async function runMetadata(db, slug) {
  const harvest = requireHarvest(slug);
  if (!harvest) return wrapErr(db, slug, 'Fetch required — run harvest first', 409);
  const prep = await prepareMetadataFromHarvest(harvest, db);
  commitMetadata(db, slug, prep);
  return wrapOk(db, slug);
}

async function runProcessed(db, slug) {
  const harvest = requireHarvest(slug);
  if (!harvest) return wrapErr(db, slug, 'Fetch required — run harvest first', 409);
  const proc = await writeProcessedCacheFromHarvest(harvest);
  commitProcessed(db, slug, proc);
  resetCacheSync();
  const updated = getSongRow(db, slug);
  if (!updated?.cache_dir || !updated?.processed_at) {
    return wrapErr(db, slug, 'processed commit failed — cache_dir not set', 500);
  }
  return wrapOk(db, slug);
}

async function runTested(db, slug) {
  const harvest = requireHarvest(slug);
  if (!harvest) return wrapErr(db, slug, 'Fetch required — run harvest first', 409);
  const row = requireSong(db, slug);
  if (!row.cache_dir || !row.processed_at) {
    return wrapErr(db, slug, 'processed step required before oracle test', 409);
  }
  const cachePath = path.join(CACHE_ROOT, row.cache_dir);
  if (!fs.existsSync(cachePath)) {
    return wrapErr(db, slug, 'cache folder missing on disk', 409);
  }
  const testRep = await runCompareInWorker(harvest.path);
  commitTested(db, slug, testRep);
  return wrapOk(db, slug, {
    oracleSummary: testRep.summary,
    oracleOutDir: testRep.outDir,
  });
}

async function runPipelineAction(db, slug, action) {
  if (!isAction(action)) return wrapErr(db, slug, `unknown action: ${action}`, 400);
  switch (action) {
    case 'harvest': return runHarvest(db, slug);
    case 'metadata': return runMetadata(db, slug);
    case 'processed': return runProcessed(db, slug);
    case 'tested': return runTested(db, slug);
    default: return wrapErr(db, slug, `unknown action: ${action}`, 400);
  }
}

function clearHarvest(db, slug) {
  if (!getSongRow(db, slug)) return wrapErr(db, slug, 'song not found', 404);
  clearHarvestArtifact(slug);
  return wrapOk(db, slug);
}

function clearMetadata(db, slug) {
  if (!getSongRow(db, slug)) return wrapErr(db, slug, 'song not found', 404);
  db.prepare('DELETE FROM song_metrics WHERE slug = ?').run(slug);
  db.prepare('DELETE FROM song_details WHERE slug = ?').run(slug);
  db.prepare('DELETE FROM song_stats WHERE slug = ?').run(slug);
  db.prepare('DELETE FROM song_sections WHERE slug = ?').run(slug);
  db.prepare(`
    UPDATE songs SET status = 'pending', difficulty_label = NULL WHERE slug = ?
  `).run(slug);
  return wrapOk(db, slug);
}

function clearProcessed(db, slug) {
  const row = getSongRow(db, slug);
  if (!row) return wrapErr(db, slug, 'song not found', 404);
  if (row.cache_dir) {
    const dir = path.join(CACHE_ROOT, row.cache_dir);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  db.prepare(`
    UPDATE songs SET cache_dir = NULL, processed_at = NULL WHERE slug = ?
  `).run(slug);
  resetCacheSync();
  return wrapOk(db, slug);
}

function clearTested(db, slug) {
  const row = getSongRow(db, slug);
  if (!row) return wrapErr(db, slug, 'song not found', 404);
  if (row.oracle_out_dir) {
    const dir = resolveDataPath(row.oracle_out_dir);
    const keep = new Set(['scrape.json']);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (keep.has(f)) continue;
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true });
        else fs.unlinkSync(p);
      }
    }
  }
  db.prepare(`
    UPDATE songs
    SET oracle_tested_at = NULL, oracle_out_dir = NULL, oracle_summary_json = NULL
    WHERE slug = ?
  `).run(slug);
  return wrapOk(db, slug);
}

function clearPipelineAction(db, slug, action) {
  if (!isAction(action)) return wrapErr(db, slug, `unknown action: ${action}`, 400);
  switch (action) {
    case 'harvest': return clearHarvest(db, slug);
    case 'metadata': return clearMetadata(db, slug);
    case 'processed': return clearProcessed(db, slug);
    case 'tested': return clearTested(db, slug);
    default: return wrapErr(db, slug, `unknown action: ${action}`, 400);
  }
}

module.exports = {
  ACTIONS,
  isAction,
  flagsPayload,
  runPipelineAction,
  clearPipelineAction,
  runHarvest,
};
