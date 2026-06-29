/**
 * Daemon state persistence (resume offsets, phase tracking).
 */

const fs = require('fs');
const { dataPath } = require('./paths');

const STATE_FILE = dataPath('daemon_state.json');
const STOP_FILE = dataPath('.catalog_stop');
const PID_FILE = dataPath('daemon.pid');
const LOG_FILE = dataPath('daemon.log');

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      phase: 'discover',
      discovery_complete: false,
      discover_offset: 0,
      songs_enriched_session: 0,
      last_slug: null,
      started_at: null,
      running: false,
    };
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {
    return { phase: 'discover', discovery_complete: false, discover_offset: 0 };
  }
}

function writeState(patch) {
  const prev = readState();
  const next = { ...prev, ...patch, updated_at: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

function shouldStop() {
  return fs.existsSync(STOP_FILE);
}

function clearStop() {
  if (fs.existsSync(STOP_FILE)) fs.unlinkSync(STOP_FILE);
}

function requestStop() {
  fs.writeFileSync(STOP_FILE, new Date().toISOString());
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

module.exports = {
  STATE_FILE,
  STOP_FILE,
  PID_FILE,
  LOG_FILE,
  readState,
  writeState,
  shouldStop,
  clearStop,
  requestStop,
  appendLog,
  writePid,
  readPid,
  clearPid,
};
