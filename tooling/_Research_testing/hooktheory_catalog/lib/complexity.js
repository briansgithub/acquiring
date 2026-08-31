/**
 * Hooktheory-native complexity rating + local fallback normalization.
 */

const WEIGHTS = {
  chord_complexity_ht: 0.35,
  melodic_complexity_ht: 0.15,
  chord_melody_tension_ht: 0.20,
  chord_progression_novelty_ht: 0.20,
  chord_bass_melody_ht: 0.10,
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function ratingFromHooktheoryMetrics(metrics) {
  if (!metrics) return null;
  let sum = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) {
    const v = metrics[key];
    if (typeof v === 'number' && !Number.isNaN(v)) {
      sum += w * v;
      weight += w;
    }
  }
  if (!weight) return null;
  return clamp(sum / weight, 0, 100);
}

function ratingFromLocalStats(stats, corpusBounds = null) {
  if (!stats) return null;
  const raw = 0.6 * (stats.unique_chords || 0) + 0.4 * (stats.unique_transitions || 0);
  if (!corpusBounds) return clamp(raw * 2, 0, 100);
  const { min, max } = corpusBounds;
  if (max <= min) return 50;
  return clamp(((raw - min) / (max - min)) * 100, 0, 100);
}

function resolveComplexityRating(metrics, stats, corpusBounds = null) {
  const ht = ratingFromHooktheoryMetrics(metrics);
  if (ht != null) {
    return { complexity_rating: ht, metrics_source: 'hooktheory_page' };
  }
  const fallback = ratingFromLocalStats(stats, corpusBounds);
  if (fallback != null) {
    return { complexity_rating: fallback, metrics_source: 'computed_fallback' };
  }
  return { complexity_rating: null, metrics_source: null };
}

function getCorpusBounds(db) {
  const row = db.prepare(`
    SELECT MIN(0.6 * unique_chords + 0.4 * unique_transitions) AS min_raw,
           MAX(0.6 * unique_chords + 0.4 * unique_transitions) AS max_raw
    FROM song_stats
  `).get();
  if (!row || row.min_raw == null) return null;
  return { min: row.min_raw, max: row.max_raw };
}

module.exports = {
  WEIGHTS,
  ratingFromHooktheoryMetrics,
  ratingFromLocalStats,
  resolveComplexityRating,
  getCorpusBounds,
};
