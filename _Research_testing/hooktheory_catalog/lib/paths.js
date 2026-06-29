/**
 * Central paths for the isolated catalog module.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const LIB_DIR = path.join(ROOT, 'lib');
const CLI_DIR = path.join(ROOT, 'cli');
const WEB_DIR = path.join(ROOT, 'web');
const PROBES_DIR = path.join(ROOT, 'probes');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function migrateLegacyFile(name) {
  ensureDataDir();
  const legacy = path.join(ROOT, name);
  const target = path.join(DATA_DIR, name);
  if (fs.existsSync(legacy) && !fs.existsSync(target)) {
    fs.copyFileSync(legacy, target);
  }
  return target;
}

function dataPath(name) {
  ensureDataDir();
  migrateLegacyFile(name);
  return path.join(DATA_DIR, name);
}

module.exports = {
  ROOT,
  DATA_DIR,
  LIB_DIR,
  CLI_DIR,
  WEB_DIR,
  PROBES_DIR,
  SCRIPTS_DIR,
  RESEARCH_DIR: path.join(ROOT, '..'),
  REPO_ROOT: path.join(ROOT, '..', '..'),
  LEGACY_DISCOVERED: path.join(ROOT, '..', 'discovered_urls.json'),
  ensureDataDir,
  migrateLegacyFile,
  dataPath,
};
