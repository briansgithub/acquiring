const fs = require('fs');
const { runLightCatalog } = require('./hooktheory_catalog/lib/lightCatalog');
const { openDb } = require('./hooktheory_catalog/lib/db');

const snap = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'playable_songs_snapshot.json'), 'utf8'));
const slugs = snap.songs.map((s) => s.slug);

runLightCatalog({ harvestOnly: true, limit: 50, slugs }).then(() => {
  const db = openDb();
  const r = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN harvest_mode = 'light' THEN 1 ELSE 0 END) AS light,
      SUM(CASE WHEN m.complexity_rating IS NOT NULL THEN 1 ELSE 0 END) AS with_complexity
    FROM songs s LEFT JOIN song_metrics m ON m.slug = s.slug
  `).get();
  const missing = db.prepare(`
    SELECT s.slug, s.title FROM songs s
    LEFT JOIN song_metrics m ON m.slug = s.slug
    WHERE m.complexity_rating IS NULL
  `).all();
  console.log('[summary]', r);
  console.log('[no complexity]', missing.map((x) => x.slug).join(', ') || 'none');
}).catch((e) => { console.error(e); process.exit(1); });
