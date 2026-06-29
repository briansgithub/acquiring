#!/usr/bin/env node
/**
 * Wipe catalog DB, then full Fetch + tested for six named songs.
 */

const { openDb, upsertSong } = require('./hooktheory_catalog/lib/db');
const { parseTheoryTabUrl } = require('./hooktheory_catalog/lib/catalogUtils');
const { runHarvest, runPipelineAction } = require('./hooktheory_catalog/lib/pipelineOps');
const { resetCacheSync } = require('./hooktheory_catalog/lib/library');

const SONGS = [
  { label: 'Maple Leaf Rag', url: 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag' },
  { label: 'Gladiolus Rag', url: 'https://www.hooktheory.com/theorytab/view/scott-joplin/gladiolus-rag' },
  { label: 'Bad Romance', url: 'https://www.hooktheory.com/theorytab/view/lady-gaga/bad-romance' },
  { label: "Sweet Child O' Mine", url: 'https://www.hooktheory.com/theorytab/view/guns-n-roses/sweet-child-o-mine' },
  { label: 'Pollyanna', url: 'https://www.hooktheory.com/theorytab/view/nintendo/earthbound-zero---pollyanna' },
  { label: 'Bohemian Rhapsody', url: 'https://www.hooktheory.com/theorytab/view/queen/bohemian-rhapsody' },
];

function clearCatalogDb(db) {
  db.exec(`
    DELETE FROM song_sections;
    DELETE FROM song_metrics;
    DELETE FROM song_stats;
    DELETE FROM song_details;
    DELETE FROM discovery_runs;
    DELETE FROM songs;
  `);
  resetCacheSync();
  console.log('[clear] catalog DB emptied');
}

async function fetchAndTest(db, { label, url }) {
  const parsed = parseTheoryTabUrl(url);
  if (!parsed) throw new Error(`invalid URL: ${url}`);

  console.log(`\n[${label}] upsert ${parsed.slug}`);
  upsertSong(db, {
    ...parsed,
    status: 'pending',
    discovery_source: 'user_url',
  });

  console.log(`[${label}] Fetch (browser harvest + metadata + processed)…`);
  const harvest = await runHarvest(db, parsed.slug, { rescrape: true });
  if (!harvest.ok) throw new Error(harvest.error || 'harvest failed');

  console.log(`[${label}] Tested (oracle compare)…`);
  const tested = await runPipelineAction(db, parsed.slug, 'tested');
  if (!tested.ok) throw new Error(tested.error || 'tested failed');

  const cx = db.prepare('SELECT complexity_rating, metrics_source FROM song_metrics WHERE slug = ?').get(parsed.slug);
  console.log(`[${label}] done — complexity=${cx?.complexity_rating?.toFixed?.(1) ?? '—'} tested=${!!tested.flags?.tested}`);
  return { slug: parsed.slug, label, tested };
}

async function main() {
  const db = openDb();
  clearCatalogDb(db);

  const results = [];
  for (const song of SONGS) {
    try {
      results.push({ ...await fetchAndTest(db, song), ok: true });
    } catch (err) {
      console.error(`[${song.label}] FAILED:`, err.message);
      results.push({ label: song.label, ok: false, error: err.message });
    }
  }

  const summary = db.prepare(`
    SELECT s.slug, s.title, s.harvest_mode,
      m.complexity_rating,
      s.oracle_tested_at IS NOT NULL AS tested,
      s.processed_at IS NOT NULL AS processed
    FROM songs s
    LEFT JOIN song_metrics m ON m.slug = s.slug
    ORDER BY s.title
  `).all();

  console.log('\n[summary]');
  for (const row of summary) {
    console.log(`  ${row.title}: complexity=${row.complexity_rating?.toFixed?.(1) ?? '—'} processed=${row.processed} tested=${row.tested}`);
  }
  console.log(`\n[done] ${results.filter((r) => r.ok).length}/${SONGS.length} succeeded`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
