const { openDb } = require('../_Research_testing/hooktheory_catalog/lib/db');
const { loadHarvest } = require('../_Research_testing/hooktheory_catalog/lib/harvestArtifact');
const db = openDb();

const rows = db.prepare(`
  SELECT s.slug, s.title, s.artist, s.status, s.harvest_mode, s.processed_at,
    m.complexity_rating, m.metrics_source,
    st.unique_chords, st.unique_transitions, st.section_count
  FROM songs s
  LEFT JOIN song_metrics m ON m.slug = s.slug
  LEFT JOIN song_stats st ON st.slug = s.slug
  WHERE s.processed_at IS NOT NULL
  ORDER BY m.complexity_rating IS NULL DESC, s.title
`).all();

const withRating = rows.filter((r) => r.complexity_rating != null);
const withoutRating = rows.filter((r) => r.complexity_rating == null);
const withoutHarvest = withoutRating.map((r) => ({
  ...r,
  hasHarvest: !!loadHarvest(r.slug),
}));
console.log(JSON.stringify({
  playableProcessed: rows.length,
  withComplexity: withRating.length,
  withoutComplexity: withoutRating.length,
  withoutWithHarvest: withoutHarvest.filter((r) => r.hasHarvest).length,
  withoutSample: withoutHarvest.slice(0, 20).map((r) => ({
    slug: r.slug,
    title: r.title,
    status: r.status,
    harvest_mode: r.harvest_mode,
    discovery_source: db.prepare('SELECT discovery_source FROM songs WHERE slug = ?').get(r.slug)?.discovery_source,
    hasHarvest: r.hasHarvest,
    unique_chords: r.unique_chords,
    unique_transitions: r.unique_transitions,
  })),
  withSample: withRating.slice(0, 5).map((r) => ({
    slug: r.slug,
    title: r.title,
    complexity_rating: r.complexity_rating,
    metrics_source: r.metrics_source,
    harvest_mode: r.harvest_mode,
  })),
}, null, 2));
