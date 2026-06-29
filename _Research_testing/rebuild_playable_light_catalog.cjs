#!/usr/bin/env node
/**
 * Export playable dropdown songs, wipe catalog DB, re-import, Meili section stubs, light harvest.
 * Output: _Research_testing/playable_songs_snapshot.json
 */

const fs = require('fs');
const path = require('path');
const { openDb, upsertSong, upsertMeiliSectionStub, listSectionsForSlug } = require('./hooktheory_catalog/lib/db');
const { parseTheoryTabUrl, buildTheoryTabUrl } = require('./hooktheory_catalog/lib/catalogUtils');
const { searchWithAuth } = require('./hooktheory_catalog/lib/meiliClient');
const { runLightCatalog } = require('./hooktheory_catalog/lib/lightCatalog');
const { resetCacheSync } = require('./hooktheory_catalog/lib/library');

const SNAPSHOT = path.join(__dirname, 'playable_songs_snapshot.json');
const ROOT = path.join(__dirname, '..');

function entryFromUrl(url) {
  const parsed = parseTheoryTabUrl(url);
  if (!parsed) return null;
  return { ...parsed, discovery_source: 'playable_snapshot' };
}

function exportPlayable(db) {
  const rows = db.prepare(`
    SELECT s.slug, s.artist, s.title, s.url, s.artist_slug, s.title_slug
    FROM songs s
    WHERE s.processed_at IS NOT NULL AND s.url IS NOT NULL
    ORDER BY s.title
  `).all();

  const songs = rows.map((row) => {
    const sections = db.prepare(`
      SELECT section_name, song_id, hooktheory_id
      FROM song_sections WHERE slug = ? ORDER BY rowid
    `).all(row.slug);
    return { ...row, sections };
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    count: songs.length,
    songs,
  };
  fs.writeFileSync(SNAPSHOT, JSON.stringify(payload, null, 2));
  console.log(`[export] ${songs.length} playable songs → ${SNAPSHOT}`);
  return payload;
}

function clearCatalogDb(db) {
  db.exec(`
    DELETE FROM song_sections;
    DELETE FROM song_metrics;
    DELETE FROM song_stats;
    DELETE FROM song_details;
    DELETE FROM discovery_runs;
    DELETE FROM songs;
  `);
  const left = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
  console.log(`[clear] songs remaining: ${left}`);
  resetCacheSync();
}

function importSnapshot(db, payload) {
  let n = 0;
  for (const s of payload.songs) {
    const entry = entryFromUrl(s.url);
    if (!entry) {
      console.warn(`[import] skip invalid url: ${s.url}`);
      continue;
    }
    upsertSong(db, { ...entry, status: 'pending' });
    for (const sec of s.sections || []) {
      upsertMeiliSectionStub(db, s.slug, sec.section_name, sec.song_id);
    }
    n++;
  }
  console.log(`[import] ${n} songs re-inserted`);
}

async function discoverSectionsForSlug(db, song) {
  const existing = listSectionsForSlug(db, song.slug);
  if (existing.length) return existing.length;

  const q = `${song.artist || ''} ${song.title || ''}`.trim();
  const json = await searchWithAuth({ q, limit: 100 });
  let added = 0;
  for (const hit of json.hits || []) {
    const url = buildTheoryTabUrl(hit.artist, hit.song);
    const entry = entryFromUrl(url);
    if (!entry || entry.slug !== song.slug) continue;
    if (hit.id && hit.section) {
      upsertMeiliSectionStub(db, song.slug, hit.section, String(hit.id));
      added++;
    }
  }
  console.log(`[meili] ${song.slug}: +${added} sections (q="${q}")`);
  return added;
}

async function ensureAllSections(db, payload) {
  let filled = 0;
  for (const song of payload.songs) {
    const before = listSectionsForSlug(db, song.slug).length;
    if (before > 0) continue;
    const added = await discoverSectionsForSlug(db, song);
    if (added > 0) filled++;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`[meili] filled sections for ${filled} songs`);
  const stillMissing = payload.songs.filter((s) => !listSectionsForSlug(db, s.slug).length);
  if (stillMissing.length) {
    console.warn('[meili] still no sections:', stillMissing.map((s) => s.slug).join(', '));
  }
}

async function main() {
  const db = openDb();
  const payload = exportPlayable(db);
  clearCatalogDb(db);
  importSnapshot(db, payload);
  await ensureAllSections(db, payload);

  const slugs = payload.songs
    .map((s) => s.slug)
    .filter((slug) => listSectionsForSlug(db, slug).length > 0);

  console.log(`[harvest] starting light catalog for ${slugs.length} songs`);
  await runLightCatalog({
    harvestOnly: true,
    limit: slugs.length,
    slugs,
    force: true,
  });

  const summary = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN m.complexity_rating IS NOT NULL THEN 1 ELSE 0 END) AS with_complexity,
      SUM(CASE WHEN s.harvest_mode = 'light' THEN 1 ELSE 0 END) AS light_harvested
    FROM songs s
    LEFT JOIN song_metrics m ON m.slug = s.slug
    WHERE s.slug IN (${slugs.map(() => '?').join(',')})
  `).get(...slugs);

  console.log('[done]', JSON.stringify(summary, null, 2));
  console.log(`Snapshot: ${path.relative(ROOT, SNAPSHOT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
