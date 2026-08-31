/**
 * Export catalog to JSON/CSV.
 *   node _Research_testing/hooktheory_catalog/export.js --format json
 */

const fs = require('fs');
const { dataPath, DATA_DIR } = require('./paths');

function toCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

function main() {
  const format = process.argv.includes('--format') ? process.argv[process.argv.indexOf('--format') + 1] : 'json';
  const db = openDb();
  const rows = db.prepare(`
    SELECT s.slug, s.artist, s.title, s.url, s.status, s.difficulty_label,
      m.chord_complexity_ht, m.melodic_complexity_ht, m.chord_melody_tension_ht,
      m.chord_progression_novelty_ht, m.chord_bass_melody_ht, m.complexity_rating, m.metrics_source,
      st.unique_chords, st.unique_transitions, st.total_chords, st.section_count
    FROM songs s
    LEFT JOIN song_metrics m ON m.slug = s.slug
    LEFT JOIN song_stats st ON st.slug = s.slug
    ORDER BY s.artist, s.title
  `).all();

  const outDir = DATA_DIR;
  if (format === 'csv') {
    const out = path.join(outDir, 'catalog_export.csv');
    fs.writeFileSync(out, toCsv(rows));
    console.log('wrote', out, 'rows', rows.length);
  } else {
    const out = path.join(outDir, 'catalog_export.json');
    fs.writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, rows }, null, 2));
    console.log('wrote', out, 'rows', rows.length);
  }
}


module.exports = { main, toCsv };
