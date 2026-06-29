/**
 * Pipeline forward (run) and hold-to-clear operations per Song Selector button.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { REPO_ROOT } = require('./paths');
const { nowIso } = require('./db');
const { enrichSong, launchBrowser } = require('./enrich');
const { CACHE_ROOT, syncCacheToCatalog } = require('./cacheSync');
const { computeFlags, canLoad, loadGateMissing } = require('./pipelineFlags');
const { runOracleForUrl } = require('./oracleRunner');
const { resetCacheSync } = require('./library');

const ACTIONS = new Set(['metadata', 'processed', 'tested']);

function isAction(action) {
  return ACTIONS.has(action);
}

function getSongRow(db, slug) {
  return db.prepare(`
    SELECT slug, url, status, cache_dir, processed_at, discovery_source,
      oracle_tested_at, oracle_out_dir, oracle_summary_json
    FROM songs WHERE slug = ?
  `).get(slug);
}

function flagsPayload(db, slug) {
  const row = getSongRow(db, slug);
  if (!row) {
    return { ok: false, status: 404, error: 'song not found', deleted: true };
  }
  const flags = computeFlags(row);
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

function spawnExtract(url) {
  return new Promise((resolve, reject) => {
    const script = path.join(REPO_ROOT, 'extract_hooktheory_data.js');
    const child = spawn(process.execPath, [script, url], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-400) || `extract exited ${code}`));
    });
  });
}

async function runMetadata(db, slug) {
  const row = requireSong(db, slug);
  const browser = await launchBrowser();
  try {
    const result = await enrichSong(db, row, { browser });
    if (!result.ok) return wrapErr(db, slug, result.error || 'enrich failed', 500);
    return wrapOk(db, slug);
  } finally {
    await browser.close();
  }
}

async function runProcessed(db, slug) {
  const row = requireSong(db, slug);
  await spawnExtract(row.url);
  resetCacheSync();
  syncCacheToCatalog(db);
  const updated = getSongRow(db, slug);
  if (!updated?.cache_dir || !updated?.processed_at) {
    return wrapErr(db, slug, 'extract finished but cache_dir not set', 500);
  }
  return wrapOk(db, slug);
}

async function runTested(db, slug) {
  const row = requireSong(db, slug);
  if (!row.cache_dir || !row.processed_at) {
    return wrapErr(db, slug, 'processed step required before oracle test', 409);
  }
  const cachePath = path.join(CACHE_ROOT, row.cache_dir);
  if (!fs.existsSync(cachePath)) {
    return wrapErr(db, slug, 'cache folder missing on disk', 409);
  }
  const { outDir, summary } = await runOracleForUrl(row.url);
  const ts = nowIso();
  db.prepare(`
    UPDATE songs
    SET oracle_tested_at = ?, oracle_out_dir = ?, oracle_summary_json = ?
    WHERE slug = ?
  `).run(ts, outDir, JSON.stringify(summary), slug);
  return wrapOk(db, slug, { oracleSummary: summary, oracleOutDir: outDir });
}

async function runPipelineAction(db, slug, action) {
  if (!isAction(action)) return wrapErr(db, slug, `unknown action: ${action}`, 400);
  switch (action) {
    case 'metadata': return runMetadata(db, slug);
    case 'processed': return runProcessed(db, slug);
    case 'tested': return runTested(db, slug);
    default: return wrapErr(db, slug, `unknown action: ${action}`, 400);
  }
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
    const dir = path.join(REPO_ROOT, row.oracle_out_dir);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
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
};
