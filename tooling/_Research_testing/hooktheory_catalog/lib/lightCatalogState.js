/**
 * Light catalog batch worker state (pause / stop / PID / log).
 */

const fs = require('fs');
const { dataPath } = require('./paths');

const STATE_FILE = dataPath('light_catalog_state.json');
const STOP_FILE = dataPath('.light_catalog_stop');
const PAUSE_FILE = dataPath('.light_catalog_pause');
const PID_FILE = dataPath('light_catalog.pid');
const LOG_FILE = dataPath('light_catalog.log');

const DEFAULT_STATE = {
  running: false,
  paused: false,
  phase: 'idle',
  run_mode: null,
  discover_offset: 0,
  discover_total_estimate: null,
  songs_discovered_session: 0,
  songs_harvested_session: 0,
  songs_failed_session: 0,
  current_slug: null,
  queue_remaining: 0,
  last_error: null,
  started_at: null,
  finished_at: null,
};

function readState() {
  if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch (_) {
    return { ...DEFAULT_STATE };
  }
}

function writeState(patch) {
  const next = { ...readState(), ...patch, updated_at: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

function shouldStop() {
  return fs.existsSync(STOP_FILE);
}

function shouldPause() {
  return fs.existsSync(PAUSE_FILE);
}

function requestStop() {
  fs.writeFileSync(STOP_FILE, new Date().toISOString());
}

function clearStop() {
  if (fs.existsSync(STOP_FILE)) fs.unlinkSync(STOP_FILE);
}

function requestPause() {
  fs.writeFileSync(PAUSE_FILE, new Date().toISOString());
  writeState({ paused: true });
}

function clearPause() {
  if (fs.existsSync(PAUSE_FILE)) fs.unlinkSync(PAUSE_FILE);
  writeState({ paused: false });
}

function appendLog(line) {
  const msg = `[${new Date().toISOString()}] ${line}\n`;
  fs.appendFileSync(LOG_FILE, msg);
  console.log(line);
}

function writePid(pid) {
  fs.writeFileSync(PID_FILE, String(pid));
}

function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  return Number(fs.readFileSync(PID_FILE, 'utf8').trim()) || null;
}

function clearPid() {
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
}

function tailLog(lines = 20) {
  if (!fs.existsSync(LOG_FILE)) return [];
  const all = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
  return all.slice(-lines);
}

function isProcessRunning() {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function killWorker() {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  STATE_FILE,
  STOP_FILE,
  PAUSE_FILE,
  PID_FILE,
  LOG_FILE,
  DEFAULT_STATE,
  readState,
  writeState,
  shouldStop,
  shouldPause,
  requestStop,
  clearStop,
  requestPause,
  clearPause,
  appendLog,
  writePid,
  readPid,
  clearPid,
  tailLog,
  isProcessRunning,
  killWorker,
};
