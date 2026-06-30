/**
 * Portable data root for Sacred Ring — catalog DB, playback cache, harvest artifacts.
 *
 * Resolution order:
 *   1. SACRED_RING_DATA env (absolute path)
 *   2. sacred_ring_data.config.json { "dataRoot": "..." } in repo root
 *   3. <repo>/sacred_ring_data (default dev layout)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(REPO_ROOT, 'sacred_ring_data.config.json');
const DEFAULT_DATA_ROOT = path.join(REPO_ROOT, 'sacred_ring_data');

let _dataRoot = null;
let _migrated = false;

function getRepoRoot() {
  return REPO_ROOT;
}

function readConfigDataRoot() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (cfg.dataRoot && String(cfg.dataRoot).trim()) {
      return path.resolve(String(cfg.dataRoot).trim());
    }
  } catch (_) {
    // ignore bad config
  }
  return null;
}

function resolveDataRoot() {
  if (_dataRoot) return _dataRoot;
  const fromEnv = process.env.SACRED_RING_DATA;
  if (fromEnv && String(fromEnv).trim()) {
    _dataRoot = path.resolve(String(fromEnv).trim());
    return _dataRoot;
  }
  const fromConfig = readConfigDataRoot();
  if (fromConfig) {
    _dataRoot = fromConfig;
    return _dataRoot;
  }
  _dataRoot = DEFAULT_DATA_ROOT;
  return _dataRoot;
}

function getCatalogDir() {
  return path.join(resolveDataRoot(), 'catalog');
}

function getPlaybackCacheDir() {
  return path.join(resolveDataRoot(), 'playback', '.hooktheory_cache');
}

function getHarvestRoot() {
  return path.join(resolveDataRoot(), 'harvest');
}

function harvestDirForSlug(slug) {
  return path.join(getHarvestRoot(), slug);
}

function ensureDataDirs() {
  for (const dir of [getCatalogDir(), getPlaybackCacheDir(), getHarvestRoot()]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function relFromDataRoot(absPath) {
  const rel = path.relative(resolveDataRoot(), absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return absPath.split(path.sep).join('/');
  }
  return rel.split(path.sep).join('/');
}

/** Resolve a path stored relative to data root (with legacy repo-relative fallbacks). */
function resolveDataPath(relOrAbs) {
  if (!relOrAbs) return null;
  if (path.isAbsolute(relOrAbs)) return relOrAbs;

  const normalized = relOrAbs.split('/').join(path.sep);
  const primary = path.join(resolveDataRoot(), normalized);
  if (fs.existsSync(primary)) return primary;

  const legacyHarvest = normalized.replace(/^harvest[/\\]/, path.join('_Decode_oracle', 'out') + path.sep);
  const legacyRepo = path.join(REPO_ROOT, legacyHarvest);
  if (fs.existsSync(legacyRepo)) return legacyRepo;

  const legacyRepoDirect = path.join(REPO_ROOT, normalized);
  if (fs.existsSync(legacyRepoDirect)) return legacyRepoDirect;

  return primary;
}

function copyDirContents(src, dest, { overwrite = false } = {}) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDirContents(from, to, { overwrite });
    } else if (!fs.existsSync(to) || overwrite) {
      fs.copyFileSync(from, to);
    }
  }
  return true;
}

function copyFileIfMissing(src, dest) {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/** One-time migration from legacy in-repo paths to sacred_ring_data/. */
function migrateLegacyData() {
  if (_migrated) return;
  _migrated = true;
  ensureDataDirs();

  const legacyCatalog = path.join(REPO_ROOT, '_Research_testing', 'hooktheory_catalog', 'data');
  if (fs.existsSync(legacyCatalog)) {
    for (const ent of fs.readdirSync(legacyCatalog, { withFileTypes: true })) {
      const from = path.join(legacyCatalog, ent.name);
      const to = path.join(getCatalogDir(), ent.name);
      if (ent.isDirectory()) copyDirContents(from, to);
      else copyFileIfMissing(from, to);
    }
  }

  const legacyCache = path.join(REPO_ROOT, '.hooktheory_cache');
  copyDirContents(legacyCache, getPlaybackCacheDir(), { overwrite: true });

  const legacyHarvest = path.join(REPO_ROOT, '_Decode_oracle', 'out');
  if (fs.existsSync(legacyHarvest)) {
    for (const ent of fs.readdirSync(legacyHarvest, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const from = path.join(legacyHarvest, ent.name);
      const to = path.join(getHarvestRoot(), ent.name);
      copyDirContents(from, to);
    }
  }

  migrateDbOraclePaths();
}

function migrateDbOraclePaths() {
  const dbPath = path.join(getCatalogDir(), 'hooktheory_catalog.db');
  if (!fs.existsSync(dbPath)) return;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    db.prepare(`
      UPDATE songs
      SET oracle_out_dir = 'harvest/' || substr(oracle_out_dir, length('_Decode_oracle/out/') + 1)
      WHERE oracle_out_dir LIKE '_Decode_oracle/out/%'
    `).run();
    db.close();
  } catch (_) {
    // DB may be locked or missing better-sqlite3 in some contexts
  }
}

// Auto-migrate on first require in normal app flows
migrateLegacyData();

module.exports = {
  getRepoRoot,
  resolveDataRoot,
  getCatalogDir,
  getPlaybackCacheDir,
  getHarvestRoot,
  harvestDirForSlug,
  ensureDataDirs,
  relFromDataRoot,
  resolveDataPath,
  migrateLegacyData,
  DEFAULT_DATA_ROOT,
};
