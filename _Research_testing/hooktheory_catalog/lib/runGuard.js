/**
 * Resilience primitives for long unattended runs.
 *
 * Design goal: the run supervises itself locally. No AI in the loop — every
 * decision here (slow down, cool off, skip, resume, give up on a phase) is
 * made by plain code from observed error shapes.
 */

const fs = require('fs');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Error taxonomy drives the response:
 *   rate-limit -> back off hard, keep going (we are the problem, slow down)
 *   blocked    -> long cooldown; if it persists the host is refusing us
 *   transient  -> short retry (network blip, 5xx)
 *   permanent  -> skip this item, do not retry (404, junk URL)
 */
function classifyError(err) {
  const msg = String(err?.message || err || '');
  const status = err?.status;

  if (status === 429 || /\b429\b|rate.?limit|too many requests/i.test(msg)) return 'rate-limit';
  if (status === 403 || /\b403\b|forbidden|cloudflare|captcha|access denied|blocked/i.test(msg)) return 'blocked';
  if (status === 404 || /\b404\b|invalid or junk|no resolvable sections|permanent/i.test(msg)) return 'permanent';
  if (
    (status >= 500 && status < 600)
    || /\b5\d\d\b|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|timeout/i.test(msg)
  ) return 'transient';
  return 'transient';
}

/**
 * Trips after `threshold` consecutive non-permanent failures, forcing a
 * cooldown so we stop hammering a host that is clearly unhappy. Permanent
 * failures (404s) never trip it — a run of dead URLs is normal and expected.
 */
class CircuitBreaker {
  constructor({ threshold = 12, cooldownMs = 10 * 60 * 1000, maxTrips = 6, onEvent = null } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.maxTrips = maxTrips;
    this.onEvent = onEvent;
    this.consecutive = 0;
    this.trips = 0;
  }

  recordSuccess() {
    this.consecutive = 0;
  }

  /** @returns {'ok'|'cooldown'|'give-up'} */
  recordFailure(kind) {
    if (kind === 'permanent') return 'ok';
    this.consecutive += 1;
    if (this.consecutive < this.threshold) return 'ok';

    this.trips += 1;
    this.consecutive = 0;
    if (this.trips > this.maxTrips) {
      this.onEvent?.({ type: 'give-up', trips: this.trips });
      return 'give-up';
    }
    this.onEvent?.({ type: 'trip', trips: this.trips, cooldownMs: this.cooldownMs * this.trips });
    return 'cooldown';
  }

  /** Cooldown lengthens with each trip. */
  cooldownFor() {
    return this.cooldownMs * Math.max(1, this.trips);
  }
}

/** Retry a single operation. Permanent errors are not retried. */
async function withRetry(fn, { retries = 3, baseMs = 2000, maxMs = 120000, onRetry = null } = {}) {
  let delay = baseMs;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const kind = classifyError(err);
      if (kind === 'permanent' || attempt === retries) throw err;
      const wait = kind === 'rate-limit' || kind === 'blocked'
        ? Math.min(delay * 4, maxMs)
        : delay;
      onRetry?.({ attempt: attempt + 1, kind, waitMs: wait, message: err.message });
      await sleep(wait);
      delay = Math.min(delay * 2, maxMs);
    }
  }
  throw new Error('withRetry: unreachable');
}

/** Persistent run state so a crash/restart resumes instead of redoing work. */
class RunState {
  constructor(file) {
    this.file = file;
    this.data = { phases: {}, restarts: 0, startedAt: new Date().toISOString() };
    if (fs.existsSync(file)) {
      try {
        this.data = { ...this.data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
      } catch (_) { /* corrupt state: start fresh rather than crash */ }
    }
  }

  save() {
    this.data.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  phase(name) {
    return this.data.phases[name] || { status: 'pending' };
  }

  isDone(name) {
    return this.phase(name).status === 'done';
  }

  setPhase(name, patch) {
    this.data.phases[name] = { ...this.phase(name), ...patch, at: new Date().toISOString() };
    this.save();
  }
}

module.exports = { sleep, classifyError, CircuitBreaker, withRetry, RunState };
