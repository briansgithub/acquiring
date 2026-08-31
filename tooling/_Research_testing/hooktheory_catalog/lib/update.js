/**
 * Catalog update orchestrator.
 *
 *   node _Research_testing/hooktheory_catalog/update.js --mode quick
 *   node _Research_testing/hooktheory_catalog/update.js --mode full --enrich-limit 50
 *   node _Research_testing/hooktheory_catalog/update.js --discover-only
 *   node _Research_testing/hooktheory_catalog/update.js --enrich-only --enrich-limit 100
 */

const fs = require('fs');
const path = require('path');
const { openDb, startDiscoveryRun, finishDiscoveryRun, getCatalogStatus } = require('./db');
const { discoverUrls } = require('./discover');
const { enrichPending } = require('./enrich');

const { dataPath } = require('./paths');
const STATE_FILE = dataPath('.update_state.json');

function parseArgs(argv) {
  const out = {
    mode: 'quick',
    enrichLimit: 20,
    maxPages: 3,
    maxMeiliPages: 0,
    discoverOnly: false,
    enrichOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode') out.mode = argv[++i] || 'quick';
    else if (argv[i] === '--enrich-limit') out.enrichLimit = Number(argv[++i]) || 20;
    else if (argv[i] === '--pages') out.maxPages = Number(argv[++i]) || 3;
    else if (argv[i] === '--meili-pages') out.maxMeiliPages = Number(argv[++i]) || 0;
    else if (argv[i] === '--discover-only') out.discoverOnly = true;
    else if (argv[i] === '--enrich-only') out.enrichOnly = true;
  }
  if (out.mode === 'full' && !out.maxMeiliPages) out.maxMeiliPages = 400;
  return out;
}

function writeState(patch) {
  const prev = fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    : {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

async function runUpdate(args = {}) {
  const opts = { ...parseArgs(process.argv.slice(2)), ...args };
  const db = openDb();
  const beforeTotal = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
  const runId = startDiscoveryRun(db, opts.mode);
  const summary = { new_count: 0, enriched_count: 0, error_count: 0, notes: [] };

  writeState({ running: true, mode: opts.mode, startedAt: new Date().toISOString() });

  try {
    if (!opts.enrichOnly) {
      const before = beforeTotal;
      await discoverUrls({
        mode: opts.mode,
        maxPages: opts.maxPages,
        maxMeiliPages: opts.maxMeiliPages,
        db,
      });
      const after = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
      summary.new_count = after - before;
      summary.notes.push(`discover: +${summary.new_count} new (${after} total)`);
    }

    if (!opts.discoverOnly) {
      const results = await enrichPending({ limit: opts.enrichLimit, db });
      summary.enriched_count = results.filter((r) => r.ok).length;
      summary.error_count = results.filter((r) => !r.ok).length;
      summary.notes.push(`enrich: ${summary.enriched_count} ok, ${summary.error_count} failed`);
    }

    finishDiscoveryRun(db, runId, summary);
    const status = getCatalogStatus(db);
    const state = writeState({
      running: false,
      finishedAt: new Date().toISOString(),
      lastRunId: runId,
      status,
      summary,
    });
    return state;
  } catch (e) {
    finishDiscoveryRun(db, runId, { ...summary, error_count: summary.error_count + 1, notes: [...summary.notes, e.message] });
    writeState({ running: false, error: e.message, finishedAt: new Date().toISOString() });
    throw e;
  }
}

async function main() {
  const state = await runUpdate();
  console.log(JSON.stringify(state, null, 2));
}

module.exports = { runUpdate, writeState, STATE_FILE, main };
