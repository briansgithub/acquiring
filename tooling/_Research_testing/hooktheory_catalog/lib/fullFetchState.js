/**
 * Full-fetch batch worker state (pause / stop / log).
 */

const fs = require('fs');
const { dataPath } = require('./paths');

const STOP_FILE = dataPath('.full_fetch_stop');
const PAUSE_FILE = dataPath('.full_fetch_pause');
const LOG_FILE = dataPath('full_fetch.log');

function shouldStop() {
  return fs.existsSync(STOP_FILE);
}

function shouldPause() {
  return fs.existsSync(PAUSE_FILE);
}

async function waitWhilePaused() {
  while (shouldPause() && !shouldStop()) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

function appendLog(line) {
  const ts = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${ts}] ${line}\n`);
}

module.exports = {
  STOP_FILE,
  PAUSE_FILE,
  LOG_FILE,
  shouldStop,
  shouldPause,
  waitWhilePaused,
  appendLog,
};
