/**
 * Light catalog batch HTTP handlers (start, status, pause, resume, cancel).
 */

const path = require('path');
const { spawn } = require('child_process');
const { ROOT } = require('../lib/paths');
const {
  readState,
  writeState,
  writePid,
  requestPause,
  clearPause,
  requestStop,
  clearStop,
  killWorker,
  isProcessRunning,
  tailLog,
} = require('../lib/lightCatalogState');
const { openDb, getCatalogStatus } = require('../lib/db');
const { countSongsNeedingLightHarvest } = require('../lib/lightHarvest');

const RUN_MODES = new Set(['db-only', 'discover-harvest', 'full']);

function buildSpawnArgs(mode, limit) {
  const args = [path.join(ROOT, 'cli', 'lightCatalog.js'), '--limit', String(limit)];
  if (mode === 'db-only') args.push('--harvest-only');
  else if (mode === 'full') args.push('--all');
  else if (mode === 'discover-harvest') args.push('--meili-pages', '25');
  return args;
}

function runModeLabel(mode) {
  if (mode === 'db-only') return 'Database only — harvest catalog songs';
  if (mode === 'discover-harvest') return 'Discover new + harvest (limited Meili pages)';
  if (mode === 'full') return 'Full discover + harvest all pending';
  return mode;
}

function handleBatchStatus(res) {
  try {
    const db = openDb();
    const state = readState();
    const queueRemaining = countSongsNeedingLightHarvest(db);
    const catalog = getCatalogStatus(db);
    const alive = isProcessRunning();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...state,
      jobActive: state.running,
      processAlive: alive,
      running: state.running && alive,
      queue_remaining: state.running && alive ? state.queue_remaining : queueRemaining,
      catalogTotals: catalog.totals,
      logTail: tailLog(20),
      runModeLabel: state.run_mode ? runModeLabel(state.run_mode) : null,
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleBatchStart(reqUrl, res) {
  if (isProcessRunning()) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Light catalog already running' }));
    return;
  }

  const mode = reqUrl.searchParams.get('mode') || 'db-only';
  if (!RUN_MODES.has(mode)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `invalid mode: ${mode}` }));
    return;
  }

  const limit = Math.max(1, Math.min(5000, Number(reqUrl.searchParams.get('limit')) || 50));
  const db = openDb();
  const queueRemaining = countSongsNeedingLightHarvest(db);

  if (mode === 'db-only' && queueRemaining === 0) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No songs in catalog need light harvest', queue_remaining: 0 }));
    return;
  }

  clearStop();
  clearPause();
  writeState({
    running: true,
    paused: false,
    phase: 'starting',
    run_mode: mode,
    queue_remaining: queueRemaining,
    songs_harvested_session: 0,
    songs_failed_session: 0,
    songs_discovered_session: 0,
    current_slug: null,
    last_error: null,
    started_at: new Date().toISOString(),
    finished_at: null,
  });

  const args = buildSpawnArgs(mode, limit);
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (child.pid) writePid(child.pid);
  child.unref();

  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    mode,
    limit,
    runModeLabel: runModeLabel(mode),
    queue_remaining: queueRemaining,
  }));
}

function handleBatchPause(res) {
  if (!isProcessRunning()) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'light catalog worker is not running' }));
    return;
  }
  requestPause();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, paused: true }));
}

function handleBatchResume(res) {
  clearPause();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, paused: false }));
}

function handleBatchCancel(res) {
  requestStop();
  killWorker();
  writeState({ running: false, phase: 'idle', paused: false, finished_at: new Date().toISOString() });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, cancelled: true }));
}

function matchCatalogBatchRoute(pathname, method) {
  if (pathname === '/api/library/catalog/batch/status' && method === 'GET') return 'status';
  if (pathname === '/api/library/catalog/batch/start' && method === 'POST') return 'start';
  if (pathname === '/api/library/catalog/batch/pause' && method === 'POST') return 'pause';
  if (pathname === '/api/library/catalog/batch/resume' && method === 'POST') return 'resume';
  if (pathname === '/api/library/catalog/batch/cancel' && method === 'POST') return 'cancel';
  return null;
}

module.exports = {
  handleBatchStatus,
  handleBatchStart,
  handleBatchPause,
  handleBatchResume,
  handleBatchCancel,
  matchCatalogBatchRoute,
  runModeLabel,
};
