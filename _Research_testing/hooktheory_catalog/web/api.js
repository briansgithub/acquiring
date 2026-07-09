/**
 * Catalog API handlers for web-player server.
 */

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const zlib = require('zlib');

const { ROOT, CLI_DIR, dataPath } = require('../lib/paths');
const { STATE_FILE } = require('../lib/update');
const { STATE_FILE: DAEMON_STATE, STOP_FILE, PID_FILE } = require('../lib/daemonState');

let catalogJob = null;
let daemonJob = null;

function loadCatalogDb() {
  const { openDb, getCatalogStatus, listSongs, toggleFavorite } = require('../lib/db');
  return { openDb, getCatalogStatus, listSongs, toggleFavorite };
}

function loadQueries() {
  return require('../lib/queries');
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
    require('../lib/libraryCache').invalidateLibraryCache();
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

function handleCatalogSongs(res) {
  try {
    const { openDb } = loadCatalogDb();
    const { listAllSongsMinimal } = loadQueries();
    const db = openDb();
    const songs = listAllSongsMinimal(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ songs }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleCatalogSongDetail(reqUrl, res) {
  const slug = reqUrl.searchParams.get('slug');
  if (!slug) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'slug query param required' }));
    return;
  }
  try {
    const { openDb } = loadCatalogDb();
    const { getSongDetail, listSongSections } = loadQueries();
    const db = openDb();
    const song = getSongDetail(db, slug);
    if (!song) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'song not found' }));
      return;
    }
    const sections = listSongSections(db, slug);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ song, sections }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

let libraryGzipCache = null;

function handleLibraryList(req, res) {
  try {
    const { openDb } = loadCatalogDb();
    const { getLibraryCache, getCacheFilePath } = require('../lib/libraryCache');
    const db = openDb();
    const jsonString = getLibraryCache(db);
    const accept = req.headers['accept-encoding'] || '';
    if (accept.includes('gzip')) {
      const cacheFile = getCacheFilePath();
      const mtime = fs.existsSync(cacheFile) ? fs.statSync(cacheFile).mtimeMs : 0;
      if (!libraryGzipCache || libraryGzipCache.mtime !== mtime) {
        libraryGzipCache = { mtime, buf: zlib.gzipSync(jsonString) };
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Vary': 'Accept-Encoding',
      });
      res.end(libraryGzipCache.buf);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(jsonString);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleLibrarySong(reqUrl, res) {
  const slug = reqUrl.searchParams.get('slug');
  if (!slug) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'slug query param required' }));
    return;
  }
  try {
    const { openDb } = loadCatalogDb();
    const { getLibrarySong } = require('../lib/library');
    const db = openDb();
    const data = getLibrarySong(db, slug);
    if (!data) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'song not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleLibraryLoad(reqUrl, res) {
  const slug = reqUrl.searchParams.get('slug');
  if (!slug) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'slug query param required' }));
    return;
  }
  try {
    const { openDb } = loadCatalogDb();
    const { resolveLoad } = require('../lib/library');
    const db = openDb();
    const result = resolveLoad(db, slug);
    if (!result.ok) {
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: result.error,
        flags: result.flags,
        missing: result.missing,
      }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      slug: result.slug,
      cacheKey: result.cacheKey,
      url: result.url,
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleLibraryFavoriteToggle(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    try {
      const { slug, isFavorite } = JSON.parse(body);
      if (!slug) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'slug is required' }));
        return;
      }
      const { openDb, toggleFavorite } = loadCatalogDb();
      const db = openDb();
      toggleFavorite(db, slug, !!isFavorite);
      require('../lib/libraryCache').invalidateLibraryCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, slug, isFavorite: !!isFavorite }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

module.exports = {
  ROOT,
  handleCatalogStatus,
  handleCatalogUpdate,
  handleDaemonStatus,
  handleDaemonStart,
  handleDaemonStop,
  handleCatalogSongs,
  handleCatalogSongDetail,
  handleLibraryList,
  handleLibrarySong,
  handleLibraryLoad,
  handleLibraryFavoriteToggle,
};
