/**
 * Sustained-backoff layer on top of per-request retry.
 *
 * fetchWithRetry (api/hooktheoryApi.js) and rateLimitPool already handle a
 * single request hitting a 429/5xx. This is the layer above that: if
 * rate-limit-shaped failures keep clustering across many songs, the whole
 * run's own pacing floor backs off (multiplicative), and decays back toward
 * the base pace once things have been quiet for a while (additive-ish
 * recovery, halving the multiplier rather than snapping back to 1x).
 */

function isRateLimitShaped(err) {
  const msg = String(err?.message || err || '');
  return /\b429\b|rate.?limit|too many requests|\b503\b|\b502\b|ETIMEDOUT|ECONNRESET|ECONNREFUSED/i.test(msg);
}

class AdaptivePacer {
  constructor({
    baseMs,
    maxMultiplier = 8,
    windowSize = 8,
    rateErrorThreshold = 2,
    decayAfterSuccesses = 15,
    onChange = null,
  } = {}) {
    this.baseMs = baseMs;
    this.maxMultiplier = maxMultiplier;
    this.windowSize = windowSize;
    this.rateErrorThreshold = rateErrorThreshold;
    this.decayAfterSuccesses = decayAfterSuccesses;
    this.onChange = onChange;
    this.multiplier = 1;
    this.recentIsRateErr = [];
    this.successStreak = 0;
  }

  /** Call after every attempt with the error (or null/undefined on success). */
  recordResult(err) {
    const rateErr = err ? isRateLimitShaped(err) : false;
    this.recentIsRateErr.push(rateErr);
    if (this.recentIsRateErr.length > this.windowSize) this.recentIsRateErr.shift();

    if (rateErr) {
      this.successStreak = 0;
      const count = this.recentIsRateErr.filter(Boolean).length;
      if (count >= this.rateErrorThreshold && this.multiplier < this.maxMultiplier) {
        this.multiplier = Math.min(this.maxMultiplier, this.multiplier * 2);
        this.onChange?.({ direction: 'slower', multiplier: this.multiplier, intervalMs: this.currentIntervalMs() });
      }
    } else {
      this.successStreak += 1;
      if (this.successStreak >= this.decayAfterSuccesses && this.multiplier > 1) {
        this.multiplier = Math.max(1, this.multiplier / 2);
        this.successStreak = 0;
        this.onChange?.({ direction: 'faster', multiplier: this.multiplier, intervalMs: this.currentIntervalMs() });
      }
    }
  }

  currentIntervalMs() {
    return Math.round(this.baseMs * this.multiplier);
  }

  jittered(jitterMs) {
    const base = this.currentIntervalMs();
    const j = Math.floor(Math.random() * jitterMs * 2) - jitterMs;
    return Math.max(1000, base + j);
  }
}

module.exports = { AdaptivePacer, isRateLimitShaped };
