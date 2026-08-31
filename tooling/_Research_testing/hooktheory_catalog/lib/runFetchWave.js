/**
 * Core full-fetch wave runner — compare each slug immediately after fetch.
 */

const { setHarvestMode, setSongStatus } = require('./db');
const { harvestSong } = require('./harvest');
const {
  listFetchQueuePending,
  setFetchQueueStatus,
  rebuildErrorSignatures,
  getErrorCatalogStats,
} = require('./engineErrorDb');
const {
  shouldStop,
  shouldPause,
  waitWhilePaused,
  appendLog,
} = require('./fullFetchState');
const {
  startWave,
  appendWaveSlug,
  finishWave,
  shouldPauseForFix,
} = require('./fetchWaveManifest');
const { compareSlugToDb } = require('./compareCatalogSong');
const { loadHarvest } = require('./harvestArtifact');

const INTERVAL_MS = Number(process.env.FULL_FETCH_INTERVAL_MS || 45000);
const JITTER_MS = Number(process.env.FULL_FETCH_JITTER_MS || 5000);
const ROLLUP_EVERY = Number(process.env.FETCH_ROLLUP_EVERY || 5);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitteredDelay() {
  const j = Math.floor(Math.random() * JITTER_MS * 2) - JITTER_MS;
  return Math.max(5000, INTERVAL_MS + j);
}

function hasFullRendered(slug) {
  const h = loadHarvest(slug);
  if (!h) return false;
  return (h.scrape.sections || []).some((s) => (s.rendered || []).length > 0);
}

async function compareAndTrack(slug, db, waveId, rollupCounter) {
  const res = await compareSlugToDb(slug, db);
  if (waveId) appendWaveSlug(waveId, slug, { comparedRows: res.written });
  if (rollupCounter.count % ROLLUP_EVERY === 0) rebuildErrorSignatures(db);
  rollupCounter.count += 1;
  return res;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ limit?: number, compare?: boolean, waveId?: string }} opts
 */
async function runFetchWave(db, opts = {}) {
  const limit = opts.limit ?? 50;
  const compare = opts.compare !== false;
  const waveId = opts.waveId || `wave-${Date.now()}`;

  if (opts.trackWave !== false) startWave(waveId, { limit });

  const queue = listFetchQueuePending(db, limit);
  console.log(`[batchFullFetch] wave=${waveId} ${queue.length} pending`);

  let ok = 0;
  let fail = 0;
  const rollupCounter = { count: 0 };

  for (let i = 0; i < queue.length; i++) {
    if (shouldStop()) {
      console.log('[batchFullFetch] stop file detected');
      break;
    }
    if (shouldPauseForFix()) {
      console.log('[batchFullFetch] paused for fix (.fetch_pause_for_fix)');
      await sleep(2000);
      i -= 1;
      continue;
    }
    await waitWhilePaused();

    const row = queue[i];
    const { slug, url } = row;
    if (!url) {
      setFetchQueueStatus(db, slug, 'skipped');
      continue;
    }

    let fetched = false;
    if (hasFullRendered(slug)) {
      setHarvestMode(db, slug, 'full');
      setFetchQueueStatus(db, slug, 'full', new Date().toISOString());
      appendLog(`skip cached full: ${slug}`);
      ok += 1;
      fetched = true;
    } else {
      console.log(`[${i + 1}/${queue.length}] fetch ${slug}`);
      appendLog(`fetch start: ${slug}`);
      try {
        await harvestSong(url, { rescrape: true });
        setHarvestMode(db, slug, 'full');
        setFetchQueueStatus(db, slug, 'full', new Date().toISOString());
        ok += 1;
        fetched = true;
        appendLog(`fetch ok: ${slug}`);
      } catch (e) {
        fail += 1;
        const msg = e.message || String(e);
        if (/404|not found/i.test(msg)) {
          setSongStatus(db, slug, 'dead', msg);
          setFetchQueueStatus(db, slug, 'failed');
        } else {
          setFetchQueueStatus(db, slug, 'failed');
        }
        appendLog(`fetch fail: ${slug} — ${msg}`);
        console.warn(`  FAIL: ${msg}`);
      }
    }

    if (fetched && compare) {
      try {
        await compareAndTrack(slug, db, waveId, rollupCounter);
      } catch (e) {
        console.warn(`  compare skip ${slug}: ${e.message}`);
      }
    }

    if (i < queue.length - 1) await sleep(jitteredDelay());
  }

  if (compare) rebuildErrorSignatures(db);
  const stats = getErrorCatalogStats(db);
  if (opts.trackWave !== false) {
    finishWave(waveId, { ok, fail, engineFails: stats.engine_fails });
  }

  console.log(`[batchFullFetch] wave ${waveId} done ok=${ok} fail=${fail} engineFails=${stats.engine_fails}`);
  return { waveId, ok, fail, engineFails: stats.engine_fails, stats };
}

module.exports = { runFetchWave };
