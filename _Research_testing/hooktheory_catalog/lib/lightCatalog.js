/**
 * Light catalog batch: Meili discover + API-only harvest (rate-limited, pausable).
 */

const config = require('./catalogConfig');
const { openDb } = require('./db');
const { discoverUrls } = require('./discover');
const {
  harvestLightSong,
  countSongsNeedingLightHarvest,
  listSongsNeedingLightHarvest,
} = require('./lightHarvest');
const { launchBrowser } = require('./theoryTabSections');
const {
  readState,
  writeState,
  shouldStop,
  shouldPause,
  clearStop,
  clearPause,
  appendLog,
  writePid,
  clearPid,
} = require('./lightCatalogState');

const INTERVAL_MS = Number(process.env.LIGHT_CATALOG_INTERVAL_MS || 4000);
const JITTER_MS = Number(process.env.LIGHT_CATALOG_JITTER_MS || 1500);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitteredDelay() {
  const j = Math.floor(Math.random() * JITTER_MS * 2) - JITTER_MS;
  return Math.max(1000, INTERVAL_MS + j);
}

async function waitWhilePaused() {
  while (shouldPause() && !shouldStop()) {
    writeState({ paused: true });
    await sleep(500);
  }
  writeState({ paused: false });
}

function parseArgs(argv) {
  const out = {
    limit: 50,
    all: false,
    discoverOnly: false,
    harvestOnly: false,
    force: false,
    slugs: null,
    meiliPages: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') out.limit = Number(argv[++i]) || 50;
    else if (a === '--all') out.all = true;
    else if (a === '--discover-only') out.discoverOnly = true;
    else if (a === '--harvest-only' || a === '--db-only') out.harvestOnly = true;
    else if (a === '--force') out.force = true;
    else if (a === '--meili-pages') out.meiliPages = Number(argv[++i]) || 0;
    else if (a === '--slugs') out.slugs = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (out.all) out.meiliPages = 0;
  return out;
}

async function runDiscoverPhase(db, opts, state) {
  writeState({ phase: 'discover', running: true, paused: false });
  appendLog(`[light-catalog] discover start offset=${state.discover_offset || 0}`);

  const result = await discoverUrls({
    db,
    mode: 'full',
    forceMeili: true,
    meiliOnly: (state.discover_offset || 0) > 0,
    skipLegacy: (state.discover_offset || 0) > 0,
    skipRecent: true,
    skipSearch: true,
    maxMeiliPages: opts.all ? 0 : opts.meiliPages,
    resumeOffset: state.discover_offset || 0,
    onMeiliPage: ({ offset, uniqueCount }) => {
      writeState({
        discover_offset: offset,
        songs_discovered_session: uniqueCount,
        discover_total_estimate: 76000,
      });
      if (shouldStop()) throw new Error('STOP_REQUESTED');
    },
  });

  writeState({
    discover_offset: result.finalOffset,
    discovery_complete: result.discovery_complete,
    songs_discovered_session: result.meiliResult?.uniqueSongs ?? readState().songs_discovered_session,
  });
  appendLog(`[light-catalog] discover done offset=${result.finalOffset} new=${result.newCount}`);
  return result;
}

async function runHarvestPhase(db, opts) {
  writeState({ phase: 'harvest', running: true });
  appendLog(`[light-catalog] harvest start limit=${opts.limit}`);

  let harvested = 0;
  let failed = 0;
  const skipSlugs = new Set();
  let browser = null;

  try {
    browser = await launchBrowser();

    while (!shouldStop()) {
      await waitWhilePaused();

      const remaining = countSongsNeedingLightHarvest(db, { force: opts.force });
      writeState({ queue_remaining: remaining });

      if (opts.limit > 0 && harvested >= opts.limit) {
        appendLog(`[light-catalog] harvest limit reached (${opts.limit})`);
        break;
      }
      if (remaining === 0) {
        appendLog('[light-catalog] no songs left in light harvest queue');
        break;
      }

      const batchLimit = opts.limit > 0 ? Math.min(remaining, opts.limit - harvested) : remaining;
      const queue = listSongsNeedingLightHarvest(db, Math.max(1, batchLimit), {
        force: opts.force,
        slugs: opts.slugs,
        skipSlugs: [...skipSlugs],
      });
      if (!queue.length) break;

      const song = queue[0];
      writeState({ current_slug: song.slug, queue_remaining: remaining });

      try {
        const result = await harvestLightSong(db, song.slug, song.url, { browser });
        if (result?.skipped) {
          skipSlugs.add(song.slug);
          appendLog(`[light-catalog] skip ${song.slug}: ${result.reason}`);
          continue;
        }
        harvested++;
        writeState({
          songs_harvested_session: harvested,
          last_error: null,
        });
        appendLog(`[light-catalog] harvested ${song.slug} (${harvested} ok)`);
      } catch (e) {
        failed++;
        skipSlugs.add(song.slug);
        writeState({
          songs_failed_session: failed,
          last_error: `${song.slug}: ${e.message}`,
        });
        appendLog(`[light-catalog] failed ${song.slug}: ${e.message}`);
      }

      if (shouldStop()) break;
      await sleep(jitteredDelay());
    }
  } finally {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
  }

  appendLog(`[light-catalog] harvest done ok=${harvested} failed=${failed}`);
  return { harvested, failed };
}

async function runLightCatalog(argvOpts = {}) {
  const opts = { ...parseArgs(process.argv.slice(2)), ...argvOpts };
  clearStop();
  clearPause();
  writePid(process.pid);

  const db = openDb();
  let state = readState();

  writeState({
    running: true,
    paused: false,
    phase: 'idle',
    started_at: state.started_at && state.running ? state.started_at : new Date().toISOString(),
    finished_at: null,
    songs_harvested_session: 0,
    songs_failed_session: 0,
    last_error: null,
  });

  appendLog(`[light-catalog] started pid=${process.pid} opts=${JSON.stringify(opts)}`);

  try {
    if (!opts.harvestOnly) {
      try {
        await runDiscoverPhase(db, opts, state);
      } catch (e) {
        if (e.message === 'STOP_REQUESTED') {
          appendLog('[light-catalog] discover stopped by user');
          return;
        }
        throw e;
      }
      if (shouldStop() || opts.discoverOnly) {
        appendLog('[light-catalog] stopped after discover');
        return;
      }
    }

    if (!opts.discoverOnly) {
      await runHarvestPhase(db, opts);
    }
  } finally {
    writeState({
      running: false,
      phase: 'idle',
      current_slug: null,
      finished_at: new Date().toISOString(),
      paused: false,
    });
    clearPid();
    appendLog('[light-catalog] exited');
  }
}

module.exports = { runLightCatalog, parseArgs };
