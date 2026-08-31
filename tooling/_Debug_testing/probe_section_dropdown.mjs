/**
 * Find songs where playback cache sections < DB/harvest/page sections.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { openDb } = require('../_Research_testing/hooktheory_catalog/lib/db');
const { listSongSections } = require('../_Research_testing/hooktheory_catalog/lib/queries');
const { loadHarvest } = require('../_Research_testing/hooktheory_catalog/lib/harvestArtifact');
const { resolveSectionsFromPage } = require('../_Research_testing/hooktheory_catalog/lib/sectionResolve');
const { getPlaybackCacheDir } = require('../lib/dataRoot');

const CACHE_ROOT = getPlaybackCacheDir();
const LOG_PATH = path.join(process.cwd(), 'debug-cca6bb.log');

function agentLog(location, message, data, hypothesisId) {
  const line = JSON.stringify({
    sessionId: 'cca6bb',
    location,
    message,
    data,
    timestamp: Date.now(),
    hypothesisId,
    runId: 'probe-scan',
  });
  fs.appendFileSync(LOG_PATH, `${line}\n`);
}

function countPlaybackSections(cacheDir) {
  const artistPath = path.join(CACHE_ROOT, cacheDir);
  if (!fs.existsSync(artistPath)) return { count: 0, names: [], skipped: [], metaCount: 0, fileCount: 0 };

  const files = fs.readdirSync(artistPath);
  const metadataPath = path.join(artistPath, '_metadata.json');
  let metadata = null;
  try {
    if (fs.existsSync(metadataPath)) metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (_) {}

  const sectionJsonFiles = files.filter((f) => f.endsWith('.json') && f !== '_metadata.json');

  function findFileForMeta(meta) {
    const byId = sectionJsonFiles.filter((f) => f.endsWith(` - ${meta.songId}.json`));
    if (!byId.length) return null;
    if (meta.sectionName) {
      const want = meta.sectionName.toLowerCase();
      const named = byId.find((f) => f.split(' - ')[0].toLowerCase() === want);
      if (named) return named;
    }
    return byId[0];
  }

  const skipped = [];
  let sections;
  if (metadata?.sections?.length) {
    sections = [];
    const sortedMeta = [...metadata.sections].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const meta of sortedMeta) {
      if (!meta.songId) {
        skipped.push({ reason: 'noSongId', sectionName: meta.sectionName });
        continue;
      }
      const file = findFileForMeta(meta);
      if (!file) {
        skipped.push({ reason: 'noFileMatch', sectionName: meta.sectionName, songId: meta.songId });
        continue;
      }
      sections.push(meta.sectionName || file.split(' - ')[0]);
    }
  } else {
    sections = sectionJsonFiles.map((f) => f.split(' - ')[0]);
  }

  return {
    count: sections.length,
    names: sections,
    skipped,
    metaCount: metadata?.sections?.length ?? 0,
    fileCount: sectionJsonFiles.length,
  };
}

function harvestSectionInfo(slug) {
  const h = loadHarvest(slug);
  if (!h) return { count: 0, names: [], mode: null };
  return {
    count: (h.scrape.sections || []).length,
    names: (h.scrape.sections || []).map((s) => s.name),
    mode: h.scrape.harvestMode || 'full',
    errors: h.scrape.errors || [],
  };
}

async function probeSlug(db, slug, url) {
  const dbSections = listSongSections(db, slug);
  const row = db.prepare('SELECT cache_dir, harvest_mode, section_count FROM songs s LEFT JOIN song_stats st ON st.slug = s.slug WHERE s.slug = ?').get(slug);
  const playback = row?.cache_dir ? countPlaybackSections(row.cache_dir) : { count: 0, names: [], skipped: [], metaCount: 0, fileCount: 0 };
  const harvest = harvestSectionInfo(slug);

  let pageCount = null;
  let pageNames = null;
  try {
    const resolved = await resolveSectionsFromPage(url);
    pageCount = resolved.length;
    pageNames = resolved.map((s) => s.section_name);
  } catch (e) {
    pageCount = -1;
    pageNames = [e.message];
  }

  const mismatch =
    playback.count < dbSections.length
    || playback.count < harvest.count
    || (pageCount > 0 && playback.count < pageCount);

  return {
    slug,
    harvest_mode: row?.harvest_mode,
    dbCount: dbSections.length,
    dbNames: dbSections.map((s) => s.section_name),
    playbackCount: playback.count,
    playbackNames: playback.names,
    playbackSkipped: playback.skipped,
    metaCount: playback.metaCount,
    fileCount: playback.fileCount,
    harvestCount: harvest.count,
    harvestNames: harvest.names,
    harvestMode: harvest.mode,
    harvestErrors: harvest.errors,
    pageCount,
    pageNames,
    mismatch,
  };
}

async function main() {
  const db = openDb();
  const args = process.argv.slice(2);
  const targetSlug = args[0] || 'the-proclaimers__500-miles';

  const targetRow = db.prepare('SELECT slug, url FROM songs WHERE slug = ?').get(targetSlug);
  if (!targetRow?.url) {
    console.error('Target song not found:', targetSlug);
    process.exit(1);
  }

  console.log(`\n=== Probe: ${targetSlug} ===`);
  const target = await probeSlug(db, targetSlug, targetRow.url);
  console.log(JSON.stringify(target, null, 2));
  agentLog('probe_section_dropdown.mjs:target', 'single song probe', target, 'A-E');

  console.log('\n=== Scanning light-harvested songs with processed cache ===');
  const rows = db.prepare(`
    SELECT s.slug, s.url, s.cache_dir, s.harvest_mode
    FROM songs s
    WHERE s.harvest_mode = 'light'
      AND s.cache_dir IS NOT NULL
      AND s.processed_at IS NOT NULL
      AND s.url IS NOT NULL
    ORDER BY s.slug
    LIMIT 200
  `).all();

  const affected = [];
  let scanned = 0;
  for (const row of rows) {
    scanned++;
    const dbSections = listSongSections(db, row.slug);
    const playback = countPlaybackSections(row.cache_dir);
    const harvest = harvestSectionInfo(row.slug);
    const mismatch =
      playback.count < dbSections.length
      || playback.count < harvest.count
      || (playback.metaCount > 0 && playback.count < playback.metaCount);

    if (mismatch || playback.skipped.length) {
      const entry = {
        slug: row.slug,
        dbCount: dbSections.length,
        playbackCount: playback.count,
        metaCount: playback.metaCount,
        fileCount: playback.fileCount,
        harvestCount: harvest.count,
        skipped: playback.skipped,
        dbNames: dbSections.map((s) => s.section_name),
        playbackNames: playback.names,
      };
      affected.push(entry);
      agentLog('probe_section_dropdown.mjs:scan', 'affected song', entry, 'C,D,E');
    }
    if (scanned % 50 === 0) process.stdout.write(`  scanned ${scanned}/${rows.length}\r`);
  }

  console.log(`\nScanned ${scanned} light-harvested songs`);
  console.log(`Affected (cache < DB/harvest/meta or skips): ${affected.length}`);
  console.log('\nTop affected:');
  for (const a of affected.slice(0, 25)) {
    console.log(`  ${a.slug}: db=${a.dbCount} playback=${a.playbackCount} meta=${a.metaCount} files=${a.fileCount} harvest=${a.harvestCount} skipped=${a.skipped.length}`);
    if (a.skipped.length) console.log(`    skipped: ${JSON.stringify(a.skipped)}`);
  }

  // Also scan full-harvest songs for playback/meta mismatch
  console.log('\n=== Scanning full-harvest songs (playback vs meta) ===');
  const fullRows = db.prepare(`
    SELECT s.slug, s.cache_dir
    FROM songs s
    WHERE s.harvest_mode = 'full'
      AND s.cache_dir IS NOT NULL
      AND s.processed_at IS NOT NULL
    ORDER BY s.slug
    LIMIT 100
  `).all();

  const fullAffected = [];
  for (const row of fullRows) {
    const playback = countPlaybackSections(row.cache_dir);
    if (playback.metaCount > playback.count || playback.skipped.length) {
      fullAffected.push({ slug: row.slug, ...playback });
    }
  }
  console.log(`Full-harvest mismatches in sample: ${fullAffected.length}`);
  for (const a of fullAffected.slice(0, 10)) {
    console.log(`  ${a.slug}: playback=${a.count} meta=${a.metaCount} skipped=${JSON.stringify(a.skipped)}`);
  }

  console.log('\n=== Full catalog scan (all processed) ===');
  const allRows = db.prepare(`
    SELECT slug, cache_dir FROM songs
    WHERE cache_dir IS NOT NULL AND processed_at IS NOT NULL
  `).all();
  let allAffected = 0;
  for (const row of allRows) {
    const dbN = listSongSections(db, row.slug).length;
    const pb = countPlaybackSections(row.cache_dir);
    if (pb.count < dbN || pb.count < pb.metaCount || pb.skipped.length) {
      allAffected++;
      if (allAffected <= 5) {
        console.log(`  ${row.slug}: db=${dbN} playback=${pb.count} meta=${pb.metaCount}`);
      }
    }
  }
  console.log(`Total processed: ${allRows.length}, affected: ${allAffected}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
