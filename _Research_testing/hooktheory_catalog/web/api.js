/**
 * Catalog API handlers for web-player server.
 */

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const { ROOT, CLI_DIR, dataPath } = require('../lib/paths');
const { STATE_FILE } = require('../lib/update');
const { STATE_FILE: DAEMON_STATE, STOP_FILE, PID_FILE } = require('../lib/daemonState');

let catalogJob = null;
let daemonJob = null;

function loadCatalogDb() {
  const { openDb, getCatalogStatus, listSongs } = require('../lib/db');
  return { openDb, getCatalogStatus, listSongs };
}

function readJsonFile(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function readUpdateState() {
  return readJsonFile(STATE_FILE, { running: false });
}

function readDaemonState() {
  return readJsonFile(DAEMON_STATE, { running: false, phase: 'discover' });
}

function isDaemonProcessRunning() {
  const pid = readJsonFile(PID_FILE, null);
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (_) {
    return false;
  }
}

function handleCatalogStatus(res) {
  try {
    const { openDb, getCatalogStatus, listSongs } = loadCatalogDb();
    const db = openDb();
    const status = getCatalogStatus(db);
    const songs = listSongs(db, { limit: 200, orderBy: 'complexity_rating' });
    const updateState = readUpdateState();
    const daemonState = readDaemonState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status,
      songs,
      updateState,
      daemonState,
      daemonRunning: isDaemonProcessRunning() || daemonState.running,
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleCatalogUpdate(reqUrl, res) {
  const state = readUpdateState();
  if (state.running || catalogJob) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Update already running', updateState: state }));
    return;
  }

  const mode = reqUrl.searchParams.get('mode') || 'quick';
  const enrichLimit = reqUrl.searchParams.get('enrichLimit') || '10';
  const updateCli = path.join(CLI_DIR, 'update.js');
  const args = [updateCli, '--mode', mode, '--enrich-limit', String(enrichLimit)];

  catalogJob = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  catalogJob.on('close', () => {
    catalogJob = null;
  });

  const { writeState } = require('../lib/update');
  writeState({
    running: true,
    mode,
    startedAt: new Date().toISOString(),
  });

  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, mode, enrichLimit: Number(enrichLimit) }));
}

function handleDaemonStatus(res) {
  const daemonState = readDaemonState();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    daemonState,
    daemonRunning: isDaemonProcessRunning() || daemonState.running,
    stopRequested: fs.existsSync(STOP_FILE),
  }));
}

function handleDaemonStart(reqUrl, res) {
  if (isDaemonProcessRunning() || daemonJob) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Daemon already running' }));
    return;
  }

  if (fs.existsSync(STOP_FILE)) fs.unlinkSync(STOP_FILE);

  const phase = reqUrl.searchParams.get('phase') || 'auto';
  const intervalMs = reqUrl.searchParams.get('intervalMs') || '';
  const daemonCli = path.join(CLI_DIR, 'catalogDaemon.js');
  const args = [daemonCli, '--phase', phase];
  if (intervalMs) args.push('--interval-ms', intervalMs);

  daemonJob = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  daemonJob.on('close', () => {
    daemonJob = null;
  });

  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, phase, pid: daemonJob.pid }));
}

function handleDaemonStop(res) {
  fs.writeFileSync(STOP_FILE, new Date().toISOString());
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, message: 'Stop signal written' }));
}

module.exports = {
  ROOT,
  handleCatalogStatus,
  handleCatalogUpdate,
  handleDaemonStatus,
  handleDaemonStart,
  handleDaemonStop,
};
