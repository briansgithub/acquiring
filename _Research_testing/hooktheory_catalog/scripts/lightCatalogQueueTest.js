/**
 * Light catalog queue + harvest artifact shape tests (no network).
 *   node scripts/lightCatalogQueueTest.js
 */

const fs = require('fs');
const path = require('path');
const { openDb, upsertSong, upsertMeiliSectionStub, setHarvestMode } = require('../lib/db');
const {
  countSongsNeedingLightHarvest,
  listSongsNeedingLightHarvest,
} = require('../lib/lightHarvest');
const { harvestOk, harvestFileForSlug, harvestDirForSlug } = require('../lib/harvestArtifact');

const TEST_SLUG = 'test-artist__test-song';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const db = openDb();
  db.prepare('DELETE FROM song_sections WHERE slug = ?').run(TEST_SLUG);
  db.prepare('DELETE FROM songs WHERE slug = ?').run(TEST_SLUG);

  upsertSong(db, {
    slug: TEST_SLUG,
    url: 'https://www.hooktheory.com/theorytab/view/test-artist/test-song',
    artist: 'test-artist',
    title: 'test-song',
    discovery_source: 'test',
  });
  upsertMeiliSectionStub(db, TEST_SLUG, 'Verse', 'KexEyqaKx_B');

  const before = countSongsNeedingLightHarvest(db);
  assert(before >= 1, 'pending queue should include test song');

  const list = listSongsNeedingLightHarvest(db, 10, { slugs: [TEST_SLUG] });
  assert(list.some((r) => r.slug === TEST_SLUG), 'list should contain test slug');

  const dir = harvestDirForSlug(TEST_SLUG);
  fs.mkdirSync(dir, { recursive: true });
  const scrape = {
    url: 'https://www.hooktheory.com/theorytab/view/test-artist/test-song',
    harvestMode: 'light',
    sections: [{ name: 'Verse', songId: 'KexEyqaKx_B', json: { chords: [{ beat: 1, duration: 1, isRest: false, root: 1 }], notes: [] }, rendered: [] }],
    harvestedAt: new Date().toISOString(),
  };
  fs.writeFileSync(harvestFileForSlug(TEST_SLUG), JSON.stringify(scrape));
  assert(harvestOk(scrape), 'light scrape should pass harvestOk');

  setHarvestMode(db, TEST_SLUG, 'light');
  const afterList = listSongsNeedingLightHarvest(db, 50);
  assert(!afterList.some((r) => r.slug === TEST_SLUG), 'light mode should exclude from queue');

  setHarvestMode(db, TEST_SLUG, 'full');
  const afterFull = listSongsNeedingLightHarvest(db, 50);
  assert(!afterFull.some((r) => r.slug === TEST_SLUG), 'full mode should exclude from light queue');

  const { harvestLightSong } = require('../lib/lightHarvest');
  const skip = await harvestLightSong(db, TEST_SLUG, 'https://www.hooktheory.com/theorytab/view/test-artist/test-song');
  assert(skip.skipped && skip.reason === 'full_fetch_complete', 'should skip light harvest when full');

  try { fs.unlinkSync(harvestFileForSlug(TEST_SLUG)); } catch (_) {}
  db.prepare('DELETE FROM song_sections WHERE slug = ?').run(TEST_SLUG);
  db.prepare('DELETE FROM songs WHERE slug = ?').run(TEST_SLUG);

  console.log('lightCatalogQueueTest: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
