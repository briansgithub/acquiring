/**
 * Write a full song/bucket manifest, then drop dead (unloadable) rows from
 * the shipped Android asset and rebuild it. The source research catalog
 * (hooktheory_catalog.db) is untouched — only the derived export loses the
 * dead rows, since dropping them there would destroy the record of what was
 * already checked and prevent future re-discovery diffing.
 *
 *   node scripts/drop-dead-rows-and-rebuild.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');
const { openDb } = require('../lib/db');
const { verifyAll } = require('../lib/verifyPlayable');
const { dataPath } = require('../lib/paths');

const CATALOG_ROOT = path.join(__dirname, '..');
// Resolved from the data root, not __dirname: android/ is absent from git
// worktrees of this repo, which is how the overnight export/publish failed.
const { getAndroidDir } = require('../../../lib/dataRoot');
const MANIFEST_FILE = path.join(dataPath('.'), 'song_buckets_manifest.json');

const BUCKET_MEANINGS = {
  playable: 'Verified real chord data in the playback cache. This is what ships to the app (melody may or may not be present — see hasMelody per song; ~1,339 known chord-only entries are genuinely melody-less upstream, not broken).',
  harvested_not_processed: 'A valid raw harvest artifact (scrape.json) exists on disk with real chord data, but it has not been converted into the playback cache yet. Fixable without any network request — just needs the processing step re-run.',
  harvest_stale_or_empty: 'The catalog says this song was harvested, but no valid chord data was found anywhere on disk. Investigated directly during this project: in every sampled case, Hooktheory\'s own API returned an empty chords array for the section — this is genuinely melody-only content at the source, not a harvest bug. Re-harvesting does not fix these.',
  never_harvested: 'Catalogued (we know the URL) but a harvest was never attempted. In practice this bucket has stayed at ~0 real entries — the handful of rows in it were internal test/debug slugs, not real songs.',
  dead_or_error: 'status is \'dead\' or \'error\' — the stored TheoryTab URL returned HTTP 404 (or another terminal answer). These rows are dropped from the shipped Android asset but remain in the source catalog. Discovery does not retry the same failed URL; if it later supplies one different, unambiguous path for the same canonical song, reconciliation clears the stale verdict and queues that replacement once.',
};

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function writeManifest() {
  log('Classifying every song in the source catalog...');
  const db = openDb();
  const { results, counts, total, mismatchCount } = verifyAll(db);
  db.close();

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceDb: 'acquiring_data/catalog/hooktheory_catalog.db',
    totalSongs: total,
    bucketCounts: counts,
    bucketMeanings: BUCKET_MEANINGS,
    dbFilesystemMismatches: mismatchCount,
    songs: results,
  };

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  log(`Manifest written: ${MANIFEST_FILE} (${total} songs)`);
  log(`Bucket counts: ${JSON.stringify(counts)}`);
  return { counts, total };
}

function rebuildAsset() {
  log('Regenerating raw export from current source data...');
  const out = execFileSync('node', ['scripts/exportFullHarvestedRoomDatabase.js'], {
    cwd: CATALOG_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  log(out.trim().split('\n').slice(-2).join(' | '));

  const dbPath = path.join(getAndroidDir(), 'catalog.db');
  const gzPath = `${dbPath}.gz`;
  const d = new Database(dbPath);

  const before = d.prepare('SELECT COUNT(*) c FROM songs').get().c;
  const beforeDead = d.prepare('SELECT COUNT(*) c FROM songs WHERE dataBlob IS NULL').get().c;
  d.prepare('DELETE FROM songs WHERE dataBlob IS NULL').run();
  const after = d.prepare('SELECT COUNT(*) c FROM songs').get().c;

  // Mirror DatabaseDownloader.kt's own post-download validation (fixed
  // earlier this session to use floors, not exact equality) so the asset
  // this script produces is guaranteed to pass the app's own integrity check.
  const browse = d.prepare('SELECT COUNT(*) c FROM song_browse_entries').get().c;
  const withChords = d.prepare(`
    SELECT COUNT(*) c FROM song_browse_entries e
    INNER JOIN songs s ON s.slug = e.slug WHERE s.dataBlob IS NOT NULL
  `).get().c;

  const EXPECTED_FLOOR = 40609;
  if (after < EXPECTED_FLOOR || browse < EXPECTED_FLOOR || withChords !== browse) {
    d.close();
    throw new Error(
      `Refusing to ship: would fail the app's own validation floor `
      + `(songs=${after} browse=${browse} withChords=${withChords}, floor=${EXPECTED_FLOOR})`,
    );
  }

  d.exec('VACUUM');
  d.close();

  fs.writeFileSync(gzPath, zlib.gzipSync(fs.readFileSync(dbPath), { level: 9 }));

  const rawMb = (fs.statSync(dbPath).size / (1024 * 1024)).toFixed(1);
  const gzMb = (fs.statSync(gzPath).size / (1024 * 1024)).toFixed(1);

  log(`Dropped ${beforeDead} dead rows (${before} -> ${after} songs)`);
  log(`Validation: browseEntries=${browse}, allHaveChords=${withChords === browse} (both >= floor of ${EXPECTED_FLOOR})`);
  log(`Rebuilt: ${dbPath} (${rawMb} MB) / ${gzPath} (${gzMb} MB)`);

  return { before, after, dropped: beforeDead, rawMb, gzMb };
}

function main() {
  const manifestResult = writeManifest();
  const rebuildResult = rebuildAsset();
  log('Done. Asset rebuilt locally — not published. Run the publish step separately when ready.');
  return { manifestResult, rebuildResult };
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`FATAL: ${err.stack || err.message}`);
    process.exit(1);
  }
}

module.exports = { main, BUCKET_MEANINGS };
