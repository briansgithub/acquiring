/**
 * Unattended supervisor for the full catalog-recovery run.
 *
 * Wraps cli/overnight-run.js so the whole thing can be started once and left
 * alone for as long as it takes:
 *
 *   - attempt 1 passes --fresh, because the previous run left every phase
 *     marked `done`; without it the export/publish phases would be skipped and
 *     nothing would ever ship.
 *   - retries deliberately omit --fresh so they RESUME the phase ledger. A
 *     --fresh retry loop would reset progress forever and never finish.
 *   - --resume suppresses that first --fresh, for picking a run back up after
 *     it was killed mid-phase. Without it the restart would discard the artist
 *     sweep's progressIndex and re-walk thousands of already-visited artists.
 *   - a non-zero exit is retried with backoff; overnight-run already isolates
 *     per-phase failures, so reaching here means a top-level fault worth
 *     re-entering rather than abandoning the run.
 *   - `.overnight_stop` in the catalog data dir halts cleanly, and is treated
 *     as an intentional stop rather than a crash to retry.
 *
 *   node scripts/run-full-recovery.js [--resume]
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { dataPath } = require('../lib/paths');

const CATALOG_ROOT = path.join(__dirname, '..');
const STOP_FILE = dataPath('.overnight_stop');
const SUPERVISOR_LOG = dataPath('full_recovery_supervisor.log');

const MAX_ATTEMPTS = Number(process.env.RECOVERY_MAX_ATTEMPTS || 20);
const BACKOFF_MS = Number(process.env.RECOVERY_BACKOFF_MS || 60_000);

const BASE_ARGS = ['--with-artist-sweep', '--publish', '--drop-dead-rows'];
const RESUME = process.argv.slice(2).includes('--resume');

function log(msg) {
  const line = `[${new Date().toISOString()}] [supervisor] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(SUPERVISOR_LOG, line + '\n'); } catch (_) {}
}

function runOnce(args) {
  return new Promise((resolve) => {
    const child = spawn('node', ['cli/overnight-run.js', ...args], {
      cwd: CATALOG_ROOT,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code == null ? 1 : code));
    child.on('error', (err) => { log(`spawn error: ${err.message}`); resolve(1); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (fs.existsSync(STOP_FILE)) {
    log(`stop file present at ${STOP_FILE} — remove it before starting.`);
    process.exit(1);
  }

  log(`starting full recovery run (max ${MAX_ATTEMPTS} attempts, ${RESUME ? 'RESUMING existing ledger' : 'fresh ledger'})`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Only the first attempt resets the ledger, and only when not resuming;
    // every retry resumes it.
    const args = (attempt === 1 && !RESUME) ? ['--fresh', ...BASE_ARGS] : [...BASE_ARGS];
    log(`attempt ${attempt}/${MAX_ATTEMPTS}: overnight-run.js ${args.join(' ')}`);

    const code = await runOnce(args);

    if (code === 0) {
      log('overnight-run completed cleanly — recovery run finished.');
      return;
    }
    if (fs.existsSync(STOP_FILE)) {
      log('stop file appeared — halting as requested (not a crash).');
      return;
    }
    log(`overnight-run exited ${code}; retrying in ${Math.round(BACKOFF_MS / 1000)}s`);
    await sleep(BACKOFF_MS);
  }

  log(`giving up after ${MAX_ATTEMPTS} attempts — inspect ${dataPath('overnight_run.log')}`);
  process.exit(1);
}

main().catch((err) => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
