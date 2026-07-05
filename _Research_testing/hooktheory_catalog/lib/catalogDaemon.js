/**
 * Long-running catalog daemon: discover all songs, then enrich pending queue.
 *
 *   node catalogDaemon.js --phase auto
 *   node catalogDaemon.js --phase discover
 *   node catalogDaemon.js --phase enrich --interval-ms 25000
 */

const config = require('./catalogConfig');
const { openDb, getCatalogStatus } = require('./db');
const { discoverUrls } = require('./discover');
const { enrichNextPending, launchBrowser } = require('./enrich');
const {
  readState,
  writeState,
  shouldStop,
  clearStop,
  appendLog,
  writePid,
  clearPid,
} = require('./daemonState');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitteredInterval() {
  const j = Math.floor(Math.random() * config.jitterMs * 2) - config.jitterMs;
  return Math.max(1000, config.intervalMs + j);
}

function parseArgs(argv) {
  const out = {
    phase: 'auto',
    intervalMs: config.intervalMs,
    maxSongs: config.defaultMaxSongs,
    batchLog: config.batchLogEvery,
    skipLegacy: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--phase') out.phase = argv[++i] || 'auto';
    else if (argv[i] === '--interval-ms') out.intervalMs = Number(argv[++i]) || config.intervalMs;
    else if (argv[i] === '--max-songs') out.maxSongs = Number(argv[++i]) || 0;
    else if (argv[i] === '--batch-log') out.batchLog = Number(argv[++i]) || 10;
    else if (argv[i] === '--skip-legacy') out.skipLegacy = true;
  }
  return out;
}

async function runDiscoverPhase(db, state, opts) {
  if (state.discovery_complete && opts.phase !== 'discover') {
    appendLog('[daemon] discovery already complete, skipping');
    return state;
  }

  appendLog(`[daemon] discover start offset=${state.discover_offset || 0}`);
  writeState({ phase: 'discover', running: true, started_at: state.started_at || new Date().toISOString() });

  const result = await discoverUrls({
    db,
    mode: 'full',
    maxMeiliPages: 0,
    resumeOffset: state.discover_offset || 0,
    forceMeili: true,
    meiliOnly: (state.discover_offset || 0) > 0,
    skipLegacy: opts.skipLegacy || (state.discover_offset || 0) > 0,
    skipRecent: (state.discover_offset || 0) > 0,
    skipSearch: (state.discover_offset || 0) > 0,
    onMeiliPage: ({ page, offset, uniqueCount }) => {
      writeState({ discover_offset: offset, discover_page: page, discover_unique: uniqueCount });
      if (shouldStop()) throw new Error('STOP_REQUESTED');
    },
  });

  const next = writeState({
    discovery_complete: true,
    discover_offset: result.finalOffset,
    phase: 'enrich',
  });
  appendLog(`[daemon] discover done total=${db.prepare('SELECT COUNT(*) AS n FROM songs').get().n} offset=${result.finalOffset}`);
  require('./libraryCache').invalidateLibraryCache();
  return next;
}

async function runEnrichPhase(db, opts) {
  appendLog(`[daemon] enrich start interval=${opts.intervalMs}ms`);
  writeState({ phase: 'enrich', running: true });

  const browser = await launchBrowser();
  let enriched = 0;
  let errors = 0;

  try {
    while (!shouldStop()) {
      if (opts.maxSongs > 0 && enriched >= opts.maxSongs) {
        appendLog(`[daemon] max-songs cap reached (${opts.maxSongs})`);
        break;
      }

      const pending = db.prepare("SELECT COUNT(*) AS n FROM songs WHERE status='pending'").get().n;
      if (pending === 0) {
        appendLog('[daemon] no pending songs');
        break;
      }

      const { done, result } = await enrichNextPending(db, { browser });
      if (done) break;

      if (result.ok) {
        enriched++;
        writeState({
          songs_enriched_session: (readState().songs_enriched_session || 0) + 1,
          last_slug: result.slug,
          last_enriched_at: new Date().toISOString(),
        });
        require('./libraryCache').invalidateLibraryCache();
        if (enriched % opts.batchLog === 0) {
          const st = getCatalogStatus(db);
          appendLog(`[daemon] progress enriched=${st.totals.enriched} pending=${st.totals.pending} last=${result.slug}`);
        }
      } else {
        errors++;
        appendLog(`[daemon] error ${result.slug}: ${result.error}`);
      }

      if (shouldStop()) break;
      await sleep(jitteredInterval());
    }
  } finally {
    await browser.close();
  }

  appendLog(`[daemon] enrich session done ok=${enriched} errors=${errors}`);
  return { enriched, errors };
}

async function runDaemon(argvOpts = {}) {
  const opts = { ...parseArgs(process.argv.slice(2)), ...argvOpts };
  config.intervalMs = opts.intervalMs;

  clearStop();
  writePid(process.pid);
  const db = openDb();
  let state = readState();

  writeState({
    running: true,
    started_at: state.started_at || new Date().toISOString(),
    phase: opts.phase === 'auto' ? (state.discovery_complete ? 'enrich' : 'discover') : opts.phase,
    songs_enriched_session: 0,
  });

  appendLog(`[daemon] started pid=${process.pid} phase=${opts.phase}`);

  try {
    if (opts.phase === 'discover' || (opts.phase === 'auto' && !state.discovery_complete)) {
      try {
        state = await runDiscoverPhase(db, state, opts);
      } catch (e) {
        if (e.message === 'STOP_REQUESTED') {
          appendLog('[daemon] discover stopped by user');
          writeState({ running: false });
          return;
        }
        throw e;
      }
      if (shouldStop() || opts.phase === 'discover') {
        writeState({ running: false });
        appendLog('[daemon] stopped after discover');
        return;
      }
    }

    if (opts.phase === 'enrich' || opts.phase === 'auto') {
      await runEnrichPhase(db, opts);
    }
  } catch (e) {
    appendLog(`[daemon] fatal: ${e.message}`);
    writeState({ running: false, error: e.message });
    throw e;
  } finally {
    writeState({ running: false, finished_at: new Date().toISOString() });
    clearPid();
    appendLog('[daemon] exited');
  }
}


module.exports = { runDaemon, parseArgs };
