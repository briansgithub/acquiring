import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveDataRoot, getCatalogDir, getPlaybackCacheDir, getHarvestRoot } = require('../lib/dataRoot.js');

const root = resolveDataRoot();
const dbPath = path.join(getCatalogDir(), 'hooktheory_catalog.db');

console.log('=== Catalog snapshot ===');
console.log('dataRoot:', root);
console.log('db:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('DB missing');
  process.exit(1);
}

const st = fs.statSync(dbPath);
console.log('db size MB:', (st.size / 1024 / 1024).toFixed(1));

const db = new Database(dbPath, { readonly: true });

const status = db.prepare(`
  SELECT
    COUNT(*) total,
    SUM(CASE WHEN status = 'enriched' THEN 1 ELSE 0 END) enriched,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) pending,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) errors,
    SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) dead,
    SUM(CASE WHEN cache_dir IS NOT NULL AND cache_dir != '' THEN 1 ELSE 0 END) with_cache_dir,
    SUM(CASE WHEN processed_at IS NOT NULL THEN 1 ELSE 0 END) processed,
    SUM(CASE WHEN oracle_tested_at IS NOT NULL THEN 1 ELSE 0 END) tested,
    SUM(CASE WHEN harvest_mode = 'full' THEN 1 ELSE 0 END) harvest_full,
    SUM(CASE WHEN harvest_mode = 'light' THEN 1 ELSE 0 END) harvest_light,
    SUM(CASE WHEN harvest_mode IS NULL OR harvest_mode = '' THEN 1 ELSE 0 END) harvest_none,
    ROUND(AVG(complexity_rating), 2) avg_complexity,
    SUM(unique_chords) total_unique_chords,
    SUM(total_chords) total_chords
  FROM songs s
  LEFT JOIN song_metrics m ON m.slug = s.slug
  LEFT JOIN song_stats st ON st.slug = s.slug
`).get();

console.log('\nDB pipeline:', status);

const sources = db.prepare(`
  SELECT discovery_source, COUNT(*) n
  FROM songs
  GROUP BY discovery_source
  ORDER BY n DESC
  LIMIT 12
`).all();
console.log('\nTop discovery sources:');
for (const r of sources) console.log(`  ${r.n}\t${r.discovery_source ?? '(null)'}`);

const complexity = db.prepare(`
  SELECT
    SUM(CASE WHEN complexity_rating IS NULL THEN 1 ELSE 0 END) unrated,
    SUM(CASE WHEN complexity_rating < 25 THEN 1 ELSE 0 END) low,
    SUM(CASE WHEN complexity_rating >= 25 AND complexity_rating < 50 THEN 1 ELSE 0 END) mid,
    SUM(CASE WHEN complexity_rating >= 50 AND complexity_rating < 75 THEN 1 ELSE 0 END) high,
    SUM(CASE WHEN complexity_rating >= 75 THEN 1 ELSE 0 END) very_high
  FROM song_metrics
`).get();
console.log('\nComplexity buckets:', complexity);

function countDirs(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
}

const cacheDir = getPlaybackCacheDir();
const harvestDir = getHarvestRoot();
console.log('\nFilesystem:');
console.log('  cache dirs:', countDirs(cacheDir));
console.log('  harvest dirs:', countDirs(harvestDir));

const daemonState = path.join(getCatalogDir(), 'daemon_state.json');
if (fs.existsSync(daemonState)) {
  const ds = JSON.parse(fs.readFileSync(daemonState, 'utf8'));
  console.log('\nDaemon state:', {
    phase: ds.phase,
    discover_offset: ds.discover_offset,
    enriched_total: ds.enriched_total,
    updatedAt: ds.updatedAt,
  });
}

const lastRuns = db.prepare('SELECT id, mode, started_at, finished_at, new_count, enriched_count, error_count FROM discovery_runs ORDER BY id DESC LIMIT 3').all();
console.log('\nLast discovery runs:');
for (const r of lastRuns) console.log(' ', r);

const sections = db.prepare('SELECT COUNT(*) sections, SUM(chord_count) chords, SUM(note_count) notes FROM song_sections').get();
console.log('\nSection rows:', sections);

const pending = db.prepare("SELECT slug, url, status FROM songs WHERE status = 'pending'").all();
console.log('\nPending:', pending);

const deadReasons = db.prepare(`
  SELECT COALESCE(NULLIF(TRIM(error_message), ''), '(no message)') reason, COUNT(*) n
  FROM songs WHERE status = 'dead'
  GROUP BY reason ORDER BY n DESC LIMIT 8
`).all();
console.log('\nDead reasons (top):');
for (const r of deadReasons) console.log(`  ${r.n}\t${r.reason.slice(0, 80)}`);

const playable = db.prepare(`
  SELECT COUNT(*) n FROM songs
  WHERE status = 'enriched' AND cache_dir IS NOT NULL AND processed_at IS NOT NULL
`).get();
console.log('\nPlayable (enriched+processed):', playable.n);

db.close();
