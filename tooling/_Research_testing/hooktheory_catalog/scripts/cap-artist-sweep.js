/**
 * Deadline cap for the artist-page sweep.
 *
 * Measured mid-run: the sweep yields ~66 new songs per 3,046 artists checked
 * — far below projection, because the Wayback channel already ingested the
 * same recently-added songs. Meanwhile it paces at ~3.2s/artist, so finishing
 * all 12,137 would take ~8 more hours and starve every phase after it
 * (artist-harvest, verify, export, publish, meili-refresh).
 *
 * Trading the sparse tail (measured ~0 yield) for a completed, published run
 * is the right call. At the deadline this ingests whatever the sweep found,
 * marks the phase done, and kills the run so the watchdog restarts it into the
 * remaining phases.
 *
 *   node scripts/cap-artist-sweep.js --at 2026-08-11T16:30:00Z
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { openDb, upsertSong } = require('../lib/db');
const { dataPath } = require('../lib/paths');
const { parseTheoryTabUrl } = require('../lib/catalogUtils');

const STATE_FILE = dataPath('overnight_run_state.json');
const FOUND_FILE = path.join(dataPath('.'), 'wayback', 'artist-sweep-found.json');
const LOG_FILE = dataPath('overnight_run.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] [capper] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) { return null; }
}

function sweepFinished() {
  const st = readState();
  return st?.phases?.['artist-sweep']?.status === 'done';
}

function ingestFound() {
  if (!fs.existsSync(FOUND_FILE)) return 0;
  let found;
  try { found = JSON.parse(fs.readFileSync(FOUND_FILE, 'utf8')); } catch (_) { return 0; }
  if (!Array.isArray(found) || !found.length) return 0;

  const db = openDb();
  let inserted = 0;
  try {
    const tx = db.transaction((rows) => {
      for (const f of rows) {
        const parsed = parseTheoryTabUrl(f.url);
        if (parsed && upsertSong(db, { ...parsed, discovery_source: 'artist-page' })) inserted += 1;
      }
    });
    tx(found);
  } finally {
    db.close();
  }
  return inserted;
}

function markSweepDone(extra) {
  const st = readState();
  if (!st) return false;
  st.phases['artist-sweep'] = {
    ...(st.phases['artist-sweep'] || {}),
    status: 'done',
    at: new Date().toISOString(),
    cappedByDeadline: true,
    ...extra,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2));
  return true;
}

/**
 * Find the overnight-run PIDs. The PowerShell goes through a temp .ps1 rather
 * than -Command: `$_` inside a quoted inline command gets mangled by the
 * intervening shells, and a process-kill is not something to leave to quoting
 * luck. Matching on the script name also guarantees the capper never kills
 * itself (its own command line says cap-artist-sweep.js).
 */
function findRunPids() {
  const psFile = path.join(__dirname, '.find-run-pids.ps1');
  fs.writeFileSync(psFile,
    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*overnight-run.js*' } | ForEach-Object { $_.ProcessId }\n");
  try {
    return execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
  } catch (_) {
    return [];
  } finally {
    try { fs.unlinkSync(psFile); } catch (_) {}
  }
}

function killRun() {
  const pids = findRunPids();
  for (const pid of pids) {
    try {
      execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force"`, { encoding: 'utf8' });
    } catch (_) { /* already gone */ }
  }
  return pids;
}

async function main() {
  if (process.argv.includes('--dry-run')) {
    log(`dry-run: matched overnight-run pid(s): ${findRunPids().join(',') || '(none)'}`);
    log(`dry-run: sweep finished? ${sweepFinished()}`);
    return;
  }

  const atArg = process.argv[process.argv.indexOf('--at') + 1];
  const deadline = new Date(atArg).getTime();
  if (!Number.isFinite(deadline)) throw new Error(`bad --at value: ${atArg}`);

  log(`armed; will cap artist-sweep at ${new Date(deadline).toISOString()}`);

  while (Date.now() < deadline) {
    if (sweepFinished()) { log('sweep finished on its own before deadline — nothing to cap'); return; }
    await new Promise((r) => setTimeout(r, 60000));
  }

  if (sweepFinished()) { log('sweep finished on its own — nothing to cap'); return; }

  const st = readState();
  const progress = st?.phases?.['artist-sweep'] || {};
  log(`deadline reached at artist ${progress.progressIndex}/12137 (found=${progress.found}) — capping`);

  const inserted = ingestFound();
  log(`ingested ${inserted} artist-page songs into catalog`);

  markSweepDone({ cappedAtIndex: progress.progressIndex, ingested: inserted });
  log('artist-sweep marked done in phase ledger');

  const pids = killRun();
  log(`killed overnight-run pid(s): ${pids.join(',') || 'none found'} — watchdog will resume into remaining phases`);
}

if (require.main === module) {
  main().catch((err) => { log(`FATAL: ${err.stack || err.message}`); process.exit(1); });
}
