/**
 * Parse Hooktheory SongMetrics from TheoryTab page HTML.
 */

const METRIC_PATTERNS = [
  ['chord_complexity_ht', 'Chord Complexity'],
  ['melodic_complexity_ht', 'Melodic Complexity'],
  ['chord_melody_tension_ht', 'Chord-Melody Tension'],
  ['chord_progression_novelty_ht', 'Chord Prog. Novelty'],
  ['chord_bass_melody_ht', 'Chord Bass Melody'],
];

const ADVANCED_SEARCH_KEYS = {
  chord_complexity_ht: 'chordComplexity',
  melodic_complexity_ht: 'melodicComplexity',
  chord_melody_tension_ht: 'chordMelodyTension',
  chord_progression_novelty_ht: 'chordProgressionNovelty',
  chord_bass_melody_ht: 'chordBassMelody',
};

function parseRangeMidpoint(rangeStr) {
  const parts = String(rangeStr).split(',').map((x) => parseFloat(x.trim()));
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return (parts[0] + parts[1]) / 2;
  }
  if (parts.length === 1 && !Number.isNaN(parts[0])) return parts[0];
  return null;
}

function parseFromAdvancedSearchLink(html) {
  const m = html.match(/advanced-search\?([^"']+)/);
  if (!m) return {};
  const qs = m[1];
  const out = {};
  for (const [key, param] of Object.entries(ADVANCED_SEARCH_KEYS)) {
    const hit = qs.match(new RegExp(`${param}=([\\d.,]+)`));
    if (hit) {
      const val = parseRangeMidpoint(hit[1]);
      if (val != null) out[key] = val;
    }
  }
  return out;
}

function parseMetricsFromHtml(html) {
  const metrics = {};
  for (const [key, label] of METRIC_PATTERNS) {
    const re = new RegExp(
      `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/span>[\\s\\S]{0,120}?<span[^>]*>(\\d+(?:\\.\\d+)?)<\\/span>`,
      'i',
    );
    const m = html.match(re);
    if (m) metrics[key] = parseFloat(m[1]);
  }

  const fromLink = parseFromAdvancedSearchLink(html);
  for (const [key, val] of Object.entries(fromLink)) {
    if (metrics[key] == null) metrics[key] = val;
  }

  const difficulty = html.match(/difficulty-badge[^>]*>([^<]+)</i)
    || html.match(/Complexity Level[^>]*>\s*([^<]+)</i);
  return {
    metrics,
    difficulty_label: difficulty ? difficulty[1].trim() : null,
    complete: METRIC_PATTERNS.every(([key]) => metrics[key] != null),
  };
}

module.exports = { parseMetricsFromHtml, METRIC_PATTERNS, parseFromAdvancedSearchLink };
